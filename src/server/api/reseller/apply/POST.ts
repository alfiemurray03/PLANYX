/**
 * POST /api/reseller/apply
 * Submit a reseller application. No auth required.
 */
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../../../db/client.js';
import { ja_resellers, ja_reseller_audit } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sendEmail } from '../../../email.js';
import { getSecret } from '#airo/secrets';

export default async function handler(req: Request, res: Response) {
  const {
    fullName, email, phone, company, website, vatNumber,
    businessType, expectedVolume, howHeard, agreedToTerms,
  } = req.body;

  if (!fullName || !email || !agreedToTerms) {
    return res.status(400).json({ success: false, error: 'Full name, email, and agreement to terms are required.' });
  }

  // Check for duplicate
  const [existing] = await db.select({ id: ja_resellers.id }).from(ja_resellers).where(eq(ja_resellers.email, email.toLowerCase().trim())).limit(1);
  if (existing) {
    return res.status(409).json({ success: false, error: 'An application with this email already exists.' });
  }

  const uuid = randomUUID();
  await db.insert(ja_resellers).values({
    uuid,
    fullName: fullName.trim(),
    email: email.toLowerCase().trim(),
    phone: phone?.trim() || null,
    company: company?.trim() || null,
    website: website?.trim() || null,
    vatNumber: vatNumber?.trim() || null,
    businessType: businessType?.trim() || null,
    expectedVolume: expectedVolume?.trim() || null,
    howHeard: howHeard?.trim() || null,
    agreedToTerms: !!agreedToTerms,
    agreedAt: new Date(),
    status: 'applied',
  });

  await db.insert(ja_reseller_audit).values({
    resellerId: null,
    adminEmail: null,
    action: 'reseller_applied',
    detail: `New reseller application from ${email}`,
    ipAddress: req.ip ?? null,
  });

  // Notify admin
  const adminEmail = String(getSecret('ADMIN_NOTIFICATION_EMAIL') ?? '');
  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: 'New Reseller Application',
      html: `<h2>New Reseller Application</h2><p><strong>Name:</strong> ${fullName}</p><p><strong>Email:</strong> ${email}</p><p><strong>Company:</strong> ${company ?? '—'}</p><p>Review in the Admin Portal → Resellers.</p>`,
      text: `New reseller application from ${fullName} (${email}). Review in Admin Portal.`,
    }).catch(() => {});
  }

  // Confirm to applicant
  await sendEmail({
    to: email,
    subject: 'Reseller Application Received — Sousa Murray Planeia',
    html: `<h2>Thank you, ${fullName}!</h2><p>We've received your reseller application for Sousa Murray Planeia. Our team will review it and get back to you within 3–5 business days.</p><p>Kind regards,<br/>JA Group Services</p>`,
    text: `Thank you for applying to become a Sousa Murray Planeia reseller. We'll be in touch within 3–5 business days.`,
  }).catch(() => {});

  return res.status(201).json({ success: true, message: 'Application submitted successfully.' });
}
