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

test('Admin displays separate Standard and Business catalogues while editing one selected plan at a time', async () => {
  const page = await read('src/pages/admin/plans.tsx');
  assert.match(page, /selectedPlanId/);
  assert.match(page, /Standard and Business subscription catalogues/);
  assert.match(page, /renderPlanSelector\('standard'/);
  assert.match(page, /renderPlanSelector\('business'/);
  assert.match(page, /selectedPlan &&/);
  assert.match(page, /Eight separate plans are linked to eight separate Stripe products and prices/);
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
  assert.match(page, /Permanent ID:/);
  assert.match(page, /action: 'save_all'/);
  assert.match(page, /beforeunload/);
});

test('Universal controls safely prepare all-plan and per-catalogue availability changes', async () => {
  const page = await read('src/pages/admin/plans.tsx');
  assert.match(page, /Universal controls/);
  assert.match(page, /Activate all/);
  assert.match(page, /Disable all/);
  assert.match(page, /Activate Standard/);
  assert.match(page, /Disable Standard/);
  assert.match(page, /Activate Business/);
  assert.match(page, /Disable Business/);
  assert.match(page, /Clear featured/);
  assert.match(page, /Reset order/);
  assert.match(page, /Discard unsaved/);
  assert.match(page, /Select Save all to publish/);
  assert.match(page, /Every plan card will display Coming soon after you save/);
  assert.match(page, /setCatalogueAvailability/);
});

test('Admin catalogue loading seeds approved missing Business rows before reading the privileged records', async () => {
  const page = await read('src/pages/admin/plans.tsx');
  const seedPosition = page.indexOf("fetch('/api/plans'");
  const adminPosition = page.indexOf("fetch('/admin/api?section=plans'");
  assert.ok(seedPosition >= 0, 'Approved catalogue bootstrap request is missing');
  assert.ok(adminPosition > seedPosition, 'Admin catalogue is read before missing Business rows are seeded');
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

test('Public plan API returns disabled rows instead of replacing them with active fallback plans', async () => {
  const api = await read('functions/api/plans.js');
  assert.doesNotMatch(api, /\.filter\(\(plan\) => Number\(plan\.is_active/);
  assert.match(api, /is_active: Number\(plan\.is_active \|\| 0\)/);
  assert.match(api, /payment_available: Number\(plan\.is_active \|\| 0\) === 1/);
  assert.match(api, /business_personal/);
  assert.match(api, /business_org_starter/);
});

test('Home and pricing plan cards read live availability and display Coming soon when disabled', async () => {
  const component = await read('src/components/StandardBusinessPlans.tsx');
  assert.match(component, /fetch\('\/api\/plans'/);
  assert.match(component, /const active = Number\(plan\.is_active \|\| 0\) === 1/);
  assert.match(component, /Coming soon/);
  assert.match(component, /checkoutReady = active && payments && Boolean\(plan\.payment_available\)/);
  assert.match(component, /isBusinessPlan/);
});

test('Checkout uses the Admin-edited service plan Price ID and records the correct catalogue', async () => {
  const checkout = await read('functions/create-checkout-session.js');
  const planSource = checkout.indexOf('if (plan.stripe_price_id) return String(plan.stripe_price_id);');
  const legacySource = checkout.indexOf('const overrideByPlan = {');
  assert.ok(planSource >= 0, 'Admin-edited Price ID source is missing');
  assert.ok(legacySource > planSource, 'Legacy override still takes priority over the plan record');
  assert.match(checkout, /business_personal/);
  assert.match(checkout, /business_org_starter/);
  assert.match(checkout, /metadata\[account_type\]/);
  assert.match(checkout, /metadata\[catalogue\]/);
  assert.match(checkout, /pricing\/\?plan=coming-soon/);
});

test('Verify All checks all eight edited Standard and Business Stripe records', async () => {
  const verify = await read('functions/api/admin/stripe/verify-prices.js');
  assert.match(verify, /APPROVED_PLAN_PRICES/);
  assert.match(verify, /business_personal/);
  assert.match(verify, /business_standard/);
  assert.match(verify, /business_professional/);
  assert.match(verify, /business_org_starter/);
  assert.match(verify, /SELECT id, plan_name, price_pence, stripe_product_id, stripe_price_id/);
  assert.match(verify, /loadExpectedPlans/);
  assert.match(verify, /databasePriceId/);
  assert.match(verify, /readSetting\(env\.DB, "stripe_secret_key"\)/);
  assert.match(verify, /source: "database"/);
});
