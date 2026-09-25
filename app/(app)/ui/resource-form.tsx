"use client";

import { useState } from "react";
import { RESOURCE_KINDS } from "@/lib/study-options";
import { addResourceAction } from "../actions";
import { ActionForm, SubmitButton, toast } from "./forms";
import { Icon } from "./icons";

const MAX = 4 * 1024 * 1024;
const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.pptx,.xlsx,.txt,.md,.csv";

/** Share a file or a link with one of the student's groups. */
export function ResourceForm({
  groups,
  groupId,
}: {
  groups?: { id: string; label: string }[];
  groupId?: string;
}) {
  const [mode, setMode] = useState<"file" | "link">("file");
  const [fileName, setFileName] = useState("");
  const [key, setKey] = useState(0);
  return (
    <ActionForm
      key={key}
      action={addResourceAction}
      hidden={groupId ? { groupId } : undefined}
      className="stack-form resource-form"
      onSuccess={() => {
        setFileName("");
        setKey((k) => k + 1);
      }}
    >
      {groups ? (
        <label className="form-field">
          <span className="field-label">Share with</span>
          <select className="field" name="groupId" required>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div
        className="segmented"
        role="radiogroup"
        aria-label="What are you sharing?"
      >
        {(["file", "link"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            className={mode === value ? "is-on" : ""}
            onClick={() => setMode(value)}
          >
            <Icon name={value === "file" ? "upload" : "link"} size={16} />{" "}
            {value === "file" ? "Upload a file" : "Add a link"}
          </button>
        ))}
      </div>
      {mode === "file" ? (
        <label className={`dropzone${fileName ? " has-file" : ""}`}>
          <input
            type="file"
            name="file"
            accept={ACCEPT}
            required
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && file.size > MAX) {
                toast({ ok: false, text: "Files can be up to 4 MB" });
                event.target.value = "";
                setFileName("");
                return;
              }
              setFileName(file?.name ?? "");
            }}
          />
          <Icon name="upload" size={22} />
          <span>{fileName || "Choose a file"}</span>
          <small>
            PDF, images, Word, PowerPoint, Excel or text · up to 4 MB
          </small>
        </label>
      ) : (
        <label className="form-field">
          <span className="field-label">Link</span>
          <input
            className="field"
            type="url"
            name="url"
            required
            placeholder="https://…"
            maxLength={2000}
          />
        </label>
      )}
      <div className="form-row">
        <label className="form-field grow">
          <span className="field-label">Title</span>
          <input
            className="field"
            name="title"
            required
            maxLength={120}
            placeholder="Chapter 5 review sheet"
          />
        </label>
        <label className="form-field">
          <span className="field-label">Type</span>
          <select
            className="field"
            name="kind"
            defaultValue={mode === "link" ? "link" : "notes"}
            key={mode}
          >
            {RESOURCE_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="form-field">
        <span className="field-label">
          Note <em>optional</em>
        </span>
        <input
          className="field"
          name="description"
          maxLength={600}
          placeholder="Covers 5.1–5.4, answers on the last page"
        />
      </label>
      <p className="fine-print">
        Only share your own work or material you’re allowed to share. Only
        members of the group can open it.
      </p>
      <div className="form-actions">
        <SubmitButton pendingLabel={mode === "file" ? "Uploading…" : "Adding…"}>
          Share with group
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
