import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/create-checkout-session.js';

const PLAN_DETAILS = {
  personal: ['Explore Plan', 599, 'individual'],
  standard: ['Plan Plan', 799, 'individual'],
  professional: ['Complete Plan', 1499, 'individual'],
  org_starter: ['Together Plan', 3999, 'individual'],
  business_personal: ['Explore Plan', 599, 'organisation'],
  business_standard: ['Plan Plan', 799, 'organisation'],
  business_professional: ['Complete Plan', 1499, 'organisation'],
  business_org_starter: ['Together Plan', 3999, 'organisation'],
};

const OIDC_ENV = {
  CUSTOMER_OIDC_ISSUER: 'https://login.example.test/tenant/v2.0',
  CUSTOMER_OIDC_CLIENT_ID: 'client',
  CUSTOMER_OIDC_CLIENT_SECRET: 'secret',
  CUSTOMEROPS_BASE_URL: 'https://customerops.example.test',
  CUSTOMEROPS_API_KEY: 'platform-test-key',
};

const VERIFIED_ADULT_PROFILE = {
  stripe_customer_id: null,
  age_band: '18+',
  age_transition_at: '',
  age_verified_at: '2026-07-25T00:00:00.000Z',
  registration_eligible: 1,
  minor_safeguards_enabled: 0,
  universal_customer_number: '1000000001',
  planyx_account_id: 'planyx-account-1',
  email: 'customer@example.test',
};

function database(overrides = {}) {
  return {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { this.values = values; return this; },
        async run() { return { success: true }; },
        async all() { return { results: [] }; },
        async first() {
          if (sql.includes('FROM site_settings')) return overrides[this.values[0]] ? { value: overrides[this.values[0]] } : null;
          if (sql.includes('FROM customer_oidc_sessions')) {
            return {
              token_hash: 'test-session-hash',
              subject: 'customer-1',
              tenant_id: 'tenant-1',
              email: 'customer@example.test',
              name: 'Test Customer',
              microsoft_object_id: 'object-1',
            };
          }
          if (sql.includes('FROM profiles')) return { ...VERIFIED_ADULT_PROFILE };
          const id = this.values[0];
          const details = PLAN_DETAILS[id];
          if (!details || !sql.includes('FROM service_plans')) return null;
          return {
            id,
            plan_name: details[0],
            plan_type: details[2] === 'organisation' ? 'Business monthly subscription' : 'Standard monthly subscription',
            price_label: `£${(details[1] / 100).toFixed(2)}`,
            price_pence: details[1],
            stripe_product_id: `prod_${id}`,
            stripe_price_id: `price_${id}`,
            is_active: 1,
          };
        },
      };
      return statement;
    },
  };
}

function installFetchMock(captureCheckout) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const address = String(url);
    if (address.includes('/api/platform/access/decision')) {
      return Response.json({
        customer: { customerNumber: '1000000001' },
        access: {
          decision: 'allow',
          revokeSessions: false,
          reason: 'Valid Head Office 16+ age assurance is held.',
          restrictions: [],
          ageAssurance: {
            contractVersion: 'ja-head-office-age-assurance-v1',
            configured: true,
            deploymentKey: 'PLANYX',
            platformCode: 'PLANYX',
            status: 'enabled',
            masterEnabled: true,
            enforcementActive: true,
            required: true,
            satisfied: true,
            decision: 'allow',
            minimumAge: 16,
            accountPopulation: 'customers_only',
            staffAccountsExcluded: true,
            evidence: { confirmedMinimumAge: 16, validUntil: '2027-07-30T00:00:00.000Z' },
          },
        },
      });
    }
    captureCheckout(String(options?.body || ''));
    return new Response(JSON.stringify({ url: 'https://checkout.stripe.test/session' }), { status: 200 });
  };
  return () => { globalThis.fetch = originalFetch; };
}

test('Admin-edited service plan Price ID takes priority over a legacy Explore override', async () => {
  let checkoutBody = '';
  const restore = installFetchMock(value => { checkoutBody = value; });
  try {
    const response = await onRequestGet({
      request: signedInRequest('https://planyx.example/create-checkout-session?plan=personal'),
      env: {
        DB: database({ toggle_payments: 'true', stripe_price_personal_override: 'price_legacy_explore' }),
        STRIPE_SECRET_KEY: 'sk_test',
        STRIPE_PRICE_EXPLORE: 'price_secret_explore',
        ...OIDC_ENV,
      },
    });
    assert.equal(response.status, 303);
    assert.equal(new URLSearchParams(checkoutBody).get('line_items[0][price]'), 'price_personal');
  } finally {
    restore();
  }
});

for (const [plan, details] of Object.entries(PLAN_DETAILS)) {
  test(`${plan} checkout includes trial, Head Office age assurance and correct account catalogue metadata`, async () => {
    let checkoutBody = '';
    const restore = installFetchMock(value => { checkoutBody = value; });
    try {
      const response = await onRequestGet({
        request: signedInRequest(`https://planyx.example/create-checkout-session?plan=${plan}&accountType=${details[2]}`),
        env: {
          DB: database({ toggle_payments: 'true' }),
          STRIPE_SECRET_KEY: 'sk_test',
          ...OIDC_ENV,
        },
      });
      assert.equal(response.status, 303);
      const params = new URLSearchParams(checkoutBody);
      assert.equal(params.get('mode'), 'subscription');
      assert.equal(params.get('line_items[0][price]'), `price_${plan}`);
      assert.equal(params.get('subscription_data[trial_period_days]'), '30');
      assert.equal(params.get('subscription_data[metadata][plan_code]'), plan);
      assert.equal(params.get('subscription_data[metadata][account_type]'), details[2]);
      assert.equal(params.get('subscription_data[metadata][catalogue]'), details[2] === 'organisation' ? 'business' : 'standard');
      assert.equal(params.get('subscription_data[metadata][age_band]'), '18+');
      assert.equal(params.get('subscription_data[metadata][age_assurance_authority]'), 'HEAD_OFFICE');
      assert.equal(params.get('subscription_data[metadata][age_assurance_threshold]'), '16');
    } finally {
      restore();
    }
  });
}

function signedInRequest(url) {
  return new Request(url, { headers: { cookie: 'ja_customer_oidc_session=test-session' } });
}
