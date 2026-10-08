"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ToolCard } from "@/lib/assistant";
import { Icon, type IconName } from "./icons";
import { SmoothTextarea } from "../../ui/smooth-input";

/*
 * The study assistant's chat, rebuilt in Comet Study's glass from 21st.dev's
 * Agent Elements (agent-chat, message-list, input-bar, suggestions, tool-group)
 * without Tailwind or the AI SDK: the student's turns are pills, the
 * assistant's are plain text, and each tool call collapses to one line saying
 * what it looked at, expandable into the rows behind it.
 */

type Tool =
  | { state: "running"; label: string }
  | { state: "done"; card: ToolCard };

/**
 * A reply comes back as text and tool calls in the order they happened — "let
 * me look", then the lookup, then the answer — so the turn keeps them in that
 * order rather than stacking all the tools on top.
 */
type Part =
  | { kind: "text"; text: string }
  | { kind: "tool"; at: number; tool: Tool };

type Turn = {
  id: number;
  role: "user" | "assistant";
  /** The question, for a student's turn. */
  text: string;
  parts: Part[];
  /** What the server will be sent back as this turn's content. */
  echo?: string;
  failed?: string;
};

const withText = (parts: Part[], delta: string): Part[] => {
  const last = parts.at(-1);
  if (last?.kind === "text")
    return [...parts.slice(0, -1), { kind: "text", text: last.text + delta }];
  return [...parts, { kind: "text", text: delta }];
};

const withTool = (parts: Part[], at: number, tool: Tool): Part[] => {
  const index = parts.findIndex(
    (part) => part.kind === "tool" && part.at === at,
  );
  if (index < 0) return [...parts, { kind: "tool", at, tool }];
  const next = [...parts];
  next[index] = { kind: "tool", at, tool };
  return next;
};

const ICONS = new Set<string>([
  "calendar",
  "clock",
  "exam",
  "file",
  "groups",
  "library",
  "link",
  "pin",
  "rooms",
  "search",
  "spark",
]);
const iconOf = (name: string): IconName =>
  (ICONS.has(name) ? name : "spark") as IconName;

