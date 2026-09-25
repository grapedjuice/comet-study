import type { Resource } from "@/lib/resources";
import { formatBytes } from "@/lib/resources";
import { labelOf, RESOURCE_KINDS } from "@/lib/study-options";
import { formatDay } from "@/lib/time";
import { deleteResourceAction } from "../actions";
import { Badge, CourseTag } from "./bits";
import { ActionForm, ConfirmSubmit } from "./forms";
import { Icon } from "./icons";

export function ResourceList({
  resources,
  userId,
  ownerOf,
  showGroup = false,
}: {
  resources: Resource[];
  userId: string;
  ownerOf: Set<string>;
  showGroup?: boolean;
}) {
  return (
    <ul className="resource-list">
      {resources.map((r) => {
        const canDelete = r.uploaderId === userId || ownerOf.has(r.groupId);
        const href = r.url ?? `/api/v1/resources/${r.id}/file`;
        return (
          <li key={r.id} className="resource-item">
            <span className={`resource-icon kind-${r.kind}`} aria-hidden="true">
              <Icon name={r.url ? "link" : "file"} size={20} />
            </span>
            <div className="resource-body">
              <p className="resource-title">
                <a
                  href={href}
                  {...(r.url
                    ? { target: "_blank", rel: "noopener noreferrer nofollow" }
                    : {})}
                >
                  {r.title}
                </a>
                <Badge>{labelOf(RESOURCE_KINDS, r.kind)}</Badge>
              </p>
              {r.description ? (
                <p className="resource-desc">{r.description}</p>
              ) : null}
              <p className="resource-meta">
                {showGroup ? (
                  <>
                    <CourseTag code={r.courseCode} /> {r.groupName} ·{" "}
                  </>
                ) : null}
                {r.uploaderName ?? "Former member"} · {formatDay(r.createdAt)}
                {r.size ? ` · ${formatBytes(r.size)}` : ""}
                {r.url ? ` · ${new URL(r.url).hostname}` : ""}
              </p>
            </div>
            <div className="resource-actions">
              <a
                className="icon-button"
                href={href}
                aria-label={r.url ? `Open ${r.title}` : `Download ${r.title}`}
                {...(r.url
                  ? { target: "_blank", rel: "noopener noreferrer nofollow" }
                  : {})}
              >
                <Icon name={r.url ? "arrow" : "download"} size={18} />
              </a>
              {canDelete ? (
                <ActionForm
                  action={deleteResourceAction}
                  hidden={{ resourceId: r.id }}
                >
                  <ConfirmSubmit
                    className="icon-button danger"
                    prompt="Remove it?"
                    confirmLabel="Remove"
                  >
                    <Icon name="x" size={18} />
                    <span className="sr-only">Remove {r.title}</span>
                  </ConfirmSubmit>
                </ActionForm>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
