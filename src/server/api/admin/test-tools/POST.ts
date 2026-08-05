/**
 * POST /api/admin/test-tools
 * Admin-only test tool runner. Executes named test actions.
 *
 * Body: { action: string; payload?: Record<string, unknown> }
 *
 * Actions:
 *   gateway_ping       — send a test email via the email gateway
 *   customer_reset_pin — trigger a customer password reset PIN for a given email
 *   admin_reset_pin    — trigger an admin temp-password reset for a given email
 *   ticket_reply       — send a test reply email for a given ticket ID
 *   away_email         — send a test "away / out of office" notification email
 *   custom_email       — send a fully custom email (to, subject, body)
 */
import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { randomUUID, randomBytes } from 'node:crypto';
import { db } from '../../../db/client.js';
import {
  ja_users,
  ja_admin_accounts,
  ja_password_reset_requests,
  ja_support_tickets,
} from '../../../db/schema.js';
import { requireAdminSession } from '../_admin-session.js';
import { logAdminAction } from '../_audit-log.js';
import { sendEmail } from '../../../email.js';
import { hashPassword } from '../auth/_store.js';
import { getSecret } from '#airo/secrets';

function generateSecurePin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateTempPassword(): string {
  return randomBytes(12).toString('base64url').slice(0, 16);
}

