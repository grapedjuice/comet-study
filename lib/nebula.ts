import { z } from "zod";

/**
 * Minimal Nebula Labs API client (https://api.utdnebula.com), server-only.
 * Contract verified live 2026-09-24: `{ status, message, data }` envelope,
 * `x-api-key` header, exact-match filters only (see docs/nebula-contract-research.md).
 */
const BASE = "https://api.utdnebula.com";

const Envelope = z.object({ status: z.number(), data: z.unknown() });

const Course = z.object({
  _id: z.string(),
  subject_prefix: z.string(),
  course_number: z.string(),
  title: z.string(),
  credit_hours: z.string().nullish(),
  catalog_year: z.string(),
});
export type NebulaCourse = z.infer<typeof Course>;

const Meeting = z.object({
  meeting_days: z.array(z.string()).nullish(),
  start_time: z.string().nullish(),
  end_time: z.string().nullish(),
  location: z
    .object({ building: z.string().nullish(), room: z.string().nullish() })
    .nullish(),
});
const Section = z.object({
  _id: z.string(),
  section_number: z.string(),
  academic_session: z.object({ name: z.string() }),
  professors: z.array(z.string()).nullish(),
  instruction_mode: z.string().nullish(),
  meetings: z.array(Meeting).nullish(),
});
export type NebulaSection = z.infer<typeof Section>;

const Professor = z.object({
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
});

const BuildingRooms = z.object({
  building: z.string(),
  rooms: z.array(
    z.object({ room: z.string(), capacity: z.number().nullish() }),
  ),
});
export type NebulaBuildingRooms = z.infer<typeof BuildingRooms>;

// Event fields differ per feed; keep them loose and normalize in lib/rooms.
const DayEvents = z.object({
  buildings: z
    .array(
      z.object({
        building: z.string(),
        rooms: z
          .array(
            z.object({
              room: z.string(),
              events: z.array(z.record(z.string(), z.unknown())).nullish(),
            }),
          )
          .nullish(),
      }),
    )
    .nullish(),
});
export type NebulaDayBuildings = NonNullable<
  z.infer<typeof DayEvents>["buildings"]
>;

export class NebulaError extends Error {
  constructor(readonly status: number) {
    super("NEBULA_UNAVAILABLE");
  }
}

export function createNebulaClient(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
) {
  async function get<T extends z.ZodType>(
    path: string,
    schema: T,
    timeoutMs = 8000,
  ): Promise<z.infer<T> | null> {
    let response: Response;
    try {
      response = await fetchImpl(`${BASE}${path}`, {
        headers: { "x-api-key": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new NebulaError(0);
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new NebulaError(response.status);
    const body = Envelope.safeParse(await response.json());
    if (!body.success) throw new NebulaError(502);
    if (body.data.data === null) return null;
    const parsed = schema.safeParse(body.data.data);
    if (!parsed.success) throw new NebulaError(502);
    return parsed.data;
  }

  /** Keep valid rows; one malformed upstream record shouldn't sink a list. */
  const each = <T extends z.ZodType>(rows: unknown[] | null, schema: T) =>
    (rows ?? []).flatMap((row) => {
      const parsed = schema.safeParse(row);
      return parsed.success ? [parsed.data as z.infer<T>] : [];
    });

  const professorNames = new Map<string, string | null>();

  return {
    /** Every catalog entry across catalog years (~20k rows, unpaginated). */
    async allCourses() {
      return each(
        await get("/course/all", z.array(z.unknown()), 60_000),
        Course,
      );
    },
    async courseSections(courseId: string) {
      return each(
        await get(
          `/course/${encodeURIComponent(courseId)}/sections`,
          z.array(z.unknown()),
        ),
        Section,
      );
    },
    /** Room inventory: building → rooms with capacity (0 means unknown). */
    async rooms() {
      return each(
        await get("/rooms", z.array(z.unknown()), 20_000),
        BuildingRooms,
      );
    },
    /**
     * One day of room occupancy from a feed: CourseBook class meetings
     * ("events"), Ad Astra academic reservations ("astra") or Mazevo
     * Student Union reservations ("mazevo"). `date` is "YYYY-MM-DD".
     */
    async roomEvents(feed: "events" | "astra" | "mazevo", date: string) {
      const day = await get(`/${feed}/${date}`, DayEvents, 20_000);
      return day?.buildings ?? [];
    },
    async professorName(id: string) {
      if (professorNames.has(id)) return professorNames.get(id) ?? null;
      const professor = await get(
        `/professor/${encodeURIComponent(id)}`,
        Professor,
      ).catch(() => null);
      const name = professor
        ? [professor.first_name, professor.last_name]
            .filter(Boolean)
            .join(" ") || null
        : null;
      professorNames.set(id, name);
      return name;
    },
  };
}
export type NebulaClient = ReturnType<typeof createNebulaClient>;
