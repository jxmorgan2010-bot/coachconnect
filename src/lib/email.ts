import { after } from "next/server";
import { checkForContactInfo } from "@/lib/moderation";
import { siteUrl } from "@/lib/siteUrl";
import { makeEmailSafe, type TextReplacement } from "@/lib/emailSafety";

/**
 * Email through Resend (https://resend.com), with RESEND_API_KEY and EMAIL_FROM from the
 * environment.
 *
 * - No key (local dev, previews): the email is logged to the console instead, with every link
 *   removed. Some links carry private tokens (password reset, guardian consent, withdraw consent),
 *   and server logs are readable by anyone with access to the hosting dashboard.
 * - Outside Vercel production, only @resend.dev test addresses are ever sent to. Previews share
 *   the production database, so this keeps a preview from emailing real families.
 * - Nothing in an email may be something the contact-info filter would block. Templates pass
 *   user-typed values through safeText(); sendEmail() checks the finished text again and replaces
 *   only what slipped through (src/lib/emailSafety.ts), records it for admins, and still sends.
 *   An email is never dropped for its content.
 * - No open or click tracking: no pixels, no rewritten links. (Resend's own tracking is a domain
 *   setting and must stay off in the Resend dashboard.)
 */

export type Email = {
  to: string;
  subject: string;
  /** Plain-text paragraphs. HTML-escaped when rendered. */
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Small print under the button, e.g. "This link expires in 1 hour." */
  footnote?: string;
  /** A short row of secondary links under the button, e.g. "Add to calendar: Google Calendar · Outlook". */
  links?: { intro: string; items: { label: string; url: string }[] };
  /** Files sent with the email (e.g. a session's .ics). Text content; base64-encoded for Resend. */
  attachments?: { filename: string; content: string }[];
  /**
   * Typed text a template already swapped for a neutral phrase (safeText/firstName fallbacks, see
   * src/lib/emails.ts). Not sent: sendEmail() records it for admins.
   */
  replaced?: TextReplacement[];
};

export type SendResult = { status: "sent"; id: string } | { status: "logged" | "suppressed" | "failed" };

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const LINK = /https?:\/\/\S+/g;

/** A user-typed value that's safe to put in an email, or the fallback if the contact filter would block it. */
export function safeText(value: string | null | undefined, fallback: string): string {
  const v = value?.trim();
  if (!v) return fallback;
  return checkForContactInfo(v).flagged ? fallback : v;
}

/** First name only, for subjects and alerts. */
export function firstName(fullName: string | null | undefined): string {
  return safeText(fullName?.trim().split(/\s+/)[0], "someone");
}

