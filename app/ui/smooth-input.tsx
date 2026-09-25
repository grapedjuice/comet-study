"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/*
 * Smooth Input (docs/prompts/smooth-input.md): the native field keeps focus,
 * selection, IME, autofill and form submission, but its text is transparent.
 * A mirror layer underneath draws each letter as its own span, so new letters
 * drop into place, deleted ones fall away and a drawn caret glides between
 * positions.
 */

type Letter = { id: number; ch: string; delay: number | null };
type Ghost = { id: number; ch: string; left: number; top: number };
type Native = HTMLInputElement | HTMLTextAreaElement;

let nextId = 1;
const letters = (text: string, delay: number | null = null) =>
  [...text].map((ch) => ({ id: nextId++, ch, delay }));

function useSmooth(initial: string, multiline: boolean, controlled?: string) {
  const native = useRef<Native>(null);
  const track = useRef<HTMLSpanElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const [chars, setChars] = useState<Letter[]>(() => letters(initial));
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const previous = useRef(initial);
  const focused = useRef(false);

  const place = useCallback(() => {
    const field = native.current;
    const layer = track.current;
    const mark = caret.current;
    if (!field || !layer || !mark) return;
    layer.style.transform = `translate(${-field.scrollLeft}px, ${-field.scrollTop}px)`;
    const start = field.selectionStart ?? 0;
    const show = focused.current && start === field.selectionEnd;
    mark.style.opacity = show ? "1" : "0";
    if (!show) return;
    const spans = layer.querySelectorAll<HTMLElement>("[data-c]");
    const target = spans[Math.min(start, spans.length - 1)];
    if (!target) return;
    const x = target.offsetLeft;
    const y = target.offsetTop;
    const moved = mark.dataset.at !== `${x},${y}`;
    mark.dataset.at = `${x},${y}`;
    mark.style.transform = `translate(${x}px, ${y}px)`;
    mark.style.height = `${target.offsetHeight}px`;
    if (moved) {
      // Stay solid while moving; blink again only once idle.
      mark.classList.remove("idle");
      void mark.offsetWidth;
      mark.classList.add("idle");
    }
  }, []);

  /** Resync without animation (form reset, autofill, value set in code). */
  const resync = useCallback(() => {
    const value = native.current?.value ?? "";
    previous.current = value;
    setChars(letters(value));
  }, []);

  const onInput = useCallback(() => {
    const field = native.current;
    const layer = track.current;
    if (!field) return;
    // Diff by characters (code points), not UTF-16 units.
    const next = [...field.value];
    const prev = [...previous.current];
    previous.current = field.value;
    const max = Math.min(prev.length, next.length);
    let p = 0;
    while (p < max && prev[p] === next[p]) p++;
    let s = 0;
    while (
      s < max - p &&
      prev[prev.length - 1 - s] === next[next.length - 1 - s]
    )
      s++;
    const removedEnd = prev.length - s;
    const added = next.slice(p, next.length - s);
    if (!added.length && removedEnd === p) return;

    // Removed letters become ghosts that fall away from where they stood.
    if (removedEnd > p && layer) {
      const spans = layer.querySelectorAll<HTMLElement>("[data-c]");
      const fallen: Ghost[] = [];
      for (let i = p; i < removedEnd && fallen.length < 16; i++) {
        const span = spans[i];
        if (span && prev[i].trim())
          fallen.push({
            id: nextId++,
            ch: prev[i],
            left: span.offsetLeft,
            top: span.offsetTop,
          });
      }
      if (fallen.length) {
        setGhosts((current) => [...current, ...fallen]);
        const ids = new Set(fallen.map((g) => g.id));
        setTimeout(
          () => setGhosts((current) => current.filter((g) => !ids.has(g.id))),
          320,
        );
      }
    }

    const step = added.length > 1 ? Math.min(12, 240 / added.length) : 0;
    setChars((current) =>
      current.length !== prev.length
        ? letters(field.value) // Out of step (shouldn't happen): resync quietly.
        : [
            ...current.slice(0, p),
            ...added.map((ch, i) => ({ id: nextId++, ch, delay: i * step })),
            ...current.slice(removedEnd),
          ],
    );
  }, []);

  useLayoutEffect(place, [chars, place]);

  // Controlled fields: follow values set in code (typing already matched).
  useLayoutEffect(() => {
    if (controlled !== undefined && controlled !== previous.current) resync();
  }, [controlled, resync]);

  useEffect(() => {
    const field = native.current;
    if (!field) return;
    const onFocus = () => {
      focused.current = true;
      place();
    };
    const onBlur = () => {
      focused.current = false;
      place();
    };
    const onSelection = () => {
      if (document.activeElement === field) place();
    };
    const form = field.form;
    const onReset = () => setTimeout(resync);
    field.addEventListener("focus", onFocus);
    field.addEventListener("blur", onBlur);
    field.addEventListener("scroll", place);
    field.addEventListener("keyup", place);
    field.addEventListener("select", place);
    document.addEventListener("selectionchange", onSelection);
    form?.addEventListener("reset", onReset);
    // Browser autofill and restored form state don't fire input events.
    if (field.value !== previous.current) resync();
    return () => {
      field.removeEventListener("focus", onFocus);
      field.removeEventListener("blur", onBlur);
      field.removeEventListener("scroll", place);
      field.removeEventListener("keyup", place);
      field.removeEventListener("select", place);
      document.removeEventListener("selectionchange", onSelection);
      form?.removeEventListener("reset", onReset);
    };
  }, [place, resync]);

  const mirror = (
    <span
      className={`smooth-mirror${multiline ? " multi" : ""}`}
      aria-hidden="true"
    >
      <span className="smooth-track" ref={track}>
        {multiline ? words(chars) : chars.map(glyph)}
        <span data-c className="smooth-end">
          {"​"}
        </span>
        {ghosts.map((g) => (
          <span
            key={g.id}
            className="smooth-ghost"
            style={{ left: g.left, top: g.top }}
          >
            {g.ch}
          </span>
        ))}
        <span className="smooth-caret idle" ref={caret} />
      </span>
    </span>
  );
  return { native, onInput, mirror };
}

