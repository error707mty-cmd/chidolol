import nodemailer from "nodemailer";

const SMTP_HOST = process.env["SMTP_HOST"];
const SMTP_PORT = parseInt(process.env["SMTP_PORT"] ?? "587");
const SMTP_USER = process.env["SMTP_USER"];
const SMTP_PASS = process.env["SMTP_PASS"];
const SMTP_FROM = process.env["SMTP_FROM"] ?? "ERROR707 Studio <no-reply@error707.studio>";
const APP_URL = process.env["APP_URL"] ?? "http://localhost:5000";

export const emailEnabled = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

const transporter = emailEnabled
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

export async function sendVerificationEmail(to: string, token: string) {
  if (!transporter) return false;
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}`;
  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject: "Verifica tu correo — ERROR707 Studio",
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:540px;margin:0 auto;background:#06030f;color:#fff;border-radius:16px;overflow:hidden">
        <div style="background:linear-gradient(90deg,#7c3aed,#ec4899,#f97316);height:4px"></div>
        <div style="padding:40px 40px 32px">
          <h1 style="margin:0 0 8px;font-size:26px;font-weight:900;letter-spacing:-0.025em">Verifica tu correo</h1>
          <p style="margin:0 0 28px;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6">
            Haz clic en el botón para confirmar tu cuenta en <strong style="color:#a78bfa">ERROR707 Studio</strong>. 
            Este enlace expira en 24 horas.
          </p>
          <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(90deg,#7c3aed,#ec4899);color:#fff;font-weight:700;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none">
            Verificar mi cuenta →
          </a>
          <p style="margin:28px 0 0;color:rgba(255,255,255,0.3);font-size:12px">
            Si no creaste esta cuenta, ignora este correo.
          </p>
        </div>
      </div>
    `,
  });
  return true;
}
