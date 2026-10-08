import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { apiError, isSameOrigin, readJson } from "@/lib/api";
import {
  ASSISTANT_INSTRUCTIONS,
  ASSISTANT_MAX_TOKENS,
  ASSISTANT_MODEL,
  ASSISTANT_TOOLS,
  buildAssistantContext,
  runAssistantTool,
  TOOL_PENDING,
  type AssistantContext,
  type ToolCard,
} from "@/lib/assistant";
import { isUuid } from "@/lib/app-errors";
import { currentTerm, termLabel } from "@/lib/courses";
import { currentUserContext } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Reading a long PDF and then answering can take a while; stay under Vercel's
// cap for a streaming function rather than the 10s default.
export const maxDuration = 120;

/** How many assistant turns may run tools before we stop and answer. */
const MAX_TOOL_ROUNDS = 6;
/** Turns kept from the client's transcript. */
const MAX_HISTORY = 24;

const Body = z.object({
  message: z.string().trim().min(1, "Type a question").max(4000),
  groupId: z
    .string()
    .refine(isUuid)
    .nullish()
    .transform((value) => value ?? null),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(20_000),
      }),
    )
    .max(MAX_HISTORY)
    .default([]),
});

/* ---------- Per-user pacing ---------- */

type Bucket = { count: number; resetAt: number };
const shared = globalThis as typeof globalThis & {
  __cometAssistantRate?: Map<string, Bucket>;
};
const buckets = (shared.__cometAssistantRate ??= new Map());
const WINDOW_MS = 5 * 60_000;
const MAX_PER_WINDOW = 25;

function overLimit(userId: string) {
  const now = Date.now();
  if (buckets.size > 5000) buckets.clear();
  const bucket = buckets.get(userId);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_PER_WINDOW;
}

/* ---------- The stream ---------- */

type Event =
  | { t: "tool"; i: number; name: string; state: "running"; label: string }
  | { t: "tool"; i: number; state: "done"; card: ToolCard }
  | { t: "text"; v: string }
  | { t: "turn"; v: string }
  | { t: "refresh" }
  | { t: "error"; v: string }
  | { t: "done" };

/**
 * The assistant's reply, streamed as newline-delimited JSON: text deltas as
 * they arrive, plus a card per tool call so the chat can show what it looked
 * at. The API is stateless, so the client sends the transcript back each turn;
 * the "turn" event is the text to store for the next one.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return apiError("FORBIDDEN", "Cross-site request rejected", 403);

  let context;
  try {
    context = await currentUserContext();
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Service unavailable", 503);
  }
  const { env, db, user, nebula } = context;
  if (!user?.onboardingCompletedAt)
    return apiError("UNAUTHENTICATED", "Sign in first", 401);
  if (!env.ANTHROPIC_API_KEY)
    return apiError(
      "ASSISTANT_UNAVAILABLE",
      "The study assistant isn’t connected on this server",
      503,
    );

  const parsed = Body.safeParse(await readJson(request));
  if (!parsed.success)
    return apiError(
      "VALIDATION_FAILED",
      parsed.error.issues[0]?.message ?? "Check the message and try again",
      422,
    );
  if (overLimit(user.id))
    return apiError(
      "RATE_LIMITED",
      "That’s a lot of questions at once — give it a few minutes",
      429,
    );

  const term = currentTerm();
  const assistant: AssistantContext = {
    db,
    nebula,
    userId: user.id,
    term,
    termLabel: termLabel(term),
    now: new Date(),
    groupId: parsed.data.groupId,
  };

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Event) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await converse(client, assistant, parsed.data, send);
      } catch (error) {
        console.error("[comet-study] assistant failed", error);
        send({
          t: "error",
          v:
            error instanceof Anthropic.RateLimitError
              ? "The assistant is busy right now. Try again in a moment."
              : "The assistant couldn’t finish that. Try again.",
        });
      } finally {
        send({ t: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

async function converse(
  client: Anthropic,
  assistant: AssistantContext,
  input: z.infer<typeof Body>,
  send: (event: Event) => void,
) {
  const messages: Anthropic.MessageParam[] = [
    ...input.history.map<Anthropic.MessageParam>((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    { role: "user", content: input.message },
  ];

  const system: Anthropic.TextBlockParam[] = [
    // Stable half first so it can be cached; the student's context changes
    // every turn and goes after the breakpoint.
    {
      type: "text",
      text: ASSISTANT_INSTRUCTIONS,
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: await buildAssistantContext(assistant) },
  ];

  let visible = "";
  const trail: string[] = [];
  let calls = 0;
  let mutated = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const turn = client.messages.stream({
      model: ASSISTANT_MODEL,
      max_tokens: ASSISTANT_MAX_TOKENS,
      // Thinking is always on for this model; a chat reply doesn't need the
      // deepest pass, and lower effort keeps the first token quick.
      output_config: { effort: "low" },
      system,
      tools: ASSISTANT_TOOLS,
      messages,
    });
    turn.on("text", (delta) => {
      visible += delta;
      send({ t: "text", v: delta });
    });

    const message = await turn.finalMessage();
    if (message.stop_reason === "refusal") {
      send({
        t: "error",
        v: "The assistant declined to answer that one. Try rewording it.",
      });
      break;
    }
    // A tool input cut off at max_tokens can still parse; never run it.
    const uses = message.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (message.stop_reason === "max_tokens" && uses.length) {
      send({
        t: "error",
        v: "That answer got too long. Try a narrower question.",
      });
      break;
    }
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    if (!uses.length) break;

    messages.push({ role: "assistant", content: message.content });
    const results: Anthropic.ContentBlockParam[] = [];
    for (const use of uses) {
      const index = calls++;
      send({
        t: "tool",
        i: index,
        name: use.name,
        state: "running",
        label: TOOL_PENDING[use.name] ?? "Working…",
      });
      const outcome = await runAssistantTool(assistant, use.name, use.input);
      mutated ||= Boolean(outcome.mutated);
      send({ t: "tool", i: index, state: "done", card: outcome.card });
      trail.push(
        `${outcome.card.label}${outcome.card.summary ? ` — ${outcome.card.summary}` : ""}`,
      );
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: outcome.content,
        ...(outcome.isError ? { is_error: true } : {}),
      });
      // Files the model has to look at ride along after their tool result.
      if (outcome.attachments?.length) results.push(...outcome.attachments);
    }
    messages.push({ role: "user", content: results });
  }

  if (mutated) send({ t: "refresh" });
  // What the client stores for this turn: the reply plus a one-line note of
  // what was looked up, so the next turn still has that thread.
  send({
    t: "turn",
    v: [visible.trim(), trail.length ? `[Looked up: ${trail.join("; ")}]` : ""]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 20_000),
  });
}
