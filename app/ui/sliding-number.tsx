"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/*
 * Rolling digits, after the 21st.dev "Sliding Number" (motion-primitives by
 * ibelick). Each digit is a 1em window over a strip of numerals (0–9 three
 * times) that a CSS transition slides, so the roll runs on the compositor:
 * no per-frame JavaScript to hitch when the page re-renders, and an ease-out
 * that settles cleanly instead of creeping the last pixel. Digits take the
 * short way round (a countdown's 0 → 9 rolls one step), then the strip
 * quietly re-centers on its middle copy.
 */
const mod = (n: number) => ((n % 10) + 10) % 10;

function Digit({ digit }: { digit: number }) {
  // `pos` is continuous: 9 → 10 keeps rolling the same way instead of
  // rewinding through every numeral.
  const [pos, setPos] = useState(digit);
  const [seen, setSeen] = useState(digit);
  const [snap, setSnap] = useState(false);
  if (digit !== seen) {
    let delta = digit - mod(pos);
    if (delta > 5) delta -= 10;
    if (delta < -5) delta += 10;
    setSeen(digit);
    setPos(pos + delta);
    setSnap(false);
  }
  // One frame without the transition after a re-center, then back on.
  useEffect(() => {
    if (!snap) return;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => setSnap(false)),
    );
    return () => cancelAnimationFrame(frame);
  }, [snap]);
  const recenter = () => {
    if (pos === mod(pos)) return;
    setSnap(true);
    setPos(mod(pos));
  };
  return (
    <span className="sn-digit">
      <span className="sn-sizer">0</span>
      <span
        className={`sn-strip${snap ? " is-snap" : ""}`}
        style={{ transform: `translateY(${(-(pos + 10) * 100) / 30}%)` }}
        onTransitionEnd={recenter}
      >
        {Array.from({ length: 30 }, (_, i) => (
          <span key={i}>{i % 10}</span>
        ))}
      </span>
    </span>
  );
}

export function SlidingNumber({
  value,
  pad = 0,
}: {
  value: number;
  /** Minimum digits, zero-padded ("07"). */
  pad?: number;
}) {
  const reduce = useReducedMotion();
  const text = String(Math.abs(Math.trunc(value))).padStart(pad, "0");
  if (reduce) return <span className="sliding-number">{text}</span>;
  return (
    <span className="sliding-number">
      {text.split("").map((digit, i) => (
        // Keyed by place (ones, tens, …) so digits keep rolling as width changes.
        <Digit key={text.length - i} digit={Number(digit)} />
      ))}
    </span>
  );
}
