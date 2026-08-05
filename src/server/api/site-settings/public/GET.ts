/**
 * GET /api/site-settings/public
 * Returns safe public-facing site settings (branding, nav, footer).
 * No auth required.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { ja_site_settings } from '../../../db/schema.js';

const DEFAULTS: Record<string, string> = {
  site_name:    'Sousa Murray Planeia',
  brand_name:   'JA Group Services',
  tagline:      'Personalised Plans, Generated in Minutes',
  support_email: 'contact@jagroupservices.co.uk',
  company_name: 'JA Group Services Ltd',
  primary_color: '#1B4F8A',
  accent_color:  '#8a561b',
  logo_url:      '',
  browser_tab_name: 'Sousa Murray Planeia',
  admin_tab_name: 'Sousa Murray Planeia Admin Portal',
  favicon_url: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E',
  admin_theme_mode: 'light',
  google_analytics_id: '',
  nav_links: JSON.stringify([
    { id: 'nl-1', label: 'Pricing', href: '/pricing', openNewTab: false },
    { id: 'nl-2', label: 'Contact', href: '/contact', openNewTab: false },
  ]),
  footer_links: JSON.stringify([
    { id: 'fl-1', label: 'Privacy Policy',    href: '/privacy',  group: 'Legal' },
    { id: 'fl-2', label: 'Terms & Conditions', href: '/terms',   group: 'Legal' },
    { id: 'fl-3', label: 'Cookie Policy',      href: '/cookies', group: 'Legal' },
    { id: 'fl-4', label: 'Pricing',            href: '/pricing', group: 'Company' },
    { id: 'fl-5', label: 'Contact',            href: '/contact', group: 'Company' },
  ]),
  affiliate_coming_soon: 'true',
};

export default async function handler(_req: Request, res: Response) {
  try {
    const rows = await db.select().from(ja_site_settings);
    const all: Record<string, string> = { ...DEFAULTS };
    for (const row of rows) all[row.settingKey] = row.value;

    // Only expose safe public keys. Admin theme contains no account data and is
    // public solely so the Admin shell can resolve its appearance before auth.
    const PUBLIC_KEYS = [
      'site_name', 'brand_name', 'tagline', 'support_email', 'company_name',
      'primary_color', 'accent_color', 'logo_url',
      'browser_tab_name', 'admin_tab_name', 'favicon_url', 'admin_theme_mode',
      'nav_links', 'footer_links', 'affiliate_coming_soon', 'google_analytics_id',
    ];
    const settings: Record<string, string> = {};
    for (const k of PUBLIC_KEYS) settings[k] = all[k] ?? '';
    settings.support_email = DEFAULTS.support_email;

    return res.json({ success: true, settings });
  } catch (err) {
    console.error('site-settings.public.get.error', err);
    return res.json({ success: true, settings: DEFAULTS });
  }
}
