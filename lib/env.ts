import { z } from "zod";

const origin = z.url().refine((value) => {
  const url = new URL(value);
  return url.origin === value && !url.username && !url.password;
});

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .url()
    .refine((value) =>
      ["postgres:", "postgresql:"].includes(new URL(value).protocol),
    ),
  AUTH_SECRET: z.string().refine((value) => value.trim().length >= 32),
  APP_URL: origin,
  DATA_MODE: z.enum(["disabled", "fixture", "live"]).default("disabled"),
  EMAIL_PROVIDER: z
    .enum(["disabled", "console", "resend", "sendgrid"])
    .default("disabled"),
  NEBULA_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  // "on" skips the inbox: the sign-in page gets the link back as a button.
  // Anyone can then sign in as any eligible address, so it's opt-in.
  INSTANT_SIGNIN: z.enum(["on", "off"]).default("off"),
  // Bearer token the scheduler sends to /api/v1/cron/* (Vercel sets it).
  CRON_SECRET: z.string().optional(),
});

export type AppEnv = z.infer<typeof schema>;

export function parseEnv(input: Record<string, string | undefined>): AppEnv {
  const result = schema.safeParse(input);
  if (!result.success) {
    const names = [
      ...new Set(
        result.error.issues.map(
          (issue) => issue.path.join(".") || "environment",
        ),
      ),
    ];
    throw new Error(`Invalid environment variables: ${names.join(", ")}`);
  }

  const env = result.data;
  const invalid: string[] = [];
  if (env.NODE_ENV === "production") {
    if (!env.APP_URL.startsWith("https://")) invalid.push("APP_URL");
    if (
      /(.)\1{7,}/.test(env.AUTH_SECRET) ||
      /change.?me|placeholder|password|secret/i.test(env.AUTH_SECRET)
    ) {
      invalid.push("AUTH_SECRET");
    }
    if (env.DATA_MODE === "fixture") invalid.push("DATA_MODE");
    if (env.EMAIL_PROVIDER === "console") invalid.push("EMAIL_PROVIDER");
  }
  if (env.DATA_MODE === "live" && !env.NEBULA_API_KEY?.trim())
    invalid.push("NEBULA_API_KEY");
  if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY?.trim())
    invalid.push("RESEND_API_KEY");
  if (env.EMAIL_PROVIDER === "sendgrid" && !env.SENDGRID_API_KEY?.trim())
    invalid.push("SENDGRID_API_KEY");
  if (
    ["resend", "sendgrid"].includes(env.EMAIL_PROVIDER) &&
    !z.email().safeParse(env.EMAIL_FROM).success
  ) {
    invalid.push("EMAIL_FROM");
  }
  if (invalid.length)
    throw new Error(`Invalid environment variables: ${invalid.join(", ")}`);
  return env;
}
