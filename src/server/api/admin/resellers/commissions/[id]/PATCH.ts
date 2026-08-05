import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { ja_reseller_commissions, ja_resellers, ja_reseller_audit } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAdminRole } from '../../../_require-role.js';
import { sendEmail } from '../../../../../email.js';

export default async function handler(req: Request, res: Response) {
  const identity = await requireAdminRole(req, res, []);
  if (!identity) return;

  const { id } = req.params;
  const { action, paymentRef, rejectionReason, adminNotes } = req.body;

  const [comm] = await db.select().from(ja_reseller_commissions).where(eq(ja_reseller_commissions.uuid, id)).limit(1);
  if (!comm) return res.status(404).json({ success: false, error: 'Commission not found.' });

  const [reseller] = await db.select().from(ja_resellers).where(eq(ja_resellers.id, comm.resellerId)).limit(1);

  const updates: Partial<typeof ja_reseller_commissions.$inferInsert> = { updatedAt: new Date() };

  if (action === 'approve') {
    updates.status = 'approved';
    updates.approvedBy = identity.email;
    updates.approvedAt = new Date();
    if (reseller?.notifyCommission) {
      await sendEmail({
        to: reseller.email,
        subject: 'Commission Approved — Sousa Murray Planeia',
        html: `<h2>Commission Approved</h2><p>Dear ${reseller.fullName},</p><p>A commission of <strong>£${(comm.commissionGbp / 100).toFixed(2)}</strong> has been approved.</p><p>Kind regards,<br/>JA Group Services</p>`,
        text: `Commission of £${(comm.commissionGbp / 100).toFixed(2)} approved.`,
      }).catch(() => {});
    }
  } else if (action === 'paid') {
    updates.status = 'paid';
    updates.paidAt = new Date();
    updates.paidBy = identity.email;
    updates.paymentRef = paymentRef ?? null;
    if (reseller?.notifyCommission) {
      await sendEmail({
        to: reseller.email,
        subject: 'Commission Paid — Sousa Murray Planeia',
        html: `<h2>Commission Paid</h2><p>Dear ${reseller.fullName},</p><p>A commission of <strong>£${(comm.commissionGbp / 100).toFixed(2)}</strong> has been paid.${paymentRef ? ` Ref: <strong>${paymentRef}</strong>` : ''}</p><p>Kind regards,<br/>JA Group Services</p>`,
        text: `Commission of £${(comm.commissionGbp / 100).toFixed(2)} paid.`,
      }).catch(() => {});
    }
  } else if (action === 'reject') {
    updates.status = 'rejected';
    updates.rejectedBy = identity.email;
    updates.rejectionReason = rejectionReason ?? null;
  } else if (action === 'on_hold') {
    updates.status = 'on_hold';
  }

  if (adminNotes !== undefined) updates.adminNotes = adminNotes;

  await db.update(ja_reseller_commissions).set(updates).where(eq(ja_reseller_commissions.id, comm.id));

  await db.insert(ja_reseller_audit).values({
    resellerId: comm.resellerId,
    adminEmail: identity.email,
    action: `commission_${action ?? 'updated'}`,
    detail: `Commission ${comm.uuid} ${action ?? 'updated'}`,
    ipAddress: req.ip ?? null,
  });

  return res.json({ success: true });
}
