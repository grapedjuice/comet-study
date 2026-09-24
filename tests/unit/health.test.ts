import { describe, expect, it } from "vitest";
import { liveness, readiness } from "../../lib/health";

describe("health", () => {
  it("keeps liveness independent of dependencies", () => {
    expect(liveness()).toEqual({
      status: 200,
      body: { data: { status: "ok" } },
    });
  });

  it("reports ready after a successful dependency probe", async () => {
    expect(await readiness(async () => true)).toEqual({
      status: 200,
      body: { data: { status: "ready" } },
    });
  });

  it("reports 503 when the schema is stale", async () => {
    const result = await readiness(async () => false);
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({
      error: { code: "SERVICE_UNAVAILABLE" },
    });
  });

  it("reports 503 without leaking a database exception", async () => {
    const result = await readiness(async () => {
      throw new Error("private database password");
    });
    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain(
      "private database password",
    );
  });
});
