"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FadeUp } from "../ui/motion";

export default function VerifyPage() {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<"verifying" | "done" | "error">(
    "verifying",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Pasted links can pick up spaces or line breaks where a terminal or mail
    // client wrapped them; tokens are base64url, so whitespace is never real.
    const token = new URLSearchParams(location.hash.slice(1))
      .get("token")
      ?.replace(/\s+/g, "");
    // Drop the token from the address bar and history right away.
    history.replaceState(null, "", "/verify");
    const verify = async () => {
      if (!token) throw new Error("This sign-in link is missing its token.");
      // Issued tokens are 32 random bytes → 43 base64url characters.
      if (token.length < 43)
        throw new Error(
          "This link looks cut off — copy the whole link, or request a new one.",
        );
      const response = await fetch("/api/v1/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error?.message ?? "We couldn't verify this link.",
        );
      return payload.data?.onboardingRequired !== false;
    };
    verify()
      .then((needsOnboarding) => {
        setState("done");
        setTimeout(
          () => router.replace(needsOnboarding ? "/welcome" : "/"),
          900,
        );
      })
      .catch((error: unknown) => {
        setState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "We couldn't verify this link.",
        );
      });
  }, [router]);

  return (
    <main id="main" className="center-page" tabIndex={-1}>
      <FadeUp className="center-card">
        {state === "verifying" ? (
          <>
            <div className="spinner" aria-hidden="true" />
            <h1>Checking your link…</h1>
            <p role="status">Hang tight — this only takes a second.</p>
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
