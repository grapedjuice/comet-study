import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comet Study — Make time to learn together",
  description:
    "A course-aware study companion for UT Dallas students. Find your people, make a plan, and keep showing up.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <Link className="wordmark" href="/" aria-label="Comet Study home">
            <span className="brand-mark" aria-hidden="true">
              ✳
            </span>{" "}
            Comet Study
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/#how-it-works">How it works</Link>
            <Link href="/#privacy">Privacy approach</Link>
            <Link className="nav-cta" href="/sign-in">
              Sign in
            </Link>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <p>Made for the people you learn with.</p>
          <p>Independent student project. Not an official UT Dallas service.</p>
        </footer>
      </body>
    </html>
  );
}
