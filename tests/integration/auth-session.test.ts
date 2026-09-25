import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createVerificationToken,
  MAX_LIVE_TOKENS,
  MAX_REQUESTS_PER_REQUESTER_HOUR,
  redeemVerificationToken,
} from "../../lib/auth/repository";
import { findSessionUser, revokeSession } from "../../lib/auth/session";
import { createDatabaseClient, runMigrations } from "../../lib/db";

const url = process.env.DATABASE_URL;
if (!url || process.env.COMET_ISOLATED_TEST_DB !== "1") {
  throw new Error("Auth integration tests require an isolated test database");
}
const db = createDatabaseClient(url);

beforeAll(() => runMigrations(db));
afterAll(() => db.close());

describe("sessions", () => {
  it("resolves a redeemed session and stops after revocation", async () => {
    const issued = new Date("2026-09-23T12:00:00.000Z");
    const created = await createVerificationToken(
      db,
      "Session.User@UTDallas.edu",
      issued,
    );
    const redeemed = await redeemVerificationToken(
      db,
      created.rawToken,
      new Date("2026-09-23T12:01:00.000Z"),
    );
    expect(redeemed).not.toBeNull();
    const now = new Date("2026-09-24T12:00:00.000Z");
    const user = await findSessionUser(db, redeemed!.sessionToken, now);
    expect(user).toMatchObject({ email: "session.user@utdallas.edu" });
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date);

    expect(await revokeSession(db, redeemed!.sessionToken, now)).toBe(true);
    expect(await findSessionUser(db, redeemed!.sessionToken, now)).toBeNull();
    expect(await revokeSession(db, redeemed!.sessionToken, now)).toBe(false);
  });

  it("ignores unknown and expired session tokens", async () => {
    expect(await findSessionUser(db, "not-a-real-token")).toBeNull();
    const created = await createVerificationToken(
      db,
      "expiring@utdallas.edu",
      new Date("2026-09-23T12:00:00.000Z"),
    );
    const redeemed = await redeemVerificationToken(
      db,
      created.rawToken,
      new Date("2026-09-23T12:01:00.000Z"),
    );
    expect(
      await findSessionUser(
        db,
        redeemed!.sessionToken,
        new Date("2026-10-01T12:02:00.000Z"),
      ),
    ).toBeNull();
  });
});

describe("verification rate limit", () => {
  it("caps live links per address and frees up after expiry", async () => {
    const at = new Date("2026-09-23T13:00:00.000Z");
    for (let i = 0; i < MAX_LIVE_TOKENS; i++)
      await createVerificationToken(db, "limited@utdallas.edu", at);
    await expect(
      createVerificationToken(db, "limited@utdallas.edu", at),
    ).rejects.toThrow("RATE_LIMITED");
    await expect(
      createVerificationToken(
        db,
        "limited@utdallas.edu",
        new Date("2026-09-23T13:11:00.000Z"),
      ),
    ).resolves.toMatchObject({ email: "limited@utdallas.edu" });
  });

  it("caps sign-in emails per network across addresses", async () => {
    const at = new Date("2026-09-23T15:00:00.000Z");
    for (let i = 0; i < MAX_REQUESTS_PER_REQUESTER_HOUR; i++)
      await createVerificationToken(
        db,
        `net${i}@utdallas.edu`,
        at,
        "requester-a",
      );
    await expect(
      createVerificationToken(db, "net-extra@utdallas.edu", at, "requester-a"),
    ).rejects.toThrow("RATE_LIMITED");
    await expect(
      createVerificationToken(db, "net-extra@utdallas.edu", at, "requester-b"),
    ).resolves.toMatchObject({ email: "net-extra@utdallas.edu" });
    await expect(
      createVerificationToken(
        db,
        "net-later@utdallas.edu",
        new Date("2026-09-23T16:01:00.000Z"),
        "requester-a",
      ),
    ).resolves.toMatchObject({ email: "net-later@utdallas.edu" });
  });
});
