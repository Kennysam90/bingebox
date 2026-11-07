import { config } from './config.js';
import { HttpError } from './http.js';

export const emailConfigured = () => !!config.resendApiKey && !!config.emailFrom;

export async function sendPasswordResetEmail(to: string, link: string) {
  if (!emailConfigured()) {
    if (config.isProd) throw new HttpError(503, 'Password recovery is temporarily unavailable. Please try again later.', 'email_unavailable');
    return; // Development returns the link directly; never log recovery tokens.
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: config.emailFrom, to: [to], subject: 'Reset your BingeBox password',
        text: `Reset your BingeBox password using this link:\n\n${link}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`,
        html: `<div style="background:#09090b;color:#fff;font-family:Arial,sans-serif;padding:40px"><h1 style="letter-spacing:-1px">Binge<span style="color:#ff2d46">Box</span></h1><h2>A fresh start.</h2><p style="color:#c7c7ce;line-height:1.7">Use the button below to choose a new password. Your link expires in 1 hour.</p><a href="${link.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" style="display:inline-block;background:#ff2d46;color:#fff;text-decoration:none;border-radius:30px;padding:16px 28px;font-weight:bold">Reset password</a><p style="color:#9b9ba5;font-size:12px;margin-top:32px">If you did not request this email, no action is needed.</p></div>`,
      }),
    });
    if (!response.ok) throw new Error('Email delivery failed');
    await response.body?.cancel();
  } catch {
    throw new HttpError(503, 'Password recovery is temporarily unavailable. Please try again later.', 'email_unavailable');
  }
}
