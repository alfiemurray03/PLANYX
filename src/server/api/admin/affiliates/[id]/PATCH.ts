/**
 * PATCH /api/admin/affiliates/:id
 * Admin — approve, reject, suspend, update commission, mark payout, etc.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { requireAdminRole } from '../../_require-role.js';
import { logAdminAction } from '../../_audit-log.js';
import { sendEmail } from '../../../../email.js';
import crypto from 'node:crypto';

function generateCode(name: string): string {
  const base = (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const rand = crypto.randomBytes(3).toString('hex');
  return `${base}${rand}`.toUpperCase().slice(0, 12);
}

export default async function handler(req: Request, res: Response) {
  const identity = await requireAdminRole(req, res, []);
  if (!identity) return;

  const { id } = req.params;
  const { action, commissionRate, adminNotes, referralCode } = req.body as {
    action?: 'approve' | 'reject' | 'suspend' | 'reactivate' | 'set_commission' | 'set_notes' | 'set_code';
    commissionRate?: number;
    adminNotes?: string;
    referralCode?: string;
  };

  try {
    // Fetch current affiliate
    const rows = await db.execute(sql`
      SELECT id, uuid, full_name, email, status, referral_code, commission_rate
      FROM ja_affiliates WHERE id = ${id} LIMIT 1
    `);
    const aff = ((rows as unknown as { rows?: unknown[] }).rows ?? [])[0] as {
      id: number; uuid: string; full_name: string; email: string;
      status: string; referral_code: string | null; commission_rate: number;
    } | undefined;

    if (!aff) return res.status(404).json({ success: false, error: 'Affiliate not found.' });

    if (action === 'approve') {
      // Generate referral code if not already set
      const code = aff.referral_code ?? generateCode(aff.full_name);
      await db.execute(sql`
        UPDATE ja_affiliates
        SET status = 'approved', referral_code = ${code},
            approved_by = ${identity.email}, approved_at = NOW(), updated_at = NOW()
        WHERE id = ${id}
      `);
      await logAdminAction(identity.email, 'affiliate.approved', `Approved affiliate ${aff.email} (code: ${code})`, req);

      // Email the affiliate
      try {
        await sendEmail({
          to: aff.email,
          subject: 'Your Affiliate Application Has Been Approved — Sousa Murray Planeia',
          html: `
            <h2>Congratulations, ${aff.full_name}!</h2>
            <p>Your affiliate application for Sousa Murray Planeia has been <strong>approved</strong>.</p>
            <p><strong>Your referral code:</strong> <code>${code}</code></p>
            <p><strong>Your referral link:</strong> <a href="https://sousamurrayplaneia.jagroupservices.co.uk/?ref=${code}">https://sousamurrayplaneia.jagroupservices.co.uk/?ref=${code}</a></p>
            <p>Log in to your affiliate dashboard to track your clicks, signups, and commissions.</p>
            <p>If you have any questions, contact us at <a href="mailto:hello@jagroupservices.co.uk">hello@jagroupservices.co.uk</a>.</p>
            <br/><p>Kind regards,<br/>JA Group Services</p>
          `,
        });
      } catch { /* non-fatal */ }

      return res.json({ success: true, referralCode: code });
    }

    if (action === 'reject') {
      await db.execute(sql`
        UPDATE ja_affiliates SET status = 'rejected', updated_at = NOW() WHERE id = ${id}
      `);
      await logAdminAction(identity.email, 'affiliate.rejected', `Rejected affiliate ${aff.email}`, req);

      try {
        await sendEmail({
          to: aff.email,
          subject: 'Affiliate Application Update — Sousa Murray Planeia',
          html: `
            <h2>Application Update</h2>
            <p>Dear ${aff.full_name},</p>
            <p>Thank you for your interest in the Sousa Murray Planeia Affiliate Programme.</p>
            <p>After reviewing your application, we are unable to approve it at this time.</p>
            <p>If you believe this is an error or would like to discuss further, please contact us at <a href="mailto:hello@jagroupservices.co.uk">hello@jagroupservices.co.uk</a>.</p>
            <br/><p>Kind regards,<br/>JA Group Services</p>
          `,
        });
      } catch { /* non-fatal */ }

      return res.json({ success: true });
    }

    if (action === 'suspend') {
      await db.execute(sql`
        UPDATE ja_affiliates SET status = 'suspended', updated_at = NOW() WHERE id = ${id}
      `);
      await logAdminAction(identity.email, 'affiliate.suspended', `Suspended affiliate ${aff.email}`, req);
      return res.json({ success: true });
    }

    if (action === 'reactivate') {
      await db.execute(sql`
        UPDATE ja_affiliates SET status = 'approved', updated_at = NOW() WHERE id = ${id}
      `);
      await logAdminAction(identity.email, 'affiliate.reactivated', `Reactivated affiliate ${aff.email}`, req);
      return res.json({ success: true });
    }

    if (action === 'set_commission') {
      if (commissionRate === undefined || commissionRate < 0 || commissionRate > 100) {
        return res.status(400).json({ success: false, error: 'Commission rate must be 0–100.' });
      }
      await db.execute(sql`
        UPDATE ja_affiliates SET commission_rate = ${commissionRate}, updated_at = NOW() WHERE id = ${id}
      `);
      await logAdminAction(identity.email, 'affiliate.commission_changed', `Set commission to ${commissionRate}% for ${aff.email}`, req);
      return res.json({ success: true });
    }

    if (action === 'set_notes') {
      await db.execute(sql`
        UPDATE ja_affiliates SET admin_notes = ${adminNotes ?? null}, updated_at = NOW() WHERE id = ${id}
      `);
      return res.json({ success: true });
    }

    if (action === 'set_code') {
      if (!referralCode?.trim()) return res.status(400).json({ success: false, error: 'Referral code is required.' });
      await db.execute(sql`
        UPDATE ja_affiliates SET referral_code = ${referralCode.toUpperCase().trim()}, updated_at = NOW() WHERE id = ${id}
      `);
      await logAdminAction(identity.email, 'affiliate.code_changed', `Changed referral code for ${aff.email} to ${referralCode}`, req);
      return res.json({ success: true });
    }

    return res.status(400).json({ success: false, error: 'Unknown action.' });
  } catch (err) {
    console.error('admin.affiliates.patch.error', err);
    return res.status(500).json({ success: false, error: 'Failed to update affiliate.' });
  }
}
