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

const title = "Comet Study — Same class. Better company.";
// Previews already show the site name above the title.
const cardTitle = "Same class. Better company.";
const description =
  "Find classmates from your UT Dallas courses, plan study sessions that fit everyone's schedule, and keep each other on track.";

export const metadata: Metadata = {
  // Absolute URLs for the link-preview image; on Vercel, Next falls back to
  // the deployment's own domain when APP_URL isn't set at build time.
  metadataBase: process.env.APP_URL ? new URL(process.env.APP_URL) : undefined,
  title,
  description,
  openGraph: {
    type: "website",
    siteName: "Comet Study",
    title: cardTitle,
    description,
  },
  // Large image card on X; Discord also uses this to show the big preview.
  twitter: { card: "summary_large_image", title: cardTitle, description },
};

export const viewport: Viewport = {
  // Also the accent stripe on Discord/Slack link previews.
  themeColor: "#8b7bff",
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
