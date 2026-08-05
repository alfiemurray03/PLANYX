import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Admin Centre retains the protected legacy age-record workspace', async () => {
  const app = await read('src/App.tsx');
  const page = await read('src/pages/admin/age-verification.tsx');
  const api = await read('functions/api/admin/age-verification.js');

  assert.match(app, /AdminAgeVerificationPage/);
  assert.match(app, /path:\s*'\/admin\/age-verification'/);
  assert.match(page, /Age Verification Control Centre/);
  assert.match(page, /\/api\/admin\/age-verification/);
  assert.match(page, /Safeguards & governance/);
  assert.match(page, /Diagnostics/);
  assert.match(page, /Events/);
  assert.match(page, /Administrator session needs refreshing/);

  assert.match(api, /getNativeSession\(request, env, "admin"\)/);
  assert.match(api, /SESSION_EXPIRED/);
  assert.doesNotMatch(api, /getAccessIdentity/);
  assert.match(api, /isSameOriginRequest/);
  assert.match(api, /manage_age_verification/);
  assert.match(api, /admin_audit_log/);
});

test('Sousa Murray Planeia cannot use its retired self-declaration controls to bypass Head Office', async () => {
  const agePage = await read('functions/age-check.js');
  const login = await read('functions/account/login.js');
  const callback = await read('functions/account/auth/callback.js');
  const middleware = await read('functions/_shared/age-gate-middleware.js');

  assert.match(agePage, /retired Sousa Murray Planeia self-declaration token/);
  assert.match(agePage, /\/account\/login\?return_to=/);
  assert.doesNotMatch(agePage, /date_of_birth|createAgeAssurance|Safe registration pause/);
  assert.match(login, /beginLogin\(context, "customer"\)/);
  assert.doesNotMatch(login, /readAgeAssurance|age-verification-settings/);
  assert.match(callback, /syncCustomerWithHeadOffice/);
  assert.match(callback, /isHeadOfficeAgeStepUp/);
  assert.doesNotMatch(callback, /provider_result_missing|persistAgeAssurance|readAgeAssurance/);
  assert.match(middleware, /checkHeadOfficeAccess/);
  assert.match(middleware, /HEAD_OFFICE_AGE_ASSURANCE_REQUIRED/);
  assert.doesNotMatch(middleware, /profileAgeStatus|age_verification_unavailable/);
});

test('16-17 privacy fields and retained governance controls cannot be silently disabled', async () => {
  const controls = await read('functions/_shared/age-verification-settings.js');
  const page = await read('src/pages/admin/age-verification.tsx');

  for (const field of [
    'profile_visibility',
    'public_discovery_allowed',
    'profiling_allowed',
    'marketing_allowed',
    'precise_location_default',
    'safeguarding_review_required',
  ]) assert.match(await read('functions/_shared/age-assurance.js'), new RegExp(field));

  assert.match(page, /Minimum age: 16/);
  assert.match(page, /Mandatory 16–17 high-privacy safeguards/);
  assert.match(page, /DPIA \/ Children’s Code assessment reference/);
  assert.match(page, /Last legal\/compliance review/);
  assert.match(page, /cannot itself guarantee legal compliance/);
  assert.match(controls, /eventRetentionDays/);
});

test('provider secrets remain server-side while new enforcement uses the Head Office connector', async () => {
  const controls = await read('functions/_shared/age-verification-settings.js');
  const page = await read('src/pages/admin/age-verification.tsx');
  const callback = await read('functions/account/auth/callback.js');
  const central = await read('functions/_shared/customerops-central.js');

  assert.match(controls, /AGE_PROVIDER_API_KEY/);
  assert.match(controls, /AGE_PROVIDER_WEBHOOK_SECRET/);
  assert.doesNotMatch(controls, /apiKey:\s*clean/);
  assert.match(page, /Secrets are read from Cloudflare and are never returned to the browser/);
  assert.doesNotMatch(page, /type="password"[^>]+AGE_PROVIDER_API_KEY/);
  assert.match(callback, /syncCustomerWithHeadOffice/);
  assert.match(central, /requestHeadOfficeAgeAssuranceSession/);
  assert.doesNotMatch(callback, /AGE_PROVIDER_API_KEY|AGE_PROVIDER_WEBHOOK_SECRET/);
});

test('Age verification events exclude full dates of birth and sensitive provider material', async () => {
  const controls = await read('functions/_shared/age-verification-settings.js');
  const api = await read('functions/api/admin/age-verification.js');
  const page = await read('src/pages/admin/age-verification.tsx');

  assert.match(controls, /CREATE TABLE IF NOT EXISTS age_verification_events/);
  assert.doesNotMatch(controls, /date_of_birth TEXT/);
  assert.doesNotMatch(controls, /document_image/);
  assert.doesNotMatch(controls, /selfie/);
  assert.match(api, /non-persistent-admin-test/);
  assert.match(page, /Full DOBs, documents, selfies, cookies, tokens and provider secrets are never displayed here/);
});
