/**
 * POST /api/admin/support/tickets/:id/messages
 * Admin sends a reply message on a support ticket.
 * - isInternal=true: saves as internal note, NOT emailed to customer.
 * - isInternal=false (default): saves message AND emails the customer.
 * Automatically moves ticket to 'in_progress' if it was 'open'.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql, eq } from 'drizzle-orm';
import { ja_support_tickets, ja_admin_accounts } from '../../../../../db/schema.js';
import { requireAdminSession } from '../../../_admin-session.js';
import { logAdminAction } from '../../../_audit-log.js';
import { sendEmail } from '../../../../../email.js';

export default async function handler(req: Request, res: Response) {
  const identity = await requireAdminSession(req);
  const adminEmail = identity?.email ?? 'unknown';
  if (!identity) return res.status(401).json({ success: false, error: 'Admin session required. Please sign in to the Admin Portal.', code: 'NOT_AUTHENTICATED' });

  const ticketId = parseInt(String(req.params.id), 10);
  const { message, isInternal = false } = req.body as { message?: string; isInternal?: boolean };

  if (!ticketId) return res.status(400).json({ success: false, error: 'Invalid ticket ID.' });
  if (!message?.trim()) return res.status(400).json({ success: false, error: 'Message is required.' });

  try {
    // Resolve admin name from identity (Microsoft session carries name directly)
    const adminRows = await db
      .select({ name: ja_admin_accounts.name, email: ja_admin_accounts.email })
      .from(ja_admin_accounts)
      .where(eq(ja_admin_accounts.email, adminEmail))
      .limit(1);
    const adminName       = adminRows[0]?.name  ?? identity?.name ?? 'Admin';
    const resolvedEmail   = adminRows[0]?.email ?? adminEmail;

    // Verify ticket exists and get customer details
    const ticketRows = await db
      .select({
        id:      ja_support_tickets.id,
        status:  ja_support_tickets.status,
        name:    ja_support_tickets.name,
        email:   ja_support_tickets.email,
        subject: ja_support_tickets.subject,
        uuid:    ja_support_tickets.uuid,
      })
      .from(ja_support_tickets)
      .where(eq(ja_support_tickets.id, ticketId))
      .limit(1);
    if (!ticketRows.length) return res.status(404).json({ success: false, error: 'Ticket not found.' });

    const ticket = ticketRows[0];

    // Insert message — is_internal column added via migration
    await db.execute(sql`
      INSERT INTO ja_ticket_messages
        (ticket_id, sender_type, sender_id, sender_name, sender_email, message, read_by_admin, read_by_customer, is_internal)
      VALUES
        (${ticketId}, 'admin', 0, ${adminName}, ${resolvedEmail}, ${message.trim()}, 1, 0, ${isInternal ? 1 : 0})
    `);

    // Auto-advance ticket status from open → in_progress (only for non-internal messages)
    if (!isInternal && ticket.status === 'open') {
      await db.update(ja_support_tickets)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(ja_support_tickets.id, ticketId));
    }

    // Send email to customer (only for non-internal messages)
    if (!isInternal) {
      try {
        const appUrl = process.env.APP_URL ?? 'https://sousamurrayplaneia.jagroupservices.co.uk';
        await sendEmail({
          to:      ticket.email,
          replyTo: adminEmail,
          subject: `Re: ${ticket.subject} [Ticket #${ticketId}]`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#1B4F8A;padding:24px;text-align:center;">
                <h1 style="color:#fff;margin:0;font-size:22px;">Sousa Murray Planeia</h1>
                <p style="color:#cce0ff;margin:4px 0 0;">Support Centre</p>
              </div>
              <div style="padding:32px;background:#f9fafb;border:1px solid #e5e7eb;">
                <h2 style="color:#1B4F8A;margin-top:0;">Reply to Your Support Ticket</h2>
                <p>Hi ${ticket.name},</p>
                <p>Our support team has replied to your ticket: <strong>${ticket.subject}</strong></p>
                <div style="background:#fff;border-left:4px solid #1B4F8A;padding:16px 20px;margin:20px 0;border-radius:0 4px 4px 0;">
                  <p style="margin:0;color:#374151;white-space:pre-wrap;">${message.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                </div>
                <p style="color:#6b7280;font-size:13px;">— ${adminName}, Sousa Murray Planeia Support</p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${appUrl}/support/tickets/${ticket.uuid}"
                     style="background:#1B4F8A;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;display:inline-block;">
                    View Your Ticket
                  </a>
                </div>
                <p style="color:#6b7280;font-size:12px;margin-top:16px;">
                  You can reply to this email or visit your ticket to continue the conversation.
                  Reference: Ticket #${ticketId}
                </p>
              </div>
              <div style="padding:16px;text-align:center;color:#6b7280;font-size:12px;">
                JA Group Services &bull; Sousa Murray Planeia Support
              </div>
            </div>
          `,
          text: `Hi ${ticket.name},\n\nOur support team has replied to your ticket: ${ticket.subject}\n\n---\n${message.trim()}\n---\n\n— ${adminName}, Sousa Murray Planeia Support\n\nView your ticket at: ${appUrl}/support/tickets/${ticket.uuid}\nReference: Ticket #${ticketId}`,
        });
        console.log(`admin.ticket.reply.email-sent ticketId=${ticketId} to=${ticket.email}`);
      } catch (emailErr) {
        console.error('admin.ticket.reply.email.FAILED', {
          ticketId,
          to:    ticket.email,
          error: emailErr instanceof Error ? emailErr.message : String(emailErr),
        });
        // Don't fail the request — message is saved, email failure is logged
      }
    }

    await logAdminAction(
      adminEmail,
      isInternal ? 'support.internal_note' : 'support.message_sent',
      isInternal
        ? `Admin added internal note to ticket #${ticketId}`
        : `Admin replied to ticket #${ticketId} (email sent to ${ticket.email})`,
      req
    );

    // Return all messages for this ticket
    const msgRows = await db.execute(sql`
      SELECT id, ticket_id, sender_type, sender_id, sender_name, sender_email,
             message, read_by_admin, read_by_customer, is_internal, created_at
      FROM ja_ticket_messages
      WHERE ticket_id = ${ticketId}
      ORDER BY created_at ASC
    `);
    const messages = (msgRows as unknown as { rows?: unknown[] }).rows ?? (Array.isArray(msgRows) ? msgRows : []);

    return res.json({ success: true, messages });
  } catch (err) {
    console.error('admin.ticket.messages.post.error', err);
    return res.status(500).json({ success: false, error: 'Failed to send message.' });
  }
}
