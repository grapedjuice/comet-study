import { createHash } from "node:crypto";
import { UserFacingError } from "./app-errors";
import { transaction, type createDatabaseClient } from "./db";
import { membership, recordActivity, requireMember } from "./groups";

type Database = ReturnType<typeof createDatabaseClient>;

/** Vercel caps request bodies at 4.5 MB; stay under it with form overhead. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const GROUP_QUOTA_BYTES = 200 * 1024 * 1024;

type FileKind = { ext: string[]; mime: string; test: (b: Buffer) => boolean };

const starts = (bytes: number[]) => (b: Buffer) =>
  bytes.every((byte, i) => b[i] === byte);
const zip = starts([0x50, 0x4b, 0x03, 0x04]);
const isText = (b: Buffer) =>
  !b.includes(0) && Buffer.from(b.toString("utf8"), "utf8").equals(b);

const FILE_KINDS: FileKind[] = [
  {
    ext: ["pdf"],
    mime: "application/pdf",
    test: starts([0x25, 0x50, 0x44, 0x46]),
  },
  { ext: ["png"], mime: "image/png", test: starts([0x89, 0x50, 0x4e, 0x47]) },
  {
    ext: ["jpg", "jpeg"],
    mime: "image/jpeg",
    test: starts([0xff, 0xd8, 0xff]),
  },
  { ext: ["gif"], mime: "image/gif", test: starts([0x47, 0x49, 0x46, 0x38]) },
  {
    ext: ["webp"],
    mime: "image/webp",
    test: (b) =>
      starts([0x52, 0x49, 0x46, 0x46])(b) &&
      b.subarray(8, 12).toString() === "WEBP",
  },
  {
    ext: ["docx"],
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    test: zip,
  },
  {
    ext: ["pptx"],
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    test: zip,
  },
  {
    ext: ["xlsx"],
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    test: zip,
  },
  { ext: ["txt"], mime: "text/plain", test: isText },
  { ext: ["md"], mime: "text/markdown", test: isText },
  { ext: ["csv"], mime: "text/csv", test: isText },
];

export const ACCEPTED_EXTENSIONS = FILE_KINDS.flatMap((kind) => kind.ext);

/**
 * Identify an upload by extension AND magic bytes; the browser's claimed MIME
 * type is ignored. Returns null for anything not on the allow-list.
 */
export function sniffFile(fileName: string, bytes: Buffer) {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const kind = FILE_KINDS.find((k) => k.ext.includes(ext));
  if (!kind || !bytes.length || !kind.test(bytes)) return null;
  return { mime: kind.mime, ext };
}

/** Keep a readable, header-safe file name. */
export function safeFileName(name: string) {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[\\/]/g, "-")
    .replace(/[^\p{L}\p{N} ._()-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-120);
  return cleaned || "file";
}

export type Resource = {
  id: string;
  groupId: string;
  groupName: string;
  courseCode: string;
  kind: string;
  title: string;
  description: string | null;
  url: string | null;
  fileName: string | null;
  mime: string | null;
  size: number | null;
  uploaderId: string | null;
  uploaderName: string | null;
  createdAt: Date;
};

export type ResourceFilters = {
  q?: string;
  groupId?: string;
  course?: string;
  kind?: string;
  mine?: boolean;
};

