import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Admin Centre exposes a dedicated Atlassian Support Control Centre', async () => {
  const [routes, layout, page] = await Promise.all([
    read('src/routes.tsx'),
    read('src/components/AdminLayoutStable.tsx'),
    read('src/pages/admin/atlassian-support.tsx'),
  ]);

  assert.match(routes, /AdminAtlassianSupportPage/);
  assert.match(routes, /path: '\/admin\/atlassian-support'/);
  assert.match(layout, /Atlassian Support/);
  assert.match(layout, /href: '\/admin\/atlassian-support'/);
  assert.match(page, /Atlassian Support Control Centre/);
  assert.match(page, /Automatic Atlassian ticket creation/);
  assert.match(page, /Request classification/);
  assert.match(page, /Test connection/);
  assert.match(page, /Recent Atlassian deliveries/);
  assert.match(page, /action: 'retry'/);
});

test('Atlassian controls persist safely and do not expose the API token', async () => {
  const [endpoint, client] = await Promise.all([
    read('functions/api/admin/atlassian-connection.js'),
    read('functions/_shared/atlassian-support.js'),
  ]);

  assert.match(endpoint, /action === "save_settings"/);
  assert.match(endpoint, /action === "test_connection"/);
  assert.match(endpoint, /action === "retry"/);
  assert.match(endpoint, /tokenConfigured: Boolean\(config\.apiToken\)/);
  assert.doesNotMatch(endpoint, /apiToken:\s*config\.apiToken/);
  assert.match(client, /CREATE TABLE IF NOT EXISTS atlassian_support_settings/);
  assert.match(client, /enabled INTEGER NOT NULL DEFAULT 1/);
  assert.match(client, /routing_mode TEXT NOT NULL DEFAULT 'auto'/);
  assert.match(client, /if \(!settings\.enabled && !force\)/);
  assert.match(client, /settings\.routingMode === "auto"/);
});
