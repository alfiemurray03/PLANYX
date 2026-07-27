import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest, onRequestGet } from '../functions/csm-widget-session.js';

const ORIGIN = 'https://planyx.jagroupservices.co.uk';

function customerSessionDb(sessionRow) {
  return {
    prepare(sql) {
      assert.match(sql, /customer_oidc_sessions/);
      return {
        bind(tokenHash) {
          assert.match(String(tokenHash), /^[a-f0-9]{64}$/);
          return {
            async first() {
              return sessionRow ? { ...sessionRow, token_hash: tokenHash } : null;
            },
          };
        },
      };
    },
  };
}

function environment(sessionRow) {
  return {
    DB: customerSessionDb(sessionRow),
    CUSTOMER_OIDC_ISSUER: 'https://login.example.com/customer/v2.0',
    CUSTOMER_OIDC_CLIENT_ID: 'customer-oidc-client',
    CUSTOMER_OIDC_CLIENT_SECRET: 'customer-oidc-secret',
  };
}

function request({ method = 'GET', cookie = 'ja_customer_oidc_session=verified-session-token' } = {}) {
  const headers = new Headers({ Accept: 'application/json' });
  if (cookie) headers.set('Cookie', cookie);
  return new Request(`${ORIGIN}/csm-widget-session`, { method, headers });
}

test('the CSM mode endpoint recognises a validated customer session without returning identity data', async () => {
  const response = await onRequestGet({
    request: request(),
    env: environment({
      subject: 'customer-subject',
      tenant_id: 'customer-tenant',
      email: 'verified.customer@example.com',
      name: 'Verified Customer',
    }),
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.deepEqual(await response.json(), { authenticated: true });
});

test('the CSM mode endpoint returns public mode when no customer session is present', async () => {
  const response = await onRequestGet({
    request: request({ cookie: '' }),
    env: environment(null),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false });
});

test('the CSM mode endpoint is GET-only and fails closed when session storage is unavailable', async () => {
  const wrongMethod = await onRequest({
    request: request({ method: 'POST' }),
    env: environment(null),
  });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'GET');

  const unavailable = await onRequestGet({ request: request(), env: {} });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    authenticated: false,
    error: 'Customer authentication is temporarily unavailable.',
  });
});
