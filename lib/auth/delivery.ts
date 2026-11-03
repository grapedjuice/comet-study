import type { AppEnv } from "../env";
import type { VerificationDelivery } from "./service";

/** Inboxes show this instead of the bare address. */
const SENDER_NAME = "Comet Study";

function emailBody(code: string) {
  const text = `Your Comet Study sign-in code is ${code}

Type it on the sign-in page. It works once and expires in 10 minutes.

If you didn't ask for this, you can ignore this email.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:32px;color:#0b0d1a">
<h1 style="font-size:22px;margin:0 0 12px">Your seat at the study table</h1>
<p style="color:#4a4f6a;line-height:1.5">Type this code on the Comet Study sign-in page. It works once and expires in 10 minutes.</p>
<p style="margin:28px 0;font-size:34px;font-weight:700;letter-spacing:0.3em;font-family:ui-monospace,monospace">${code}</p>
<p style="color:#8a8fa8;font-size:13px">If you didn't ask for this, you can ignore this email.</p></div>`;
  return { text, html };
}

export function createDelivery(
  env: AppEnv,
  fetchImpl: typeof fetch = fetch,
): VerificationDelivery {
  return async ({ email, code }) => {
    const subject = `${code} is your Comet Study sign-in code`;
    const { text, html } = emailBody(code);
    if (env.EMAIL_PROVIDER === "console" && env.NODE_ENV !== "production") {
      console.info(`[comet-study] sign-in code for ${email}: ${code}`);
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
          from: `${SENDER_NAME} <${env.EMAIL_FROM}>`,
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
          from: { email: env.EMAIL_FROM, name: SENDER_NAME },
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
