import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('Admin utility side-tab stylesheet is loaded globally', async () => {
  const main = await read('src/main.tsx');
  assert.match(main, /import '\.\/styles\/admin-utility-side-tabs\.css'/);
});

test('Support and Shortcuts share the sliding left-edge behaviour', async () => {
  const css = await read('src/styles/admin-utility-side-tabs.css');

  assert.match(css, /button\[aria-label="Open Admin Centre keyboard shortcuts"\]/);
  assert.match(css, /a\[aria-label="Open Admin Support and Manuals"\]/);
  assert.match(css, /left:\s*0\s*!important/);
  assert.match(css, /translate3d\(calc\(-100% \+ 3rem\), 0, 0\)/);
  assert.match(css, /:is\(:hover, :focus, :focus-visible\)/);
  assert.match(css, /transform:\s*translate3d\(0, 0, 0\)/);
  assert.match(css, /flex-direction:\s*row-reverse/);
  assert.match(css, /> span[\s\S]{0,80}display:\s*inline\s*!important/);
});

test('Side tabs remain separated and accessible on smaller screens', async () => {
  const css = await read('src/styles/admin-utility-side-tabs.css');
  const shortcuts = await read('src/components/AdminKeyboardShortcuts.tsx');
  const support = await read('src/components/AdminSupportLauncher.tsx');

  assert.match(css, /bottom:\s*1rem\s*!important/);
  assert.match(css, /bottom:\s*4rem\s*!important/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(shortcuts, /aria-label="Open Admin Centre keyboard shortcuts"/);
  assert.match(support, /aria-label="Open Admin Support and Manuals"/);
  assert.match(support, /hasPermission\(admin, 'support'\)/);
});
