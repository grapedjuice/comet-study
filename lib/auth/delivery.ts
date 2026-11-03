import type { AppEnv } from "../env";
import { WORDMARK_PNG_BASE64 } from "./email-wordmark";
import type { VerificationDelivery } from "./service";

/** Inboxes show this instead of the bare address. */
const SENDER_NAME = "Comet Study";

// Mail clients load web fonts only sometimes (Apple Mail, iOS); the rest
// fall back to the system stack, so both are spelled out everywhere.
const SANS = `Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const SERIF = `'Instrument Serif',Georgia,'Times New Roman',serif`;
const MONO = `'Geist Mono','SF Mono',Menlo,Consolas,'Courier New',monospace`;
const PAGE = "#07081a";
const CARD = "#11132b";
const TILE = "#1b1e40";

/**
 * Outlook's dark mode repaints background colors but leaves background
 * images alone, so each dark fill is also a one-color gradient.
 */
function fill(color: string) {
  return `background-color:${color};background-image:linear-gradient(${color},${color})`;
}
/** The wordmark rides along as an inline attachment the HTML points at. */
const WORDMARK_CID = "comet-wordmark";
const WORDMARK_FILE = "comet-study.png";

/** Table layout and inline styles: the only HTML Outlook and Gmail agree on. */
export function emailBody(code: string) {
  const text = `Your Comet Study sign-in code is ${code}

Enter it on the Comet Study sign-in page. It expires in 10 minutes and works once.

Didn't ask for this? Someone may have typed your email by mistake. You can ignore it.`;
  const tiles = [...code]
    .map(
      (char) =>
        `<td style="padding:0 3px"><div class="cs-tile" style="width:42px;height:54px;line-height:54px;border-radius:12px;${fill(TILE)};border:1px solid #363b75;color:#ffffff;font-family:${MONO};font-size:26px;font-weight:600;text-align:center">${char}</div></td>`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>Your Comet Study sign-in code</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@600&family=Instrument+Serif:ital@1&display=swap" rel="stylesheet">
<style>
[data-ogsb] .cs-page{background-color:${PAGE}!important}
[data-ogsb] .cs-card{background-color:${CARD}!important}
[data-ogsb] .cs-tile{background-color:${TILE}!important}
</style>
</head>
<body class="cs-page" style="margin:0;padding:0;${fill(PAGE)}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE}">Expires in 10 minutes and works once. Didn't ask? You can ignore it.&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cs-page" style="${fill(PAGE)}"><tr><td align="center" class="cs-page" style="padding:32px 16px;${fill(PAGE)}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px">
<tr><td align="center" style="padding:0 0 20px"><img src="cid:${WORDMARK_CID}" width="175" height="64" alt="Comet Study" style="display:block;border:0;width:175px;height:64px;color:#f4f4fb;font-family:${SANS};font-size:20px;font-weight:600"></td></tr>
<tr><td class="cs-card" style="${fill(CARD)};border:1px solid #262a52;border-radius:20px;padding:30px 24px">
<p style="margin:0 0 10px;color:#7cc8ff;font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase">Sign-in code</p>
<p style="margin:0 0 8px;color:#f4f4fb;font-family:${SANS};font-size:26px;font-weight:600;letter-spacing:-0.02em;line-height:1.2">Here's your <em style="font-family:${SERIF};font-size:1.15em;font-weight:400;font-style:italic;color:#a99dff;letter-spacing:0">code.</em></p>
<p style="margin:0 0 24px;color:#a4a8c6;font-family:${SANS};font-size:15px;line-height:1.55">Enter it on the Comet Study sign-in page to pick up where you left off.</p>
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 22px"><tr>${tiles}</tr></table>
<p style="margin:0;color:#8d92b8;font-family:${SANS};font-size:13px;text-align:center">Expires in 10 minutes &nbsp;&middot;&nbsp; Works once</p>
</td></tr>
<tr><td style="padding:22px 12px 0;color:#7a7fa3;font-family:${SANS};font-size:13px;line-height:1.55;text-align:center">Didn't ask for this? Someone may have typed your email by mistake. You can ignore it.</td></tr>
<tr><td style="padding:12px 0 0;color:#565b80;font-family:${SANS};font-size:12px;text-align:center">Comet Study &middot; Study groups for UT Dallas</td></tr>
</table>
</td></tr></table>
</body></html>`;
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
          attachments: [
            {
              filename: WORDMARK_FILE,
              content: WORDMARK_PNG_BASE64,
              content_type: "image/png",
              content_id: WORDMARK_CID,
            },
          ],
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
          attachments: [
            {
              filename: WORDMARK_FILE,
              content: WORDMARK_PNG_BASE64,
              type: "image/png",
              disposition: "inline",
              content_id: WORDMARK_CID,
            },
          ],
        }),
      });
    } else {
      throw new Error("EMAIL_UNAVAILABLE");
    }
    if (!response.ok) throw new Error("EMAIL_UNAVAILABLE");
  };
}
