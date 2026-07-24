import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('authority sessions render as neat selectable cards without stretched checkboxes', async () => {
  const panel = await read('src/components/admin/AuthorityReportLinkingPanel.tsx');

  assert.match(panel, /aria-pressed=\{selected\}/);
  assert.match(panel, /grid-cols-\[auto_minmax\(0,1fr\)\]/);
  assert.match(panel, /Session reference unavailable/);
  assert.match(panel, /Show all \$\{context\.user\.sessions\.length\} sessions/);
  assert.match(panel, /showAllSessions \? context\.user\.sessions : context\.user\.sessions\.slice\(0, 6\)/);

  assert.doesNotMatch(panel, /<input\s+type="checkbox"/);
  assert.doesNotMatch(panel, /max-h-96\s+space-y-2\s+overflow-y-auto/);
});

test('embedded authority controls prevent horizontal overflow and vertical letter wrapping', async () => {
  const panel = await read('src/components/admin/AuthorityReportLinkingPanel.tsx');

  assert.match(panel, /max-w-full overflow-x-hidden rounded-2xl/);
  assert.match(panel, /overflow-y-auto overflow-x-hidden/);
  assert.match(panel, /\[overflow-wrap:normal\]/);
  assert.match(panel, /min-w-0 overflow-hidden/);
  assert.match(panel, /break-words font-mono text-xs/);
});
