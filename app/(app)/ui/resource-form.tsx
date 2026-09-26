"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { RESOURCE_KINDS } from "@/lib/study-options";
import { addResourceAction } from "../actions";
import { ActionForm, SubmitButton, toast } from "./forms";
import { GlassSelect } from "./glass-select";
import { Icon } from "./icons";
import { SmoothInput } from "../../ui/smooth-input";

const MAX = 4 * 1024 * 1024;
const FOLD = {
  initial: { height: 0, opacity: 0, y: -10 },
  animate: { height: "auto", opacity: 1, y: 0 },
  exit: { height: 0, opacity: 0, y: -14 },
  transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
} as const;
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
        <GlassSelect
          label="Share with"
          name="groupId"
          options={groups.map((g) => ({ value: g.id, label: g.label }))}
        />
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
            {mode === value ? (
              <motion.i
                layoutId="share-mode-pill"
                className="seg-pill"
                aria-hidden="true"
                transition={{ type: "spring", stiffness: 460, damping: 36 }}
              />
            ) : null}
            <Icon name={value === "file" ? "upload" : "link"} size={16} />{" "}
            {value === "file" ? "Upload a file" : "Add a link"}
          </button>
        ))}
      </div>
      {/* One wrapper, so the form's gap doesn't jump while the two panels
          swap: the old one folds up and away as the new one opens below. */}
      <div className="mode-panels">
        <AnimatePresence initial={false}>
          {mode === "file" ? (
            <motion.div key="file" className="mode-panel" {...FOLD}>
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
                  PDF, images, Word, PowerPoint, Excel or text ·{" "}
                  <span className="nowrap">up to 4 MB</span>
                </small>
              </label>
            </motion.div>
          ) : (
            <motion.div key="link" className="mode-panel" {...FOLD}>
              <label className="form-field">
                <span className="field-label">Link</span>
                <SmoothInput
                  className="field"
                  type="url"
                  name="url"
                  required
                  placeholder="https://…"
                  maxLength={2000}
                />
              </label>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="form-row">
        <label className="form-field grow">
          <span className="field-label">Title</span>
          <SmoothInput
            className="field"
            name="title"
            required
            maxLength={120}
            placeholder="Ch. 5 review"
          />
        </label>
        <GlassSelect
          key={mode}
          label="Type"
          name="kind"
          defaultValue={mode === "link" ? "link" : "notes"}
          options={RESOURCE_KINDS.map((k) => ({ value: k.id, label: k.label }))}
        />
      </div>
      <label className="form-field">
        <span className="field-label">
          Note <em>optional</em>
        </span>
        <SmoothInput
          className="field"
          name="description"
          maxLength={600}
          placeholder="Covers 5.1–5.4"
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
