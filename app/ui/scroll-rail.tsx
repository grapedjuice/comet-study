"use client";

import { useEffect, useRef } from "react";

/**
 * Replaces the native scrollbar: a slim glass rail whose gradient thumb
 * appears while scrolling or hovering, and can be dragged or clicked.
 */
export default function ScrollRail() {
  const railRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    const thumb = thumbRef.current;
    if (!rail || !thumb) return;
    let hideTimer = 0;
    let drag: { startY: number; startScroll: number } | null = null;

    const metrics = () => {
      const doc = document.documentElement;
      const view = window.innerHeight;
      const total = doc.scrollHeight;
      const size = Math.max(48, (view / total) * view);
      return { view, max: Math.max(1, total - view), size, track: view - size };
    };
    const update = () => {
      const { max, size, track, view } = metrics();
      rail.hidden = document.documentElement.scrollHeight <= view + 1;
      thumb.style.height = `${size}px`;
      thumb.style.transform = `translateY(${(window.scrollY / max) * track}px)`;
    };
    const flash = () => {
      update();
      rail.classList.add("is-active");
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        if (!drag) rail.classList.remove("is-active");
      }, 900);
    };
    const scrollToRatio = (ratio: number) => {
      const { max } = metrics();
      window.scrollTo({ top: Math.min(max, Math.max(0, ratio * max)) });
    };
    const pointerDown = (event: PointerEvent) => {
      event.preventDefault();
      const { size, track } = metrics();
      if (event.target === thumb) {
        drag = { startY: event.clientY, startScroll: window.scrollY };
      } else {
        scrollToRatio((event.clientY - size / 2) / track);
        drag = { startY: event.clientY, startScroll: window.scrollY };
      }
      rail.setPointerCapture(event.pointerId);
      rail.classList.add("is-dragging");
    };
    const pointerMove = (event: PointerEvent) => {
      if (!drag) return;
      const { max, track } = metrics();
      window.scrollTo({
        top: drag.startScroll + ((event.clientY - drag.startY) / track) * max,
      });
    };
    const pointerUp = () => {
      drag = null;
      rail.classList.remove("is-dragging");
      flash();
    };

    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    update();
    window.addEventListener("scroll", flash, { passive: true });
    window.addEventListener("resize", update);
    rail.addEventListener("pointerdown", pointerDown);
    rail.addEventListener("pointermove", pointerMove);
    rail.addEventListener("pointerup", pointerUp);
    rail.addEventListener("pointercancel", pointerUp);
    return () => {
      window.clearTimeout(hideTimer);
      observer.disconnect();
      window.removeEventListener("scroll", flash);
      window.removeEventListener("resize", update);
      rail.removeEventListener("pointerdown", pointerDown);
      rail.removeEventListener("pointermove", pointerMove);
      rail.removeEventListener("pointerup", pointerUp);
      rail.removeEventListener("pointercancel", pointerUp);
    };
  }, []);

  return (
    <div className="scroll-rail" ref={railRef} aria-hidden="true" hidden>
      <div className="scroll-thumb" ref={thumbRef} />
    </div>
  );
}
