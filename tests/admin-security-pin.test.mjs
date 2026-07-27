import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('administrator CRM PIN uses a correctly delimited HMAC and audited lockout controls', async () => {
  const endpoint = await read('functions/api/admin/pin.js');
  assert.match(endpoint, /adminPinMac/);
  assert.match(endpoint, /\["hmac_sha256", salt, await adminPinMac\(env, pin, salt\)\]\.join\("\$"\)/);
  assert.match(endpoint, /function parseAdminPinHash/);
  assert.match(endpoint, /parsed\.legacy/);
  assert.doesNotMatch(endpoint, /const pinHash = `hmac_sha256\$\{salt\}/);
  assert.doesNotMatch(endpoint, /pin\s+TEXT/);
  assert.match(endpoint, /ADMIN_OIDC_CLIENT_SECRET/);
  assert.match(endpoint, /MAX_ATTEMPTS = 5/);
  assert.match(endpoint, /LOCK_MINUTES = 15/);
  assert.match(endpoint, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(endpoint, /admin_pin_verification_failed/);
  assert.match(endpoint, /admin_pin_verified/);
});

test('Admin Portal requires the personal PIN after Microsoft authentication', async () => {
  const layout = await read('src/components/AdminLayout.tsx');
  assert.match(layout, /if \(!pinState\.unlocked\)/);
  assert.match(layout, /Enter your personal four-digit PIN to continue after Microsoft sign-in/);
  assert.match(layout, /Create your personal four-digit PIN/);
  assert.match(layout, /\/api\/admin\/pin/);
  assert.match(layout, /The Admin Centre remains securely locked/);
  assert.doesNotMatch(layout, /false && !pinState\.unlocked/);
});

test('Customer CRM verification is scoped to the exact administrator and customer', async () => {
  const endpoint = await read('functions/api/admin/customer-verification.js');
  const legacyMiddleware = await read('functions/admin/_middleware.js');
  const governedMiddleware = await read('functions/api/admin/_middleware.js');
  const runtime = await read('static/assets/customer-crm-verification.js');
  const index = await read('index.html');

  assert.match(endpoint, /lower\(customer_email\)=lower\(\?\) AND lower\(admin_email\)=lower\(\?\)/);
  assert.match(endpoint, /requiresPinPerCustomer: true/);
  assert.match(endpoint, /verifyScopedAdminPin/);
  assert.match(endpoint, /customer-specific CRM action/);
  assert.match(endpoint, /UPDATE customer_identity_verification_sessions SET ended_at=CURRENT_TIMESTAMP/);
  assert.match(legacyMiddleware, /\["admin_pin_override", "override_identity_lock"\]/);
  assert.match(legacyMiddleware, /GOVERNED_VERIFICATION_REQUIRED/);
  assert.match(governedMiddleware, /CUSTOMER_SCOPE_MISMATCH/);
  assert.match(governedMiddleware, /requestRow\.customer_email/);
  assert.match(runtime, /Fresh verification per customer/);
  assert.match(runtime, /re-enter your own PIN/i);
  assert.match(index, /customer-crm-verification\.js\?v=1/);
  assert.match(index, /customer-crm-verification\.css\?v=1/);
});

test('Customer CRM override requires structured justification and independent approval for lower roles', async () => {
  const endpoint = await read('functions/api/admin/customer-verification.js');
  const runtime = await read('static/assets/customer-crm-verification.js');

  assert.match(endpoint, /const REASONS = \[/);
  assert.match(endpoint, /const CHANNELS = \[/);
  assert.match(endpoint, /reasonDetail\.length < 20/);
  assert.match(endpoint, /You cannot approve your own override request/);
  assert.match(endpoint, /An active supervisor approval is required/);
  assert.match(endpoint, /status='Consumed'/);
  assert.match(endpoint, /reviewed_by/);
  assert.match(endpoint, /approved_until/);
  assert.match(runtime, /Override reason/);
  assert.match(runtime, /Support or investigation channel/);
  assert.match(runtime, /Professional justification/);
  assert.match(runtime, /Request supervisor approval/);
  assert.match(runtime, /Supervisor review note/);
});

test('Support PIN failures have an enforced customer lockout with alternate recovery routes', async () => {
  const middleware = await read('functions/api/admin/_middleware.js');
  assert.match(middleware, /attempts >= 3/);
  assert.match(middleware, /15 \* 60 \* 1000/);
  assert.match(middleware, /SUPPORT_PIN_LOCKED/);
  assert.match(middleware, /registered-email code or a governed supervisor override/);
  assert.match(middleware, /customer_support_pin_locked/);
  assert.match(middleware, /verify_email_code", "authorise_override/);
});

test('registered-email support codes are hashed, one-time, rate-limited and honestly labelled', async () => {
  const endpoint = await read('functions/api/admin/customer-verification.js');
  assert.match(endpoint, /customer_support_email_codes/);
  assert.match(endpoint, /code_hash TEXT NOT NULL/);
  assert.match(endpoint, /randomSixDigitCode/);
  assert.match(endpoint, /Wait one minute before sending another code/);
  assert.match(endpoint, /Too many codes have been sent/);
  assert.match(endpoint, /max_attempts INTEGER NOT NULL DEFAULT 5/);
  assert.match(endpoint, /status='Verified'/);
  assert.match(endpoint, /Registered-email support verification; not account MFA/);
  assert.doesNotMatch(endpoint, /metadata[^\n]*code\b/);
});

test('Security Centre lets each administrator create or replace their own CRM PIN', async () => {
  const security = await read('src/pages/admin/security.tsx');
  assert.match(security, /Administrator CRM override PIN/);
  assert.match(security, /action: directorPinStatus\.configured \? 'reset' : 'setup'/);
  assert.match(security, /every administrator/);
  assert.match(security, /It never controls Admin Portal sign-in/);
});

test('all authorised CRM staff may own a PIN while override approval remains role-governed', async () => {
  const legacyApi = await read('functions/admin/api.js');
  const governedApi = await read('functions/api/admin/customer-verification.js');
  assert.match(legacyApi, /eligible: true/);
  assert.match(legacyApi, /action === "setup" \|\| action === "reset"/);
  assert.match(governedApi, /canApprove/);
  assert.match(governedApi, /approve_crm_identity_override/);
  assert.match(governedApi, /Platform Owner/);
  assert.match(governedApi, /Senior Administrator/);
});
