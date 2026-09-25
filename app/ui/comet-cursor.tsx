"use client";

import { useEffect, useRef } from "react";

/*
 * Cursor from the 21st.dev "Smooth Cursor" prompt (Magic UI): a spring-follow
 * ring around the pointer, extended with a comet tail — a tapered, glowing
 * ribbon in the brand gradient that streams behind fast movements. The core
 * dot tracks the pointer exactly so aiming never feels laggy.
 */
const TRAIL = 26;
const INTERACTIVE = "a, button, [role='button'], summary, label";
const TEXT = "input, textarea, [contenteditable='true']";

export default function CometCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const fine = window.matchMedia("(pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduced.matches) return;

    const root = document.documentElement;
    root.classList.add("has-comet-cursor");
    let ratio = 1;
    const resize = () => {
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * ratio;
      canvas.height = window.innerHeight * ratio;
    };
    resize();

    const pointer = { x: -100, y: -100 };
    const ring = { x: -100, y: -100, r: 16, target: 16 };
    // 0 = comet, 1 = text caret; springs between the two over text fields.
    const beam = { v: 0, h: 22 };
    const trail: { x: number; y: number }[] = [];
    let visible = false;
    let overText = false;
    let pressed = false;
    let frame = 0;
    let idleFrames = 0;

    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (!visible) {
        ring.x = pointer.x = event.clientX;
        ring.y = pointer.y = event.clientY;
        trail.length = 0;
      }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      visible = true;
      const target = event.target as Element | null;
      overText = Boolean(target?.closest?.(TEXT));
      ring.target = overText ? 0 : target?.closest?.(INTERACTIVE) ? 30 : 16;
      if (overText) {
        // Match the caret to the field's text size.
        const size = parseFloat(getComputedStyle(target as Element).fontSize);
        beam.h = Math.min(34, Math.max(16, (size || 16) * 1.35));
      }
      wake();
    };
    const leave = () => {
      visible = false;
      wake();
    };
    const down = () => {
      pressed = true;
      wake();
    };
    const up = () => {
      pressed = false;
      wake();
    };

    const draw = () => {
      frame = 0;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ring.x += (pointer.x - ring.x) * 0.2;
      ring.y += (pointer.y - ring.y) * 0.2;
      const r = ring.target * (pressed ? 0.75 : 1);
      ring.r += (r - ring.r) * 0.2;
      beam.v += ((overText ? 1 : 0) - beam.v) * 0.22;

      trail.unshift({ x: pointer.x, y: pointer.y });
      if (trail.length > TRAIL) trail.pop();
      // Let the tail collapse back into the head when the pointer rests.
      for (let i = 1; i < trail.length; i++) {
        trail[i].x += (trail[i - 1].x - trail[i].x) * 0.26;
        trail[i].y += (trail[i - 1].y - trail[i].y) * 0.26;
      }

      // Over text fields the comet folds into a glowing, spring-follow caret
      // (the native I-beam is near-invisible on the dark fields).
      if (visible && beam.v > 0.02) {
        const h = beam.h * beam.v;
        const x = ring.x;
        const y = ring.y;
        ctx.globalCompositeOperation = "lighter";
        const halo = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
        halo.addColorStop(0, "rgba(139, 123, 255, 0)");
        halo.addColorStop(0.5, `rgba(139, 150, 255, ${0.35 * beam.v})`);
        halo.addColorStop(1, "rgba(94, 234, 212, 0)");
        ctx.strokeStyle = halo;
        ctx.lineCap = "round";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(x, y - h / 2);
        ctx.lineTo(x, y + h / 2);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
        const core = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
        core.addColorStop(0, `rgba(190, 180, 255, ${beam.v})`);
        core.addColorStop(1, `rgba(140, 240, 225, ${beam.v})`);
        ctx.strokeStyle = core;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - h / 2);
        ctx.lineTo(x, y + h / 2);
        // Small serifs so it still reads as a text cursor.
        const w = 4 * beam.v;
        ctx.moveTo(x - w, y - h / 2);
        ctx.lineTo(x + w, y - h / 2);
        ctx.moveTo(x - w, y + h / 2);
        ctx.lineTo(x + w, y + h / 2);
        ctx.stroke();
      }

      if (visible && beam.v < 0.98) {
        ctx.globalAlpha = 1 - beam.v;
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        // Two passes: a wide soft halo, then a bright tapered core.
        for (const [width, alpha] of [
          [22, 0.12],
          [9, 0.75],
        ]) {
          for (let i = trail.length - 1; i > 0; i--) {
            const a = trail[i];
            const b = trail[i - 1];
            const t = 1 - i / trail.length;
            ctx.strokeStyle = `hsla(${250 - (1 - t) * 85}, 95%, ${60 + t * 14}%, ${t * t * alpha})`;
            ctx.lineWidth = 0.6 + t * width;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        const glow = ctx.createRadialGradient(
          pointer.x,
          pointer.y,
          0,
          pointer.x,
          pointer.y,
          18,
        );
        glow.addColorStop(0, "rgba(200, 190, 255, 0.55)");
        glow.addColorStop(1, "rgba(139, 123, 255, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, pressed ? 2.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();

        if (ring.r > 0.5) {
          ctx.strokeStyle = "rgba(220, 215, 255, 0.55)";
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      const head = trail[0];
      const tail = trail[trail.length - 1];
      const settled =
        Math.hypot(pointer.x - ring.x, pointer.y - ring.y) < 0.3 &&
        Math.abs(ring.r - r) < 0.3 &&
        Math.abs(beam.v - (overText ? 1 : 0)) < 0.01 &&
        (!head || !tail || Math.hypot(head.x - tail.x, head.y - tail.y) < 0.5);
      idleFrames = settled ? idleFrames + 1 : 0;
      if (idleFrames < 3) wake();
    };
    function wake() {
      if (!frame) frame = requestAnimationFrame(draw);
    }

    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      root.classList.remove("has-comet-cursor");
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="comet-cursor" aria-hidden="true" />;
}
