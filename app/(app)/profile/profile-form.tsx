"use client";

import { useRef, useState } from "react";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  PROFILE_MODALITIES,
  STUDY_GOALS,
  STUDY_STYLES,
  WEEKDAYS,
} from "@/lib/study-options";
import { saveProfileAction } from "../actions";
import { ActionForm, ChipGroup, SubmitButton } from "../ui/forms";
import { GlassSelect } from "../ui/glass-select";
import { SmoothInput } from "../../ui/smooth-input";

const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR },
  (_, i) => DAY_START_HOUR + i,
);
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
const range = (a: number, b: number) =>
  Array.from({ length: b - a }, (_, i) => a + i);

export function ProfileForm({
  name,
  profile,
  classSlots,
}: {
  name: string;
  profile: {
    styles: string[];
    goals: string[];
    modality: string;
    preferredSize: number;
    availability: number[];
    discoverable: boolean;
  };
  classSlots: number[];
}) {
  const [slots, setSlots] = useState(() => new Set(profile.availability));
  const painting = useRef<null | boolean>(null);
  const classes = new Set(classSlots);

  const paint = (slot: number, on: boolean) =>
    setSlots((current) => {
      if (current.has(slot) === on) return current;
      const next = new Set(current);
      if (on) next.add(slot);
      else next.delete(slot);
      return next;
    });
  const preset = (days: number[], hours: number[]) =>
    setSlots((current) => {
      const next = new Set(current);
      for (const d of days)
        for (const h of hours)
          if (!classes.has(d * 24 + h)) next.add(d * 24 + h);
      return next;
    });

  return (
    <ActionForm action={saveProfileAction} className="profile-form">
      <input
        type="hidden"
        name="availability"
        value={JSON.stringify([...slots].sort((a, b) => a - b))}
      />
      <section className="panel">
        <div className="panel-head">
          <h2>About you</h2>
        </div>
        <div className="stack-form">
          <label className="form-field">
            <span className="field-label">Name classmates see</span>
            <SmoothInput
              className="field"
              name="name"
              defaultValue={name}
              maxLength={40}
              required
            />
            <span className="field-hint">
              Outside your groups, people see your first name and last initial.
            </span>
          </label>
          <div className="form-row">
            <GlassSelect
              label="Prefer to meet"
              name="modality"
              defaultValue={profile.modality}
              options={PROFILE_MODALITIES.map((m) => ({
                value: m.id,
                label: m.label,
              }))}
            />
            <GlassSelect
              label="Ideal group size"
              name="preferredSize"
              defaultValue={String(profile.preferredSize)}
              options={[4, 5, 6, 7, 8].map((n) => ({
                value: String(n),
                label: `${n} people`,
              }))}
            />
          </div>
          <ChipGroup
            name="styles"
            legend="How you like to study"
            options={STUDY_STYLES}
            selected={profile.styles}
          />
          <ChipGroup
            name="goals"
            legend="What you want from a group"
            options={STUDY_GOALS}
            selected={profile.goals}
          />
          <label className="switch">
            <input
              type="checkbox"
              name="discoverable"
              defaultChecked={profile.discoverable}
            />
            <span className="switch-track" aria-hidden="true" />
            <span>
              <strong>Show me in classmates’ matches</strong>
              <span className="field-hint">
                Turn off to only join groups yourself. Nobody can invite you
                while it’s off.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>When you’re free</h2>
          <span className="muted-note">
            {slots.size} hours a week · Central time
          </span>
        </div>
        <p className="muted-note">
          Drag across the hours you could usually study. Your classes are
          shaded. Classmates only see how many hours you share, never this grid.
        </p>
        <div className="preset-row">
          <button
            type="button"
            className="chip-link"
            onClick={() => preset(range(0, 5), range(17, 21))}
          >
            Weekday evenings
          </button>
          <button
            type="button"
            className="chip-link"
            onClick={() => preset(range(0, 5), range(12, 17))}
          >
            Weekday afternoons
          </button>
          <button
            type="button"
            className="chip-link"
            onClick={() => preset([5, 6], range(10, 18))}
          >
            Weekends
          </button>
          <button
            type="button"
            className="chip-link"
            onClick={() => setSlots(new Set())}
          >
            Clear
          </button>
        </div>
        <div
          className="avail-grid"
          role="grid"
          aria-label="Weekly availability"
          onPointerUp={() => (painting.current = null)}
          onPointerLeave={() => (painting.current = null)}
          onPointerCancel={() => (painting.current = null)}
        >
          <div role="row" className="avail-row head">
            <span role="columnheader" />
            {WEEKDAYS.map((d) => (
              <span role="columnheader" key={d}>
                {d}
              </span>
            ))}
          </div>
          {HOURS.map((h) => (
            <div role="row" className="avail-row" key={h}>
              <span role="rowheader" className="avail-hour">
                {hourLabel(h)}
              </span>
              {WEEKDAYS.map((d, di) => {
                const slot = di * 24 + h;
                const on = slots.has(slot);
                const hasClass = classes.has(slot);
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    aria-selected={on}
                    aria-label={`${d} ${hourLabel(h)}${hasClass ? ", you have class" : ""}`}
                    className={`avail-cell${on ? " on" : ""}${hasClass ? " class" : ""}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      // Touch pointers capture to the first cell; release so
                      // dragging paints the cells underneath.
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                      painting.current = !on;
                      paint(slot, !on);
                    }}
                    onPointerEnter={() => {
                      if (painting.current !== null)
                        paint(slot, painting.current);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === " " || event.key === "Enter") {
                        event.preventDefault();
                        paint(slot, !on);
                      }
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </section>
      <div className="form-actions sticky-save">
        <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
      </div>
    </ActionForm>
  );
}
