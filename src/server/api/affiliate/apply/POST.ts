/**
 * POST /api/affiliate/apply
 * Public — submit an affiliate application.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { sendEmail } from '../../../email.js';

function generateCode(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const rand = crypto.randomBytes(3).toString('hex');
  return `${base}${rand}`.toUpperCase().slice(0, 12);
}

export default async function handler(req: Request, res: Response) {
  const {
    fullName, email, phone, company, website,
    socialLinks, referralMethod, expectedAudience, agreedToTerms,
  } = req.body as {
    fullName: string; email: string; phone?: string; company?: string;
    website?: string; socialLinks?: string[]; referralMethod?: string;
    expectedAudience?: string; agreedToTerms: boolean;
  };

  if (!fullName?.trim() || !email?.trim()) {
    return res.status(400).json({ success: false, error: 'Full name and email are required.' });
  }
  if (!agreedToTerms) {
    return res.status(400).json({ success: false, error: 'You must agree to the affiliate terms.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
  }

  const uuid = crypto.randomUUID();

  try {
    await db.execute(sql`
      INSERT INTO ja_affiliates
        (uuid, full_name, email, phone, company, website, social_links,
         referral_method, expected_audience, agreed_to_terms, status, created_at, updated_at)
      VALUES
        (${uuid}, ${fullName.trim()}, ${email.toLowerCase().trim()},
         ${phone ?? null}, ${company ?? null}, ${website ?? null},
         ${socialLinks ? JSON.stringify(socialLinks) : null},
         ${referralMethod ?? null}, ${expectedAudience ?? null},
         1, 'applied', NOW(), NOW())
    `);

    // Notify admin
    try {
      await sendEmail({
        to: 'hello@jagroupservices.co.uk',
        subject: 'New Affiliate Application — Sousa Murray Planeia',
        html: `
          <h2>New Affiliate Application</h2>
          <p><strong>Name:</strong> ${fullName}</p>
          <p><strong>Email:</strong> ${email}</p>
          ${company ? `<p><strong>Company:</strong> ${company}</p>` : ''}
          ${website ? `<p><strong>Website:</strong> ${website}</p>` : ''}
          ${referralMethod ? `<p><strong>Referral method:</strong> ${referralMethod}</p>` : ''}
          <p>Review this application in the <a href="https://sousamurrayplaneia.jagroupservices.co.uk/admin/affiliate">Admin Portal</a>.</p>
        `,
      });
    } catch { /* non-fatal */ }

    // Confirm to applicant
    try {
      await sendEmail({
        to: email,
        subject: 'Affiliate Application Received — Sousa Murray Planeia',
        html: `
          <h2>Thank you for applying, ${fullName}!</h2>
          <p>We've received your affiliate application for Sousa Murray Planeia.</p>
          <p>Our team will review your application and get back to you within 3–5 business days.</p>
          <p>If you have any questions in the meantime, please contact us at <a href="mailto:hello@jagroupservices.co.uk">hello@jagroupservices.co.uk</a>.</p>
          <br/>
          <p>Kind regards,<br/>JA Group Services</p>
        `,
      });
    } catch { /* non-fatal */ }

    return res.status(201).json({ success: true, message: 'Application submitted successfully.' });
  } catch (err: unknown) {
    const msg = String(err);
    if (msg.includes('Duplicate entry') || msg.includes('unique')) {
      return res.status(409).json({ success: false, error: 'An application with this email already exists.' });
    }
    console.error('affiliate.apply.error', err);
    return res.status(500).json({ success: false, error: 'Failed to submit application.' });
  }
}
