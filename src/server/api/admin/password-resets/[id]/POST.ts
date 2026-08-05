/**
 * POST /api/admin/password-resets/:id/action
 * Admin approves/rejects a password reset request and optionally sends reset credentials.
 *
 * Body: { action: 'approve_link' | 'approve_pin' | 'reject', adminEmail: string, notes?: string }
 */
import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from '../../../../db/client.js';
import { ja_password_reset_requests } from '../../../../db/schema.js';
import { sendEmail } from '../../../../email.js';
import { getSecret } from '#airo/secrets';
import { requireAdminSession } from '../../_admin-session.js';
import { logAdminAction } from '../../_audit-log.js';

function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}

function generateSecurePin(): string {
  // 6-digit numeric PIN
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default async function handler(req: Request, res: Response) {
  const identity = await requireAdminSession(req);
  const adminEmail = identity?.email ?? 'unknown';
  if (!identity) return res.status(401).json({ success: false, error: 'Admin session required. Please sign in to the Admin Portal.', code: 'NOT_AUTHENTICATED' });

  try {
    const adminNotifyEmail = getSecret('ADMIN_NOTIFICATION_EMAIL') as string;
    const { id } = req.params;
    const { action, adminEmail, notes } = req.body as {
      action: 'approve_link' | 'approve_pin' | 'reject';
      adminEmail: string;
      notes?: string;
    };

    if (!action || !adminEmail) {
      return res.status(400).json({ success: false, error: 'action and adminEmail are required.' });
    }

    // Fetch the request
    const rows = await db
      .select()
      .from(ja_password_reset_requests)
      .where(sql`${ja_password_reset_requests.uuid} = ${id}`)
      .limit(1);

    const resetReq = rows[0];
    if (!resetReq) {
      return res.status(404).json({ success: false, error: 'Reset request not found.' });
    }

    if (resetReq.status !== 'pending') {
      return res.status(400).json({ success: false, error: `This request has already been ${resetReq.status}.` });
    }

    if (action === 'reject') {
      await db
        .update(ja_password_reset_requests)
        .set({
          status: 'rejected',
          adminNotes: notes ?? null,
          processedBy: adminEmail,
          processedAt: new Date(),
        })
        .where(eq(ja_password_reset_requests.id, resetReq.id));

      await logAdminAction(adminEmail, 'password_reset.reject', `Rejected reset request for ${resetReq.email}`, req);

      // Notify customer of rejection
      try {
        await sendEmail({
          to: resetReq.email,
          replyTo: adminNotifyEmail,
          subject: 'Password Reset Request — Update',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#1B4F8A;padding:24px;text-align:center;">
                <h1 style="color:#fff;margin:0;font-size:22px;">Sousa Murray Planeia</h1>
                <p style="color:#cce0ff;margin:4px 0 0;">JA Group Services</p>
              </div>
              <div style="padding:32px;background:#f9fafb;border:1px solid #e5e7eb;">
                <h2 style="color:#1B4F8A;margin-top:0;">Password Reset Request</h2>
                <p>Your password reset request could not be processed at this time.</p>
                ${notes ? `<p style="color:#6b7280;font-style:italic;">${notes}</p>` : ''}
                <p>If you believe this is an error, please contact us at <a href="mailto:${adminNotifyEmail}">${adminNotifyEmail}</a>.</p>
              </div>
              <div style="padding:16px;text-align:center;color:#6b7280;font-size:12px;">
                JA Group Services &bull; Sousa Murray Planeia
              </div>
            </div>
          `,
          text: `Your password reset request could not be processed. Please contact ${adminNotifyEmail} if you need assistance.`,
        });
      } catch (emailErr) {
        console.error('admin.password-resets.reject.email.failed', emailErr);
      }

      return res.json({ success: true, message: 'Request rejected and customer notified.' });
    }

    // Approve with link or PIN
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    let token: string | null = null;
    let pin: string | null = null;
    let deliveryMethod: 'link' | 'pin';

    if (action === 'approve_link') {
      token = generateSecureToken();
      deliveryMethod = 'link';
    } else {
      pin = generateSecurePin();
      deliveryMethod = 'pin';
    }

    await db
      .update(ja_password_reset_requests)
      .set({
        status: 'approved',
        token: token ?? undefined,
        pin: pin ?? undefined,
        deliveryMethod,
        expiresAt,
        adminNotes: notes ?? null,
        processedBy: adminEmail,
        processedAt: new Date(),
      })
      .where(eq(ja_password_reset_requests.id, resetReq.id));

    // Send reset email to customer
    const resetUrl = `${process.env.APP_URL ?? 'https://planyx.co.uk'}/reset-password?token=${token}`;

    try {
      if (deliveryMethod === 'link') {
        await sendEmail({
          to: resetReq.email,
          replyTo: adminNotifyEmail,
          subject: 'Reset Your Sousa Murray Planeia Password',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#1B4F8A;padding:24px;text-align:center;">
                <h1 style="color:#fff;margin:0;font-size:22px;">Sousa Murray Planeia</h1>
                <p style="color:#cce0ff;margin:4px 0 0;">JA Group Services</p>
              </div>
              <div style="padding:32px;background:#f9fafb;border:1px solid #e5e7eb;">
                <h2 style="color:#1B4F8A;margin-top:0;">Reset Your Password</h2>
                <p>Your password reset request has been approved. Click the button below to set a new password.</p>
                <div style="text-align:center;margin:32px 0;">
                  <a href="${resetUrl}" style="background:#1B4F8A;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;display:inline-block;">Reset My Password</a>
                </div>
                <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:16px;margin-top:16px;">
                  <strong>Important:</strong> This link is single-use and expires in <strong>24 hours</strong>. If you did not request a password reset, please ignore this email.
                </div>
                <p style="margin-top:16px;color:#6b7280;font-size:13px;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${resetUrl}" style="color:#1B4F8A;word-break:break-all;">${resetUrl}</a></p>
              </div>
              <div style="padding:16px;text-align:center;color:#6b7280;font-size:12px;">
                JA Group Services &bull; Sousa Murray Planeia &bull; This link expires ${expiresAt.toLocaleString('en-GB', { timeZone: 'Europe/London' })}
              </div>
            </div>
          `,
          text: `Your password reset has been approved. Visit this link to reset your password: ${resetUrl}\n\nThis link expires in 24 hours and can only be used once.`,
        });
      } else {
        await sendEmail({
          to: resetReq.email,
          replyTo: adminNotifyEmail,
          subject: 'Your Password Reset PIN — Sousa Murray Planeia',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#1B4F8A;padding:24px;text-align:center;">
                <h1 style="color:#fff;margin:0;font-size:22px;">Sousa Murray Planeia</h1>
                <p style="color:#cce0ff;margin:4px 0 0;">JA Group Services</p>
              </div>
              <div style="padding:32px;background:#f9fafb;border:1px solid #e5e7eb;">
                <h2 style="color:#1B4F8A;margin-top:0;">Your Password Reset PIN</h2>
                <p>Your password reset request has been approved. Use the PIN below to reset your password.</p>
                <div style="text-align:center;margin:32px 0;">
                  <div style="background:#1B4F8A;color:#fff;padding:20px 40px;border-radius:8px;display:inline-block;font-size:36px;font-weight:bold;letter-spacing:8px;font-family:monospace;">${pin}</div>
                </div>
                <p style="text-align:center;color:#6b7280;">Enter this PIN at <a href="${process.env.APP_URL ?? 'https://planyx.co.uk'}/reset-password" style="color:#1B4F8A;">/reset-password</a> along with your email address.</p>
                <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:16px;margin-top:16px;">
                  <strong>Important:</strong> This PIN is single-use and expires in <strong>24 hours</strong>. Do not share it with anyone.
                </div>
              </div>
              <div style="padding:16px;text-align:center;color:#6b7280;font-size:12px;">
                JA Group Services &bull; Sousa Murray Planeia &bull; PIN expires ${expiresAt.toLocaleString('en-GB', { timeZone: 'Europe/London' })}
              </div>
            </div>
          `,
          text: `Your password reset PIN is: ${pin}\n\nVisit /reset-password and enter your email and this PIN to set a new password.\n\nThis PIN expires in 24 hours and can only be used once.`,
        });
      }
    } catch (emailErr) {
      console.error('admin.password-resets.approve.email.failed', emailErr);
      return res.status(500).json({ success: false, error: 'Request approved but failed to send email. Please try again.' });
    }

    await logAdminAction(adminEmail, 'password_reset.approve', `Approved reset for ${resetReq.email} via ${deliveryMethod}`, req);
    return res.json({ success: true, message: `Request approved and reset ${deliveryMethod === 'link' ? 'link' : 'PIN'} sent to ${resetReq.email}.` });
  } catch (err) {
    console.error('admin.password-resets.action.error', err);
    return res.status(500).json({ success: false, error: 'Service unavailable.' });
  }
}
