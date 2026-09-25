"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { BlurText, FadeUp } from "../ui/motion";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [delivery, setDelivery] = useState<"email" | "console">("email");
  const [devLink, setDevLink] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/v1/auth/request-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error?.message ?? "We couldn't send your link.",
        );
      setDelivery(payload.data?.delivery === "console" ? "console" : "email");
      setDevLink(
        typeof payload.data?.devLink === "string" ? payload.data.devLink : "",
      );
      setStatus("sent");
      setMessage("Check your university inbox for a sign-in link.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "We couldn't send your link.",
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
          {status === "sent" ? (
            <div className="sent-state">
              <span className="sent-orb" aria-hidden="true">
                ✓
              </span>
              <p className="form-message sent" role="status">
                {message}
              </p>
              <p>
                We sent a one-time link to <strong>{email}</strong>. It works
                once and expires in 10 minutes.
                {delivery === "console"
                  ? " (Local dev: the link is also printed in the server console.)"
                  : ""}
              </p>
              {delivery === "email" ? (
                <p className="sent-hint">
                  Don’t see it within a minute? Check your <strong>Junk</strong>{" "}
                  or <strong>Spam</strong> folder, and mark it “Not junk” so
                  future links land in your inbox.
                </p>
              ) : null}
              {devLink ? (
                <a className="button primary" href={devLink}>
                  Open sign-in link <span aria-hidden="true">→</span>
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setMessage("");
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <p className="auth-lede">
                Sign in with your UT Dallas email. We’ll send a one-time link —
                no password needed.
              </p>
              <form
                className="auth-form"
                onSubmit={submit}
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
                    ? "Sending…"
                    : "Email me a sign-in link"}
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
