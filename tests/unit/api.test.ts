import { describe, expect, it } from "vitest";
import { apiError, isSameOrigin, ok, readJson } from "../../lib/api";

describe("api helpers", () => {
  it("accepts same-origin and origin-less requests", () => {
    expect(
      isSameOrigin(
        new Request("http://localhost:3000/api", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOrigin(
        new Request("http://localhost:3000/api", { method: "POST" }),
      ),
    ).toBe(true);
  });

  it("accepts the host a proxy or tunnel forwarded", () => {
    expect(
      isSameOrigin(
        new Request("http://localhost:3000/api", {
          method: "POST",
          headers: {
            origin: "https://demo.trycloudflare.com",
            "x-forwarded-host": "demo.trycloudflare.com",
          },
        }),
      ),
    ).toBe(true);
  });

  it("rejects cross-site and malformed origins", () => {
    for (const origin of ["https://evil.example", "null"]) {
      expect(
        isSameOrigin(
          new Request("http://localhost:3000/api", {
            method: "POST",
            headers: { origin },
          }),
        ),
      ).toBe(false);
    }
  });

  it("wraps success and error payloads without caching", async () => {
    const success = ok({ a: 1 });
    expect(success.headers.get("cache-control")).toBe("no-store");
    expect(await success.json()).toEqual({ data: { a: 1 } });
    const failure = apiError("NOPE", "No", 422, { field: "bad" });
    expect(failure.status).toBe(422);
    expect(await failure.json()).toMatchObject({
      error: { code: "NOPE", message: "No", fieldErrors: { field: "bad" } },
    });
  });

  it("returns undefined for invalid JSON bodies", async () => {
    expect(
      await readJson(new Request("http://x/", { method: "POST", body: "{" })),
    ).toBeUndefined();
  });
});
