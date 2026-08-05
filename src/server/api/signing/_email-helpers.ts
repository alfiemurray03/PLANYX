/**
 * Email helpers for Document Signing.
 * All signing emails go through the Airo email gateway (src/server/email.ts).
 */
import { sendEmail } from '../../email.js';
import { db } from '../../db/client.js';
import { ja_signing_audit, ja_site_settings } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const APP_URL = process.env.APP_URL || 'https://sousamurrayplaneia.jagroupservices.co.uk';

async function getSiteName(): Promise<string> {
  try {
    const rows = await db.select({ value: ja_site_settings.value })
      .from(ja_site_settings)
      .where(eq(ja_site_settings.settingKey, 'site_name'))
      .limit(1);
    return rows[0]?.value ?? 'Sousa Murray Planeia';
  } catch {
    return 'Sousa Murray Planeia';
  }
}

function brandedHtml(title: string, body: string, appName = 'Sousa Murray Planeia'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f6f9;margin:0;padding:0}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .hdr{background:#1B4F8A;padding:28px 32px;color:#fff}
  .hdr h1{margin:0;font-size:20px;font-weight:700}
  .hdr p{margin:4px 0 0;font-size:13px;opacity:.8}
  .body{padding:32px}
  .body p{color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px}
  .btn{display:inline-block;background:#1B4F8A;color:#fff!important;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;margin:8px 0 16px}
  .info-box{background:#f0f4ff;border-left:4px solid #1B4F8A;padding:14px 18px;border-radius:0 8px 8px 0;margin:16px 0}
  .info-box p{margin:0;font-size:14px;color:#1e3a5f}
  .footer{background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center}
  .status{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;background:#dcfce7;color:#166534}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr"><h1>${appName}</h1><p>Document Signing</p></div>
  <div class="body">${body}</div>
  <div class="footer">This email was sent by ${appName}. If you did not expect this email, you can safely ignore it.</div>
</div>
</body></html>`;
}

/** Send signing request email to a signer */
export async function sendSigningRequestEmail(opts: {
  signerEmail: string;
  signerName: string;
  ownerName: string;
  documentTitle: string;
  message?: string;
  signingUrl: string;
  expiresAt?: Date;
  requestId: number;
  signerId: number;
}): Promise<{ ok: boolean; error?: string }> {
  const appName = await getSiteName();
  const expiry = opts.expiresAt
    ? `<p style="color:#6b7280;font-size:13px">This signing link expires on <strong>${opts.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</p>`
    : '';
  const msg = opts.message
    ? `<div class="info-box"><p><strong>Message from ${opts.ownerName}:</strong><br>${opts.message}</p></div>`
    : '';
  const html = brandedHtml(
    `Please sign: ${opts.documentTitle}`,
    `<p>Hello ${opts.signerName},</p>
     <p><strong>${opts.ownerName}</strong> has requested your signature on the following document:</p>
     <div class="info-box"><p><strong>${opts.documentTitle}</strong></p></div>
     ${msg}
     <p>Click the button below to review and sign the document securely online:</p>
     <a href="${opts.signingUrl}" class="btn">Review &amp; Sign Document</a>
     ${expiry}
     <p style="color:#6b7280;font-size:13px">Or copy this link: ${opts.signingUrl}</p>`,
    appName,
  );
  try {
    await sendEmail({
      to: opts.signerEmail,
      subject: `Please sign: ${opts.documentTitle}`,
      html,
      text: `Hello ${opts.signerName},\n\n${opts.ownerName} has requested your signature on: ${opts.documentTitle}\n\nSign here: ${opts.signingUrl}`,
    });
    await logSigningAudit(opts.requestId, opts.signerId, null, null, 'email_sent', `Signing request email sent to ${opts.signerEmail}`, null, null, opts.signerEmail, 'email_token');
    return { ok: true };
  } catch (err) {
    await logSigningAudit(opts.requestId, opts.signerId, null, null, 'email_failed', `Failed to send signing request email to ${opts.signerEmail}: ${String(err)}`, null, null, opts.signerEmail, null);
    return { ok: false, error: String(err) };
  }
}

/** Send reminder email to a signer */
export async function sendReminderEmail(opts: {
  signerEmail: string;
  signerName: string;
  ownerName: string;
  documentTitle: string;
  signingUrl: string;
  expiresAt?: Date;
  requestId: number;
  signerId: number;
}): Promise<{ ok: boolean; error?: string }> {
  const appName = await getSiteName();
  const expiry = opts.expiresAt
    ? `<p style="color:#dc2626;font-size:13px">⚠️ This signing link expires on <strong>${opts.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</p>`
    : '';
  const html = brandedHtml(
    `Reminder: Please sign ${opts.documentTitle}`,
    `<p>Hello ${opts.signerName},</p>
     <p>This is a friendly reminder that your signature is still required on:</p>
     <div class="info-box"><p><strong>${opts.documentTitle}</strong><br>Requested by ${opts.ownerName}</p></div>
     <a href="${opts.signingUrl}" class="btn">Sign Document Now</a>
     ${expiry}`,
    appName,
  );
  try {
    await sendEmail({
      to: opts.signerEmail,
      subject: `Reminder: Please sign ${opts.documentTitle}`,
      html,
      text: `Reminder: Your signature is required on ${opts.documentTitle}.\n\nSign here: ${opts.signingUrl}`,
    });
    await logSigningAudit(opts.requestId, opts.signerId, null, null, 'reminder_sent', `Reminder email sent to ${opts.signerEmail}`, null, null, opts.signerEmail, null);
    return { ok: true };
  } catch (err) {
    await logSigningAudit(opts.requestId, opts.signerId, null, null, 'email_failed', `Failed to send reminder to ${opts.signerEmail}: ${String(err)}`, null, null, opts.signerEmail, null);
    return { ok: false, error: String(err) };
  }
}

/** Send completion notification to document owner */
export async function sendCompletionEmail(opts: {
  ownerEmail: string;
  ownerName: string;
  documentTitle: string;
  requestId: number;
  requestUuid: string;
}): Promise<{ ok: boolean; error?: string }> {
  const appName = await getSiteName();
  const dashUrl = `${APP_URL}/signing/${opts.requestUuid}`;
  const html = brandedHtml(
    `Document signed: ${opts.documentTitle}`,
    `<p>Hello ${opts.ownerName},</p>
     <p>Great news! Your document has been fully signed by all parties:</p>
     <div class="info-box"><p><strong>${opts.documentTitle}</strong><br><span class="status">Completed</span></p></div>
     <p>You can now download the signed document and audit certificate from your dashboard.</p>
     <a href="${dashUrl}" class="btn">View Signed Document</a>`,
    appName,
  );
  try {
    await sendEmail({
      to: opts.ownerEmail,
      subject: `Document signed: ${opts.documentTitle}`,
      html,
      text: `Your document "${opts.documentTitle}" has been fully signed. View it here: ${dashUrl}`,
    });
    await logSigningAudit(opts.requestId, null, null, null, 'completion_email_sent', `Completion email sent to ${opts.ownerEmail}`, null, null, null, null);
    return { ok: true };
  } catch (err) {
    await logSigningAudit(opts.requestId, null, null, null, 'email_failed', `Failed to send completion email to ${opts.ownerEmail}: ${String(err)}`, null, null, null, null);
    return { ok: false, error: String(err) };
  }
}

/** Send declined/expired notification to document owner */
export async function sendDeclinedEmail(opts: {
  ownerEmail: string;
  ownerName: string;
  documentTitle: string;
  signerName: string;
  signerEmail: string;
  reason?: string;
  requestId: number;
  requestUuid: string;
  eventType: 'declined' | 'expired';
}): Promise<{ ok: boolean; error?: string }> {
  const appName = await getSiteName();
  const dashUrl = `${APP_URL}/signing/${opts.requestUuid}`;
  const isDeclined = opts.eventType === 'declined';
  const subject = isDeclined
    ? `Document declined: ${opts.documentTitle}`
    : `Document expired: ${opts.documentTitle}`;
  const body = isDeclined
    ? `<p><strong>${opts.signerName}</strong> (${opts.signerEmail}) has declined to sign your document.</p>
       ${opts.reason ? `<div class="info-box"><p><strong>Reason:</strong> ${opts.reason}</p></div>` : ''}`
    : `<p>Your signing request for <strong>${opts.documentTitle}</strong> has expired without all signatures being collected.</p>`;
  const html = brandedHtml(subject, `<p>Hello ${opts.ownerName},</p>${body}<a href="${dashUrl}" class="btn">View Request</a>`, appName);
  try {
    await sendEmail({ to: opts.ownerEmail, subject, html, text: `${subject}\n\nView: ${dashUrl}` });
    return { ok: true };
  } catch (err) {
    await logSigningAudit(opts.requestId, null, null, null, 'email_failed', `Failed to send ${opts.eventType} email: ${String(err)}`, null, null, null, null);
    return { ok: false, error: String(err) };
  }
}

/** Log a signing audit event */
export async function logSigningAudit(
  requestId: number,
  signerId: number | null,
  userId: number | null,
  adminId: number | null,
  event: string,
  detail: string | null,
  ipAddress: string | null,
  userAgent: string | null,
  signerEmail: string | null,
  authMethod: string | null,
): Promise<void> {
  try {
    await db.insert(ja_signing_audit).values({
      requestId,
      signerId,
      userId,
      adminId,
      event,
      detail,
      ipAddress,
      userAgent,
      signerEmail,
      authMethod,
    });
  } catch (err) {
    console.error('signing.audit.log.error', err);
  }
}

/** Build a signing URL for a signer token */
export function buildSigningUrl(token: string): string {
  return `${APP_URL}/sign/${token}`;
}
