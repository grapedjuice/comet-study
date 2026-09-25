"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FadeUp } from "../ui/motion";

export default function VerifyPage() {
  const router = useRouter();
  const started = useRef(false);
  const token = useRef("");
  const [state, setState] = useState<
    "checking" | "ready" | "verifying" | "done" | "error"
  >("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Pasted links can pick up spaces or line breaks where a terminal or mail
    // client wrapped them; tokens are base64url, so whitespace is never real.
    const raw = new URLSearchParams(location.hash.slice(1))
      .get("token")
      ?.replace(/\s+/g, "");
    // Drop the token from the address bar and history right away.
    history.replaceState(null, "", "/verify");
    const problem = !raw
      ? "This sign-in link is missing its token."
      : raw.length < 43 // Issued tokens are 32 random bytes → 43 characters.
        ? "This link looks cut off — copy the whole link, or request a new one."
        : "";
    token.current = raw ?? "";
    // Deferred so the state update doesn't happen synchronously in the effect.
    queueMicrotask(() => {
      setMessage(problem);
      setState(problem ? "error" : "ready");
    });
  }, []);

  // Sign-in waits for a real click: university mail scanners (Outlook Safe
  // Links) open every link in a message and would otherwise spend the
  // one-time token before the student ever sees it.
  async function signIn() {
    setState("verifying");
    try {
      const response = await fetch("/api/v1/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.current }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error?.message ?? "We couldn't verify this link.",
        );
      setState("done");
      const needsOnboarding = payload.data?.onboardingRequired !== false;
      setTimeout(
        () => router.replace(needsOnboarding ? "/welcome" : "/"),
        900,
      );
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "We couldn't verify this link.",
      );
    }
  }

  return (
    <main id="main" className="center-page" tabIndex={-1}>
      <FadeUp className="center-card">
        {state === "checking" || state === "verifying" ? (
          <>
            <div className="spinner" aria-hidden="true" />
            <h1>{state === "checking" ? "Opening your link…" : "Signing you in…"}</h1>
            <p role="status">Hang tight — this only takes a second.</p>
          </>
        ) : state === "ready" ? (
          <>
            <h1>
              One tap to <em className="gradient-serif">sign in.</em>
            </h1>
            <p role="status">Confirm it’s you to open your study table.</p>
            <div className="hero-actions">
              <button
                className="button primary"
                type="button"
                onClick={signIn}
                autoFocus
              >
                Continue to Comet Study <span aria-hidden="true">→</span>
              </button>
            </div>
          </>
        ) : state === "done" ? (
          <>
            <span className="sent-orb" aria-hidden="true">
              ✓
            </span>
            <h1>
              You’re <em className="gradient-serif">in.</em>
            </h1>
            <p role="status">Setting up your study table…</p>
          </>
        ) : (
          <>
            <h1>That link didn’t work.</h1>
            <p role="status">{message}</p>
            <div className="hero-actions">
              <Link className="button primary" href="/sign-in">
                Request a new link <span aria-hidden="true">→</span>
              </Link>
            </div>
          </>
        )}
      </FadeUp>
    </main>
  );
}
