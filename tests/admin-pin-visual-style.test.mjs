import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('Admin PIN gate loads the dedicated Planyx visual layer', async () => {
  const index = await read('index.html');
  const pinStyles = await read('static/admin-pin.css');
  const shellStyles = await read('static/admin-pin-shell.css');

  assert.match(index, /href="\/admin-pin\.css\?v=1"/);
  assert.match(index, /href="\/admin-pin-shell\.css\?v=1"/);
  assert.ok(
    index.indexOf('/admin-pin.css?v=1') < index.indexOf('/admin-pin-shell.css?v=1'),
    'The shell refinements must load after the main PIN stylesheet.',
  );

  assert.match(pinStyles, /:has\(#admin-security-pin\)/);
  assert.match(pinStyles, /grid-template-columns: minmax\(0, 1\.08fr\) minmax\(360px, 0\.92fr\)/);
  assert.match(pinStyles, /Administrator verification/);
  assert.match(pinStyles, /Planyx Admin Centre/);
  assert.match(pinStyles, /\.dark #app > div:has\(#admin-security-pin\)/);
  assert.match(pinStyles, /@media \(max-width: 800px\)/);
  assert.match(shellStyles, /planyx-logo\.svg/);
  assert.match(shellStyles, /background-position: center/);
});

test('Admin PIN restyle does not replace authentication or lockout handling', async () => {
  const layout = await read('src/components/AdminLayout.tsx');

  assert.match(layout, /fetch\('\/admin\/api\?section=adminpin'/);
  assert.match(layout, /action: pinState\.configured \? 'verify' : 'setup'/);
  assert.match(layout, /pinState\.lockedUntil/);
  assert.match(layout, /event\.target\.value\.replace\(\/\\D\/g, ''\)\.slice\(0, 4\)/);
  assert.match(layout, /id="admin-security-pin"/);
});

test('production build contains the Admin PIN styles', async () => {
  const sourcePin = await read('static/admin-pin.css');
  const sourceShell = await read('static/admin-pin-shell.css');
  const publicPin = await read('public/admin-pin.css');
  const publicShell = await read('public/admin-pin-shell.css');

  assert.equal(publicPin, sourcePin);
  assert.equal(publicShell, sourceShell);
});
