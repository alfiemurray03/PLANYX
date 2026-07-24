import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('Admin Centre mounts the global keyboard shortcut controller', async () => {
  const app = await read('src/App.tsx');
  assert.match(app, /import AdminKeyboardShortcuts from '@\/components\/AdminKeyboardShortcuts'/);
  assert.match(app, /<AdminKeyboardShortcuts\s*\/>/);
});

test('Admin shortcuts cover the agreed high-use pages', async () => {
  const source = await read('src/components/AdminKeyboardShortcuts.tsx');
  const expected = [
    ["'d'", '/admin/dashboard'],
    ["'c'", '/admin/users'],
    ["'p'", '/admin/plans'],
    ["'e'", '/admin/enquiries'],
    ["'b'", '/admin/builders'],
    ["'a'", '/admin/ai-chatbot'],
    ["'s'", '/admin/site-settings'],
    ["'h'", '/admin/health'],
  ];

  for (const [key, path] of expected) {
    assert.match(source, new RegExp(`key: ${key}[\\s\\S]{0,180}href: '${path.replaceAll('/', '\\/')}'`));
  }
});

test('Keyboard navigation is permission-aware and safe while typing', async () => {
  const source = await read('src/components/AdminKeyboardShortcuts.tsx');
  assert.match(source, /hasPermission\(admin, shortcut\.section\)/);
  assert.match(source, /\['INPUT', 'TEXTAREA', 'SELECT'\]\.includes\(target\.tagName\)/);
  assert.match(source, /target\.isContentEditable/);
  assert.match(source, /if \(isEditableTarget\(event\.target\)\) return/);
  assert.match(source, /if \(event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey\) return/);
});

test('G prefix, question-mark guide and Escape cancellation are implemented', async () => {
  const source = await read('src/components/AdminKeyboardShortcuts.tsx');
  assert.match(source, /if \(key === 'g'\)/);
  assert.match(source, /if \(event\.key === '\?'\)/);
  assert.match(source, /if \(event\.key === 'Escape'\)/);
  assert.match(source, /Press G, release it, then press the page letter/);
  assert.match(source, /Shortcuts are paused while you type in a form/);
});

test('Shortcut controls only appear after the unlocked Admin Centre shell exists', async () => {
  const source = await read('src/components/AdminKeyboardShortcuts.tsx');
  assert.match(source, /document\.querySelector\('\.admin-portal'\)/);
  assert.match(source, /if \(!admin \|\| !portalReady \|\| allowedShortcuts\.length === 0\) return null/);
});
