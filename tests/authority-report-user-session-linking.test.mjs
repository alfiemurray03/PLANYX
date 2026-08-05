import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Authority reporting searches customers administrators and tracked identities by name or email', async () => {
  const api = await read('functions/api/admin/authority-user-search.js');
  const panel = await read('src/components/admin/AuthorityReportLinkingPanel.tsx');
  assert.match(api, /SELECT \* FROM profiles/);
  assert.match(api, /SELECT \* FROM admin_users/);
  assert.match(api, /FROM auth_sessions/);
  assert.match(api, /display_name/);
  assert.match(api, /verified_name/);
  assert.match(api, /linked_user_name/);
  assert.match(api, /recordType: "Administrator"/);
  assert.match(panel, /Search and link a Sousa Murray Planeia user/);
  assert.match(panel, /Name, email address or organisation/);
  assert.match(panel, /authority-user-search\?q=/);
  assert.match(panel, /Link selected details/);
});

test('Billing address prefers Stripe and safely falls back to the saved account address', async () => {
  const api = await read('functions/api/admin/authority-user-search.js');
  assert.match(api, /stripeBillingAddress/);
  assert.match(api, /https:\/\/api\.stripe\.com\/v1\/customers/);
  assert.match(api, /Stripe billing address/);
  assert.match(api, /Saved Sousa Murray Planeia account address/);
  assert.match(api, /street_address/);
  assert.match(api, /postcode/);
});

test('Responsible force and nearest station use postcode coordinates and official Police.uk data', async () => {
  const api = await read('functions/api/admin/authority-report-context.js');
  assert.match(api, /https:\/\/api\.postcodes\.io\/postcodes/);
  assert.match(api, /locate-neighbourhood\?q=/);
  assert.match(api, /distanceMiles/);
  assert.match(api, /collectForceStations/);
  assert.match(api, /distanceMiles:\s*distance === null/);
  assert.match(api, /Dist.*postcode centroid|postcode centroid/i);
});

test('Multiple user sessions are attached through a junction table and evidence holds', async () => {
  const api = await read('functions/api/admin/authority-report-context.js');
  const embedded = await read('src/components/admin/EmbeddedAuthorityReportLinking.tsx');
  assert.match(api, /CREATE TABLE IF NOT EXISTS authority_report_sessions/);
  assert.match(api, /UNIQUE\(report_id, session_id\)/);
  assert.match(api, /action === "sync_sessions"/);
  assert.match(api, /legal_hold=1/);
  assert.match(api, /Evidence hold applied by authority report/);
  assert.match(embedded, /session_ids: context\.sessions\.map/);
  assert.match(embedded, /Linked Sousa Murray Planeia sessions:/);
  assert.match(embedded, /investigation_context/);
});

test('User linking is embedded inside section two rather than shown as a floating drawer', async () => {
  const route = await read('src/pages/admin/authority-reporting-route.tsx');
  const embedded = await read('src/components/admin/EmbeddedAuthorityReportLinking.tsx');
  assert.match(route, /<EmbeddedAuthorityReportLinking\s*\/>/);
  assert.match(embedded, /createPortal/);
  assert.match(embedded, /getElementById\('user-email'\)\?\.closest\('section'\)/);
  assert.match(embedded, /authority-linking-inline-root/);
  assert.match(embedded, /setInput\('user-email'/);
  assert.match(embedded, /setInput\('user-name'/);
  assert.match(embedded, /setInput\('session-reference'/);
  assert.match(embedded, /linked_session_id: primary\?\.id/);
  assert.match(embedded, /assigned_station: context\.assignedStation/);
  assert.doesNotMatch(route, /fixed bottom-24/);
  assert.doesNotMatch(route, /Link user, sessions & police/);
});
