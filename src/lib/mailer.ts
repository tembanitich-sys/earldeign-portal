import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null | undefined;

function getTransport() {
  if (transporter !== undefined) return transporter;
  if (!process.env.SMTP_HOST) {
    transporter = null;
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const t = getTransport();
  if (!t) {
    if (process.env.NODE_ENV !== "test") console.info(`[mail:outbox] to=${to} subject=${subject}`);
    return false;
  }
  try {
    await t.sendMail({ from: process.env.MAIL_FROM ?? "noreply@earldeign.co.zw", to, subject, text });
    return true;
  } catch (e) {
    console.error("[mail] send failed", e);
    return false;
  }
}
