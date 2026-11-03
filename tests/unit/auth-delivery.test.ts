import { describe, expect, it, vi } from "vitest";
import { createDelivery, emailBody } from "../../lib/auth/delivery";
import { parseEnv } from "../../lib/env";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  AUTH_SECRET: "k".repeat(8) + "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  APP_URL: "http://localhost:3000",
};
const input = {
  email: "student@utdallas.edu",
  code: "K7Q2MX",
  expiresAt: new Date("2026-09-23T12:10:00.000Z"),
};

describe("verification delivery", () => {
  it("prints the code for the console provider outside production", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchImpl = vi.fn();
    const env = parseEnv({ ...base, EMAIL_PROVIDER: "console" });
    await createDelivery(env, fetchImpl)(input);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("K7Q2MX"));
    info.mockRestore();
  });

  it("sends through Resend with the configured sender", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const env = parseEnv({
      ...base,
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "hello@study.example",
    });
    await createDelivery(env, fetchImpl as typeof fetch)(input);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test" });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      from: "Comet Study <hello@study.example>",
      to: ["student@utdallas.edu"],
    });
    expect(body.text).toContain("K7Q2MX");
    expect(body.text).not.toContain("http");
    expect(body.subject).toContain("K7Q2MX");
    expect(body.attachments).toEqual([
      expect.objectContaining({
        content_id: "comet-wordmark",
        content_type: "image/png",
      }),
    ]);
  });

  it("shows the inline wordmark and one tile per code character", () => {
    const { html } = emailBody("K7Q2MX");
    expect(html).toContain('src="cid:comet-wordmark"');
    expect(html).toContain('alt="Comet Study"');
    expect(html.match(/<td style="padding:0 3px">/g)).toHaveLength(6);
    expect(html).not.toContain("Nobody gets in");
  });

  it("names the sender for SendGrid", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 202 }));
    const env = parseEnv({
      ...base,
      EMAIL_PROVIDER: "sendgrid",
      SENDGRID_API_KEY: "sg_test",
      EMAIL_FROM: "hello@study.example",
    });
    await createDelivery(env, fetchImpl as typeof fetch)(input);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(init.body)).from).toEqual({
      email: "hello@study.example",
      name: "Comet Study",
    });
  });

  it("reports provider failures as unavailable", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 500 }));
    const env = parseEnv({
      ...base,
      EMAIL_PROVIDER: "sendgrid",
      SENDGRID_API_KEY: "sg_test",
      EMAIL_FROM: "hello@study.example",
    });
    await expect(
      createDelivery(env, fetchImpl as typeof fetch)(input),
    ).rejects.toThrow("EMAIL_UNAVAILABLE");
  });

  it("refuses to deliver when email is disabled", async () => {
    const env = parseEnv({ ...base, EMAIL_PROVIDER: "disabled" });
    await expect(createDelivery(env, vi.fn())(input)).rejects.toThrow(
      "EMAIL_UNAVAILABLE",
    );
  });
});
