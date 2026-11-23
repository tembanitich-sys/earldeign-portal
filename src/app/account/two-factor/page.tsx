import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { generateURI } from "otplib";
import { getSession } from "@/lib/session";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, Submit } from "@/components/forms";
import { confirmTotpAction, startTotpEnrolment } from "@/app/login/actions";

export const metadata = { title: "Set up two-factor sign-in" };

export default async function TwoFactorPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.user.mustChangePassword) redirect("/account/password");
  if (s.user.totpEnabled) redirect("/");
  const secret = await startTotpEnrolment();
  const uri = generateURI({ issuer: "Earldeign Portal", label: s.user.email, secret });
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 200, color: { dark: "#111827", light: "#FFFFFF" } });
  return (
    <AuthShell title="Set up two-factor sign-in" intro="Your role requires a second step at sign-in. Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator or similar).">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="qr" src={qr} alt="QR code for your authenticator app" width={200} height={200} />
      <p className="small muted" style={{ marginTop: 12 }}>Cannot scan? Enter this key manually: <code className="secret">{secret.match(/.{1,4}/g)?.join(" ")}</code></p>
      <ActionForm action={confirmTotpAction}>
        <div className="field"><label htmlFor="code">Code shown in the app</label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required /></div>
        <div className="form-actions"><Submit>Turn on two-factor</Submit></div>
      </ActionForm>
    </AuthShell>
  );
}
