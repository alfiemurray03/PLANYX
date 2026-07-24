import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Sessions and Reports routes use dedicated readable Admin Centre pages', async () => {
  const operational = await read('src/pages/admin/operational-section.tsx');
  assert.match(operational, /import AdminSessionsPage from '@\/pages\/admin\/sessions'/);
  assert.match(operational, /import AdminAuthorityReportingPage from '@\/pages\/admin\/authority-reporting'/);
  assert.match(operational, /if \(isSessions\) return <AdminSessionsPage/);
  assert.match(operational, /if \(isAuthorityReporting\) return <AdminAuthorityReportingPage/);
  assert.match(operational, /Session & Sign-in Centre/);
  assert.match(operational, /Authority Reporting Centre/);
});

test('Session page is human-readable and never renders a raw session token hash', async () => {
  const page = await read('src/pages/admin/sessions.tsx');
  assert.match(page, /Understand who signed in, when and from where/);
  assert.match(page, /deviceSummary/);
  assert.match(page, /Open linked user/);
  assert.match(page, /Create authority report/);
  assert.match(page, /Apply evidence hold/);
  assert.match(page, /Session chronology/);
  assert.match(page, /masked one-way fingerprint/);
  assert.doesNotMatch(page, /TOKEN HASH/);
  assert.doesNotMatch(page, /token_hash/);
});

test('Unified session tracking links verified identities and audits sign-in, activity and sign-out', async () => {
  const tracking = await read('functions/_shared/session-tracking.js');
  const heartbeat = await read('functions/api/session-heartbeat.js');
  const adminContext = await read('src/lib/admin-context.tsx');
  const customerContext = await read('src/lib/auth-context.tsx');

  assert.match(tracking, /CREATE TABLE IF NOT EXISTS auth_sessions/);
  assert.match(tracking, /CREATE TABLE IF NOT EXISTS auth_session_events/);
  assert.match(tracking, /resolveLinkedUser/);
  assert.match(tracking, /Admin email/);
  assert.match(tracking, /Microsoft object ID/);
  assert.match(tracking, /Sign-in recorded/);
  assert.match(tracking, /Session activity/);
  assert.match(tracking, /Sign-out recorded/);
  assert.match(tracking, /legal_hold/);
  assert.match(heartbeat, /getNativeSession\(context\.request, context\.env, "admin"\)/);
  assert.match(heartbeat, /getNativeSession\(context\.request, context\.env, "customer"\)/);
  assert.match(adminContext, /recordAdminSession\('heartbeat'\)/);
  assert.match(adminContext, /recordAdminSession\('logout'\)/);
  assert.match(customerContext, /recordCustomerSession\('heartbeat'\)/);
  assert.match(customerContext, /recordCustomerSession\('logout'\)/);
});

test('Successful Microsoft callbacks are audited before redirecting to the application', async () => {
  const helper = await read('functions/_shared/completed-login-audit.js');
  const adminCallback = await read('functions/admin/auth/callback.js');
  const customerCallback = await read('functions/account/auth/callback.js');
  assert.match(helper, /sessionCookieFromResponse/);
  assert.match(helper, /getNativeSession/);
  assert.match(helper, /recordSessionHeartbeat/);
  assert.match(adminCallback, /await recordCompletedLogin\(context, response, "admin"\)/);
  assert.match(customerCallback, /await recordCompletedLogin\(context, response, "customer"\)/);
});

test('Failed Microsoft sign-ins are stored without passwords, cookies or tokens', async () => {
  const audit = await read('functions/_shared/auth-attempt-audit.js');
  const adminCallback = await read('functions/admin/auth/callback.js');
  const customerCallback = await read('functions/account/auth/callback.js');
  assert.match(audit, /Sign-in failed/);
  assert.match(audit, /Unidentified sign-in attempt/);
  assert.match(audit, /Failure at \$\{stage\}/);
  assert.match(audit, /requestId/);
  assert.match(audit, /ipHash/);
  assert.doesNotMatch(audit, /password/i);
  assert.doesNotMatch(audit, /access_token/i);
  assert.match(adminCallback, /recordAuthenticationFailure/);
  assert.match(customerCallback, /recordAuthenticationFailure/);
});

test('Session Centre masks fingerprints, links profiles and preserves investigation evidence', async () => {
  const api = await read('functions/api/admin/session-centre.js');
  assert.match(api, /maskFingerprint/);
  assert.match(api, /profile_url/);
  assert.match(api, /Multiple active sessions/);
  assert.match(api, /User profile not linked/);
  assert.match(api, /set_legal_hold/);
  assert.match(api, /Evidence hold applied/);
  assert.match(api, /session_review/);
  assert.doesNotMatch(api, /token_hash:\s*row\.token_hash/);
});

test('Authority Reporting Centre provides guided builders and official escalation routes', async () => {
  const page = await read('src/pages/admin/authority-reporting.tsx');
  for (const text of [
    'Call 999',
    'Call 101 or report online',
    'Child safeguarding referral',
    'Adult safeguarding referral',
    'Personal data breach / ICO assessment',
    'Local authority / public protection referral',
    'Protect first, record second',
    'You do not need proof before reporting a genuine concern',
    'within 72 hours',
    'It does not submit the report',
  ]) assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(page, /https:\/\/www\.police\.uk/);
  assert.match(page, /https:\/\/www\.gov\.uk\/report-child-abuse/);
  assert.match(page, /https:\/\/ico\.org\.uk\/for-organisations\/report-a-breach/);
});

test('Authority reports have permanent references, chronology, audit and linked-session evidence holds', async () => {
  const api = await read('functions/api/admin/authority-reports.js');
  assert.match(api, /CREATE TABLE IF NOT EXISTS authority_reports/);
  assert.match(api, /CREATE TABLE IF NOT EXISTS authority_report_events/);
  assert.match(api, /AUTH-\$\{day\}-/);
  assert.match(api, /preserveLinkedSession/);
  assert.match(api, /Evidence hold applied by authority report/);
  assert.match(api, /authority_report_create/);
  assert.match(api, /authority_report_update/);
  assert.match(api, /external_reference/);
  assert.match(api, /staff_declaration/);
});

test('Authority report PDF is a formal internal pack and does not claim to notify an authority', async () => {
  const pdf = await read('src/lib/authority-report-pdf.ts');
  assert.match(pdf, /Planyx Authority Reporting Centre/);
  assert.match(pdf, /Emergency Police Incident Record/);
  assert.match(pdf, /Child Safeguarding Referral Record/);
  assert.match(pdf, /Personal Data Breach Assessment & ICO Report Pack/);
  assert.match(pdf, /does not itself notify the police/);
  assert.match(pdf, /doc\.save/);
});

test('Legacy authority URLs safely redirect into the dedicated Reports centre', async () => {
  const redirect = await read('functions/admin/authority-reporting.js');
  assert.match(redirect, /new URL\('\/admin\/reports'/);
  assert.match(redirect, /destination\.search = url\.search/);
  assert.match(redirect, /status: 302/);
});
