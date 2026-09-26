"use client";

import { useEffect } from "react";

/*
 * On desktop the month grid fits the window, so a day shows only the lines
 * that fit (the rest wrap into a hidden column). This counts what didn't fit
 * in each day, plus anything the server left out, into the "+N" badge next to
 * the date, and recounts when the window resizes.
 */
export function MonthOverflow() {
  useEffect(() => {
    const grid = document.querySelector<HTMLElement>(".month-grid");
    if (!grid) return;
    const count = () => {
      for (const day of grid.querySelectorAll<HTMLElement>(".mg-day")) {
        const badge = day.querySelector<HTMLElement>(".mg-more");
        if (!badge) continue;
        const left = day.querySelector<HTMLElement>(".mg-top")?.offsetLeft ?? 0;
        const hidden = [
          ...day.querySelectorAll<HTMLElement>(".mg-item"),
        ].filter(
          (item) => item.offsetLeft > left + 4 || item.offsetParent === null,
        ).length;
        const total = hidden + Number(day.dataset.extra ?? 0);
        badge.textContent = total ? `+${total}` : "";
        badge.title = total ? `${total} more — open the week` : "";
      }
    };
    count();
    const observer = new ResizeObserver(count);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);
  return null;
}
