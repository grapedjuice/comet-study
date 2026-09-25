import { describe, expect, it } from "vitest";
import {
  hashToken,
  isEligibleUtdEmail,
  issueToken,
  normalizeEmail,
  requesterHash,
} from "../../lib/auth/policy";

describe("authentication policy", () => {
  it.each([
    ["student@utdallas.edu", "student@utdallas.edu"],
    [" Student@UTDallas.EDU ", "student@utdallas.edu"],
  ])("normalizes eligible email %s", (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
    expect(isEligibleUtdEmail(input)).toBe(true);
  });

  it.each([
    "student@utdallas.edu.attacker.test",
    "student@sub.utdallas.edu",
    "student@utdallas.edu.example",
    "student@example.edu",
    "student utdallas.edu",
  ])("rejects non-exact eligible domain: %s", (input) => {
    expect(isEligibleUtdEmail(input)).toBe(false);
  });

  it("issues an opaque token and stores only a non-reversible digest", () => {
    const issued = issueToken();
    expect(issued.raw).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(issued.digest).toBe(hashToken(issued.raw));
    expect(issued.digest).not.toContain(issued.raw);
  });

  it("uses a different digest for different tokens", () => {
    const first = issueToken();
    const second = issueToken();
    expect(first.raw).not.toBe(second.raw);
    expect(first.digest).not.toBe(second.digest);
  });
});

describe("requester hash", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://comet.test/", { headers });
  it("keys the first forwarded IP and never returns it raw", () => {
    const a = requesterHash(
      req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }),
      "k".repeat(32),
    );
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("203.0.113.9");
    expect(
      requesterHash(req({ "x-real-ip": "203.0.113.9" }), "k".repeat(32)),
    ).toBe(a);
    expect(
      requesterHash(req({ "x-forwarded-for": "203.0.113.9" }), "j".repeat(32)),
    ).not.toBe(a);
    expect(requesterHash(req({}), "k".repeat(32))).toBeNull();
  });
});
