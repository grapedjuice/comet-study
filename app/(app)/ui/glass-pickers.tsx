"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { addDays, campusDate } from "../../../lib/time";
import { Icon } from "./icons";

/*
 * Date and time fields that match GlassSelect instead of opening the
 * browser's own pickers (which ignore the theme, and whose icon shows the
 * system cursor under the comet one). Same pattern: a trigger button, a
 * popover in a portal, keyboard support, and a real input carrying the
 * value ("YYYY-MM-DD" / "HH:MM", like the native fields), so forms, resets
 * and `required` keep working.
 */

type Place = { left: number; width: number; top?: number; bottom?: number };

function usePopover(want: { width: number; height: number }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(
      window.innerWidth - 24,
      Math.max(rect.width, want.width),
    );
    const left = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - 12 - width),
    );
    const below = window.innerHeight - rect.bottom - 12;
    const up = below < want.height && rect.top - 12 > below;
    setPlace({
      left,
      width,
      ...(up
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    });
  }, [want.width, want.height]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!pop.current?.contains(target) && !trigger.current?.contains(target))
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

  const show = () => {
    measure();
    setOpen(true);
  };
  return { open, show, close, place, trigger, pop };
}

/** Restores the initial value when the surrounding form resets. */
function useFormReset(
  input: React.RefObject<HTMLInputElement | null>,
  reset: () => void,
) {
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [input, reset]);
}

