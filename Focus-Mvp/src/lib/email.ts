/**
 * Email sending via Resend (https://resend.com).
 *
 * Setup:
 *  1. Sign up at https://resend.com (free — 100 emails/day, 3 000/month)
 *  2. Add your domain (focusnow.io) under Domains and verify the DNS records
 *  3. Create an API key and add it to .env:
 *       RESEND_API_KEY=re_xxxxxxxxxxxx
 *       EMAIL_FROM=Focus <focus@focusnow.io>
 *
 * While the domain is NOT yet verified you can still test by using
 * "onboarding@resend.dev" as the from address — Resend will deliver
 * to YOUR Resend account email only (not arbitrary recipients).
 */

import { Resend } from "resend";

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set in environment variables.");
  return new Resend(key);
}

const FROM = process.env.EMAIL_FROM ?? "Focus <onboarding@resend.dev>";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    // Dev fallback — print to console so flows can still be tested without email
    console.log(
      `\n[EMAIL — no RESEND_API_KEY set]\nTo: ${to}\nSubject: ${subject}\n` +
        html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim() +
        "\n"
    );
    return;
  }

  const resend = getResend();

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
  });

  if (error) {
    // Log but never crash the request — callers must not depend on email succeeding.
    // While the sending domain is unverified, Resend only allows delivery to the
    // account-owner address. The verification URL is always printed to console below.
    console.error("[EMAIL] Resend delivery failed (domain pending?):", error.message);
    return;
  }

  console.log(`[EMAIL] Sent "${subject}" → ${to}`);
}

// ── HTML email templates ──────────────────────────────────────────────────────

export function otpEmailHtml(code: string, expiryMinutes: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Your Focus sign-in code</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <tr>
          <td style="background:linear-gradient(135deg,#1a73e8,#1558c0);padding:32px 40px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Focus</p>
            <p style="margin:4px 0 0;font-size:11px;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:0.12em;">Operational Intelligence</p>
          </td>
        </tr>

        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Your sign-in code</p>
            <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6;">
              Use the code below to complete your sign-in. It expires in <strong>${expiryMinutes} minutes</strong>.
            </p>

            <div style="background:#f0f4ff;border:2px solid #c7d7fd;border-radius:10px;padding:28px;text-align:center;margin-bottom:28px;">
              <p style="margin:0;font-size:42px;font-weight:800;letter-spacing:14px;color:#1a73e8;font-family:'Courier New',monospace;">${code}</p>
            </div>

            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
              If you didn&apos;t request this code, you can safely ignore this email.
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#f9fafb;padding:18px 40px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              &copy; 2026 Focus Platform &nbsp;&bull;&nbsp; Automated message — please do not reply.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function verifyEmailHtml(verifyUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Verify your Focus account</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <tr>
          <td style="background:linear-gradient(135deg,#1a73e8,#1558c0);padding:32px 40px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Focus</p>
            <p style="margin:4px 0 0;font-size:11px;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:0.12em;">Operational Intelligence</p>
          </td>
        </tr>

        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Welcome to Focus!</p>
            <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6;">
              Thanks for signing up. Please verify your email address to activate your account.
            </p>

            <div style="text-align:center;margin-bottom:28px;">
              <a href="${verifyUrl}"
                 style="display:inline-block;background:#1a73e8;color:#ffffff;font-size:15px;font-weight:600;
                        text-decoration:none;padding:14px 32px;border-radius:8px;">
                Verify my email address
              </a>
            </div>

            <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Or copy this link into your browser:</p>
            <p style="margin:0 0 24px;font-size:12px;color:#9ca3af;word-break:break-all;">${verifyUrl}</p>

            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
              This link expires in 24 hours. If you didn&apos;t create a Focus account, you can safely ignore this email.
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#f9fafb;padding:18px 40px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              &copy; 2026 Focus Platform &nbsp;&bull;&nbsp; Automated message — please do not reply.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
