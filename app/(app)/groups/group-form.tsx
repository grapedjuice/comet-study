import type { GroupSummary } from "@/lib/groups";
import {
  GROUP_MODALITIES,
  STUDY_GOALS,
  STUDY_STYLES,
} from "@/lib/study-options";
import { createGroupAction, updateGroupAction } from "../actions";
import { ActionForm, ChipGroup, SubmitButton } from "../ui/forms";

/** Create (with a course picker) or edit (with a group) a study group. */
export function GroupForm({
  courses,
  course,
  group,
}: {
  courses?: { code: string; title: string }[];
  course?: string;
  group?: GroupSummary;
}) {
  return (
    <ActionForm
      action={group ? updateGroupAction : createGroupAction}
      hidden={group ? { groupId: group.id } : undefined}
      className="stack-form"
    >
      {courses ? (
        <label className="form-field">
          <span className="field-label">Course</span>
          <select
            className="field"
            name="courseCode"
            defaultValue={course ?? courses[0]?.code}
            required
          >
            {courses.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="form-field">
        <span className="field-label">Group name</span>
        <input
          className="field"
          name="name"
          maxLength={60}
          required
          defaultValue={group?.name}
          placeholder="Tuesday problem-set crew"
        />
      </label>
      <label className="form-field">
        <span className="field-label">
          What’s the plan? <em>optional</em>
        </span>
        <textarea
          className="field"
          name="description"
          rows={3}
          maxLength={400}
          defaultValue={group?.description ?? ""}
          placeholder="Work through each week’s problem set together before it’s due."
        />
      </label>
      <div className="form-row">
        <label className="form-field">
          <span className="field-label">Group size</span>
          <select
            className="field"
            name="capacity"
            defaultValue={String(group?.capacity ?? 6)}
          >
            {[4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                Up to {n} people
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span className="field-label">Where you’ll meet</span>
          <select
            className="field"
            name="modality"
            defaultValue={group?.modality ?? "in_person"}
          >
            {GROUP_MODALITIES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="chip-group">
        <legend className="field-label">Who can join</legend>
        <div className="chips">
          <label className="chip">
            <input
              type="radio"
              name="joinPolicy"
              value="open"
              defaultChecked={(group?.joinPolicy ?? "open") === "open"}
            />
            <span>Anyone in the course</span>
          </label>
          <label className="chip">
            <input
              type="radio"
              name="joinPolicy"
              value="request"
              defaultChecked={group?.joinPolicy === "request"}
            />
            <span>I approve requests</span>
          </label>
        </div>
      </fieldset>
      <label className="form-field">
        <span className="field-label">
          Usual rhythm <em>optional</em>
        </span>
        <input
          className="field"
          name="cadence"
          maxLength={80}
          defaultValue={group?.cadence ?? ""}
          placeholder="Tuesdays after class"
        />
      </label>
      <ChipGroup
        name="styles"
        legend="How you’ll study"
        options={STUDY_STYLES}
        selected={group?.styles ?? []}
      />
      <ChipGroup
        name="goals"
        legend="Goals"
        options={STUDY_GOALS}
        selected={group?.goals ?? []}
      />
      <div className="form-actions">
        <SubmitButton pendingLabel={group ? "Saving…" : "Creating…"}>
          {group ? "Save changes" : "Create group"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
