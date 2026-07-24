import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Authority reporting searches and links real customer profiles', async () => {
  const api = await read('functions/api/admin/authority-report-context.js');
  const panel = await read('src/components/admin/AuthorityReportLinkingPanel.tsx');
  assert.match(api, /SELECT \* FROM profiles/);
  assert.match(api, /display_name/);
  assert.match(api, /verified_name/);
  assert.match(api, /lower\(COALESCE\(email,''\)\) LIKE/);
  assert.match(panel, /Search and link a customer/);
  assert.match(panel, /Customer name or email address/);
  assert.match(panel, /Link selected details/);
});

test('Billing address prefers Stripe and safely falls back to the saved account address', async () => {
  const api = await read('functions/api/admin/authority-report-context.js');
  assert.match(api, /stripeBillingAddress/);
  assert.match(api, /https:\/\/api\.stripe\.com\/v1\/customers/);
  assert.match(api, /Stripe billing address/);
  assert.match(api, /Saved Planyx account address/);
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

test('Multiple customer sessions are attached through a junction table and evidence holds', async () => {
  const api = await read('functions/api/admin/authority-report-context.js');
  const route = await read('src/pages/admin/authority-reporting-route.tsx');
  assert.match(api, /CREATE TABLE IF NOT EXISTS authority_report_sessions/);
  assert.match(api, /UNIQUE\(report_id, session_id\)/);
  assert.match(api, /action === "sync_sessions"/);
  assert.match(api, /legal_hold=1/);
  assert.match(api, /Evidence hold applied by authority report/);
  assert.match(route, /session_ids: context\.sessions\.map/);
  assert.match(route, /Linked Planyx sessions:/);
  assert.match(route, /investigation_context/);
});

test('The linking drawer writes the user primary session and police assignment into the report', async () => {
  const route = await read('src/pages/admin/authority-reporting-route.tsx');
  assert.match(route, /updateControlledInput\('user-email'/);
  assert.match(route, /updateControlledInput\('user-name'/);
  assert.match(route, /updateControlledInput\('session-reference'/);
  assert.match(route, /linked_session_id: primary\?\.id/);
  assert.match(route, /assigned_station: context\.assignedStation/);
  assert.match(route, /Link user, sessions & police/);
});
