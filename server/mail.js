// Outgoing email (password reset and recovery-email checks), sent from a Google Workspace mailbox over SMTP.
// Without SMTP_USER / SMTP_PASS (local dev, tests) nothing is sent: the mail is printed and kept in `outbox`,
// so a developer can click the link and tests can read it.
import { config } from './config.js';

export const outbox = [];
let transport = null;

export const mailReady = () => !!(config.smtpUser && config.smtpPass);

async function getTransport() {
  if (transport) return transport;
  const { default: nodemailer } = await import('nodemailer');
  transport = nodemailer.createTransport({
    host: config.smtpHost, port: config.smtpPort, secure: config.smtpPort === 465,
    auth: { user: config.smtpUser, pass: config.smtpPass }
  });
  return transport;
}

export async function sendMail({ to, subject, text, html }) {
  if (!mailReady()) {
    outbox.push({ to, subject, text, html, at: Date.now() });
    if (outbox.length > 50) outbox.shift();
    if (!process.env.NODE_TEST_CONTEXT) console.log(`[mail not configured] to ${to}: ${subject}\n${text}`);
    return { ok: true, queued: false };
  }
  const t = await getTransport();
  await t.sendMail({ from: `Kaun Banega Coder <${config.mailFrom}>`, to, subject, text, html });
  return { ok: true, queued: true };
}

// A plain, branded email with one button. `lines` are paragraphs of plain text.
export function linkMail({ heading, lines, button, url, footer }) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const text = [heading, '', ...lines, '', `${button}: ${url}`, '', footer || ''].join('\n').trim();
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0F172A">
<p style="font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:#64748B;margin:0 0 8px">Kaun Banega Coder</p>
<h1 style="font-size:22px;margin:0 0 16px">${esc(heading)}</h1>
${lines.map((l) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${esc(l)}</p>`).join('')}
<p style="margin:22px 0"><a href="${esc(url)}" style="display:inline-block;background:#F59E0B;color:#1A1205;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">${esc(button)}</a></p>
<p style="font-size:12px;color:#64748B;line-height:1.5;margin:0">If the button doesn't work, copy this link into your browser:<br>${esc(url)}</p>
${footer ? `<p style="font-size:12px;color:#64748B;line-height:1.5;margin:16px 0 0">${esc(footer)}</p>` : ''}</div>`;
  return { text, html };
}
