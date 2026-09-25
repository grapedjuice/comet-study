import { apiError, ok } from "../../../../../lib/api";
import { ensureCatalog, searchCatalog } from "../../../../../lib/courses";
import { currentUserContext } from "../../../../../lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const { db, user, nebula } = await currentUserContext();
    if (!user) return apiError("UNAUTHENTICATED", "Sign in first", 401);
    const status = await ensureCatalog(db, nebula);
    if (!status.count)
      return apiError(
        "CATALOG_UNAVAILABLE",
        "The UTD course catalog isn’t available right now",
        503,
      );
    return ok({ results: await searchCatalog(db, q.slice(0, 60)) });
  } catch {
    return apiError(
      "CATALOG_UNAVAILABLE",
      "The UTD course catalog isn’t available right now",
      503,
    );
  }
}
