import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// This regression runs after the production build and confirms the PIN design
// is inside the generated Vite CSS rather than a detached public stylesheet.
const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('Admin PIN gate uses a stable centred Planyx card', async () => {
  const entry = await read('src/main.tsx');
  const styles = await read('src/styles/admin-pin-gate.css');
  const index = await read('index.html');

  assert.match(entry, /import '\.\/styles\/admin-pin-gate\.css';/);
  assert.match(styles, /#admin-theme-root:has\(#admin-security-pin\)/);
  assert.match(styles, /width: min\(100%, 470px\)/);
  assert.match(styles, /linear-gradient\(90deg, #2563eb 0%, #06b6d4 55%, #8b5cf6 100%\)/);
  assert.match(styles, /Planyx Admin Centre/);
  assert.match(styles, /\.dark #admin-theme-root:has\(#admin-security-pin\)/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.doesNotMatch(styles, /grid-template-columns:/);
  assert.doesNotMatch(styles, /Administrator verification/);
  assert.doesNotMatch(styles, /Build experiences\. Create memories\./);
  assert.doesNotMatch(index, /admin-pin\.css/);
  assert.doesNotMatch(index, /admin-pin-shell\.css/);
});

test('generated production CSS contains the corrected Admin PIN card', async () => {
  const manifest = JSON.parse(await read('public/.asset-manifest.json'));
  const cssAssets = (manifest.currentAssets || []).filter(
    asset => asset.startsWith('assets/') && asset.endsWith('.css'),
  );

  assert.ok(cssAssets.length > 0, 'The production manifest must contain a CSS bundle.');
  const compiledCss = (await Promise.all(
    cssAssets.map(asset => read(`public/${asset}`)),
  )).join('\n');

  assert.match(compiledCss, /#admin-theme-root:has\(#admin-security-pin\)/);
  assert.match(compiledCss, /max-width:470px/);
  assert.doesNotMatch(compiledCss, /Administrator verification/);
});

test('Admin PIN restyle preserves authentication, timeout and lockout handling', async () => {
  const layout = await read('src/components/AdminLayout.tsx');
  const endpoint = await read('functions/api/admin/pin.js');

  assert.match(layout, /fetch\('\/api\/admin\/pin'/);
  assert.match(layout, /action: pinState\.configured \? 'verify' : 'setup'/);
  assert.match(layout, /pinState\.lockedUntil/);
  assert.match(layout, /ADMIN_PIN_TIMEOUT_MS = 7000/);
  assert.match(layout, /event\.target\.value\.replace\(\/\\D\/g, ''\)\.slice\(0, 4\)/);
  assert.match(layout, /id="admin-security-pin"/);
  assert.match(layout, /The Admin Centre remains securely locked/);

  assert.match(endpoint, /MAX_ATTEMPTS = 5/);
  assert.match(endpoint, /LOCK_MINUTES = 15/);
  assert.match(endpoint, /ja_admin_pin_session/);
  assert.match(endpoint, /HttpOnly; Secure; SameSite=Strict/);
});
