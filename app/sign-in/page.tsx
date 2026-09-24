"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
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
      <div className="auth-card">
        <Link className="back-link" href="/">
          ← Back home
        </Link>
        <p className="eyebrow">Comet Study</p>
        <h1>Find your people.</h1>
        <p className="auth-lede">
          Sign in with your UT Dallas email. We’ll send a one-time link so you
          can pick up where you left off.
        </p>
        <form className="auth-form" onSubmit={submit}>
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
            {status === "loading" ? "Sending…" : "Email me a sign-in link"}
          </button>
          {message ? (
            <p className={`form-message ${status}`} role="status">
              {message}
            </p>
          ) : null}
        </form>
        <p className="auth-footnote">
          Only exact <strong>@utdallas.edu</strong> addresses are eligible.
        </p>
      </div>
    </main>
  );
}