function Popover({
  open,
  place,
  pop,
  trigger,
  close,
  label,
  children,
}: {
  open: boolean;
  place: Place | null;
  pop: React.RefObject<HTMLDivElement | null>;
  trigger: React.RefObject<HTMLButtonElement | null>;
  close: (refocus: boolean) => void;
  label: string;
  children: React.ReactNode;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && place ? (
        <motion.div
          ref={pop}
          role="dialog"
          aria-label={label}
          className="picker-pop"
          data-lenis-prevent
          style={{
            left: place.left,
            width: place.width,
            top: place.top,
            bottom: place.bottom,
            transformOrigin: place.top !== undefined ? "top" : "bottom",
          }}
          initial={{
            opacity: 0,
            scale: 0.96,
            y: place.top !== undefined ? -6 : 6,
          }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
          transition={{ type: "spring", stiffness: 520, damping: 34 }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close(true);
            }
          }}
          onBlur={(event) => {
            // Tabbing out of the popover closes it (clicks are handled above).
            const next = event.relatedTarget as Node | null;
            if (
              next &&
              !pop.current?.contains(next) &&
              next !== trigger.current
            )
              close(false);
          }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function Field({
  label,
  labelId,
  className,
  children,
}: {
  label?: React.ReactNode;
  labelId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`glass-select picker${label ? " form-field" : ""}${className ? ` ${className}` : ""}`}
    >
      {label ? (
        <span className="field-label" id={labelId}>
          {label}
        </span>
      ) : null}
      {children}
    </div>
  );
}

/**
 * The submitted value. Invisible but still validated for `required`; it sits
 * under the trigger, so the browser's "fill out this field" bubble points there.
 */
function ValueInput({
  input,
  name,
  value,
  required,
}: {
  input: React.RefObject<HTMLInputElement | null>;
  name: string;
  value: string;
  required?: boolean;
}) {
  return (
    <input
      ref={input}
      className="picker-value"
      name={name}
      value={value}
      required={required}
      onChange={() => {}}
      tabIndex={-1}
      aria-hidden="true"
    />
  );
}

/* ---------- Date ---------- */

const utc = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const utcFmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options });
const shortDay = utcFmt({ weekday: "short", month: "short", day: "numeric" });
const shortDayYear = utcFmt({
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const longDay = utcFmt({
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const monthFmt = utcFmt({ month: "long", year: "numeric" });

const monthOf = (date: string) => date.slice(0, 7);
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};
/** Same day number in another month, clamped (Jan 31 → Feb 28). */
const shiftDate = (date: string, months: number) => {
  const target = shiftMonth(monthOf(date), months);
  const last = addDays(`${shiftMonth(target, 1)}-01`, -1);
  const day = Math.min(Number(date.slice(8)), Number(last.slice(8)));
  return `${target}-${String(day).padStart(2, "0")}`;
};
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function GlassDate({
  name,
  label,
  defaultValue = "",
  min,
  max,
  required,
  placeholder = "Pick a date",
  className,
}: {
  name: string;
  label?: React.ReactNode;
  defaultValue?: string;
  min?: string;
  max?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [focus, setFocus] = useState(defaultValue);
  const [today, setToday] = useState("");
  const {
    open: isOpen,
    show,
    close,
    place,
    trigger,
    pop,
  } = usePopover({ width: 304, height: 372 });
  const input = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const focusGrid = useRef(false);
  const id = useId();
  useFormReset(
    input,
    useCallback(() => setValue(defaultValue), [defaultValue]),
  );

  const clamp = (date: string) =>
    min && date < min ? min : max && date > max ? max : date;
  const allowed = (date: string) =>
    (!min || date >= min) && (!max || date <= max);

  const open = () => {
    const now = campusDate(new Date());
    setToday(now);
    setFocus(value || clamp(now));
    focusGrid.current = true;
    show();
  };
  const choose = (date: string) => {
    setValue(date);
    close(true);
  };

  // Keyboard focus follows the day on open and on arrow keys; the month
  // buttons keep focus so they can be pressed repeatedly.
  useLayoutEffect(() => {
    if (!isOpen || !focusGrid.current) return;
    focusGrid.current = false;
    grid.current
      ?.querySelector<HTMLElement>(`[data-date="${focus}"]`)
      ?.focus({ preventScroll: true });
  }, [isOpen, focus]);

  const move = (event: React.KeyboardEvent) => {
    const steps: Record<string, () => string> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => shiftDate(focus, -1),
      PageDown: () => shiftDate(focus, 1),
      Home: () => addDays(focus, -utc(focus).getUTCDay()),
      End: () => addDays(focus, 6 - utc(focus).getUTCDay()),
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    focusGrid.current = true;
    setFocus(clamp(step()));
  };

  const month = monthOf(focus || today || "2000-01-01");
  const first = `${month}-01`;
  const start = addDays(first, -utc(first).getUTCDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const canPrev = !min || shiftMonth(month, -1) >= monthOf(min);
  const canNext = !max || shiftMonth(month, 1) <= monthOf(max);
  const nowYear = campusDate(new Date()).slice(0, 4);
  const shown = value
    ? (value.startsWith(nowYear) ? shortDay : shortDayYear).format(utc(value))
    : "";

  const labelId = `${id}-label`;
  return (
    <Field label={label} labelId={labelId} className={className}>
      <ValueInput input={input} name={name} value={value} required={required} />
      <button
        ref={trigger}
        type="button"
        className={`field select-trigger picker-trigger${isOpen ? " is-open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-labelledby={label ? `${labelId} ${id}-value` : undefined}
        aria-label={label ? undefined : `${name}: ${shown || placeholder}`}
        onClick={() => (isOpen ? close(false) : open())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            open();
          }
        }}
      >
        <span
          className={`select-value${shown ? "" : " picker-placeholder"}`}
          id={`${id}-value`}
        >
          {shown || placeholder}
        </span>
        <Icon name="calendar" size={17} className="picker-icon" />
      </button>
      <Popover
        open={isOpen}
        place={place}
        pop={pop}
        trigger={trigger}
        close={close}
        label="Choose a date"
      >
        <div className="dp-head">
          <button
            type="button"
            className="dp-nav"
            aria-label="Previous month"
            disabled={!canPrev}
            onClick={() => setFocus(clamp(shiftDate(focus, -1)))}
          >
            <Icon name="chevronLeft" size={16} />
          </button>
          <motion.strong
            key={month}
            className="dp-month"
            aria-live="polite"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {monthFmt.format(utc(first))}
          </motion.strong>
          <button
            type="button"
            className="dp-nav"
            aria-label="Next month"
            disabled={!canNext}
            onClick={() => setFocus(clamp(shiftDate(focus, 1)))}
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
        <div className="dp-week" aria-hidden="true">
          {WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <motion.div
          key={month}
          ref={grid}
          className="dp-grid"
          onKeyDown={move}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
        >
          {days.map((date) => (
            <button
              key={date}
              type="button"
              data-date={date}
              tabIndex={date === focus ? 0 : -1}
              disabled={!allowed(date)}
              aria-label={longDay.format(utc(date))}
              aria-pressed={date === value}
              aria-current={date === today ? "date" : undefined}
              className={`dp-day${monthOf(date) !== month ? " is-out" : ""}${date === today ? " is-today" : ""}`}
              onClick={() => choose(date)}
            >
              {Number(date.slice(8))}
            </button>
          ))}
        </motion.div>
        <div className="picker-foot">
          {today && allowed(today) ? (
            <button
              type="button"
              className="picker-link"
              onClick={() => choose(today)}
            >
              Today
            </button>
          ) : (
            <span />
          )}
          {!required && value ? (
            <button
              type="button"
              className="picker-link"
              onClick={() => choose("")}
            >
              Clear
            </button>
          ) : null}
        </div>
      </Popover>
    </Field>
  );
}

/* ---------- Time ---------- */

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const split = (minutes: number) => ({
  hour: Math.floor(minutes / 60) % 12 || 12,
  minute: minutes % 60,
  pm: minutes >= 720,
});
const join = (hour: number, minute: number, pm: boolean) =>
  ((hour % 12) + (pm ? 12 : 0)) * 60 + minute;
const pad = (n: number) => String(n).padStart(2, "0");

/** Row height and the row the selection band sits on (5 rows show). */
const ROW = 40;
const CENTER = 2;
// Wheel travel per step: one notch of a mouse wheel, or a short trackpad swipe.
const WHEEL_STEP = 48;

type WheelItem = { text: string; on: boolean; disabled: boolean };

const mod = (n: number, m: number) => ((n % m) + m) % m;

/*
 * One column of the time picker, as a wheel: the band stays put and the
 * numbers roll through it. Scrolling steps one row per notch, dragging (mouse
 * or touch) spins it with a little momentum, a click picks a row, and the
 * arrow keys step. Looping wheels (hours, minutes) repeat their rows so
 * 11 rolls on to 12 and 55 to 00; after each move the track quietly
 * re-centers on the middle copy.
 */
function Wheel({
  id,
  label,
  items,
  loop = false,
  onPick,
  onKey,
  wheelRef,
}: {
  id: string;
  label: string;
  items: WheelItem[];
  loop?: boolean;
  onPick: (index: number) => void;
  onKey: (event: React.KeyboardEvent) => void;
  wheelRef: (node: HTMLDivElement | null) => void;
}) {
  const n = items.length;
  // Enough copies that a fast spin never runs off the end (30+ rows a side).
  const copies = loop ? 2 * Math.ceil(30 / n) + 1 : 1;
  const home = loop ? Math.floor(copies / 2) * n : 0;
  const total = copies * n;
  const index = Math.max(
    0,
    items.findIndex((item) => item.on),
  );

  const [row, setRow] = useState(home + index);
  const [seen, setSeen] = useState(index);
  // The value changed from outside (min/max clamp, form reset): roll the
  // short way round to it.
  if (index !== seen) {
    let delta = index - seen;
    if (loop && delta > n / 2) delta -= n;
    if (loop && delta < -n / 2) delta += n;
    setSeen(index);
    setRow(row + delta);
  }
  const [drag, setDrag] = useState<number | null>(null);
  const [instant, setInstant] = useState(false);
  const node = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<{
    y: number;
    from: number;
    hit: number;
    moved: boolean;
    v: number;
    lastY: number;
    lastT: number;
  } | null>(null);

  const enabled = (r: number) =>
    r >= 0 && r < total && !items[mod(r, n)].disabled;
  const go = (target: number) => {
    const next = mod(target, n);
    setRow(target);
    setSeen(next);
    if (next !== index) onPick(next);
  };
  const step = (dir: number) => {
    for (
      let r = row + dir;
      r >= 0 && r < total && Math.abs(r - row) <= n;
      r += dir
    )
      if (enabled(r)) return go(r);
  };
  /** Nearest enabled row to `at`, preferring the direction of travel. */
  const nearest = (at: number, prefer: number) => {
    const r = Math.max(0, Math.min(total - 1, Math.round(at)));
    for (let d = 0; d < total; d++)
      for (const c of [r + d * prefer, r - d * prefer])
        if (enabled(c)) return c;
    return r;
  };

  const latest = useRef(step);
  useLayoutEffect(() => {
    latest.current = step;
  });

  // A native listener: React's onWheel is passive, and the page mustn't scroll.
  useEffect(() => {
    const el = node.current;
    if (!el) return;
    let travel = 0;
    let lastAt = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (gesture.current) return;
      if (event.timeStamp - lastAt > 220) travel = 0;
      lastAt = event.timeStamp;
      travel += event.deltaMode === 1 ? event.deltaY * ROW : event.deltaY;
      if (Math.abs(travel) < WHEEL_STEP) return;
      const dir = Math.sign(travel);
      travel = 0;
      latest.current(dir);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // One frame without transitions after a silent re-center, then back on.
  useEffect(() => {
    if (!instant) return;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => setInstant(false)),
    );
    return () => cancelAnimationFrame(frame);
  }, [instant]);
  const recenter = () => {
    if (!loop || gesture.current) return;
    const centered = home + mod(row, n);
    if (centered === row) return;
    setInstant(true);
    setRow(centered);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const hit = (event.target as Element).closest<HTMLElement>("[data-r]");
    gesture.current = {
      y: event.clientY,
      from: row,
      hit: hit ? Number(hit.dataset.r) : -1,
      moved: false,
      v: 0,
      lastY: event.clientY,
      lastT: event.timeStamp,
    };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dy = event.clientY - g.y;
    if (!g.moved && Math.abs(dy) < 4) return;
    g.moved = true;
    const dt = Math.max(1, event.timeStamp - g.lastT);
    g.v = 0.8 * ((event.clientY - g.lastY) / dt) + 0.2 * g.v;
    g.lastY = event.clientY;
    g.lastT = event.timeStamp;
    // Past either end a plain wheel resists instead of stopping dead.
    let at = g.from - dy / ROW;
    if (at < 0) at = loop ? 0 : at / 3;
    if (at > total - 1)
      at = loop ? total - 1 : total - 1 + (at - total + 1) / 3;
    setDrag(at);
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (!g.moved) {
      if (g.hit >= 0 && enabled(g.hit)) go(g.hit);
      return;
    }
    // Flicks carry on a little, as a physical wheel would.
    const fling = event.timeStamp - g.lastT < 80 ? (-g.v * 140) / ROW : 0;
    setDrag(null);
    go(nearest((drag ?? g.from) + fling, fling >= 0 ? 1 : -1));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowUp: () => step(-1),
      ArrowDown: () => step(1),
      Home: () => go(nearest(row - index, 1)),
      End: () => go(nearest(row - index + n - 1, -1)),
    };
    const run = keys[event.key];
    if (!run) return onKey(event);
    event.preventDefault();
    run();
  };

  const at = drag ?? row;
  const still = drag !== null || instant;
  return (
    <div
      ref={(el) => {
        node.current = el;
        wheelRef(el);
      }}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={`${id}-${index}`}
      className={`wheel${still ? " is-still" : ""}`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="wheel-track"
        style={{ transform: `translateY(${(CENTER - at) * ROW}px)` }}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget) recenter();
        }}
      >
        {Array.from({ length: total }, (_, r) => {
          const i = mod(r, n);
          const item = items[i];
          const main = r - i === home;
          return (
            <div
              key={r}
              id={main ? `${id}-${i}` : undefined}
              data-r={r}
              role={main ? "option" : undefined}
              aria-selected={main ? item.on : undefined}
              aria-disabled={main && item.disabled ? true : undefined}
              aria-hidden={main ? undefined : true}
              className={`wheel-row${r === row ? " is-on" : ""}${item.disabled ? " is-off" : ""}`}
              style={{
                opacity: item.disabled
                  ? 0.22
                  : Math.max(0.28, 1 - Math.abs(r - at) * 0.3),
              }}
            >
              {item.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GlassTime({
  name,
  label,
  defaultValue = "",
  min,
  max,
  step = 5,
  required,
  placeholder = "Pick a time",
  className,
}: {
  name: string;
  label?: React.ReactNode;
  defaultValue?: string;
  min?: string;
  max?: string;
  /** Minutes between choices. */
  step?: number;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const {
    open: isOpen,
    show,
    close,
    place,
    trigger,
    pop,
  } = usePopover({ width: 248, height: 290 });
  const input = useRef<HTMLInputElement>(null);
  const columns = useRef<(HTMLDivElement | null)[]>([]);
  const id = useId();
  useFormReset(
    input,
    useCallback(() => setValue(defaultValue), [defaultValue]),
  );

  const lo = min ? toMinutes(min) : 0;
  const hi = max ? toMinutes(max) : 1439;
  const ok = (minutes: number) => minutes >= lo && minutes <= hi;
  const minutes = Array.from(
    { length: Math.ceil(60 / step) },
    (_, i) => i * step,
  );
  // An empty field starts its wheels at noon (or the nearest allowed time).
  const current = value ? toMinutes(value) : Math.max(lo, Math.min(hi, 720));
  const parts = split(current);

  const commit = (next: number) => {
    // Keep choices inside min/max and on the step grid.
    let clamped = Math.max(lo, Math.min(hi, next));
    clamped = Math.round(clamped / step) * step;
    if (clamped < lo) clamped += step;
    if (clamped > hi) clamped -= step;
    setValue(toTime(clamped));
  };

  const cols = [
    {
      key: "hour",
      label: "Hour",
      items: HOURS.map((hour) => ({
        text: String(hour),
        on: hour === parts.hour,
        disabled: minutes.every((m) => !ok(join(hour, m, parts.pm))),
      })),
      pick: (i: number) => commit(join(HOURS[i], parts.minute, parts.pm)),
    },
    {
      key: "minute",
      label: "Minute",
      items: minutes.map((minute) => ({
        text: pad(minute),
        on: minute === parts.minute,
        disabled: !ok(join(parts.hour, minute, parts.pm)),
      })),
      pick: (i: number) => commit(join(parts.hour, minutes[i], parts.pm)),
    },
    {
      key: "meridiem",
      label: "AM or PM",
      items: [false, true].map((pm) => ({
        text: pm ? "PM" : "AM",
        on: pm === parts.pm,
        disabled: HOURS.every((hour) =>
          minutes.every((m) => !ok(join(hour, m, pm))),
        ),
      })),
      pick: (i: number) => commit(join(parts.hour, parts.minute, i === 1)),
    },
  ];

  useLayoutEffect(() => {
    if (isOpen) columns.current[0]?.focus({ preventScroll: true });
  }, [isOpen]);

  const onColumnKey = (event: React.KeyboardEvent, index: number) => {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => columns.current[Math.max(0, index - 1)]?.focus(),
      ArrowRight: () => columns.current[Math.min(2, index + 1)]?.focus(),
      Enter: () => {
        if (!value) commit(current);
        close(true);
      },
    };
    const run = keys[event.key];
    if (!run) return;
    event.preventDefault();
    run();
  };

  const chosen = value ? split(toMinutes(value)) : null;
  const shown = chosen
    ? `${chosen.hour}:${pad(chosen.minute)} ${chosen.pm ? "PM" : "AM"}`
    : "";
  const labelId = `${id}-label`;
  return (
    <Field label={label} labelId={labelId} className={className}>
      <ValueInput input={input} name={name} value={value} required={required} />
      <button
        ref={trigger}
        type="button"
        className={`field select-trigger picker-trigger${isOpen ? " is-open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-labelledby={label ? `${labelId} ${id}-value` : undefined}
        aria-label={label ? undefined : `${name}: ${shown || placeholder}`}
        onClick={() => (isOpen ? close(false) : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            show();
          }
        }}
      >
        <span
          className={`select-value${shown ? "" : " picker-placeholder"}`}
          id={`${id}-value`}
        >
          {shown || placeholder}
        </span>
        <Icon name="clock" size={17} className="picker-icon" />
      </button>
      <Popover
        open={isOpen}
        place={place}
        pop={pop}
        trigger={trigger}
        close={close}
        label="Choose a time"
      >
        <div className={`wheels${value ? "" : " is-draft"}`}>
          <div className="wheel-band" aria-hidden="true" />
          {cols.map((col, index) => (
            <Fragment key={col.key}>
              {index === 1 ? (
                <span className="wheel-colon" aria-hidden="true">
                  :
                </span>
              ) : null}
              <Wheel
                id={`${id}-${col.key}`}
                label={col.label}
                items={col.items}
                loop={col.key !== "meridiem"}
                onPick={col.pick}
                onKey={(event) => onColumnKey(event, index)}
                wheelRef={(node) => {
                  columns.current[index] = node;
                }}
              />
            </Fragment>
          ))}
        </div>
        <div className="picker-foot">
          {!required && value ? (
            <button
              type="button"
              className="picker-link"
              onClick={() => {
                setValue("");
                close(true);
              }}
            >
              Clear
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="picker-done"
            onClick={() => {
              if (!value) commit(current);
              close(true);
            }}
          >
            Done
          </button>
        </div>
      </Popover>
    </Field>
  );
}
