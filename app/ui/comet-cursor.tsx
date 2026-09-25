"use client";

import { useEffect, useRef } from "react";

/*
 * Cursor from the 21st.dev "Smooth Cursor" prompt (Magic UI): a spring-follow
 * ring around the pointer, extended with a comet tail — a tapered, glowing
 * ribbon in the brand gradient that streams behind fast movements. The whole
 * cursor eases toward the pointer so movement glides instead of snapping.
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
    // The drawn cursor eases toward the pointer (like hackutd.co's), and the
    // ring eases toward the head, so the whole comet glides.
    const head = { x: -100, y: -100 };
    let last = 0;
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
        ring.x = head.x = pointer.x = event.clientX;
        ring.y = head.y = pointer.y = event.clientY;
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

    const draw = (now: number) => {
      frame = 0;
      // Frame-rate independent easing: same feel at 60 Hz and 144 Hz.
      const dt = last ? Math.min(64, now - last) : 16.7;
      last = now;
      const ease = (rate: number) => 1 - Math.pow(1 - rate, dt / 16.7);
      const kHead = ease(0.34);
      const kRing = ease(0.24);
      head.x += (pointer.x - head.x) * kHead;
      head.y += (pointer.y - head.y) * kHead;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ring.x += (head.x - ring.x) * kRing;
      ring.y += (head.y - ring.y) * kRing;
      const r = ring.target * (pressed ? 0.75 : 1);
      ring.r += (r - ring.r) * ease(0.2);
      beam.v += ((overText ? 1 : 0) - beam.v) * ease(0.22);

      trail.unshift({ x: head.x, y: head.y });
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
        const x = head.x;
        const y = head.y;
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
          head.x,
          head.y,
          0,
          head.x,
          head.y,
          18,
        );
        glow.addColorStop(0, "rgba(200, 190, 255, 0.55)");
        glow.addColorStop(1, "rgba(139, 123, 255, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(head.x, head.y, pressed ? 2.5 : 3.5, 0, Math.PI * 2);
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

      const front = trail[0];
      const tail = trail[trail.length - 1];
      const settled =
        Math.hypot(pointer.x - head.x, pointer.y - head.y) < 0.3 &&
        Math.hypot(head.x - ring.x, head.y - ring.y) < 0.3 &&
        Math.abs(ring.r - r) < 0.3 &&
        Math.abs(beam.v - (overText ? 1 : 0)) < 0.01 &&
        (!front ||
          !tail ||
          Math.hypot(front.x - tail.x, front.y - tail.y) < 0.5);
      idleFrames = settled ? idleFrames + 1 : 0;
      if (idleFrames < 3) wake();
      else last = 0; // Resume from a fresh timestamp after idling.
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