/** Resources from groups the student is an active member of. */
export async function listResources(
  db: Database,
  userId: string,
  filters: ResourceFilters = {},
  limit = 60,
) {
  const where = ["m.user_id = $1", "m.status = 'active'"];
  const values: unknown[] = [userId];
  const add = (clause: string, value: unknown) => {
    values.push(value);
    where.push(clause.replace("?", `$${values.length}`));
  };
  if (filters.groupId) add("r.group_id = ?", filters.groupId);
  if (filters.course) add("g.course_code = ?", filters.course);
  if (filters.kind) add("r.kind = ?", filters.kind);
  if (filters.mine) add("r.uploader_id = ?", userId);
  const q = filters.q?.trim().slice(0, 80);
  if (q) {
    values.push(`%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    const p = `$${values.length}`;
    where.push(
      `(r.title ilike ${p} or r.description ilike ${p} or r.file_name ilike ${p})`,
    );
  }
  values.push(limit);
  const result = await db.pool.query<{
    id: string;
    group_id: string;
    group_name: string;
    course_code: string;
    kind: string;
    title: string;
    description: string | null;
    url: string | null;
    file_name: string | null;
    mime: string | null;
    size: number | null;
    uploader_id: string | null;
    uploader_name: string | null;
    created_at: Date;
  }>(
    `select r.id, r.group_id, g.name as group_name, g.course_code, r.kind, r.title,
            r.description, r.url, r.file_name, r.mime, r.size, r.uploader_id,
            u.name as uploader_name, r.created_at
       from resources r
       join study_groups g on g.id = r.group_id
       join group_members m on m.group_id = r.group_id
       left join users u on u.id = r.uploader_id
      where ${where.join(" and ")}
      order by r.created_at desc
      limit $${values.length}`,
    values,
  );
  return result.rows.map<Resource>((row) => ({
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    courseCode: row.course_code,
    kind: row.kind,
    title: row.title,
    description: row.description,
    url: row.url,
    fileName: row.file_name,
    mime: row.mime,
    size: row.size,
    uploaderId: row.uploader_id,
    uploaderName: row.uploader_name,
    createdAt: row.created_at,
  }));
}

export type ResourceInput = {
  kind: string;
  title: string;
  description: string | null;
  url: string | null;
  file: { name: string; bytes: Buffer } | null;
};

export async function addResource(
  db: Database,
  userId: string,
  groupId: string,
  input: ResourceInput,
) {
  if (!input.url && !input.file)
    throw new UserFacingError("Attach a file or paste a link");
  let file: {
    name: string;
    mime: string;
    bytes: Buffer;
    checksum: string;
  } | null = null;
  if (input.file) {
    if (input.file.bytes.length > MAX_FILE_BYTES)
      throw new UserFacingError("Files can be up to 4 MB");
    const sniffed = sniffFile(input.file.name, input.file.bytes);
    if (!sniffed)
      throw new UserFacingError(
        `That file type isn’t supported. Use ${ACCEPTED_EXTENSIONS.join(", ")}`,
      );
    file = {
      name: safeFileName(input.file.name),
      mime: sniffed.mime,
      bytes: input.file.bytes,
      checksum: createHash("sha256").update(input.file.bytes).digest("hex"),
    };
  }
  return transaction(db, async (client) => {
    await requireMember(client, groupId, userId);
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      `resources:${groupId}`,
    ]);
    const usage = await client.query<{ bytes: string; recent: string }>(
      `select coalesce(sum(size), 0) as bytes,
              count(*) filter (where uploader_id = $2 and created_at > now() - interval '1 hour') as recent
         from resources where group_id = $1`,
      [groupId, userId],
    );
    if (Number(usage.rows[0].recent) >= 30)
      throw new UserFacingError("That’s a lot of uploads — try again in a bit");
    if (file) {
      if (Number(usage.rows[0].bytes) + file.bytes.length > GROUP_QUOTA_BYTES)
        throw new UserFacingError("This group’s library is full (200 MB)");
      const dupe = await client.query(
        "select 1 from resources where group_id = $1 and checksum = $2",
        [groupId, file.checksum],
      );
      if (dupe.rowCount)
        throw new UserFacingError("That exact file is already in the library");
    }
    const created = await client.query<{ id: string }>(
      `insert into resources (group_id, uploader_id, kind, title, description, url, file_name, mime, size, checksum)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [
        groupId,
        userId,
        input.kind,
        input.title,
        input.description,
        file ? null : input.url,
        file?.name ?? null,
        file?.mime ?? null,
        file?.bytes.length ?? null,
        file?.checksum ?? null,
      ],
    );
    const id = created.rows[0].id;
    if (file)
      await client.query(
        "insert into resource_files (resource_id, data) values ($1, $2)",
        [id, file.bytes],
      );
    await recordActivity(
      client,
      groupId,
      userId,
      "resource",
      `Shared “${input.title}”`,
    );
    return id;
  });
}

export async function deleteResource(
  db: Database,
  userId: string,
  resourceId: string,
) {
  const found = await db.pool.query<{
    group_id: string;
    uploader_id: string | null;
  }>("select group_id, uploader_id from resources where id = $1", [resourceId]);
  const row = found.rows[0];
  if (!row) return;
  const member = await membership(db.pool, row.group_id, userId);
  if (
    member?.status !== "active" ||
    (member.role !== "owner" && row.uploader_id !== userId)
  )
    throw new UserFacingError(
      "Only the organizer or the uploader can remove it",
    );
  await db.pool.query("delete from resources where id = $1", [resourceId]);
}

/** File bytes for an active member of the resource's group; null otherwise. */
export async function readResourceFile(
  db: Database,
  userId: string,
  resourceId: string,
) {
  const result = await db.pool.query<{
    file_name: string;
    mime: string;
    data: Buffer;
  }>(
    `select r.file_name, r.mime, f.data
       from resources r
       join resource_files f on f.resource_id = r.id
       join group_members m on m.group_id = r.group_id and m.user_id = $2 and m.status = 'active'
      where r.id = $1`,
    [resourceId, userId],
  );
  return result.rows[0] ?? null;
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
