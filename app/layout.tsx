import type { Metadata, Viewport } from "next";
import Link from "next/link";
import CometCursor from "./ui/comet-cursor";
import Cosmos from "./ui/cosmos";
import ScrollRail from "./ui/scroll-rail";
import SiteHeader from "./ui/site-header";
import SmoothScroll from "./ui/smooth-scroll";
import { ScrollProgress } from "./ui/motion";
import "@fontsource-variable/geist";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comet Study — Same class. Better company.",
  description:
    "A course-aware study companion for UT Dallas students. Find your people, make a plan, and keep showing up.",
};

export const viewport: Viewport = {
  themeColor: "#04050b",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Cosmos />
        <div className="grain" aria-hidden="true" />
        <ScrollProgress />
        <ScrollRail />
        <CometCursor />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SmoothScroll>
          <SiteHeader />
          {children}
          <footer className="site-footer">
            <div className="footer-inner">
              <p className="footer-brand">
                A little company. <em>A lot of possibility.</em>
              </p>
              <div className="footer-links">
                <Link href="/#how-it-works">How it works</Link>
                <Link className="footer-privacy" href="/#privacy">
                  Privacy approach
                </Link>
                <Link href="/sign-in">Sign in</Link>
              </div>
              <p className="footer-note">
                Independent student project. Not an official UT Dallas service.
              </p>
            </div>
          </footer>
        </SmoothScroll>
      </body>
    </html>
  );
}
