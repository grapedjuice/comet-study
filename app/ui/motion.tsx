"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

const spring = { stiffness: 140, damping: 32, mass: 0.5 };

/**
 * Scroll-linked entrance: content lifts, un-tilts and un-blurs as the page
 * brings it up, so sections arrive at the reader instead of being scrolled to.
 */
export function Rise({
  children,
  className,
  distance = 120,
  tilt = 14,
  style,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
  tilt?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start 58%"],
  });
  const p = useSpring(scrollYProgress, spring);
  const y = useTransform(p, [0, 1], [distance, 0]);
  const rotateX = useTransform(p, [0, 1], [tilt, 0]);
  const scale = useTransform(p, [0, 1], [0.92, 1]);
  const opacity = useTransform(p, [0, 0.7], [0, 1]);
  const blur = useTransform(p, [0, 0.8], [14, 0]);
  const filter = useTransform(blur, (value) => `blur(${value}px)`);
  return (
    <motion.div
      ref={ref}
      className={className}
      style={
        reduced
          ? style
          : {
              ...style,
              y,
              rotateX,
              scale,
              opacity,
              filter,
              transformPerspective: 1400,
              transformOrigin: "50% 0%",
            }
      }
    >
      {children}
    </motion.div>
  );
}

/** Word-by-word blur reveal (21st.dev "Blur Reveal", reduced to words). */
export function BlurText({
  text,
  className,
  delay = 0,
  as = "span",
}: {
  text: string;
  className?: string;
  delay?: number;
  as?: "span" | "p";
}) {
  const reduced = useReducedMotion();
  const Tag = as === "p" ? motion.p : motion.span;
  const words = text.split(" ");
  return (
    <Tag
      className={className}
      initial={reduced ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount: 0.4 }}
      transition={{ staggerChildren: 0.06, delayChildren: delay }}
    >
      <span className="sr-only">{text}</span>
      {words.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          aria-hidden="true"
          className="blur-word"
          variants={{
            hidden: { opacity: 0, filter: "blur(14px)", y: "0.35em" },
            visible: {
              opacity: 1,
              filter: "blur(0px)",
              y: "0em",
              transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
            },
          }}
        >
          {word}
          {index < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </Tag>
  );
}

/** Time-based entrance for above-the-fold content. */
export function FadeUp({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 28, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 1, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Container-scroll tilt (21st.dev "Container Scroll Animation"): the panel
 * starts laid back and stands up to face the reader as the hero scrolls.
 */
export function TiltPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start 20%"],
  });
  const p = useSpring(scrollYProgress, spring);
  const rotateX = useTransform(p, [0, 1], [24, 0]);
  const scale = useTransform(p, [0, 1], [0.94, 1]);
  const y = useTransform(p, [0, 1], [40, 0]);
  return (
    <div className="tilt-stage">
      <motion.div
        ref={ref}
        className={className}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.5 }}
        style={
          reduced
            ? undefined
            : { rotateX, scale, y, transformPerspective: 1600 }
        }
      >
        {children}
      </motion.div>
    </div>
  );
}

/* Stacking cards (21st.dev "Stacking Cards" by Khoa Phan), CSS-module free. */
const StackContext = createContext<{
  progress: MotionValue<number>;
  total: number;
} | null>(null);

export function StackingCards({
  children,
  total,
  className,
}: {
  children: ReactNode;
  total: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  return (
    <StackContext.Provider value={{ progress: scrollYProgress, total }}>
      <div ref={ref} className={className}>
        {children}
      </div>
    </StackContext.Provider>
  );
}

export function StackingCard({
  index,
  children,
  className,
}: {
  index: number;
  children: ReactNode;
  className?: string;
}) {
  const context = useContext(StackContext);
  if (!context) throw new Error("StackingCard must be inside StackingCards");
  const reduced = useReducedMotion();
  const { progress, total } = context;
  const ref = useRef<HTMLDivElement>(null);
  const start = index / total;
  const scale = useTransform(
    progress,
    [start, 1],
    [1, 1 - (total - index - 1) * 0.05],
  );
  const dim = useTransform(
    progress,
    [start, Math.min(1, start + 1 / total)],
    [1, index === total - 1 ? 1 : 0.3],
  );
  const filter = useTransform(dim, (value) => `brightness(${value})`);
  const { scrollYProgress: enter } = useScroll({
    target: ref,
    offset: ["start end", "start start"],
  });
  const rotateX = useTransform(enter, [0, 1], [18, 0]);
  return (
    <div
      ref={ref}
      className="stack-slot"
      style={{ "--stack-offset": `${index * 22}px` } as CSSProperties}
    >
      <motion.div
        className={className}
        style={
          reduced
            ? undefined
            : {
                scale,
                filter,
                rotateX,
                transformPerspective: 1400,
                transformOrigin: "50% 0%",
              }
        }
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Top-of-page scroll progress hairline. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 40 });
  return (
    <motion.div
      className="scroll-progress"
      aria-hidden="true"
      style={{ scaleX }}
    />
  );
}

/** Cursor-following spotlight for any descendant with [data-spotlight]. */
export function SpotlightGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const move = (event: PointerEvent) => {
      for (const card of root.querySelectorAll<HTMLElement>(
        "[data-spotlight]",
      )) {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        card.style.setProperty("--my", `${event.clientY - rect.top}px`);
      }
    };
    root.addEventListener("pointermove", move);
    return () => root.removeEventListener("pointermove", move);
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
