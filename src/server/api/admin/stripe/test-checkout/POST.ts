/**
 * POST /api/admin/stripe/test-checkout
 * Creates a test Stripe checkout session (test mode only) to verify the full flow.
 * Supports all 6 active paid plans.
 * Only works when Stripe is in test mode (sk_test_*).
 */
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { getSecret } from '#airo/secrets';
import { db } from '../../../../db/client.js';
import { ja_system_config } from '../../../../db/schema.js';
import { requireAdminSession } from '../../_admin-session.js';
import { logAdminAction } from '../../_audit-log.js';
import { eq } from 'drizzle-orm';

async function getConfigValue(configKey: string, envFallback: string | null): Promise<string | null> {
  const rows = await db
    .select({ value: ja_system_config.value })
    .from(ja_system_config)
    .where(eq(ja_system_config.configKey, configKey))
    .limit(1);
  return rows[0]?.value ?? envFallback;
}

// Maps plan slug → [configKey, envSecretName]
const PLAN_PRICE_MAP: Record<string, [string, string]> = {
  personal:         ['stripe_price_personal_override',         'STRIPE_PRICE_PERSONAL'],
  standard:         ['stripe_price_standard_override',         'STRIPE_PRICE_STANDARD'],
  professional:     ['stripe_price_professional_override',     'STRIPE_PRICE_PROFESSIONAL'],
  org_starter:      ['stripe_price_org_starter_override',      'STRIPE_PRICE_ORG_STARTER'],
  org_growth:       ['stripe_price_org_growth_override',       'STRIPE_PRICE_ORG_GROWTH'],
  org_professional: ['stripe_price_org_professional_override', 'STRIPE_PRICE_ORG_PROFESSIONAL'],
};

export default async function handler(req: Request, res: Response) {
  const identity = await requireAdminSession(req);
  const adminEmail = identity?.email ?? 'unknown';
  if (!identity) {
    return res.status(401).json({ success: false, error: 'Admin session required.', code: 'NOT_AUTHENTICATED' });
  }

  // Any admin authenticated via Microsoft OIDC has full platform owner access.
  // No ja_admin_accounts lookup required — the OIDC session IS the authority.

  const secretKey = await getConfigValue('stripe_secret_key_override', getSecret('STRIPE_SECRET_KEY') as string | null);
  if (!secretKey) {
    return res.json({ success: false, error: 'No Stripe secret key configured.' });
  }

  // Safety: only allow test mode
  if (!secretKey.startsWith('sk_test_')) {
    await logAdminAction(adminEmail, 'stripe.test-checkout.blocked', 'Attempted test checkout with live key — blocked', req);
    return res.status(400).json({
      success: false,
      error: 'Test checkout is only available in test mode (sk_test_*). Switch to test keys first.',
    });
  }

  const { plan = 'standard' } = req.body as { plan?: string };

  const priceEntry = PLAN_PRICE_MAP[plan] ?? PLAN_PRICE_MAP.standard;
  const [configKey, envKey] = priceEntry;
  const priceId = await getConfigValue(configKey, getSecret(envKey) as string | null);

  if (!priceId) {
    return res.json({ success: false, error: `No price ID configured for plan: ${plan}. Add it in the Price IDs tab.` });
  }

  const successUrl = await getConfigValue('stripe_success_url', null)
    ?? 'https://sousamurrayplaneia.jagroupservices.co.uk/dashboard?checkout=success';
  const cancelUrl  = await getConfigValue('stripe_cancel_url', null)
    ?? 'https://sousamurrayplaneia.jagroupservices.co.uk/pricing?checkout=cancelled';

  try {
    const stripe = new Stripe(secretKey, { apiVersion: '2026-05-27.dahlia' });
    const session = await stripe.checkout.sessions.create({
      mode:        'subscription',
      line_items:  [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url:  cancelUrl,
      metadata:    { source: 'admin_test', plan },
    });

    await logAdminAction(adminEmail, 'stripe.test-checkout.created', `Created test checkout session ${session.id} for plan: ${plan}`, req);

    return res.json({
      success:    true,
      sessionId:  session.id,
      sessionUrl: session.url,
      plan,
      priceId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAdminAction(adminEmail, 'stripe.test-checkout.failed', `Test checkout failed: ${message}`, req);
    return res.json({ success: false, error: message });
  }
}
