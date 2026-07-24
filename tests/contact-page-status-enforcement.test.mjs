import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('public support config publishes Contact maintenance and offline settings', async () => {
  const endpoint = await read('functions/api/support-assistant.js');

  assert.match(endpoint, /contactPageStatus:\s*contactStatusFrom\(settings\)/);
  assert.match(endpoint, /contactMaintenanceTitle:/);
  assert.match(endpoint, /contactMaintenanceReason:/);
  assert.match(endpoint, /contactMaintenanceMessage:/);
  assert.match(endpoint, /contactMaintenanceStart:/);
  assert.match(endpoint, /contactMaintenanceExpectedReturn:/);
  assert.match(endpoint, /contactOfflineMessage:/);
  assert.match(endpoint, /"Cache-Control": "no-store"/);
});

test('Contact route is protected during full and client-side navigation', async () => {
  const layout = await read('src/layouts/RootLayout.tsx');
  const gate = await read('src/components/ContactStatusGate.tsx');
  const middleware = await read('functions/_middleware.js');

  assert.match(layout, /isContactPage\(location\.pathname\)/);
  assert.match(layout, /<ContactStatusGate>\{children\}<\/ContactStatusGate>/);
  assert.match(gate, /contactPageStatus === 'online'/);
  assert.match(gate, /contactPageStatus === 'maintenance'/);
  assert.match(gate, /Contact Us is currently offline/);
  assert.match(gate, /cache: 'no-store'/);
  assert.match(middleware, /contactStatus !== "online"/);
});

test('Contact submission endpoint rejects maintenance, offline and disabled states', async () => {
  const worker = await read('src/worker.js');

  assert.match(worker, /loadContactAvailability\(env\)/);
  assert.match(worker, /availability\.status === 'maintenance'/);
  assert.match(worker, /availability\.status === 'offline'/);
  assert.match(worker, /!availability\.enabled/);
  assert.match(worker, /contact_page_status/);
  assert.match(worker, /contact_page_enabled/);
});
