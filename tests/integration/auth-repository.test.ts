import { describe, expect, it } from "vitest";
import { afterAll, beforeAll } from "vitest";
import {
  createVerificationToken,
  redeemVerificationToken,
} from "../../lib/auth/repository";
import { createDatabaseClient, runMigrations } from "../../lib/db";

const url = process.env.DATABASE_URL;
if (!url || process.env.COMET_ISOLATED_TEST_DB !== "1") {
  throw new Error("Auth integration tests require an isolated test database");
}
const db = createDatabaseClient(url);

beforeAll(() => runMigrations(db));
afterAll(() => db.close());

describe("verification token persistence", () => {
  it("stores a hashed token and redeems it only once", async () => {
    const created = await createVerificationToken(
      db,
      "student@utdallas.edu",
      new Date("2026-09-23T12:00:00.000Z"),
    );
    expect(created.rawToken).not.toBe(created.tokenHash);
    const first = await redeemVerificationToken(
      db,
      created.rawToken,
      new Date("2026-09-23T12:01:00.000Z"),
    );
    const second = await redeemVerificationToken(
      db,
      created.rawToken,
      new Date("2026-09-23T12:02:00.000Z"),
    );
    expect(first).not.toBeNull();
    expect(first?.sessionToken).not.toBe(first?.sessionTokenHash);
    expect(second).toBeNull();
  });

  it("rejects a token after its expiry", async () => {
    const created = await createVerificationToken(
      db,
      "expired@utdallas.edu",
      new Date("2026-09-23T12:00:00.000Z"),
    );
    expect(
      await redeemVerificationToken(
        db,
        created.rawToken,
        new Date("2026-09-23T12:11:00.000Z"),
      ),
    ).toBeNull();
  });

  it("allows only one winner when two requests redeem concurrently", async () => {
    const created = await createVerificationToken(
      db,
      "racing@utdallas.edu",
      new Date("2026-09-23T12:00:00.000Z"),
    );
    const results = await Promise.all([
      redeemVerificationToken(
        db,
        created.rawToken,
        new Date("2026-09-23T12:01:00.000Z"),
      ),
      redeemVerificationToken(
        db,
        created.rawToken,
        new Date("2026-09-23T12:01:00.000Z"),
      ),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
  });
});
