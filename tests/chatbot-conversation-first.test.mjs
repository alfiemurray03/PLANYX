import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('runtime uses the Head Office controlled Planyx support assistant', async () => {
  const runtime = await read('src/components/AIHelpChatbotRuntime.tsx');
  const client = await read('src/components/CentralCustomerServiceChatbot.tsx');
  const bridge = await read('functions/api/customer-service/[[path]].js');
  const shared = await read('functions/_shared/customer-service-centre.js');

  assert.match(runtime, /import CentralCustomerServiceChatbot from '\.\/CentralCustomerServiceChatbot'/);
  assert.match(runtime, /return <CentralCustomerServiceChatbot config=\{config\} \/>/);
  assert.match(runtime, /window\.location\.pathname\.startsWith\('\/admin'\)/);
  assert.match(runtime, /window\.location\.pathname\.startsWith\('\/reseller'\)/);
  assert.match(runtime, /if \(config\.maintenanceEnabled\) return <MaintenanceWidget config=\{config\} \/>/);
  assert.doesNotMatch(runtime, /AtlassianCustomerServiceWidget/);
  assert.doesNotMatch(runtime, /tawk\.to/i);

  assert.match(client, /Planyx Support Assistant/);
  assert.match(client, /Head Office/);
  assert.match(client, /request_human/);
  assert.doesNotMatch(client, /atlassian/i);
  assert.doesNotMatch(client, /jira/i);
  assert.doesNotMatch(client, /tawk/i);

  assert.match(bridge, /centralCustomerServiceEnabled/);
  assert.match(bridge, /ensureCentralConversation/);
  assert.match(shared, /HEAD_OFFICE_SUPPORT_CENTRE_ENABLED/);
  assert.match(shared, /CUSTOMEROPS_API_KEY/);
  assert.match(shared, /\/api\/v1\/platform\/support\//);
});

test('retired third-party chat services are absent from the website shell', async () => {
  const sourceShell = await read('index.html');
  const publicShell = await read('public/index.html');

  for (const shell of [sourceShell, publicShell]) {
    assert.doesNotMatch(shell, /embed\.tawk\.to/i);
    assert.doesNotMatch(shell, /Tawk_API/i);
    assert.doesNotMatch(shell, /atlassian/i);
    assert.doesNotMatch(shell, /jira/i);
  }
});
