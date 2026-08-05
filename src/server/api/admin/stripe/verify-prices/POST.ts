/**
 * POST /api/admin/stripe/verify-prices
 * Verifies the four live Sousa Murray Planeia subscription Price IDs against Stripe
 * and checks that each one belongs to the correct product, amount and interval.
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

const PRICE_SLOTS = [
  {
    key: 'personal', configKey: 'stripe_price_personal_override', envSecrets: ['STRIPE_PRICE_EXPLORE', 'STRIPE_PRICE_PERSONAL'],
    label: 'Explore Plan', amount: 599, productId: 'prod_UtkvP5dvxrwLNa',
    productNames: ['Explore Plan', 'Sousa Murray Planeia – Explore', 'Sousa Murray Planeia - Explore'],
    defaultPriceId: 'price_1TtxPrDZzb3r6Q3cIViE64O4',
  },
  {
    key: 'standard', configKey: 'stripe_price_standard_override', envSecrets: ['STRIPE_PRICE_PLAN', 'STRIPE_PRICE_STANDARD'],
    label: 'Plan Plan', amount: 799, productId: 'prod_UtkvpswzvV53y7',
    productNames: ['Plan Plan', 'Sousa Murray Planeia – Plan', 'Sousa Murray Planeia - Plan'],
    defaultPriceId: 'price_1TtxPyDZzb3r6Q3cg9hcgXeA',
  },
  {
    key: 'professional', configKey: 'stripe_price_professional_override', envSecrets: ['STRIPE_PRICE_COMPLETE', 'STRIPE_PRICE_PROFESSIONAL'],
    label: 'Complete Plan', amount: 1499, productId: 'prod_Utkv85XaRxReja',
    productNames: ['Complete Plan', 'Sousa Murray Planeia – Complete', 'Sousa Murray Planeia - Complete'],
    defaultPriceId: 'price_1TtxQ5DZzb3r6Q3c0XxvHRDY',
  },
  {
    key: 'org_starter', configKey: 'stripe_price_org_starter_override', envSecrets: ['STRIPE_PRICE_TOGETHER', 'STRIPE_PRICE_ORG_STARTER'],
    label: 'Together Plan', amount: 3999, productId: 'prod_Utkwas33GBC6Yn',
    productNames: ['Together Plan', 'Sousa Murray Planeia – Together', 'Sousa Murray Planeia - Together'],
    defaultPriceId: 'price_1TtxQDDZzb3r6Q3cI8rCEJwJ',
  },
] as const;

type PriceSlot = typeof PRICE_SLOTS[number];

interface PriceVerifyResult {
  set: boolean;
  valid: boolean;
  label: string;
  id?: string;
  source?: string;
  product?: string;
  productId?: string;
  amount?: number | null;
  currency?: string;
  interval?: string;
  active?: boolean;
  error?: string;
}

function normalise(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function invalid(slot: PriceSlot, id: string, source: string, error: string): PriceVerifyResult {
  return { set: Boolean(id), valid: false, label: slot.label, id: id || undefined, source, error };
}

function requestPrices(req: Request): Record<string, unknown> {
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const prices = body.prices;
  return prices && typeof prices === 'object' ? prices as Record<string, unknown> : body;
}

async function resolvePriceId(req: Request, slot: PriceSlot): Promise<{ id: string; source: string }> {
  const submitted = requestPrices(req);
  const submittedId = String(submitted[slot.configKey] ?? submitted[slot.key] ?? '').trim();
  if (submittedId) return { id: submittedId, source: 'submitted' };

  for (const secretName of slot.envSecrets) {
    const configured = getSecret(secretName) as string | null;
    const saved = await getConfigValue(slot.configKey, configured);
    if (saved) return { id: saved, source: configured && saved === configured ? 'secret' : 'database' };
  }

  return { id: slot.defaultPriceId, source: 'default' };
}

async function verifyPrice(stripe: Stripe, slot: PriceSlot, id: string, source: string): Promise<PriceVerifyResult> {
  if (!/^price_[A-Za-z0-9]+$/.test(id)) return invalid(slot, id, source, 'This is not a valid Stripe Price ID format.');

  try {
    const price = await stripe.prices.retrieve(id, { expand: ['product'] });
    const product = price.product && typeof price.product === 'object' && !('deleted' in price.product)
      ? price.product as Stripe.Product
      : null;
    const productId = product?.id ?? (typeof price.product === 'string' ? price.product : '');
    const productName = product?.name ?? '';
    const acceptedNames = new Set(slot.productNames.map(normalise));
    const productMatches = productId === slot.productId || acceptedNames.has(normalise(productName));
    const amountMatches = price.unit_amount === slot.amount;
    const currencyMatches = normalise(price.currency) === 'gbp';
    const intervalMatches = price.recurring?.interval === 'month' && (price.recurring.interval_count ?? 1) === 1;
    const priceActive = price.active;
    const productActive = product?.active !== false;

    const failures: string[] = [];
    if (!productMatches) failures.push(`belongs to the wrong product (expected ${slot.label})`);
    if (!amountMatches) failures.push(`has the wrong amount (expected £${(slot.amount / 100).toFixed(2)})`);
    if (!currencyMatches) failures.push('is not priced in GBP');
    if (!intervalMatches) failures.push('is not a monthly recurring price');
    if (!priceActive) failures.push('is inactive');
    if (!productActive) failures.push('belongs to an inactive product');

    return {
      set: true,
      valid: failures.length === 0,
      label: slot.label,
      id: price.id,
      source,
      product: productName || productId || 'Unknown product',
      productId: productId || undefined,
      amount: price.unit_amount,
      currency: price.currency.toUpperCase(),
      interval: price.recurring?.interval ?? 'one_time',
      active: priceActive && productActive,
      error: failures.length ? `Price ID ${failures.join(', ')}.` : undefined,
    };
  } catch (error) {
    return invalid(slot, id, source, error instanceof Error ? error.message : 'Stripe could not find this Price ID.');
  }
}

export default async function handler(req: Request, res: Response) {
  const identity = await requireAdminSession(req);
  const adminEmail = identity?.email ?? 'unknown';
  if (!identity) {
    return res.status(401).json({ success: false, error: 'Admin session required.' });
  }

  const secretKey = getSecret('STRIPE_SECRET_KEY') as string | null;
  const results: Record<string, PriceVerifyResult> = {};

  if (!secretKey) {
    for (const slot of PRICE_SLOTS) {
      const { id, source } = await resolvePriceId(req, slot);
      results[slot.key] = invalid(slot, id, source, 'The Stripe secret key is not configured.');
    }
    return res.json({ success: true, prices: results, summary: { valid: 0, total: PRICE_SLOTS.length, allValid: false } });
  }

  try {
    const stripe = new Stripe(secretKey, { apiVersion: '2026-05-27.dahlia' });
    for (const slot of PRICE_SLOTS) {
      const { id, source } = await resolvePriceId(req, slot);
      results[slot.key] = await verifyPrice(stripe, slot, id, source);
    }

    const valid = Object.values(results).filter((result) => result.valid).length;
    await logAdminAction(adminEmail, 'stripe.verify-prices.run', `Verified ${valid}/${PRICE_SLOTS.length} Stripe price IDs`, req);
    return res.json({ success: true, prices: results, summary: { valid, total: PRICE_SLOTS.length, allValid: valid === PRICE_SLOTS.length } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logAdminAction(adminEmail, 'stripe.verify-prices.failed', `Price verification failed: ${message}`, req);
    for (const slot of PRICE_SLOTS) {
      if (!results[slot.key]) {
        const { id, source } = await resolvePriceId(req, slot);
        results[slot.key] = invalid(slot, id, source, 'Stripe verification could not be completed. Please try again.');
      }
    }
    return res.json({ success: true, prices: results, summary: { valid: 0, total: PRICE_SLOTS.length, allValid: false } });
  }
}
