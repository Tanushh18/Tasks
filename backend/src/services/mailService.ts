import nodemailer from "nodemailer";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

export function isMailConfigured(): boolean {
  return Boolean(env.mailWebhookUrl) || Boolean(env.smtpHost && env.smtpUser && env.smtpPass && env.mailFrom);
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export async function sendMail(options: {
  to: string[];
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}): Promise<void> {
  if (!isMailConfigured()) {
    throw new ApiError(503, "MAIL_NOT_CONFIGURED", "Email isn't set up on the server yet. Use Download Excel instead.");
  }
  if (env.mailWebhookUrl) {
    await sendViaWebhook(options);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: { user: env.smtpUser, pass: env.smtpPass },
  });
  try {
    await transporter.sendMail({
      from: env.mailFrom,
      to: options.to.join(", "),
      subject: options.subject,
      text: options.text,
      attachments: options.attachments,
    });
  } catch (err) {
    console.error("Sending mail failed", err);
    throw new ApiError(502, "MAIL_FAILED", "We couldn't send the email. Check the address and try again.");
  }
}

/** Sends through a Google Apps Script web app, which mails from the script owner's Gmail. */
async function sendViaWebhook(options: {
  to: string[];
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}): Promise<void> {
  try {
    const response = await fetch(env.mailWebhookUrl, {
      method: "POST",
      // Apps Script reads the raw body; text/plain avoids a CORS-style preflight it can't answer.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret: env.mailWebhookSecret,
        to: options.to,
        subject: options.subject,
        text: options.text,
        attachments: (options.attachments ?? []).map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          base64: a.content.toString("base64"),
        })),
      }),
      redirect: "follow",
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !body?.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
  } catch (err) {
    console.error("Mail webhook failed", err);
    throw new ApiError(502, "MAIL_FAILED", "We couldn't send the email. Check the address and try again.");
  }
}
