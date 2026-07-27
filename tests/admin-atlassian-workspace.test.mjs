import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Admin Support is a live openable PXCS request workspace', async () => {
  const page = await read('src/pages/admin/support.tsx');
  assert.match(page, /Customer Service Workspace/);
  assert.match(page, /Request queue/);
  assert.match(page, /Open request/);
  assert.match(page, /openRequest\(request\.issueKey\)/);
  assert.match(page, /\/admin\/support\?request=/);
  assert.match(page, /Back to request queue/);
  assert.match(page, /Request details/);
  assert.match(page, /Status history/);
  assert.match(page, /Public reply/);
  assert.match(page, /Internal note/);
  assert.match(page, /Open in Atlassian/);
  assert.match(page, /\/admin\/users\/\$\{encodeURIComponent\(detail\.request\.reporter\.email\)\}/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
});

test('PXCS request details still open when optional conversation or status history APIs fail', async () => {
  const client = await read('functions/_shared/atlassian-workspace.js');
  assert.match(client, /Promise\.allSettled/);
  assert.match(client, /warningFromFailure\("conversation"/);
  assert.match(client, /warningFromFailure\("status_history"/);
  assert.match(client, /Atlassian returned no request data/);
  assert.match(client, /does not belong to the configured PXCS service desk/);
  assert.match(client, /Number\(error\?\.status \|\| 0\) !== 400/);
});

test('PXCS workspace uses protected Atlassian request, comment and status APIs', async () => {
  const client = await read('functions/_shared/atlassian-workspace.js');
  assert.match(client, /api\.atlassian\.com\/ex\/jira/);
  assert.match(client, /\/rest\/servicedeskapi\/request\?\$\{params\.toString\(\)\}/);
  assert.match(client, /requestStatus/);
  assert.match(client, /OPEN_REQUESTS/);
  assert.match(client, /CLOSED_REQUESTS/);
  assert.match(client, /ALL_REQUESTS/);
  assert.match(client, /\/comment\?\$\{commentParams\.toString\(\)\}/);
  assert.match(client, /\/status\?start=0&limit=50/);
  assert.match(client, /body: \{ body, public: input\.public !== false \}/);
  assert.doesNotMatch(client, /console\.(?:log|error)\([^\n]*apiToken/);
});

test('PXCS workspace endpoint requires an admin session and records replies', async () => {
  const endpoint = await read('functions/api/admin/atlassian-workspace.js');
  assert.match(endpoint, /getNativeSession\(context\.request, context\.env, "admin"\)/);
  assert.match(endpoint, /assertSameOrigin/);
  assert.match(endpoint, /Administrator access is required/);
  assert.match(endpoint, /listAtlassianWorkspaceRequests/);
  assert.match(endpoint, /getAtlassianWorkspaceRequest/);
  assert.match(endpoint, /addAtlassianWorkspaceComment/);
  assert.match(endpoint, /pxcs_public_reply_added/);
  assert.match(endpoint, /pxcs_internal_note_added/);
  assert.doesNotMatch(endpoint, /apiToken\s*:/);
});
