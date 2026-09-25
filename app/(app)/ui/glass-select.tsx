"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";

/*
 * Select rebuilt from the 21st.dev "Select" (Jolly UI / react-aria) pattern
 * without the dependency: a trigger button, a listbox in a portal so panels
 * never clip it, flip-up when there's no room below, full keyboard support,
 * and a hidden input so it submits with ordinary forms (GET or actions).
 */

export type SelectOption = { value: string; label: string; hint?: string };

export function GlassSelect({
  name,
  options,
  defaultValue,
  label,
  ariaLabel,
  className,
  onChange,
}: {
  name: string;
  options: SelectOption[];
  defaultValue?: string;
  label?: string;
  ariaLabel?: string;
  className?: string;
  onChange?: (value: string) => void;
}) {
  const initial = options.some((o) => o.value === defaultValue)
    ? defaultValue!
    : (options[0]?.value ?? "");
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    max: number;
  } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const id = useId();
  const selected = options.find((o) => o.value === value) ?? options[0];

  const choose = useCallback(
    (next: string) => {
      setValue(next);
      setOpen(false);
      onChange?.(next);
      trigger.current?.focus();
    },
    [onChange],
  );

  const measure = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const want = Math.min(320, options.length * 44 + 12);
    const up = below < Math.min(want, 220) && above > below;
    setPlace({
      left: rect.left,
      width: rect.width,
      max: Math.max(120, Math.min(320, up ? above : below) - 6),
      ...(up
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    });
  }, [options.length]);

  const show = () => {
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    measure();
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    list.current
      ?.querySelector<HTMLElement>(`[data-i="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!list.current?.contains(target) && !trigger.current?.contains(target))
        setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  // Follow the form: reset restores the initial choice.
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form) return;
    const reset = () => setValue(initial);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [initial]);

  const onListKey = (event: React.KeyboardEvent) => {
    const last = options.length - 1;
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((i) => Math.min(last, i + 1)),
      ArrowUp: () => setActive((i) => Math.max(0, i - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      PageDown: () => setActive((i) => Math.min(last, i + 6)),
      PageUp: () => setActive((i) => Math.max(0, i - 6)),
      Enter: () => choose(options[active].value),
      " ": () => choose(options[active].value),
      Escape: () => {
        setOpen(false);
        trigger.current?.focus();
      },
      Tab: () => setOpen(false),
    };
    const run = keys[event.key];
    if (run) {
      if (event.key !== "Tab") event.preventDefault();
      run();
      return;
    }
    // Type to jump, like a native select.
    if (event.key.length === 1) {
      const now = Date.now();
      typed.current.text =
        (now - typed.current.at < 700 ? typed.current.text : "") +
        event.key.toLowerCase();
      typed.current.at = now;
      const hit = options.findIndex((o) =>
        o.label.toLowerCase().startsWith(typed.current.text),
      );
      if (hit >= 0) setActive(hit);
    }
  };

  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  return (
    <div
      className={`glass-select${label ? " form-field" : ""}${className ? ` ${className}` : ""}`}
    >
      {label ? (
        <span className="field-label" id={labelId}>
          {label}
        </span>
      ) : null}
      <input ref={hidden} type="hidden" name={name} value={value} />
      <button
        ref={trigger}
        type="button"
        className={`field select-trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-labelledby={label ? `${labelId} ${valueId}` : undefined}
        aria-label={
          label ? undefined : `${ariaLabel ?? name}: ${selected?.label ?? ""}`
        }
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            show();
          }
        }}
      >
        <span className="select-value" id={valueId}>
          {selected?.label}
        </span>
        <Icon name="chevronDown" size={16} className="select-chevron" />
      </button>
      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {open && place ? (
                <motion.ul
                  ref={list}
                  id={`${id}-list`}
                  role="listbox"
                  tabIndex={-1}
                  aria-labelledby={label ? labelId : undefined}
                  aria-label={label ? undefined : ariaLabel}
                  aria-activedescendant={`${id}-o${active}`}
                  className="select-list"
                  data-lenis-prevent
                  style={{
                    left: place.left,
                    width: place.width,
                    top: place.top,
                    bottom: place.bottom,
                    maxHeight: place.max,
                    transformOrigin: place.top !== undefined ? "top" : "bottom",
                  }}
                  initial={{
                    opacity: 0,
                    scale: 0.96,
                    y: place.top !== undefined ? -6 : 6,
                  }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    scale: 0.97,
                    transition: { duration: 0.12 },
                  }}
                  transition={{ type: "spring", stiffness: 520, damping: 34 }}
                  onKeyDown={onListKey}
                >
                  {options.map((option, i) => (
                    <li
                      key={option.value}
                      id={`${id}-o${i}`}
                      data-i={i}
                      role="option"
                      aria-selected={option.value === value}
                      className={`select-option${i === active ? " is-active" : ""}`}
                      onPointerMove={() => setActive(i)}
                      onClick={() => choose(option.value)}
                    >
                      <span className="select-option-text">
                        <span>{option.label}</span>
                        {option.hint ? <small>{option.hint}</small> : null}
                      </span>
                      {option.value === value ? (
                        <Icon name="check" size={16} className="select-check" />
                      ) : null}
                    </li>
                  ))}
                </motion.ul>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
