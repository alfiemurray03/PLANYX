import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('public catalogue loading is read-only and cannot overwrite Admin-edited subscription plans', async () => {
  const [plansData, checkout, adminApi] = await Promise.all([
    readFile(new URL('functions/plans-data.js', root), 'utf8'),
    readFile(new URL('functions/create-checkout-session.js', root), 'utf8'),
    readFile(new URL('functions/admin/api.js', root), 'utf8'),
  ]);

  assert.doesNotMatch(plansData, /INSERT\s+INTO\s+service_plans/i);
  assert.doesNotMatch(plansData, /UPDATE\s+service_plans/i);
  assert.doesNotMatch(plansData, /DELETE\s+FROM\s+service_plans/i);
  assert.doesNotMatch(plansData, /CREATE\s+TABLE/i);
  assert.doesNotMatch(plansData, /ALTER\s+TABLE/i);

  assert.match(checkout, /ON CONFLICT\(id\) DO NOTHING/);
  assert.doesNotMatch(checkout, /DELETE FROM service_plans WHERE id NOT IN/);

  assert.match(adminApi, /async function seedServicePlans/);
  assert.match(adminApi, /ON CONFLICT\(id\) DO NOTHING/);
});

test('online checkout requires a verified account and carries its email into Stripe', async () => {
  const checkout = await readFile(new URL('functions/create-checkout-session.js', root), 'utf8');
  assert.match(checkout, /getNativeSession\(context\.request, context\.env, "customer"\)/);
  assert.match(checkout, /params\.append\("customer_email", accountEmail\)/);
  assert.match(checkout, /params\.append\("client_reference_id", accountEmail\)/);
  assert.match(checkout, /subscription_data\[metadata\]\[customer_email\]/);
});
