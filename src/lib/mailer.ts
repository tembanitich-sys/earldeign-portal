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
    // On 587 the connection must upgrade to TLS before the password is sent.
    requireTLS: Number(process.env.SMTP_PORT ?? 587) !== 465,
    connectionTimeout: 10_000,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

/** Like sendMail, but reports the server's answer, for the Super Admin's test button. */
export async function testMail(to: string): Promise<{ ok: boolean; detail: string }> {
  const t = getTransport();
  if (!t) return { ok: false, detail: "Email is not configured: SMTP_HOST is not set." };
  try {
    const info = await t.sendMail({
      from: process.env.MAIL_FROM ?? "noreply@earldeign.co.zw", to,
      subject: "Test email from the Earldeign portal",
      text: "This is a test from the Earldeign portal. If you can read it, email notifications are working.\n\nEarldeign Investments (Pvt) Ltd",
    });
    return { ok: true, detail: `Accepted by the mail server (${info.response ?? "ok"}). Check the inbox and the spam folder.` };
  } catch (e) {
    const err = e as { code?: string; response?: string; message?: string };
    const hint = err.code === "EAUTH" ? " The username or password was refused."
      : err.code === "ESOCKET" || err.code === "ETIMEDOUT" || err.code === "ECONNECTION" ? " The server could not be reached on that host and port."
      : /certificate|altnames/i.test(err.message ?? "") ? " The server's certificate does not match the host name: ask the host for the correct SMTP server name." : "";
    return { ok: false, detail: `${err.response ?? err.message ?? "Unknown error"}.${hint}` };
  }
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
