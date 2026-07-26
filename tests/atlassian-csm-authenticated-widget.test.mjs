import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest, onRequestPost } from '../functions/csm-widget-token.js';

const ORIGIN = 'https://planyx.jagroupservices.co.uk';
const CUSTOMER_EMAIL = 'verified.customer@example.com';
const CLIENT_ID = 'csm-client-id';
const CLIENT_SECRET = 'csm-client-secret-for-tests';

function decodeBase64Url(value) {
  const normalised = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalised.padEnd(normalised.length + ((4 - normalised.length % 4) % 4), '='), 'base64');
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function customerSessionDb(email = CUSTOMER_EMAIL) {
  return {
    prepare(sql) {
      assert.match(sql, /customer_oidc_sessions/);
      return {
        bind(tokenHash) {
          assert.match(String(tokenHash), /^[a-f0-9]{64}$/);
          return {
            async first() {
              return {
                token_hash: tokenHash,
                subject: 'customer-subject',
                tenant_id: 'customer-tenant',
                email,
                name: 'Verified Customer',
                microsoft_object_id: 'customer-object-id',
              };
            },
          };
        },
      };
    },
  };
}

function environment(overrides = {}) {
  return {
    DB: customerSessionDb(),
    CUSTOMER_OIDC_ISSUER: 'https://login.example.com/customer/v2.0',
    CUSTOMER_OIDC_CLIENT_ID: 'customer-oidc-client',
    CUSTOMER_OIDC_CLIENT_SECRET: 'customer-oidc-secret',
    CSM_WIDGET_CLIENT_ID: CLIENT_ID,
    CSM_WIDGET_CLIENT_SECRET: CLIENT_SECRET,
    ...overrides,
  };
}

function request({ method = 'POST', origin = ORIGIN, cookie = 'ja_customer_oidc_session=verified-session-token' } = {}) {
  const headers = new Headers({ Accept: 'application/json' });
  if (origin) headers.set('Origin', origin);
  if (cookie) headers.set('Cookie', cookie);
  return new Request(`${ORIGIN}/csm-widget-token`, { method, headers });
}

test('signed-in customers receive an Atlassian access token minted from their verified session email', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let exchangeCalled = false;

  globalThis.fetch = async (url, options) => {
    exchangeCalled = true;
    assert.equal(String(url), 'https://auth.atlassian.com/oauth/token');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded');

    const form = new URLSearchParams(options.body);
    assert.equal(form.get('client_id'), CLIENT_ID);
    assert.equal(form.get('client_secret'), CLIENT_SECRET);
    assert.equal(form.get('scope'), 'csm:atlassian-internal');
    assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');

    const assertion = form.get('assertion');
    const parts = assertion.split('.');
    assert.equal(parts.length, 3);
    assert.deepEqual(JSON.parse(decodeBase64Url(parts[0]).toString('utf8')), { alg: 'HS256', typ: 'JWT' });

    const payload = JSON.parse(decodeBase64Url(parts[1]).toString('utf8'));
    assert.equal(payload.sub, CUSTOMER_EMAIL);
    assert.equal(payload.iss, CLIENT_ID);
    assert.equal(payload.exp - payload.iat, 60);
    assert.ok(payload.iat <= Math.floor(Date.now() / 1000));

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(CLIENT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    assert.equal(parts[2], encodeBase64Url(new Uint8Array(signature)));

    return new Response(JSON.stringify({ access_token: 'atlassian-access-token', expires_in: 3600 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const response = await onRequestPost({ request: request(), env: environment() });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /^application\/json/);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    assert.equal(response.headers.get('vary'), 'Cookie');
    assert.deepEqual(await response.json(), { access_token: 'atlassian-access-token' });
    assert.equal(exchangeCalled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('signed-out visitors cannot mint a personalised widget token', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let exchangeCalled = false;
  globalThis.fetch = async () => {
    exchangeCalled = true;
    throw new Error('Atlassian exchange must not run for signed-out visitors.');
  };

  try {
    const response = await onRequestPost({
      request: request({ cookie: '' }),
      env: environment(),
    });
    assert.equal(response.status, 401);
    assert.equal(exchangeCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the token endpoint rejects cross-origin requests and missing server credentials', { concurrency: false }, async () => {
  const crossOrigin = await onRequestPost({
    request: request({ origin: 'https://malicious.example' }),
    env: environment(),
  });
  assert.equal(crossOrigin.status, 403);

  const missingCredentials = await onRequestPost({
    request: request(),
    env: environment({ CSM_WIDGET_CLIENT_ID: '', CSM_WIDGET_CLIENT_SECRET: '' }),
  });
  assert.equal(missingCredentials.status, 501);
});

test('the token route accepts POST only', async () => {
  const response = await onRequest({ request: request({ method: 'GET', origin: '' }), env: environment() });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'POST');
});
