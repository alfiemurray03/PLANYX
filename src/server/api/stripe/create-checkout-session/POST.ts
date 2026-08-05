/**
 * POST /api/stripe/create-checkout-session
 * Creates a Stripe Checkout Session for a live Sousa Murray Planeia subscription.
 */
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { getSecret } from '#airo/secrets';
import { resolveSession } from '../../auth/_session.js';
import { db } from '../../../db/client.js';
import { ja_users, ja_system_config } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import {
  PLAN_STRIPE_SECRET_KEY, PLAN_HAS_TRIAL, PLAN_LABELS, PAID_PLANS,
  type PlanId,
} from '../../../../lib/plan-config.js';

const PRICE_CONFIG_KEY: Partial<Record<PlanId, string>> = {
  personal: 'stripe_price_personal_override',
  standard: 'stripe_price_standard_override',
  professional: 'stripe_price_professional_override',
  org_starter: 'stripe_price_org_starter_override',
};

const EXPECTED_PRICE: Partial<Record<PlanId, { amount: number; productNames: string[] }>> = {
  personal: { amount: 599, productNames: ['Explore Plan', 'Sousa Murray Planeia – Explore', 'Sousa Murray Planeia - Explore'] },
  standard: { amount: 799, productNames: ['Plan Plan', 'Sousa Murray Planeia – Plan', 'Sousa Murray Planeia - Plan'] },
  professional: { amount: 1499, productNames: ['Complete Plan', 'Sousa Murray Planeia – Complete', 'Sousa Murray Planeia - Complete'] },
  org_starter: { amount: 3999, productNames: ['Together Plan', 'Sousa Murray Planeia – Together', 'Sousa Murray Planeia - Together'] },
};

async function configValue(key: string): Promise<string> {
  const rows = await db
    .select({ value: ja_system_config.value })
    .from(ja_system_config)
    .where(eq(ja_system_config.configKey, key))
    .limit(1);
  return String(rows[0]?.value ?? '').trim();
}

async function paymentsAreEnabled(): Promise<boolean> {
  return (await configValue('toggle_payments')) === 'true';
}

function normalise(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

async function resolveConfiguredPriceId(planId: PlanId): Promise<string> {
  const overrideKey = PRICE_CONFIG_KEY[planId];
  if (overrideKey) {
    const override = await configValue(overrideKey);
    if (override) return override;
  }

  const secretName = PLAN_STRIPE_SECRET_KEY[planId];
  return secretName ? String(getSecret(secretName) ?? '').trim() : '';
}

async function validatePrice(stripe: Stripe, planId: PlanId, priceId: string): Promise<string | null> {
  const expected = EXPECTED_PRICE[planId];
  if (!expected) return 'This subscription is not configured for checkout.';
  if (!/^price_[A-Za-z0-9]+$/.test(priceId)) return 'The configured Stripe Price ID is invalid.';

  try {
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    const product = price.product && typeof price.product === 'object' && !('deleted' in price.product)
      ? price.product as Stripe.Product
      : null;
    const productName = normalise(product?.name);
    const acceptedNames = new Set(expected.productNames.map(normalise));

    if (!price.active || product?.active === false) return 'This subscription is not active in Stripe.';
    if (!acceptedNames.has(productName)) return `The configured Price ID does not belong to ${PLAN_LABELS[planId]}.`;
    if (price.currency.toLowerCase() !== 'gbp' || price.unit_amount !== expected.amount) {
      return `The configured Stripe price does not match the published ${PLAN_LABELS[planId]} amount.`;
    }
    if (price.recurring?.interval !== 'month' || (price.recurring.interval_count ?? 1) !== 1) {
      return 'The configured Stripe price is not a monthly subscription.';
    }
    return null;
  } catch (error) {
    console.error('stripe.checkout.price-validation.error', error);
    return 'The configured Stripe Price ID could not be verified.';
  }
}

export default async function handler(req: Request, res: Response) {
  try {
    if (!(await paymentsAreEnabled())) {
      return res.status(503).json({
        success: false,
        error: 'Payments are coming soon. Checkout is currently switched off by Sousa Murray Planeia.',
      });
    }
  } catch (error) {
    console.error('stripe.checkout.toggle-read.error', error);
    return res.status(503).json({ success: false, error: 'Checkout is temporarily unavailable. Please try again later.' });
  }

  const { plan, successUrl, cancelUrl, referralCode: bodyRef } = req.body as {
    plan: string;
    successUrl?: string;
    cancelUrl?: string;
    referralCode?: string;
  };

  if (!PAID_PLANS.includes(plan as PlanId)) {
    return res.status(400).json({ success: false, error: 'Please select one of the available Sousa Murray Planeia subscriptions.' });
  }

  const planId = plan as PlanId;
  const secretKey = String(getSecret('STRIPE_SECRET_KEY') ?? '').trim();
  if (!secretKey) {
    return res.status(503).json({ success: false, error: 'Checkout is temporarily unavailable. Please contact Sousa Murray Planeia.' });
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2026-05-27.dahlia' });
  let priceId = '';
  try {
    priceId = await resolveConfiguredPriceId(planId);
  } catch (error) {
    console.error('stripe.checkout.price-config.error', error);
  }

  if (!priceId) {
    return res.status(503).json({ success: false, error: `${PLAN_LABELS[planId]} checkout has not been configured yet.` });
  }

  const priceError = await validatePrice(stripe, planId, priceId);
  if (priceError) return res.status(409).json({ success: false, error: priceError });

  try {
    const origin = `${req.protocol}://${req.get('host')}`;
    const userId = await resolveSession(req);
    let customerEmail: string | undefined;

    if (userId) {
      const users = await db
        .select({ email: ja_users.email })
        .from(ja_users)
        .where(eq(ja_users.id, userId))
        .limit(1);
      customerEmail = users[0]?.email;
    }

    const refCode = (bodyRef ?? (req.cookies?.ja_ref as string | undefined) ?? '').toUpperCase().trim() || undefined;
    let affiliateId: number | undefined;

    if (refCode) {
      try {
        const rows = await db.execute(sql`
          SELECT id FROM ja_affiliates WHERE referral_code = ${refCode} AND status = 'approved' LIMIT 1
        `);
        const affiliate = ((rows as unknown as { rows?: unknown[] }).rows ?? [])[0] as { id: number } | undefined;
        if (affiliate) affiliateId = affiliate.id;
      } catch {
        // Referral attribution is non-fatal to checkout.
      }
    }

    const trialDays = PLAN_HAS_TRIAL[planId] ? 30 : 0;
    const metadata = {
      plan: planId,
      ...(userId ? { userId: String(userId) } : {}),
      ...(affiliateId ? { affiliateId: String(affiliateId), referralCode: refCode! } : {}),
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl ?? `${origin}/dashboard?checkout=success&plan=${planId}`,
      cancel_url: cancelUrl ?? `${origin}/pricing?checkout=cancelled`,
      allow_promotion_codes: true,
      metadata,
      subscription_data: {
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
        metadata,
      },
    });

    if (!session.url) {
      return res.status(503).json({ success: false, error: 'Stripe did not return a checkout page. Please try again.' });
    }

    return res.json({ success: true, url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('stripe.create-checkout-session.error', error);
    return res.status(503).json({ success: false, error: 'Checkout could not be started. Please try again later.' });
  }
}
