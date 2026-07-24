import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('Admin Subscription Plans route renders the dedicated editor instead of the generic read-only table', async () => {
  const operational = await read('src/pages/admin/operational-section.tsx');
  assert.match(operational, /import AdminPlansPage from '@\/pages\/admin\/plans'/);
  assert.match(operational, /const isPlans = definition\.section === 'plans'/);
  assert.match(operational, /if \(isPlans\) return <AdminPlansPage \/>/);
});

test('Subscription Plans page provides editable fields and a complete save action', async () => {
  const page = await read('src/pages/admin/plans.tsx');
  assert.match(page, /Edit the plans customers see and purchase/);
  assert.match(page, /Plan name/);
  assert.match(page, /Monthly price \(£\)/);
  assert.match(page, /Stripe Product ID/);
  assert.match(page, /Stripe Price ID/);
  assert.match(page, /Plan is live/);
  assert.match(page, /Featured plan/);
  assert.match(page, /action: 'save_all'/);
  assert.match(page, /Save all changes/);
  assert.match(page, /beforeunload/);
});

test('Admin plans API persists complete plan records in the service_plans table', async () => {
  const api = await read('functions/admin/api.js');
  assert.match(api, /export async function savePlans/);
  assert.match(api, /stripe_product_id = excluded\.stripe_product_id/);
  assert.match(api, /stripe_price_id = excluded\.stripe_price_id/);
  assert.match(api, /if \(body\.action === "save_all"\)/);
  assert.match(api, /await savePlans\(env\.DB, body\.plans\)/);
});

test('Checkout uses the Admin-edited service plan Price ID before legacy overrides', async () => {
  const checkout = await read('functions/create-checkout-session.js');
  const planSource = checkout.indexOf('if (plan.stripe_price_id) return String(plan.stripe_price_id);');
  const legacySource = checkout.indexOf('const overrideByPlan = {');
  assert.ok(planSource >= 0, 'Admin-edited Price ID source is missing');
  assert.ok(legacySource > planSource, 'Legacy override still takes priority over the plan record');
});

test('Verify All checks edited plan names, amounts, products and stored Stripe credentials', async () => {
  const verify = await read('functions/api/admin/stripe/verify-prices.js');
  assert.match(verify, /SELECT id, plan_name, price_pence, stripe_product_id, stripe_price_id/);
  assert.match(verify, /hydrateExpectedPlan/);
  assert.match(verify, /record\?\.price_pence/);
  assert.match(verify, /record\?\.stripe_product_id/);
  assert.match(verify, /record\?\.stripe_price_id/);
  assert.match(verify, /readSetting\(env\.DB, "stripe_secret_key"\)/);
  assert.match(verify, /source: "plan database"/);
});
