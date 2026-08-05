/**
 * GET /api/admin/signing/config
 * Admin: get Document Signing configuration.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { ja_system_config } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAdminRole } from '../../_require-role.js';

const CONFIG_KEYS = [
  'signing_enabled',
  'signing_plans',
  'signing_max_docs_professional',
  'signing_max_docs_org_starter',
  'signing_max_docs_org_growth',
  'signing_max_docs_org_professional',
  'signing_max_signers',
  'signing_default_expiry_days',
  'signing_reminder_days',
  'signing_max_attachments',
  'signing_max_attachment_size_mb',
  'signing_allowed_attachment_types',
  'signing_append_to_final_pack_default',
  'signing_email_template_request',
  'signing_email_template_reminder',
  'signing_email_template_completed',
  'signing_email_template_declined',
  'signing_branding_logo_url',
  'signing_branding_company_name',
  'signing_branding_footer_text',
];

export default async function handler(req: Request, res: Response) {
  const admin = await requireAdminRole(req, res, []);
  if (!admin) return;

  try {
    const rows = await db.select().from(ja_system_config);
    const config: Record<string, string> = {};
    for (const row of rows) {
      if (CONFIG_KEYS.includes(row.configKey)) {
        config[row.configKey] = row.value ?? '';
      }
    }
    // Defaults
    const defaults: Record<string, string> = {
      signing_enabled: 'true',
      signing_plans: 'professional,org_starter,org_growth,org_professional',
      signing_max_docs_professional: '20',
      signing_max_docs_org_starter: '50',
      signing_max_docs_org_growth: '150',
      signing_max_docs_org_professional: '500',
      signing_max_signers: '10',
      signing_default_expiry_days: '30',
      signing_reminder_days: '3',
      signing_max_attachments: '10',
      signing_max_attachment_size_mb: '20',
      signing_allowed_attachment_types: 'pdf,png,jpg,jpeg,doc,docx,xls,xlsx,txt',
      signing_append_to_final_pack_default: 'false',
      signing_branding_company_name: 'Sousa Murray Planeia',
      signing_branding_footer_text: 'This document was signed electronically via Sousa Murray Planeia.',
    };
    return res.json({ success: true, config: { ...defaults, ...config } });
  } catch (err) {
    console.error('admin.signing.config.get.error', err);
    return res.status(500).json({ success: false, error: 'Failed to load signing config.' });
  }
}
