import type { AppEnv } from "../env";
import type { VerificationDelivery } from "./service";

/** The token travels in the fragment so it never reaches server access logs. */
export function verificationLink(appUrl: string, token: string) {
  return `${appUrl}/verify#token=${encodeURIComponent(token)}`;
}

function emailBody(link: string) {
  const text = `Your Comet Study sign-in link (valid for 10 minutes):\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:32px;color:#0b0d1a">
<h1 style="font-size:22px;margin:0 0 12px">Your seat at the study table</h1>
<p style="color:#4a4f6a;line-height:1.5">Tap below to sign in to Comet Study. The link works once and expires in 10 minutes.</p>
<p style="margin:28px 0"><a href="${link}" style="background:#6d5dfc;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Sign in to Comet Study</a></p>
<p style="color:#8a8fa8;font-size:13px">If you didn't ask for this, you can ignore this email.</p></div>`;
  return { text, html };
}

export function createDelivery(
  env: AppEnv,
  fetchImpl: typeof fetch = fetch,
): VerificationDelivery {
  return async ({ email, token }) => {
    const link = verificationLink(env.APP_URL, token);
    const subject = "Your Comet Study sign-in link";
    const { text, html } = emailBody(link);
    if (env.EMAIL_PROVIDER === "console" && env.NODE_ENV !== "production") {
      console.info(`[comet-study] sign-in link for ${email}: ${link}`);
      return;
    }
    let response: Response;
    if (env.EMAIL_PROVIDER === "resend") {
      response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [email],
          subject,
          text,
          html,
        }),
      });
    } else if (env.EMAIL_PROVIDER === "sendgrid") {
      response = await fetchImpl("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: env.EMAIL_FROM },
          subject,
          content: [
            { type: "text/plain", value: text },
            { type: "text/html", value: html },
          ],
        }),
      });
    } else {
      throw new Error("EMAIL_UNAVAILABLE");
    }
    if (!response.ok) throw new Error("EMAIL_UNAVAILABLE");
  };
}
