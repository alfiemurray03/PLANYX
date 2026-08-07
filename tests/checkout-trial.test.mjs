import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/create-checkout-session.js';

const PLAN_DETAILS = {
  personal: ['PLANEIA_EXPLORE', 'PLANEIA_EXPLORE_MONTHLY', 'individual'],
  standard: ['PLANEIA_PLAN', 'PLANEIA_PLAN_MONTHLY', 'individual'],
  professional: ['PLANEIA_COMPLETE', 'PLANEIA_COMPLETE_MONTHLY', 'individual'],
  org_starter: ['PLANEIA_TOGETHER', 'PLANEIA_TOGETHER_MONTHLY', 'individual'],
  business_personal: ['PLANEIA_BUSINESS_EXPLORE', 'PLANEIA_BUSINESS_EXPLORE_MONTHLY', 'organisation'],
  business_standard: ['PLANEIA_BUSINESS_PLAN', 'PLANEIA_BUSINESS_PLAN_MONTHLY', 'organisation'],
  business_professional: ['PLANEIA_BUSINESS_COMPLETE', 'PLANEIA_BUSINESS_COMPLETE_MONTHLY', 'organisation'],
  business_org_starter: ['PLANEIA_BUSINESS_TOGETHER', 'PLANEIA_BUSINESS_TOGETHER_MONTHLY', 'organisation'],
};

const OIDC_ENV = {
  CUSTOMER_OIDC_ISSUER: 'https://login.example.test/tenant/v2.0',
  CUSTOMER_OIDC_CLIENT_ID: 'client',
  CUSTOMER_OIDC_CLIENT_SECRET: 'secret',
  CUSTOMEROPS_BASE_URL: 'https://customerops.example.test',
  CUSTOMEROPS_API_KEY: 'platform-test-key-for-central-payments',
  SITE_URL: 'https://sousamurrayplaneia.jagroupservices.co.uk',
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
          return null;
        },
      };
      return statement;
    },
  };
}

function installFetchMock(onCentralCheckout) {
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
    if (address.includes('/api/v1/payments/checkout')) {
      const payload = JSON.parse(String(options?.body || '{}'));
      onCentralCheckout(payload, options?.headers || {});
      return Response.json({
        checkout: {
          reference: 'cp-test-1',
          sessionId: 'cs_test_central',
          url: 'https://checkout.stripe.test/session',
          mode: 'subscription',
          trialPeriodDays: 30,
        },
      }, { status: 201 });
    }
    throw new Error(`Unexpected request in checkout regression: ${address}`);
  };
  return () => { globalThis.fetch = originalFetch; };
}

for (const [plan, details] of Object.entries(PLAN_DETAILS)) {
  test(`${plan} checkout is delegated to Head Office Central Payments with the governed catalogue code`, async () => {
    let checkoutPayload = null;
    let checkoutHeaders = null;
    const restore = installFetchMock((payload, headers) => {
      checkoutPayload = payload;
      checkoutHeaders = headers;
    });
    try {
      const response = await onRequestGet({
        request: signedInRequest(`https://sousamurrayplaneia.jagroupservices.co.uk/create-checkout-session?plan=${plan}&accountType=${details[2]}`),
        env: {
          DB: database({ toggle_payments: 'true' }),
          ...OIDC_ENV,
        },
      });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), 'https://checkout.stripe.test/session');
      assert.ok(checkoutPayload, 'The site must call Head Office Central Payments.');
      assert.equal(checkoutPayload.brand, 'SOUSA_MURRAY_PLANEIA');
      assert.equal(checkoutPayload.customerNumber, '1000000001');
      assert.equal(checkoutPayload.productCode, details[0]);
      assert.equal(checkoutPayload.priceCode, details[1]);
      assert.match(checkoutPayload.orderReference, /^PLANEIA-/);
      assert.equal(checkoutPayload.serviceReference, `${details[2]}:${plan}`);
      assert.equal(checkoutPayload.successUrl, 'https://sousamurrayplaneia.jagroupservices.co.uk/payment-success/?central_payment=success');
      assert.equal(checkoutPayload.cancelUrl, 'https://sousamurrayplaneia.jagroupservices.co.uk/pricing/?payment=cancelled');
      assert.match(String(checkoutHeaders.Authorization || checkoutHeaders.authorization || ''), /^Bearer platform-test-key-for-central-payments$/);
      assert.equal('stripePriceId' in checkoutPayload, false, 'The website must never submit an arbitrary Stripe Price ID.');
    } finally {
      restore();
    }
  });
}

test('Planeia checkout no longer requires a site-level Stripe secret or Price ID override', async () => {
  let checkoutPayload = null;
  const restore = installFetchMock(payload => { checkoutPayload = payload; });
  try {
    const response = await onRequestGet({
      request: signedInRequest('https://sousamurrayplaneia.jagroupservices.co.uk/create-checkout-session?plan=personal'),
      env: {
        DB: database({ toggle_payments: 'true', stripe_price_personal_override: 'price_legacy_must_not_be_used' }),
        ...OIDC_ENV,
      },
    });
    assert.equal(response.status, 303);
    assert.equal(checkoutPayload.priceCode, 'PLANEIA_EXPLORE_MONTHLY');
    assert.doesNotMatch(JSON.stringify(checkoutPayload), /price_legacy_must_not_be_used|sk_(?:test|live)/);
  } finally {
    restore();
  }
});

function signedInRequest(url) {
  return new Request(url, { headers: { cookie: 'ja_customer_oidc_session=test-session' } });
}
