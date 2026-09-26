"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "../../ui/site-header";
import { Icon, type IconName } from "./icons";

const NAV: { href: string; label: string; icon: IconName; mobile?: boolean }[] =
  [
    { href: "/dashboard", label: "Home", icon: "home", mobile: true },
    { href: "/calendar", label: "Calendar", icon: "calendar", mobile: true },
    { href: "/groups", label: "Groups", icon: "groups", mobile: true },
    { href: "/match", label: "Find matches", icon: "match" },
    { href: "/rooms", label: "Rooms", icon: "rooms", mobile: true },
    { href: "/library", label: "Library", icon: "library" },
    { href: "/courses", label: "Courses", icon: "courses" },
  ];

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export default function AppNav({
  name,
  initials,
  email,
}: {
  name: string;
  initials: string;
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/v1/auth/sign-out", { method: "POST" }).catch(
      () => undefined,
    );
    router.replace("/");
    router.refresh();
  }

  const extra = NAV.filter((item) => !item.mobile);
  return (
    <>
      <aside className="app-rail" aria-label="App">
        <Link
          className="wordmark rail-brand"
          href="/dashboard"
          aria-label="Comet Study home"
        >
          <BrandMark />
          <span className="wordmark-text">
            Comet <em>Study</em>
          </span>
        </Link>
        <nav className="rail-nav" aria-label="Main navigation">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rail-link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {active ? (
                  <motion.span
                    layoutId="rail-active"
                    className="rail-active"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                ) : null}
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="rail-footer">
          <Link
            href="/profile"
            className={`rail-user${isActive(pathname, "/profile") ? " is-active" : ""}`}
          >
            <span className="avatar tone-0">{initials}</span>
            <span className="rail-user-text">
              <strong>{name}</strong>
              <span>{email}</span>
            </span>
          </Link>
          <button
            className="rail-signout"
            type="button"
            onClick={signOut}
            disabled={signingOut}
          >
            <Icon name="signout" size={18} />
            <span>{signingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      </aside>

      <header className="app-topbar">
        <Link
          className="wordmark"
          href="/dashboard"
          aria-label="Comet Study home"
        >
          <BrandMark />
          <span className="wordmark-text">
            Comet <em>Study</em>
          </span>
        </Link>
        <Link
          href="/profile"
          className="topbar-avatar"
          aria-label="Your profile"
        >
          <span className="avatar tone-0">{initials}</span>
        </Link>
      </header>

      <nav className="app-tabbar" aria-label="Main navigation">
        {NAV.filter((item) => item.mobile).map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`tab-link${active ? " is-active" : ""}`}
              onClick={() => setMore(false)}
              aria-current={active ? "page" : undefined}
            >
              {active ? <TabbarActive /> : null}
              <Icon name={item.icon} size={22} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          className={`tab-link${extra.some((item) => isActive(pathname, item.href)) ? " is-active" : ""}`}
          type="button"
          aria-expanded={more}
          aria-controls="more-sheet"
          onClick={() => setMore((open) => !open)}
        >
          {extra.some((item) => isActive(pathname, item.href)) ? (
            <TabbarActive />
          ) : null}
          <Icon name="more" size={22} />
          <span>More</span>
        </button>
      </nav>

      <AnimatePresence>
        {more ? (
          <>
            <motion.div
              className="sheet-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMore(false)}
            />
            <motion.div
              id="more-sheet"
              className="more-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
            >
              {[
                ...extra,
                {
                  href: "/profile",
                  label: "Profile & availability",
                  icon: "profile" as const,
                },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="sheet-link"
                  onClick={() => setMore(false)}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              ))}
              <button
                className="sheet-link"
                type="button"
                onClick={signOut}
                disabled={signingOut}
              >
                <Icon name="signout" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/** The mobile tab bar's highlight; it slides to whichever tab is current. */
function TabbarActive() {
  return (
    <motion.span
      layoutId="tabbar-active"
      className="tabbar-active"
      aria-hidden="true"
      transition={{ type: "spring", stiffness: 460, damping: 34 }}
    />
  );
}
