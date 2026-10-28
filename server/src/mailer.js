import fs from "node:fs";
import nodemailer from "nodemailer";

let transport;

export function emailVerificationEnabled() {
  return process.env.EMAIL_VERIFICATION_ENABLED === "true";
}

// MAIL_TRANSPORT=file appends messages to MAIL_OUTBOX_FILE (tests only).
export async function sendMail({ to, subject, text }) {
  if (process.env.MAIL_TRANSPORT === "file" && process.env.MAIL_OUTBOX_FILE) {
    fs.appendFileSync(
      process.env.MAIL_OUTBOX_FILE,
      `${JSON.stringify({ to, subject, text })}\n`,
    );
    return;
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS)
    throw new Error("SMTP is not configured");
  transport ||= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: (process.env.SMTP_SECURE ?? "true") === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM || `PaceCar <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
  });
}