export default async function handler(req: Request, res: Response) {
  const identity = await requireAdminSession(req);
  const adminEmail = identity?.email ?? 'unknown';
  if (!identity) {
    return res.status(401).json({ success: false, error: 'Admin session required.', code: 'NOT_AUTHENTICATED' });
  }

  const { action, payload = {} } = req.body as {
    action: string;
    payload?: Record<string, unknown>;
  };

  if (!action) {
    return res.status(400).json({ success: false, error: 'action is required.' });
  }

  try {
    // ── 1. Gateway ping ──────────────────────────────────────────────────────
    if (action === 'gateway_ping') {
      const to = (payload.to as string) || (getSecret('ADMIN_NOTIFICATION_EMAIL') as string);
      if (!to) return res.status(400).json({ success: false, error: 'No recipient address available.' });

      const result = await sendEmail({
        to,
        subject: '[Sousa Murray Planeia] Email Gateway Test',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#1B4F8A;padding:24px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:22px;">Sousa Murray Planeia</h1>
              <p style="color:#cce0ff;margin:4px 0 0;">Admin Test Tools</p>
            </div>
            <div style="padding:32px;background:#f9fafb;border:1px solid #e5e7eb;">
              <h2 style="color:#1B4F8A;margin-top:0;">✅ Email Gateway Test</h2>
              <p>This is a test email sent from the Sousa Murray Planeia Admin Test Tools panel.</p>
              <p>If you received this, the email gateway is working correctly.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:8px;font-weight:bold;color:#374151;width:120px;">Sent at:</td><td style="padding:8px;color:#111827;">${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}</td></tr>
                <tr style="background:#fff;"><td style="padding:8px;font-weight:bold;color:#374151;">Sent to:</td><td style="padding:8px;color:#111827;">${to}</td></tr>
              </table>
            </div>
            <div style="padding:16px;text-align:center;color:#6b7280;font-size:12px;">
              JA Group Services &bull; Sousa Murray Planeia &bull; Admin Test Tools
            </div>
          </div>
        `,
        text: `Email gateway test sent at ${new Date().toISOString()}. If you received this, the gateway is working.`,
      });

      await logAdminAction(adminEmail, 'test_tools.gateway_ping', `Gateway ping sent to ${to}`, req);
      return res.json({ success: true, action, messageId: result.messageId, sentTo: to });
    }

    // ── 2. Customer reset PIN ────────────────────────────────────────────────
    if (action === 'customer_reset_pin') {
      const email = payload.email as string;
      if (!email) return res.status(400).json({ success: false, error: 'payload.email is required.' });

      const normalised = email.trim().toLowerCase();
      const users = await db
        .select({ id: ja_users.id, firstName: ja_users.firstName, lastName: ja_users.lastName, email: ja_users.email })
        .from(ja_users)
        .where(eq(ja_users.email, normalised))
        .limit(1);

      if (!users[0]) {
        return res.status(404).json({ success: false, error: `No customer account found for ${normalised}.` });
      }

      const user = users[0];

      // Cancel existing pending requests
      await db
        .update(ja_password_reset_requests)
        .set({ status: 'rejected' })
        .where(sql`${ja_password_reset_requests.email} = ${normalised} AND ${ja_password_reset_requests.status} = 'pending'`);

      const pin = generateSecurePin();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.insert(ja_password_reset_requests).values({
        uuid:           randomUUID(),
        userId:         user.id,
        email:          normalised,
        status:         'approved',
        pin,
        deliveryMethod: 'pin',
        expiresAt,
        used:           false,
      });

      const appUrl = process.env.APP_URL ?? 'https://sousamurrayplaneia.jagroupservices.co.uk';
      const result = await sendEmail({
        to:      normalised,
        subject: '[TEST] Your Sousa Murray Planeia Password Reset PIN',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#dc2626;padding:8px;text-align:center;">
              <p style="color:#fff;margin:0;font-size:13px;font-weight:bold;">⚠️ TEST EMAIL — Sent from Admin Test Tools</p>
            </div>
            <div style="background:#1B4F8A;padding:24px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:22px;">Sousa Murray Planeia</h1>
              <p style="color:#cce0ff;margin:4px 0 0;">JA Group Services</p>
            </div>
            <div style="padding:32px;background:#f9fafb;border:1px solid #e5e7eb;">
              <h2 style="color:#1B4F8A;margin-top:0;">Password Reset PIN</h2>
              <p>Hi ${user.firstName},</p>
              <p>Your password reset PIN is:</p>
              <div style="text-align:center;margin:32px 0;">
                <div style="background:#1B4F8A;color:#fff;padding:20px 40px;border-radius:8px;display:inline-block;font-size:36px;font-weight:bold;letter-spacing:8px;font-family:monospace;">${pin}</div>
              </div>
              <p style="text-align:center;color:#6b7280;">Enter this PIN at <a href="${appUrl}/reset-password" style="color:#1B4F8A;">/reset-password</a> along with your email address.</p>
              <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:16px;margin-top:16px;">
                <strong>Important:</strong> This PIN expires in 24 hours and can only be used once.
              </div>
            </div>
            <div style="padding:16px;text-align:center;color:#6b7280;font-size:12px;">
              JA Group Services &bull; Sousa Murray Planeia &bull; PIN expires ${expiresAt.toLocaleString('en-GB', { timeZone: 'Europe/London' })}
            </div>
          </div>
        `,
        text: `[TEST] Password reset PIN for ${user.firstName}: ${pin}\n\nVisit ${appUrl}/reset-password and enter your email and this PIN.\n\nExpires: ${expiresAt.toISOString()}`,
      });

      await logAdminAction(adminEmail, 'test_tools.customer_reset_pin', `Test reset PIN sent to ${normalised}`, req);
      return res.json({ success: true, action, messageId: result.messageId, sentTo: normalised, pin });
    }

    // ── 3. Admin reset temp password ─────────────────────────────────────────
    if (action === 'admin_reset_pin') {
      const email = payload.email as string;
      if (!email) return res.status(400).json({ success: false, error: 'payload.email is required.' });

      const normalised = email.trim().toLowerCase();
      const admins = await db
        .select({ id: ja_admin_accounts.id, name: ja_admin_accounts.name, email: ja_admin_accounts.email, suspended: ja_admin_accounts.suspended })
        .from(ja_admin_accounts)
        .where(eq(ja_admin_accounts.email, normalised))
        .limit(1);

      if (!admins[0]) {
        return res.status(404).json({ success: false, error: `No admin account found for ${normalised}.` });
      }
      if (admins[0].suspended) {
        return res.status(400).json({ success: false, error: 'Admin account is suspended.' });
      }

      const admin = admins[0];
      const tempPassword = generateTempPassword();
      const tempHash = hashPassword(tempPassword);

      await db
        .update(ja_admin_accounts)
        .set({ passwordHash: tempHash, mustResetPassword: true })
        .where(eq(ja_admin_accounts.id, admin.id));

      const result = await sendEmail({
        to:      admin.email,
        subject: '[TEST] Your Sousa Murray Planeia Admin Temporary Password',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#dc2626;padding:8px;text-align:center;">
              <p style="color:#fff;margin:0;font-size:13px;font-weight:bold;">⚠️ TEST EMAIL — Sent from Admin Test Tools</p>
            </div>
            <div style="background:#1B4F8A;padding:24px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:22px;">Sousa Murray Planeia</h1>
              <p style="color:#cce0ff;margin:4px 0 0;">Administration Portal</p>
            </div>
            <div style="padding:32px;background:#f9fafb;border:1px solid #e5e7eb;">
              <h2 style="color:#1B4F8A;margin-top:0;">Admin Temporary Password</h2>
              <p>Hi ${admin.name},</p>
              <p>Your temporary admin password is:</p>
              <div style="text-align:center;margin:28px 0;">
                <div style="background:#1B4F8A;color:#fff;padding:18px 36px;border-radius:8px;display:inline-block;font-size:26px;font-weight:bold;letter-spacing:4px;font-family:monospace;">${tempPassword}</div>
              </div>
              <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:16px;margin-top:16px;">
                <strong>Security notice:</strong> This is a test-generated temporary password. You must set a new password after logging in.
              </div>
            </div>
            <div style="padding:16px;text-align:center;color:#6b7280;font-size:12px;">
              JA Group Services &bull; Sousa Murray Planeia &bull; Admin Test Tools
            </div>
          </div>
        `,
        text: `[TEST] Temporary admin password for ${admin.name}: ${tempPassword}\n\nLog in at /admin and set a new password immediately.`,
      });

      await logAdminAction(adminEmail, 'test_tools.admin_reset_pin', `Test admin temp password sent to ${normalised}`, req);
      return res.json({ success: true, action, messageId: result.messageId, sentTo: admin.email });
    }

    // ── 4. Ticket reply test ─────────────────────────────────────────────────
    if (action === 'ticket_reply') {
      const ticketId = payload.ticketId as number | string;
      const message  = (payload.message as string) || 'This is a test reply from the Sousa Murray Planeia support team.';
      if (!ticketId) return res.status(400).json({ success: false, error: 'payload.ticketId is required.' });

      const tickets = await db
        .select({ id: ja_support_tickets.id, name: ja_support_tickets.name, email: ja_support_tickets.email, subject: ja_support_tickets.subject, uuid: ja_support_tickets.uuid })
        .from(ja_support_tickets)
        .where(eq(ja_support_tickets.id, Number(ticketId)))
        .limit(1);

      if (!tickets[0]) return res.status(404).json({ success: false, error: `Ticket #${ticketId} not found.` });

      const ticket = tickets[0];
      const appUrl = process.env.APP_URL ?? 'https://sousamurrayplaneia.jagroupservices.co.uk';

      const result = await sendEmail({
        to:      ticket.email,
        subject: `[TEST] Re: ${ticket.subject} [Ticket #${ticket.id}]`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#dc2626;padding:8px;text-align:center;">
              <p style="color:#fff;margin:0;font-size:13px;font-weight:bold;">⚠️ TEST EMAIL — Sent from Admin Test Tools</p>
            </div>
            <div style="background:#1B4F8A;padding:24px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:22px;">Sousa Murray Planeia</h1>
              <p style="color:#cce0ff;margin:4px 0 0;">Support Centre</p>
            </div>
            <div style="padding:32px;background:#f9fafb;border:1px solid #e5e7eb;">
              <h2 style="color:#1B4F8A;margin-top:0;">Reply to Your Support Ticket</h2>
              <p>Hi ${ticket.name},</p>
              <p>Our support team has replied to your ticket: <strong>${ticket.subject}</strong></p>
              <div style="background:#fff;border-left:4px solid #1B4F8A;padding:16px 20px;margin:20px 0;border-radius:0 4px 4px 0;">
                <p style="margin:0;color:#374151;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
              </div>
              <div style="text-align:center;margin:24px 0;">
                <a href="${appUrl}/support/tickets/${ticket.uuid}"
                   style="background:#1B4F8A;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;display:inline-block;">
                  View Your Ticket
                </a>
              </div>
            </div>
            <div style="padding:16px;text-align:center;color:#6b7280;font-size:12px;">
              JA Group Services &bull; Sousa Murray Planeia Support
            </div>
          </div>
        `,
        text: `[TEST] Hi ${ticket.name},\n\nReply to ticket: ${ticket.subject}\n\n${message}\n\nView at: ${appUrl}/support/tickets/${ticket.uuid}`,
      });

      await logAdminAction(adminEmail, 'test_tools.ticket_reply', `Test ticket reply sent to ${ticket.email} for ticket #${ticket.id}`, req);
      return res.json({ success: true, action, messageId: result.messageId, sentTo: ticket.email });
    }

    // ── 5. Away / out-of-office email ────────────────────────────────────────
    if (action === 'away_email') {
      const to      = payload.to as string;
      const message = (payload.message as string) || 'Our support team is currently away. We will respond to your enquiry as soon as possible.';
      const returnDate = payload.returnDate as string | undefined;
      if (!to) return res.status(400).json({ success: false, error: 'payload.to is required.' });

      const result = await sendEmail({
        to,
        subject: '[TEST] Sousa Murray Planeia — Out of Office',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#dc2626;padding:8px;text-align:center;">
              <p style="color:#fff;margin:0;font-size:13px;font-weight:bold;">⚠️ TEST EMAIL — Sent from Admin Test Tools</p>
            </div>
            <div style="background:#1B4F8A;padding:24px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:22px;">Sousa Murray Planeia</h1>
              <p style="color:#cce0ff;margin:4px 0 0;">Support Centre</p>
            </div>
            <div style="padding:32px;background:#f9fafb;border:1px solid #e5e7eb;">
              <h2 style="color:#1B4F8A;margin-top:0;">Out of Office</h2>
              <p>${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
              ${returnDate ? `<p><strong>Expected return:</strong> ${returnDate}</p>` : ''}
              <p style="color:#6b7280;font-size:13px;">Your enquiry has been received and will be addressed upon our return. Thank you for your patience.</p>
            </div>
            <div style="padding:16px;text-align:center;color:#6b7280;font-size:12px;">
              JA Group Services &bull; Sousa Murray Planeia Support
            </div>
          </div>
        `,
        text: `[TEST] Out of Office\n\n${message}${returnDate ? `\n\nExpected return: ${returnDate}` : ''}\n\nYour enquiry has been received and will be addressed upon our return.`,
      });

      await logAdminAction(adminEmail, 'test_tools.away_email', `Test away email sent to ${to}`, req);
      return res.json({ success: true, action, messageId: result.messageId, sentTo: to });
    }

    // ── 6. Custom email ──────────────────────────────────────────────────────
    if (action === 'custom_email') {
      const to      = payload.to as string;
      const subject = payload.subject as string;
      const body    = payload.body as string;
      if (!to)      return res.status(400).json({ success: false, error: 'payload.to is required.' });
      if (!subject) return res.status(400).json({ success: false, error: 'payload.subject is required.' });
      if (!body)    return res.status(400).json({ success: false, error: 'payload.body is required.' });

      const result = await sendEmail({
        to,
        subject: `[TEST] ${subject}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#dc2626;padding:8px;text-align:center;">
              <p style="color:#fff;margin:0;font-size:13px;font-weight:bold;">⚠️ TEST EMAIL — Sent from Admin Test Tools</p>
            </div>
            <div style="background:#1B4F8A;padding:24px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:22px;">Sousa Murray Planeia</h1>
            </div>
            <div style="padding:32px;background:#f9fafb;border:1px solid #e5e7eb;">
              <p style="white-space:pre-wrap;color:#374151;">${body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            </div>
            <div style="padding:16px;text-align:center;color:#6b7280;font-size:12px;">
              JA Group Services &bull; Sousa Murray Planeia
            </div>
          </div>
        `,
        text: `[TEST] ${body}`,
      });

      await logAdminAction(adminEmail, 'test_tools.custom_email', `Test custom email sent to ${to} — subject: ${subject}`, req);
      return res.json({ success: true, action, messageId: result.messageId, sentTo: to });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('admin.test-tools.error', { action, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Service unavailable.',
    });
  }
}
