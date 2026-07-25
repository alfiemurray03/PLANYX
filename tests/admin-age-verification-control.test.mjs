import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Admin Centre has a dedicated age verification control page and protected API', async () => {
  const app = await read('src/App.tsx');
  const page = await read('src/pages/admin/age-verification.tsx');
  const api = await read('functions/api/admin/age-verification.js');

  assert.match(app, /AdminAgeVerificationPage/);
  assert.match(app, /path:\s*'\/admin\/age-verification'/);
  assert.match(page, /Age Verification Control Centre/);
  assert.match(page, /\/api\/admin\/age-verification/);
  assert.match(page, /Service/);
  assert.match(page, /Design/);
  assert.match(page, /Provider/);
  assert.match(page, /Safeguards & governance/);
  assert.match(page, /Diagnostics/);
  assert.match(page, /Events/);
  assert.match(page, /Customer preview/);
  assert.match(page, /Administrator session needs refreshing/);

  assert.match(api, /getNativeSession\(request, env, "admin"\)/);
  assert.match(api, /SESSION_EXPIRED/);
  assert.doesNotMatch(api, /getAccessIdentity/);
  assert.match(api, /isSameOriginRequest/);
  assert.match(api, /manage_age_verification/);
  assert.match(api, /admin_audit_log/);
});

test('Age verification safe-off mode pauses registrations rather than bypassing the minimum age', async () => {
  const controls = await read('functions/_shared/age-verification-settings.js');
  const agePage = await read('functions/age-check.js');
  const middleware = await read('functions/_shared/age-gate-middleware.js');

  assert.match(controls, /const MINIMUM_AGE = 16/);
  assert.match(controls, /minorSafeguardsLocked:\s*true/);
  assert.match(controls, /requestedStatus === "off"[^\n]+"paused"/);
  assert.match(controls, /Independent provider mode cannot go live/);
  assert.match(agePage, /Safe registration pause/);
  assert.match(agePage, /No unverified account can be created/);
  assert.match(middleware, /age_verification_unavailable/);
  assert.match(middleware, /Unverified customer access is currently blocked/);
});

test('16-17 safeguards and legal governance controls cannot be silently disabled', async () => {
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

test('Independent provider secrets are never exposed or editable in the Admin browser', async () => {
  const controls = await read('functions/_shared/age-verification-settings.js');
  const page = await read('src/pages/admin/age-verification.tsx');
  const callback = await read('functions/account/auth/callback.js');

  assert.match(controls, /AGE_PROVIDER_API_KEY/);
  assert.match(controls, /AGE_PROVIDER_WEBHOOK_SECRET/);
  assert.doesNotMatch(controls, /apiKey:\s*clean/);
  assert.match(page, /Secrets are read from Cloudflare and are never returned to the browser/);
  assert.doesNotMatch(page, /type="password"[^>]+AGE_PROVIDER_API_KEY/);
  assert.match(callback, /provider_result_missing/);
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