/** Outside Vercel production, only Resend's test inboxes (delivered@resend.dev etc.). */
export function canDeliverTo(to: string, vercelEnv = process.env.VERCEL_ENV): boolean {
  if (vercelEnv === "production") return true;
  return /^[^@\s]+@resend\.dev$/i.test(to.trim());
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Brand tokens from src/app/globals.css (email clients can't read CSS variables).
const C = { ink: "#10201a", pitch: "#1e5631", chalk: "#f5f6f0", surface: "#ffffff", line: "#d8dccf", gold: "#efb811", soft: "#57614f" };
const DISPLAY = "Anton, Impact, 'Arial Narrow Bold', 'Helvetica Neue', Arial, sans-serif";
const BODY = "Karla, 'Helvetica Neue', Helvetica, Arial, sans-serif";

export function renderText(email: Email): string {
  const parts = [...email.paragraphs];
  if (email.button) parts.push(`${email.button.label}: ${email.button.url}`);
  if (email.links) parts.push([email.links.intro, ...email.links.items.map((l) => `${l.label}: ${l.url}`)].join("\n"));
  if (email.footnote) parts.push(email.footnote);
  parts.push(`Assist Coaching · Bay Area. This address doesn't take replies; use Need help in the app.\n${siteUrl()}`);
  return parts.join("\n\n");
}

export function renderHtml(email: Email): string {
  const paragraphs = email.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-family:${BODY};font-size:16px;line-height:1.6;color:${C.ink};">${escapeHtml(p)}</p>`)
    .join("");
  const button = email.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr><td style="background:${C.pitch};border-radius:8px;border:2px solid ${C.ink};">` +
      `<a href="${escapeHtml(email.button.url)}" style="display:inline-block;padding:14px 22px;font-family:${BODY};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(email.button.label)}</a>` +
      `</td></tr></table>`
    : "";
  const links = email.links
    ? `<p style="margin:0 0 16px;font-family:${BODY};font-size:14px;line-height:1.6;color:${C.ink};">${escapeHtml(email.links.intro)} ` +
      email.links.items
        .map((l) => `<a href="${escapeHtml(l.url)}" style="color:${C.pitch};font-weight:700;">${escapeHtml(l.label)}</a>`)
        .join(" · ") +
      `</p>`
    : "";
  const footnote = email.footnote
    ? `<p style="margin:0 0 8px;font-family:${BODY};font-size:13px;line-height:1.5;color:${C.soft};">${escapeHtml(email.footnote)}</p>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(email.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.chalk};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.chalk};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${C.surface};border:2px solid ${C.ink};border-radius:12px;">
<tr><td style="background:${C.pitch};border-bottom:4px solid ${C.gold};border-radius:10px 10px 0 0;padding:16px 24px;">
<span style="font-family:${DISPLAY};font-size:24px;letter-spacing:0.5px;color:#ffffff;">Assist <span style="color:${C.gold};">Coaching</span></span>
</td></tr>
<tr><td style="padding:24px 24px 8px;">
<h1 style="margin:0 0 16px;font-family:${DISPLAY};font-size:26px;line-height:1.15;font-weight:400;color:${C.ink};">${escapeHtml(email.subject)}</h1>
${paragraphs}${button}${links}${footnote}
</td></tr>
<tr><td style="padding:16px 24px 20px;border-top:1px solid ${C.line};">
<p style="margin:0;font-family:${BODY};font-size:12px;line-height:1.5;color:${C.soft};">Assist Coaching · Bay Area. This address doesn't take replies; use Need help in the app.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

let announced = false;

/**
 * Saves replacements for the admin page. Loaded only when needed, so the database is never touched
 * for a clean email, and a failed write is logged, never thrown: the email still goes out.
 */
async function recordReplacements(email: Email, replacements: TextReplacement[]): Promise<void> {
  try {
    const { saveEmailReplacements } = await import("@/lib/emailReplacementStore");
    await saveEmailReplacements(email, replacements);
  } catch (err) {
    console.error(`[email] Couldn't record replaced text for "${email.subject}": ${(err as Error)?.message ?? err}`);
  }
}

/** Sends now and resolves when done. Most callers want queueEmail() instead. */
export async function sendEmail(original: Email): Promise<SendResult> {
  // Our own links are fine; everything else must pass the contact-info filter. Anything that
  // doesn't is replaced, never the whole email (src/lib/emailSafety.ts), and every replacement is
  // recorded for admins (/admin/jobs).
  const { email, replacements: found } = makeEmailSafe(original, renderText);
  const replacements = [...(original.replaced ?? []), ...found];
  if (replacements.length > 0) {
    const parts = replacements.map((r) => `${r.part} (${r.categories.join(", ")})`).join("; ");
    // The text itself stays out of server logs: it may hold someone's contact details.
    console.warn(`[email] Replaced text the contact filter matched in "${email.subject}": ${parts}. Sending the rest.`);
    await recordReplacements(email, replacements);
  }
  const text = renderText(email);

  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!announced) {
    announced = true;
    console.log(key && from ? "[email] Sending through Resend." : "[email] RESEND_API_KEY or EMAIL_FROM not set: logging emails, not sending.");
  }

  if (!key || !from) {
    console.log(`\n📧 [email, not sent] To: ${email.to}\nSubject: ${email.subject}\n${text.replace(LINK, "[link withheld from logs]")}${email.attachments?.length ? `\nAttachments: ${email.attachments.map((a) => a.filename).join(", ")}` : ""}\n`);
    return { status: "logged" };
  }
  if (!canDeliverTo(email.to)) {
    console.log(`[email] Not sent outside production (only @resend.dev test addresses are): "${email.subject}"`);
    return { status: "suppressed" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        html: renderHtml(email),
        text,
        ...(email.attachments?.length
          ? {
              attachments: email.attachments.map((a) => ({
                filename: a.filename,
                content: Buffer.from(a.content, "utf8").toString("base64"),
              })),
            }
          : {}),
      }),
    });
    if (!res.ok) {
      // Only the status and Resend's error name: the body can echo the email, links included.
      const name = await res.json().then((b: { name?: string }) => b?.name ?? "").catch(() => "");
      console.error(`[email] Resend rejected "${email.subject}": ${res.status} ${name}`);
      return { status: "failed" };
    }
    const { id } = (await res.json()) as { id: string };
    console.log(`[email] Sent "${email.subject}" (Resend id ${id})`);
    return { status: "sent", id };
  } catch (err) {
    console.error(`[email] Couldn't reach Resend for "${email.subject}": ${(err as Error).name}`);
    return { status: "failed" };
  }
}

/**
 * Sends after the response is finished, so an email never slows down or fails the action that
 * triggered it. Outside a request (scripts, tests) it just starts the send.
 */
export function queueEmail(email: Email): void {
  later(() => sendEmail(email));
}

/**
 * Runs `task` after the response (loading data for an email, then sending it). Errors are logged,
 * never thrown, so they can't reach the user. Outside a request it just starts the task.
 */
export function later(task: () => Promise<unknown>, label = "email"): void {
  const run = () =>
    task().then(
      () => undefined,
      (err: unknown) => console.error(`[${label}] failed: ${(err as Error)?.message ?? err}`),
    );
  try {
    after(run);
  } catch {
    void run();
  }
}
