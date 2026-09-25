import { isUuid } from "../../../../../../lib/app-errors";
import { apiError } from "../../../../../../lib/api";
import { currentUserContext } from "../../../../../../lib/request-context";
import { readResourceFile } from "../../../../../../lib/resources";

export const runtime = "nodejs";

/** Download a library file; only active members of its group get bytes. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) return apiError("NOT_FOUND", "File not found", 404);
  try {
    const { db, user } = await currentUserContext();
    if (!user) return apiError("UNAUTHENTICATED", "Sign in first", 401);
    const file = await readResourceFile(db, user.id, id);
    if (!file) return apiError("NOT_FOUND", "File not found", 404);
    const ascii = file.file_name
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_");
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mime,
        "Content-Length": String(file.data.length),
        // Always a download: never render uploaded content on our origin.
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return apiError(
      "SERVICE_UNAVAILABLE",
      "Files are temporarily unavailable",
      503,
    );
  }
}
