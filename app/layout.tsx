import type { Metadata, Viewport } from "next";
import CometCursor from "./ui/comet-cursor";
import Cosmos from "./ui/cosmos";
import ScrollRail from "./ui/scroll-rail";
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
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
