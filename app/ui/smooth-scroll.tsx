"use client";

import { ReactLenis, useLenis } from "lenis/react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Same-page links glide through Lenis: hash links to their section, and links
 * to the current page (the logo on the home page) back to the top. New routes
 * start at the top instead of inheriting the smoothed scroll position.
 */
function AnchorGlide() {
  const lenis = useLenis();
  const pathname = usePathname();
  useEffect(() => {
    if (lenis && !location.hash) lenis.scrollTo(0, { immediate: true });
  }, [lenis, pathname]);
  useEffect(() => {
    if (!lenis) return;
    const click = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname)
        return;
      if (!url.hash) {
        event.preventDefault();
        if (location.hash) history.pushState(null, "", url.pathname);
        lenis.scrollTo(0, { duration: 1.4 });
        return;
      }
      const target = document.getElementById(
        decodeURIComponent(url.hash.slice(1)),
      );
      if (!target) return;
      event.preventDefault();
      history.pushState(null, "", url.hash);
      lenis.scrollTo(target, { offset: -24, duration: 1.4 });
      target.focus({ preventScroll: true });
    };
    // Capture phase: run before next/link, whose handler then sees the
    // prevented default and skips its own navigation.
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [lenis]);
  return null;
}

/* 21st.dev "Smooth Scroll" prompt: Lenis on the root scroller. */
export default function SmoothScroll({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(!media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  // A sibling, not a wrapper, so toggling never remounts the page tree.
  return (
    <>
      {enabled ? (
        <ReactLenis
          root
          options={{ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true }}
        >
          <AnchorGlide />
        </ReactLenis>
      ) : null}
      {children}
    </>
  );
}
