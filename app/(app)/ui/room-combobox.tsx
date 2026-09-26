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
import type { RoomSuggestionGroup } from "@/lib/rooms";
import { SmoothInput } from "../../ui/smooth-input";

/*
 * "Where" field with campus room suggestions, rebuilt from the 21st.dev
 * coss "Autocomplete" (with groups) without Base UI: a combobox input,
 * results grouped by building in a portal, arrow/enter/escape keys, and
 * free text still allowed (a room we don't know, or a meeting link). When
 * the form has a date and times, rooms free then are marked and float up.
 */

type Place = { left: number; width: number; top: number; max: number };

export function RoomCombobox({
  name,
  defaultValue = "",
  placeholder,
  maxLength,
  className = "field",
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<RoomSuggestionGroup[]>([]);
  const [timed, setTimed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<Place | null>(null);
  const request = useRef(0);
  const flat = groups.flatMap((g) => g.rooms);

  const measure = useCallback(() => {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) return;
    setPlace({
      left: rect.left,
      width: rect.width,
      top: rect.bottom + 6,
      max: Math.max(160, Math.min(360, window.innerHeight - rect.bottom - 18)),
    });
  }, []);

  const load = useCallback((query: string) => {
    const form = input.current?.form;
    const field = (key: string) =>
      (form?.elements.namedItem(key) as HTMLInputElement | null)?.value ?? "";
    const params = new URLSearchParams({ q: query });
    const date = field("date");
    const from = field("start");
    const to = field("end");
    if (date && from && to) {
      params.set("date", date);
      params.set("from", from);
      params.set("to", to);
    }
    const ticket = ++request.current;
    setLoading(true);
    fetch(`/api/v1/rooms/suggest?${params}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (ticket !== request.current) return;
        setGroups(payload?.data?.groups ?? []);
        setTimed(Boolean(payload?.data?.timed));
        setActive(-1);
      })
      .catch(() => ticket === request.current && setGroups([]))
      .finally(() => ticket === request.current && setLoading(false));
  }, []);

  // Debounce lookups while typing.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => load(text), 140);
    return () => clearTimeout(timer);
  }, [text, open, load]);

  useEffect(() => {
    if (!open) return;
    measure();
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!wrap.current?.contains(target) && !list.current?.contains(target))
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

  useLayoutEffect(() => {
    if (active < 0) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-i="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Follow the form: reset restores the starting text.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const reset = () => setText(defaultValue);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultValue]);

  const choose = (label: string) => {
    setText(label);
    setOpen(false);
    input.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (event.key === "Enter" && open && active >= 0 && flat[active]) {
      event.preventDefault();
      choose(flat[active].label);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "Tab") setOpen(false);
  };

  const showList = open && place && (flat.length > 0 || text.trim() !== "");
  // Each group's first index in the flat option list.
  const starts = groups.map((_, g) =>
    groups.slice(0, g).reduce((sum, group) => sum + group.rooms.length, 0),
  );
  return (
    <div className="combo" ref={wrap}>
      <SmoothInput
        ref={input}
        className={className}
        name={name}
        value={text}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={Boolean(showList)}
        aria-controls={`${id}-list`}
        aria-activedescendant={active >= 0 ? `${id}-o${active}` : undefined}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {showList ? (
                <motion.div
                  ref={list}
                  id={`${id}-list`}
                  role="listbox"
                  aria-label="Campus rooms"
                  className="select-list combo-list"
                  data-lenis-prevent
                  style={{
                    left: place.left,
                    width: Math.max(place.width, 280),
                    top: place.top,
                    maxHeight: place.max,
                    transformOrigin: "top",
                  }}
                  initial={{ opacity: 0, scale: 0.97, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    scale: 0.98,
                    transition: { duration: 0.12 },
                  }}
                  transition={{ type: "spring", stiffness: 520, damping: 34 }}
                  onPointerDown={(event) => event.preventDefault()}
                >
                  {!text.trim() && timed && flat.length ? (
                    <p className="combo-hint">Free at the time you picked</p>
                  ) : null}
                  {groups.map((group, g) => (
                    <div
                      key={group.building}
                      role="group"
                      aria-label={group.name ?? group.building}
                      className="combo-group"
                    >
                      <p className="combo-group-label">
                        <strong>{group.building}</strong>
                        {group.name ? <span>{group.name}</span> : null}
                      </p>
                      {group.rooms.map((room, r) => {
                        const i = starts[g] + r;
                        return (
                          <div
                            key={room.label}
                            id={`${id}-o${i}`}
                            data-i={i}
                            role="option"
                            aria-selected={i === active}
                            className={`select-option combo-option${i === active ? " is-active" : ""}`}
                            onPointerMove={() => setActive(i)}
                            onClick={() => choose(room.label)}
                          >
                            <span className="combo-room">
                              <span className="combo-bldg">
                                {group.building}
                              </span>{" "}
                              <strong>{room.room}</strong>
                            </span>
                            <span className="combo-facts">
                              {room.capacity ? (
                                <span>{room.capacity} seats</span>
                              ) : null}
                              {room.free === true ? (
                                <span className="combo-free">Free then</span>
                              ) : room.free === false ? (
                                <span className="combo-busy">Booked</span>
                              ) : null}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {!flat.length ? (
                    <p className="combo-empty">
                      {loading
                        ? "Looking up rooms…"
                        : "No campus room matches. That’s fine: any place or meeting link works."}
                    </p>
                  ) : (
                    <p className="combo-foot">
                      ↑↓ to move · Enter to pick · or type any place
                    </p>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
