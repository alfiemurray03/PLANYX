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

test('Subscription Plans page edits one selected plan at a time instead of stacking every full form', async () => {
  const page = await read('src/pages/admin/plans.tsx');
  assert.match(page, /selectedPlanId/);
  assert.match(page, /Choose subscription plan/);
  assert.match(page, /selectedPlan &&/);
  assert.match(page, /Edit every plan without the endless scrolling/);
  assert.doesNotMatch(page, /expanded\[plan\.id\]/);
});

test('Every stored customer-facing and Stripe plan setting is editable', async () => {
  const page = await read('src/pages/admin/plans.tsx');
  for (const label of [
    'Plan name',
    'Plan type',
    'Monthly price (£)',
    'Public price label',
    'Display order',
    'Public description',
    'Benefit line 1',
    'Benefit line 2',
    'Purchase button wording',
    'Stripe Product ID',
    'Stripe Price ID',
    'Live',
    'Featured',
  ]) {
    assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(page, /Permanent internal plan ID/);
  assert.match(page, /readOnly aria-readonly="true"/);
  assert.match(page, /action: 'save_all'/);
  assert.match(page, /beforeunload/);
});

test('Universal controls prepare safe bulk catalogue changes before Save all publishes them', async () => {
  const page = await read('src/pages/admin/plans.tsx');
  assert.match(page, /Universal controls for every plan/);
  assert.match(page, /Activate all/);
  assert.match(page, /Disable all/);
  assert.match(page, /Feature all/);
  assert.match(page, /Clear featured/);
  assert.match(page, /Reset order/);
  assert.match(page, /Discard unsaved/);
  assert.match(page, /Nothing goes live until you select Save all/);
  assert.match(page, /window\.confirm\('Disable every subscription plan/);
  assert.match(page, /sort_order: \(index \+ 1\) \* 10/);
});

test('Admin plans API persists complete plan records in the service_plans table', async () => {
  const api = await read('functions/admin/api.js');
  assert.match(api, /export async function savePlans/);
  assert.match(api, /stripe_product_id = excluded\.stripe_product_id/);
  assert.match(api, /stripe_price_id = excluded\.stripe_price_id/);
  assert.match(api, /delivery_time = excluded\.delivery_time/);
  assert.match(api, /revisions = excluded\.revisions/);
  assert.match(api, /description = excluded\.description/);
  assert.match(api, /button_label = excluded\.button_label/);
  assert.match(api, /is_active = excluded\.is_active/);
  assert.match(api, /is_featured = excluded\.is_featured/);
  assert.match(api, /sort_order = excluded\.sort_order/);
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
