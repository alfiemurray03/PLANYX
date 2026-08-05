/**
 * PATCH /api/admin/resellers/:id
 * Approve, reject, suspend, reactivate, or update a reseller.
 */
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../../../../db/client.js';
import { ja_resellers, ja_reseller_audit } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAdminRole } from '../../_require-role.js';
import { sendEmail } from '../../../../email.js';

export default async function handler(req: Request, res: Response) {
  const identity = await requireAdminRole(req, res, []);
  if (!identity) return;

  const { id } = req.params;
  const {
    action, adminNotes, rejectionReason,
    commissionType, commissionRate, commissionRecurring, minPayoutGbp,
    fullName, phone, company,
  } = req.body;

  const [reseller] = await db.select().from(ja_resellers).where(eq(ja_resellers.uuid, id)).limit(1);
  if (!reseller) return res.status(404).json({ success: false, error: 'Reseller not found.' });

  const updates: Partial<typeof ja_resellers.$inferInsert> = { updatedAt: new Date() };

  if (action === 'approve') {
    const tempPassword = randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const referralCode = `RES${randomBytes(4).toString('hex').toUpperCase()}`;
    const appUrl = `${req.protocol}://${req.hostname}`;
    const referralLink = `${appUrl}/?ref=${referralCode}&type=reseller`;

    updates.status = 'approved';
    updates.approvedBy = identity.email;
    updates.approvedAt = new Date();
    updates.passwordHash = passwordHash;
    updates.referralCode = referralCode;
    updates.referralLink = referralLink;

    await sendEmail({
      to: reseller.email,
      subject: 'Reseller Application Approved — Sousa Murray Planeia',
      html: `<h2>Congratulations, ${reseller.fullName}!</h2>
        <p>Your reseller application for Sousa Murray Planeia has been <strong>approved</strong>.</p>
        <p><strong>Reseller portal:</strong> <a href="${appUrl}/reseller">${appUrl}/reseller</a></p>
        <p><strong>Login email:</strong> ${reseller.email}</p>
        <p><strong>Temporary password:</strong> <code>${tempPassword}</code></p>
        <p>Please log in and change your password in Settings.</p>
        <p><strong>Referral code:</strong> <code>${referralCode}</code></p>
        <p><strong>Referral link:</strong> <a href="${referralLink}">${referralLink}</a></p>
        <p>Kind regards,<br/>JA Group Services</p>`,
      text: `Your reseller application has been approved. Login at ${appUrl}/reseller with email ${reseller.email} and temporary password: ${tempPassword}`,
    }).catch(() => {});

  } else if (action === 'reject') {
    updates.status = 'rejected';
    updates.rejectedBy = identity.email;
    updates.rejectedAt = new Date();
    updates.rejectionReason = rejectionReason ?? null;

    await sendEmail({
      to: reseller.email,
      subject: 'Reseller Application Update — Sousa Murray Planeia',
      html: `<h2>Application Update</h2><p>Dear ${reseller.fullName},</p><p>After reviewing your application, we are unable to approve it at this time.</p>${rejectionReason ? `<p><strong>Reason:</strong> ${rejectionReason}</p>` : ''}<p>Kind regards,<br/>JA Group Services</p>`,
      text: `Your reseller application was not approved.`,
    }).catch(() => {});

  } else if (action === 'suspend') {
    updates.status = 'suspended';
  } else if (action === 'reactivate') {
    updates.status = 'approved';
  }

  if (adminNotes !== undefined) updates.adminNotes = adminNotes;
  if (commissionType) updates.commissionType = commissionType;
  if (commissionRate !== undefined) updates.commissionRate = Number(commissionRate);
  if (commissionRecurring !== undefined) updates.commissionRecurring = !!commissionRecurring;
  if (minPayoutGbp !== undefined) updates.minPayoutGbp = Number(minPayoutGbp);
  if (fullName) updates.fullName = fullName.trim();
  if (phone !== undefined) updates.phone = phone?.trim() ?? null;
  if (company !== undefined) updates.company = company?.trim() ?? null;

  await db.update(ja_resellers).set(updates).where(eq(ja_resellers.id, reseller.id));

  await db.insert(ja_reseller_audit).values({
    resellerId: reseller.id,
    adminEmail: identity.email,
    action: action ?? 'updated',
    detail: `Admin ${action ?? 'updated'} reseller ${reseller.email}`,
    ipAddress: req.ip ?? null,
  });

  return res.json({ success: true });
}
