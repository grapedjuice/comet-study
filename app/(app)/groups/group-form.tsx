import type { GroupSummary } from "@/lib/groups";
import {
  GROUP_MODALITIES,
  STUDY_GOALS,
  STUDY_STYLES,
} from "@/lib/study-options";
import { createGroupAction, updateGroupAction } from "../actions";
import { ActionForm, ChipGroup, SubmitButton } from "../ui/forms";
import { GlassSelect } from "../ui/glass-select";
import { SmoothInput, SmoothTextarea } from "../../ui/smooth-input";

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
        <GlassSelect
          label="Course"
          name="courseCode"
          defaultValue={course ?? courses[0]?.code}
          options={courses.map((c) => ({
            value: c.code,
            label: `${c.code} — ${c.title}`,
          }))}
        />
      ) : null}
      <label className="form-field">
        <span className="field-label">Group name</span>
        <SmoothInput
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
        <SmoothTextarea
          className="field"
          name="description"
          rows={3}
          maxLength={400}
          defaultValue={group?.description ?? ""}
          placeholder="Work through each week’s problem set together before it’s due."
        />
      </label>
      <div className="form-row">
        <GlassSelect
          label="Group size"
          name="capacity"
          defaultValue={String(group?.capacity ?? 6)}
          options={[4, 5, 6, 7, 8].map((n) => ({
            value: String(n),
            label: `Up to ${n} people`,
          }))}
        />
        <GlassSelect
          label="Where you’ll meet"
          name="modality"
          defaultValue={group?.modality ?? "in_person"}
          options={GROUP_MODALITIES.map((m) => ({
            value: m.id,
            label: m.label,
          }))}
        />
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
        <SmoothInput
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
