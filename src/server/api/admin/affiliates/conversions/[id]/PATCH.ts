/**
 * PATCH /api/admin/affiliates/conversions/:id
 * Mark a conversion as approved or paid.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { requireAdminRole } from '../../../_require-role.js';
import { logAdminAction } from '../../../_audit-log.js';
import { sendEmail } from '../../../../../email.js';

export default async function handler(req: Request, res: Response) {
  const identity = await requireAdminRole(req, res, []);
  if (!identity) return;

  const { id } = req.params;
  const { action } = req.body as { action: 'approve' | 'mark_paid' | 'reject' };

  try {
    const rows = await db.execute(sql`
      SELECT cv.id, cv.affiliate_id, cv.status, cv.commission_gbp,
             a.email AS affiliate_email, a.full_name AS affiliate_name
      FROM ja_affiliate_conversions cv
      JOIN ja_affiliates a ON a.id = cv.affiliate_id
      WHERE cv.id = ${id} LIMIT 1
    `);
    const conv = ((rows as unknown as { rows?: unknown[] }).rows ?? [])[0] as {
      id: number; affiliate_id: number; status: string; commission_gbp: number;
      affiliate_email: string; affiliate_name: string;
    } | undefined;

    if (!conv) return res.status(404).json({ success: false, error: 'Conversion not found.' });

    if (action === 'approve') {
      await db.execute(sql`UPDATE ja_affiliate_conversions SET status = 'approved', updated_at = NOW() WHERE id = ${id}`);
      await logAdminAction(identity.email, 'affiliate.conversion.approved', `Approved conversion #${id} for ${conv.affiliate_email}`, req);
    } else if (action === 'mark_paid') {
      await db.execute(sql`
        UPDATE ja_affiliate_conversions
        SET status = 'paid', paid_at = NOW(), paid_by = ${identity.email}, updated_at = NOW()
        WHERE id = ${id}
      `);
      await logAdminAction(identity.email, 'affiliate.conversion.paid', `Marked conversion #${id} as paid for ${conv.affiliate_email} (£${(conv.commission_gbp / 100).toFixed(2)})`, req);

      // Notify affiliate
      try {
        await sendEmail({
          to: conv.affiliate_email,
          subject: 'Commission Payout Update — Sousa Murray Planeia',
          html: `
            <h2>Commission Payout</h2>
            <p>Dear ${conv.affiliate_name},</p>
            <p>A commission payment of <strong>£${(conv.commission_gbp / 100).toFixed(2)}</strong> has been processed for your account.</p>
            <p>Log in to your affiliate dashboard to view your full payout history.</p>
            <p>If you have any questions, contact us at <a href="mailto:hello@jagroupservices.co.uk">hello@jagroupservices.co.uk</a>.</p>
            <br/><p>Kind regards,<br/>JA Group Services</p>
          `,
        });
      } catch { /* non-fatal */ }
    } else if (action === 'reject') {
      await db.execute(sql`UPDATE ja_affiliate_conversions SET status = 'rejected', updated_at = NOW() WHERE id = ${id}`);
      await logAdminAction(identity.email, 'affiliate.conversion.rejected', `Rejected conversion #${id} for ${conv.affiliate_email}`, req);
    } else {
      return res.status(400).json({ success: false, error: 'Unknown action.' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('admin.affiliates.conversions.patch.error', err);
    return res.status(500).json({ success: false, error: 'Failed to update conversion.' });
  }
}
