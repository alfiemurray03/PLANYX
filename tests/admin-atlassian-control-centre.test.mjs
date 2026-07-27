import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Admin Centre exposes a dedicated Support Operations Centre', async () => {
  const [routes, layout, page] = await Promise.all([
    read('src/routes.tsx'),
    read('src/components/AdminLayoutStable.tsx'),
    read('src/pages/admin/atlassian-support.tsx'),
  ]);

  assert.match(routes, /AdminAtlassianSupportPage/);
  assert.match(routes, /path: '\/admin\/atlassian-support'/);
  assert.match(layout, /Atlassian Support/);
  assert.match(layout, /href: '\/admin\/atlassian-support'/);
  assert.match(page, /Support Operations Centre/);
  assert.match(page, /Raise request/);
  assert.match(page, /Queue & history/);
  assert.match(page, /Guided connection diagnostics/);
  assert.match(page, /Integration controls/);
  assert.match(page, /action: 'retry'/);
  assert.match(page, /action: 'retry_all_failed'/);
});

test('Atlassian controls persist safely and do not expose the API token', async () => {
  const [endpoint, client] = await Promise.all([
    read('functions/api/admin/atlassian-connection.js'),
    read('functions/_shared/atlassian-support.js'),
  ]);

  assert.match(endpoint, /action === "save_settings"/);
  assert.match(endpoint, /action === "test_connection" \|\| action === "run_diagnostics"/);
  assert.match(endpoint, /action === "retry"/);
  assert.match(endpoint, /action === "retry_all_failed"/);
  assert.match(endpoint, /tokenConfigured: Boolean\(config\.apiToken\)/);
  assert.doesNotMatch(endpoint, /apiToken:\s*config\.apiToken/);
  assert.match(client, /CREATE TABLE IF NOT EXISTS atlassian_support_settings/);
  assert.match(client, /auth_mode TEXT DEFAULT 'auto'/);
  assert.match(client, /sync_customers INTEGER DEFAULT 0/);
  assert.match(client, /if \(!settings\.enabled && !force\)/);
  assert.match(client, /settings\.routingMode === "auto"/);
});
