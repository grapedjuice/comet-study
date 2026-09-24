import { describe, expect, it } from "vitest";
import { parseEnv } from "../../lib/env";

const valid = {
  NODE_ENV: "test",
  DATABASE_URL:
    "postgresql://test_user:isolated_secret@127.0.0.1:5439/comet_test",
  AUTH_SECRET: "a".repeat(48),
  APP_URL: "http://localhost:3000",
  DATA_MODE: "fixture",
  EMAIL_PROVIDER: "console",
};

describe("parseEnv", () => {
  it.each(["DATABASE_URL", "AUTH_SECRET", "APP_URL"])(
    "rejects a missing %s",
    (key) => {
      expect(() => parseEnv({ ...valid, [key]: undefined })).toThrow(key);
    },
  );

  it("does not disclose supplied secrets in validation errors", () => {
    const secret = "secret-value-that-must-not-leak";
    expect(() =>
      parseEnv({
        ...valid,
        AUTH_SECRET: secret,
        DATABASE_URL: `postgresql://${secret}`,
      }),
    ).toThrowError(new RegExp("AUTH_SECRET"));
    try {
      parseEnv({
        ...valid,
        AUTH_SECRET: secret,
        DATABASE_URL: `postgresql://${secret}`,
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it("accepts a valid isolated test configuration", () => {
    expect(parseEnv(valid).DATABASE_URL).toBe(valid.DATABASE_URL);
  });

  it("rejects fixture adapters in production", () => {
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: "production",
        APP_URL: "https://study.example.edu",
      }),
    ).toThrow(/DATA_MODE|EMAIL_PROVIDER/);
  });

  it("rejects HTTP origin in production", () => {
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: "production",
        DATA_MODE: "disabled",
        EMAIL_PROVIDER: "disabled",
      }),
    ).toThrow(/APP_URL/);
  });

  it("rejects a predictable production auth secret", () => {
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: "production",
        DATA_MODE: "disabled",
        EMAIL_PROVIDER: "disabled",
        APP_URL: "https://study.example.edu",
      }),
    ).toThrow(/AUTH_SECRET/);
  });

  it("rejects whitespace-only active provider credentials", () => {
    expect(() =>
      parseEnv({ ...valid, DATA_MODE: "live", NEBULA_API_KEY: "   " }),
    ).toThrow(/NEBULA_API_KEY/);
    expect(() =>
      parseEnv({
        ...valid,
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "  ",
        EMAIL_FROM: " ",
      }),
    ).toThrow(/RESEND_API_KEY|EMAIL_FROM/);
  });

  it("rejects an all-whitespace auth secret", () => {
    expect(() => parseEnv({ ...valid, AUTH_SECRET: " ".repeat(40) })).toThrow(
      /AUTH_SECRET/,
    );
  });

  it("accepts a production configuration without inactive provider credentials", () => {
    expect(
      parseEnv({
        ...valid,
        NODE_ENV: "production",
        DATA_MODE: "disabled",
        EMAIL_PROVIDER: "disabled",
        APP_URL: "https://study.example.edu",
        AUTH_SECRET:
          "e8c31e81a9f34e2d6b84b6fa2987091ff8115238244baa29f12ec42ee1547dbd",
      }).NODE_ENV,
    ).toBe("production");
  });
});
