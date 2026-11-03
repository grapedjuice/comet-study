"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { BlurText, FadeUp } from "../../ui/motion";

async function post(path: string, body: object) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(payload.error?.message ?? "Something went wrong.");
  return payload.data;
}

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [delivery, setDelivery] = useState<"email" | "console">("email");

  async function requestCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const data = await post("/api/v1/auth/request-verification", { email });
      setDelivery(data?.delivery === "console" ? "console" : "email");
      setCode("");
      setStep("code");
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "We couldn't send your code.",
      );
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const data = await post("/api/v1/auth/verify-email", { email, code });
      setStep("done");
      setStatus("idle");
      const needsOnboarding = data?.onboardingRequired !== false;
      setTimeout(
        () => router.replace(needsOnboarding ? "/welcome" : "/dashboard"),
        900,
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "We couldn't check that code.",
      );
    }
  }

  return (
    <main id="main" className="auth-page" tabIndex={-1}>
      <aside className="auth-aside">
        <p className="section-kicker">Comet Study</p>
        <h2>
          <BlurText text="A seat at the" />
          <br />
          <em className="gradient-serif">
            <BlurText text="study table." delay={0.2} />
          </em>
        </h2>
        <FadeUp delay={0.4}>
          <p>
            A familiar face. A shared problem set. A reason to show up next
            week.
          </p>
          <Link className="text-link" href="/#demo">
            Explore the product demo <span aria-hidden="true">↗</span>
          </Link>
        </FadeUp>
      </aside>
      <FadeUp delay={0.15}>
        <div className="auth-card">
          <Link className="back-link" href="/">
            ← Back home
          </Link>
          <p className="eyebrow">Sign in</p>
          <h1>Find your people.</h1>
          {step === "done" ? (
            <div className="sent-state">
              <span className="sent-orb" aria-hidden="true">
                ✓
              </span>
              <p className="form-message sent" role="status">
                You’re in. Setting up your study table…
              </p>
            </div>
          ) : step === "code" ? (
            <>
              <p className="auth-lede">
                We emailed a 6-character code to <strong>{email}</strong>. It
                works once and expires in 10 minutes.
                {delivery === "console"
                  ? " (Local dev: the code is printed in the server console.)"
                  : ""}
              </p>
              {delivery === "email" ? (
                <p className="auth-hint">
                  Don’t see it within a minute? Check your <strong>Junk</strong>{" "}
                  or <strong>Spam</strong> folder.
                </p>
              ) : null}
              <form
                className="auth-form"
                onSubmit={verifyCode}
                aria-busy={status === "loading"}
              >
                <label htmlFor="code">Sign-in code</label>
                <input
                  id="code"
                  name="code"
                  className="code-input"
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  pattern="[A-Za-z0-9]{6}"
                  maxLength={6}
                  placeholder="••••••"
                  value={code}
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .replace(/[^A-Za-z0-9]/g, "")
                        .toUpperCase()
                        .slice(0, 6),
                    )
                  }
                  autoFocus
                  required
                />
                <button
                  className="button primary"
                  type="submit"
                  disabled={status === "loading" || code.length !== 6}
                >
                  {status === "loading" ? "Checking…" : "Sign in"}
                </button>
                {message ? (
                  <p className={`form-message ${status}`} role="status">
                    {message}
                  </p>
                ) : null}
              </form>
              <p className="auth-actions">
                <button
                  type="button"
                  onClick={() => requestCode()}
                  disabled={status === "loading"}
                >
                  Send a new code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setStatus("idle");
                    setMessage("");
                  }}
                >
                  Use a different email
                </button>
              </p>
            </>
          ) : (
            <>
              <p className="auth-lede">
                Sign in with your UT Dallas email and we’ll send you a
                6-character code — no password needed.
              </p>
              <form
                className="auth-form"
                onSubmit={requestCode}
                aria-busy={status === "loading"}
              >
                <label htmlFor="email">UT Dallas email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@utdallas.edu"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <button
                  className="button primary"
                  type="submit"
                  disabled={status === "loading"}
                >
                  {status === "loading"
                    ? "Sending your code…"
                    : "Email me a code"}
                </button>
                {message ? (
                  <p className={`form-message ${status}`} role="status">
                    {message}
                  </p>
                ) : null}
              </form>
              <p className="auth-footnote">
                Only exact <strong>@utdallas.edu</strong> addresses are
                eligible.
              </p>
            </>
          )}
        </div>
      </FadeUp>
    </main>
  );
}
