"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <defs>
          <linearGradient id="bm-tail" x1="10" y1="30" x2="25" y2="15">
            <stop stopColor="#6ff0d8" stopOpacity="0" />
            <stop offset="0.55" stopColor="#74c7ff" stopOpacity="0.7" />
            <stop offset="1" stopColor="#a99bff" />
          </linearGradient>
          <radialGradient
            id="bm-core"
            cx="0"
            cy="0"
            r="1"
            gradientTransform="translate(25 15) scale(9)"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#fff" />
            <stop offset="0.35" stopColor="#d9d3ff" />
            <stop offset="1" stopColor="#8b7bff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path
          d="M22.2 17.8L9.5 30.5"
          stroke="url(#bm-tail)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M20.4 14.2L12 22.6"
          stroke="url(#bm-tail)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M25.8 19.6L17.4 28"
          stroke="url(#bm-tail)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="25" cy="15" r="9" fill="url(#bm-core)" />
        <circle cx="25" cy="15" r="3.4" fill="#fff" />
      </svg>
    </span>
  );
}

export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    setSigningOut(true);
    await fetch("/api/v1/auth/sign-out", { method: "POST" }).catch(
      () => undefined,
    );
    setSignedIn(false);
    setSigningOut(false);
    router.replace("/");
    router.refresh();
  }
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    let current = true;
    fetch("/api/v1/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => current && setSignedIn(Boolean(payload?.data?.user)))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [pathname]);
  return (
    <header className={`site-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="header-pill">
        <Link className="wordmark" href="/" aria-label="Comet Study home">
          <BrandMark />
          <span className="wordmark-text">
            Comet <em>Study</em>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <Link className="nav-link" href="/#how-it-works">
            How it works
          </Link>
          <Link className="nav-link nav-privacy" href="/#privacy">
            Privacy approach
          </Link>
          {signedIn ? (
            <button
              className="nav-link nav-signout"
              type="button"
              onClick={signOut}
              disabled={signingOut}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          ) : null}
          <Link className="nav-cta" href={signedIn ? "/account" : "/sign-in"}>
            {signedIn ? "Your table" : "Sign in"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