export function Assistant({
  groupId = null,
  suggestions,
  scope,
}: {
  groupId?: string | null;
  suggestions: string[];
  /** What the chat can see, shown in the empty state. */
  scope: string;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const listId = useId();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const latestAsk = useRef<HTMLParagraphElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const stick = useRef(true);
  const nextId = useRef(0);

  useEffect(() => () => abort.current?.abort(), []);

  const latestQuestionId = turns
    .filter((turn) => turn.role === "user")
    .at(-1)?.id;

  // Start each exchange at the top of the stream, above its answer.
  useLayoutEffect(() => {
    const el = list.current;
    const ask = latestAsk.current;
    if (!el || !ask) return;
    const top = parseFloat(getComputedStyle(el).paddingTop) || 0;
    el.scrollTop +=
      ask.getBoundingClientRect().top - el.getBoundingClientRect().top - top;
  }, [latestQuestionId]);

  // Reveal new answer text only when it extends below the visible stream.
  const scrollDown = useCallback(() => {
    const el = list.current;
    const content = el?.querySelector(".as-turns");
    if (!el || !content || !stick.current) return;
    const overflow =
      content.getBoundingClientRect().bottom -
      el.getBoundingClientRect().bottom;
    if (overflow > 0) el.scrollTop += overflow;
  }, []);
  useEffect(scrollDown, [turns, scrollDown]);

  const grow = useCallback(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
    el.style.overflowY = el.scrollHeight > 168 ? "auto" : "hidden";
  }, []);
  useEffect(grow, [draft, grow]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    stick.current = true;
    setDraft("");
    setBusy(true);

    const history = turns
      .map((turn) => ({
        role: turn.role,
        content: turn.echo ?? turn.text,
      }))
      .filter((turn) => turn.content.trim())
      .slice(-24);

    const askId = nextId.current++;
    const replyId = nextId.current++;
    setTurns((current) => [
      ...current,
      { id: askId, role: "user", text: question, parts: [] },
      { id: replyId, role: "assistant", text: "", parts: [] },
    ]);

    const patch = (change: (turn: Turn) => Turn) =>
      setTurns((current) =>
        current.map((turn) => (turn.id === replyId ? change(turn) : turn)),
      );

    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch("/api/v1/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, groupId, history }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        patch((turn) => ({
          ...turn,
          failed:
            payload?.error?.message ??
            "The assistant isn’t reachable right now.",
        }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let refresh = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.t === "text")
            patch((turn) => ({
              ...turn,
              parts: withText(turn.parts, event.v),
            }));
          else if (event.t === "tool")
            patch((turn) => ({
              ...turn,
              parts: withTool(
                turn.parts,
                event.i,
                event.state === "running"
                  ? { state: "running", label: event.label }
                  : { state: "done", card: event.card },
              ),
            }));
          else if (event.t === "turn")
            patch((turn) => ({ ...turn, echo: event.v }));
          else if (event.t === "refresh") refresh = true;
          else if (event.t === "error")
            patch((turn) => ({ ...turn, failed: event.v }));
        }
        scrollDown();
      }
      // A scheduled session has to show up on the pages behind the chat.
      if (refresh) router.refresh();
    } catch (error) {
      if ((error as Error)?.name !== "AbortError")
        patch((turn) => ({
          ...turn,
          failed: "The connection dropped before the answer finished.",
        }));
    } finally {
      abort.current = null;
      setBusy(false);
      // Drop an assistant turn that produced nothing at all.
      setTurns((current) =>
        current.filter(
          (turn) => turn.id !== replyId || turn.parts.length || turn.failed,
        ),
      );
    }
  }

  const empty = turns.length === 0;
  return (
    <div className={`as${empty ? " is-empty" : ""}`}>
      <div
        className="as-stream"
        ref={list}
        id={listId}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        // The history scrolls, so keyboard users need to be able to reach it.
        tabIndex={0}
        data-lenis-prevent
        onScroll={(event) => {
          const el = event.currentTarget;
          const content = el.querySelector(".as-turns");
          stick.current =
            !content ||
            content.getBoundingClientRect().bottom -
              el.getBoundingClientRect().bottom <
              80;
        }}
      >
        {empty ? (
          <div className="as-intro">
            <span className="as-orb" aria-hidden="true" />
            <h2>
              Ask about your <em className="gradient-serif">study week.</em>
            </h2>
            <p>{scope}</p>
          </div>
        ) : (
          <div className="as-turns">
            {turns.map((turn) =>
              turn.role === "user" ? (
                <p
                  className="as-ask"
                  key={turn.id}
                  ref={turn.id === latestQuestionId ? latestAsk : null}
                >
                  {turn.text}
                </p>
              ) : (
                <div className="as-reply" key={turn.id}>
                  {turn.parts.map((part, index) =>
                    part.kind === "tool" ? (
                      <ToolRow
                        key={`t${part.at}`}
                        tool={part.tool}
                        reduced={Boolean(reduced)}
                      />
                    ) : part.text.trim() ? (
                      <Rich key={`x${index}`} text={part.text} />
                    ) : null,
                  )}
                  {!turn.parts.length && !turn.failed ? (
                    <p className="as-pending">
                      <Shimmer>Thinking…</Shimmer>
                    </p>
                  ) : null}
                  {turn.failed ? (
                    <p className="as-failed">
                      <Icon name="x" size={15} /> {turn.failed}
                    </p>
                  ) : null}
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <div className="as-foot">
        {empty && suggestions.length ? (
          <div className="as-openers">
            {suggestions.map((suggestion, index) => (
              <motion.button
                key={suggestion}
                type="button"
                className="as-opener"
                onClick={() => send(suggestion)}
                disabled={busy}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: reduced ? 0 : 0.04 * index,
                  duration: 0.3,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {suggestion}
              </motion.button>
            ))}
          </div>
        ) : null}

        <form
          className="as-bar"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <SmoothTextarea
            ref={box}
            className="as-input"
            rows={1}
            value={draft}
            maxLength={4000}
            aria-label="Ask the study assistant"
            aria-controls={listId}
            placeholder="Ask about your week…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
          />
          {busy ? (
            <button
              type="button"
              className="as-send is-stop"
              onClick={() => abort.current?.abort()}
              aria-label="Stop"
            >
              <span className="as-stop-mark" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              className="as-send"
              disabled={!draft.trim()}
              aria-label="Send"
            >
              <Icon name="arrow" size={18} />
            </button>
          )}
        </form>
        <p className="as-fine">
          Answers can be wrong — check dates and rooms before you rely on them.
          Conversations aren’t saved.
        </p>
      </div>
    </div>
  );
}

/** One tool call: a line saying what happened, opening onto what it found. */
function ToolRow({ tool, reduced }: { tool: Tool; reduced: boolean }) {
  const [open, setOpen] = useState(false);
  if (tool.state === "running")
    return (
      <p className="as-tool is-running">
        <Spinner />
        <Shimmer>{tool.label}</Shimmer>
      </p>
    );

  const { card } = tool;
  const rows = card.rows ?? [];
  const body = (
    <>
      <span className="as-tool-label">{card.label}</span>
      {card.summary ? (
        <span className="as-tool-sum">{card.summary}</span>
      ) : null}
      {rows.length ? (
        <Icon name="chevronDown" size={14} className="as-tool-chev" />
      ) : null}
    </>
  );

  return (
    <div className={`as-tool-wrap tone-${card.tone ?? "default"}`}>
      {rows.length ? (
        <button
          type="button"
          className={`as-tool is-open-${open}`}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {body}
        </button>
      ) : (
        <p className="as-tool">{body}</p>
      )}
      <AnimatePresence initial={false}>
        {open && rows.length ? (
          <motion.div
            className="as-tool-rows"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          >
            <div>
              {rows.map((row, index) => (
                <span className="as-tool-row" key={index}>
                  <Icon name={iconOf(row.icon)} size={15} />
                  <span className="as-row-label">{row.label}</span>
                  {row.detail ? (
                    <span className="as-row-detail">{row.detail}</span>
                  ) : null}
                </span>
              ))}
              {card.href ? (
                <Link className="as-tool-link" href={card.href}>
                  Open <span aria-hidden="true">→</span>
                </Link>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Shimmer({ children }: { children: ReactNode }) {
  return <span className="as-shimmer">{children}</span>;
}

function Spinner() {
  return (
    <svg
      className="as-spin"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ---------- Light formatting ---------- */

const APP_PATH =
  /(^|[\s(])(\/(?:dashboard|calendar|groups|match|rooms|library|courses|profile|assistant)[\w/?=&-]*)/g;

/**
 * The small slice of Markdown a reply actually uses — paragraphs, lists,
 * bold, inline code — built as React nodes, never as HTML.
 */
function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let ordered = false;

  const flush = (key: string) => {
    if (!list.length) return;
    const items = list.map((item, index) => (
      <li key={index}>{inline(item)}</li>
    ));
    blocks.push(
      ordered ? (
        <ol className="as-list is-ordered" key={key}>
          {items}
        </ol>
      ) : (
        <ul className="as-list is-bullet" key={key}>
          {items}
        </ul>
      ),
    );
    list = [];
  };

  for (const [index, raw] of text.split("\n").entries()) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const number = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || number) {
      const wanted = Boolean(number);
      if (list.length && wanted !== ordered) flush(`l${index}`);
      ordered = wanted;
      list.push((bullet ?? number)![1]);
      continue;
    }
    flush(`l${index}`);
    if (!line.trim()) continue;
    // A line that is nothing but bold is a section label, not a sentence —
    // models write "**This week**" above the list it introduces.
    const heading =
      line.match(/^#{1,4}\s+(.*)$/) ?? line.match(/^\*\*(.+?)\*\*:?$/);
    blocks.push(
      heading ? (
        <p className="as-head" key={index}>
          {inline(heading[1])}
        </p>
      ) : (
        <p key={index}>{inline(line)}</p>
      ),
    );
  }
  flush("l-end");
  return <div className="as-rich">{blocks}</div>;
}

/** `**bold**`, `` `code` `` and bare app paths, in order, without regex soup. */
function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) nodes.push(...linkify(text.slice(last, at), key++));
    // Bold can wrap code or a path, so look inside it; `[^*]+` stops recursion.
    if (match[1])
      nodes.push(<strong key={`b${key++}`}>{inline(match[1])}</strong>);
    else nodes.push(<code key={`c${key++}`}>{match[2]}</code>);
    last = at + match[0].length;
  }
  if (last < text.length) nodes.push(...linkify(text.slice(last), key++));
  return nodes;
}

function linkify(text: string, key: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(APP_PATH)) {
    const at = (match.index ?? 0) + match[1].length;
    if (at > last) nodes.push(text.slice(last, at));
    nodes.push(
      <Link className="as-path" href={match[2]} key={`p${key}-${index++}`}>
        {match[2]}
      </Link>,
    );
    last = at + match[2].length;
  }
  nodes.push(text.slice(last));
  return nodes;
}