function glyph(letter: Letter) {
  if (letter.ch === "\n")
    return (
      <span key={letter.id} data-c className="smooth-nl">
        {"\n"}
      </span>
    );
  return (
    <span
      key={letter.id}
      data-c
      className={letter.delay === null ? "smooth-ch" : "smooth-ch in"}
      style={letter.delay ? { animationDelay: `${letter.delay}ms` } : undefined}
    >
      {letter.ch}
    </span>
  );
}

/** Group letters into words so a textarea mirror wraps at spaces. */
function words(chars: Letter[]) {
  const out: React.ReactNode[] = [];
  let word: Letter[] = [];
  const flush = () => {
    if (!word.length) return;
    out.push(
      <span key={`w${word[0].id}`} className="smooth-word">
        {word.map(glyph)}
      </span>,
    );
    word = [];
  };
  for (const letter of chars) {
    if (letter.ch === " " || letter.ch === "\n" || letter.ch === "\t") {
      flush();
      out.push(glyph(letter));
    } else word.push(letter);
  }
  flush();
  return out;
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  type?: "text" | "search" | "url" | "tel";
};

export const SmoothInput = forwardRef<HTMLInputElement, InputProps>(
  function SmoothInput(
    { className, defaultValue, value, onInput, type = "text", ...props },
    ref,
  ) {
    const {
      native,
      onInput: track,
      mirror,
    } = useSmooth(
      String(value ?? defaultValue ?? ""),
      false,
      value === undefined ? undefined : String(value),
    );
    useImperativeHandle(ref, () => native.current as HTMLInputElement);
    return (
      <span className={`smooth-field ${className ?? ""}`}>
        {mirror}
        <input
          {...props}
          ref={native as React.RefObject<HTMLInputElement>}
          type={type}
          {...(value === undefined ? { defaultValue } : { value })}
          className="smooth-native"
          onInput={(event) => {
            track();
            onInput?.(event);
          }}
        />
      </span>
    );
  },
);

export const SmoothTextarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function SmoothTextarea({ className, defaultValue, onInput, ...props }, ref) {
  const {
    native,
    onInput: track,
    mirror,
  } = useSmooth(String(defaultValue ?? ""), true);
  useImperativeHandle(ref, () => native.current as HTMLTextAreaElement);
  return (
    <span className={`smooth-field multi ${className ?? ""}`}>
      {mirror}
      <textarea
        {...props}
        ref={native as React.RefObject<HTMLTextAreaElement>}
        defaultValue={defaultValue}
        className="smooth-native"
        onInput={(event) => {
          track();
          onInput?.(event);
        }}
      />
    </span>
  );
});
