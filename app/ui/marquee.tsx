"use client";

import { useEffect, useRef } from "react";

/**
 * Infinite course ticker. Each item moves on its own small layer and wraps
 * from the left edge to the end of the line, so the loop never runs out and
 * there is no giant animated strip for the compositor to drop tiles from.
 * Scrolling the page briefly speeds it up. Static under reduced motion.
 */
export default function Marquee({
  items,
  speed = 55,
}: {
  items: string[];
  speed?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-item]"));
    if (!nodes.length) return;

    let positions: number[] = [];
    let widths: number[] = [];
    const layout = () => {
      widths = nodes.map((node) => node.offsetWidth);
      let x = 0;
      positions = widths.map((width) => {
        const at = x;
        x += width;
        return at;
      });
      root.classList.add("is-live");
    };

    let frame = 0;
    let last = performance.now();
    let boost = 0;
    let lastScroll = window.scrollY;
    let visible = true;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const scrollY = window.scrollY;
      // Scroll velocity (px/frame) kicks the speed up, then eases off.
      boost = Math.min(6, boost * 0.92 + Math.abs(scrollY - lastScroll) * 0.02);
      lastScroll = scrollY;
      const shift = speed * (1 + boost) * dt;
      const total = widths.reduce((sum, width) => sum + width, 0);
      for (let i = 0; i < nodes.length; i++) {
        positions[i] -= shift;
        // Past the left edge: rejoin at the end of the line.
        if (positions[i] + widths[i] < 0) positions[i] += total;
        nodes[i].style.transform = `translate3d(${positions[i]}px,0,0)`;
      }
      if (visible) frame = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    layout();
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && !document.hidden;
      if (visible) start();
      else cancelAnimationFrame(frame);
    });
    observer.observe(root);
    const resize = new ResizeObserver(layout);
    resize.observe(root);
    document.fonts?.ready.then(layout).catch(() => undefined);
    const visibility = () => {
      visible = !document.hidden;
      if (visible) start();
      else cancelAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", visibility);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      root.classList.remove("is-live");
      for (const node of nodes) node.style.transform = "";
    };
  }, [items, speed]);

  // Enough copies that the line is always wider than any screen plus one item.
  const line = [...items, ...items, ...items];
  return (
    <div className="marquee" ref={rootRef} aria-hidden="true">
      {line.map((code, index) => (
        <span className="marquee-item" data-item key={`${code}-${index}`}>
          {code}
          <i>✦</i>
        </span>
      ))}
    </div>
  );
}
