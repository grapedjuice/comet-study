import { describe, expect, it } from "vitest";
import {
  hashToken,
  isEligibleUtdEmail,
  issueToken,
  normalizeEmail,
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
