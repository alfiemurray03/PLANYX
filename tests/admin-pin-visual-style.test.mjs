import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('Admin PIN gate styling is compiled through the main application entry', async () => {
  const entry = await read('src/main.tsx');
  const styles = await read('src/styles/admin-pin-gate.css');
  const index = await read('index.html');

  assert.match(entry, /import '\.\/styles\/admin-pin-gate\.css';/);
  assert.match(styles, /#admin-theme-root:has\(#admin-security-pin\)/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1\.08fr\) minmax\(360px, 0\.92fr\)/);
  assert.match(styles, /Administrator verification/);
  assert.match(styles, /Planyx Admin Centre/);
  assert.match(styles, /Build experiences\. Create memories\./);
  assert.match(styles, /\.dark #admin-theme-root:has\(#admin-security-pin\)/);
  assert.match(styles, /@media \(max-width: 800px\)/);
  assert.doesNotMatch(index, /admin-pin\.css/);
  assert.doesNotMatch(index, /admin-pin-shell\.css/);
});

test('generated production CSS contains the Admin PIN visual layer', async () => {
  const manifest = JSON.parse(await read('public/.asset-manifest.json'));
  const cssAssets = (manifest.currentAssets || []).filter(
    asset => asset.startsWith('assets/') && asset.endsWith('.css'),
  );

  assert.ok(cssAssets.length > 0, 'The production manifest must contain a CSS bundle.');
  const compiledCss = (await Promise.all(
    cssAssets.map(asset => read(`public/${asset}`)),
  )).join('\n');

  assert.match(compiledCss, /#admin-theme-root:has\(#admin-security-pin\)/);
  assert.match(compiledCss, /Administrator verification/);
});

test('Admin PIN restyle does not replace authentication or lockout handling', async () => {
  const layout = await read('src/components/AdminLayout.tsx');

  assert.match(layout, /fetch\('\/admin\/api\?section=adminpin'/);
  assert.match(layout, /action: pinState\.configured \? 'verify' : 'setup'/);
  assert.match(layout, /pinState\.lockedUntil/);
  assert.match(layout, /event\.target\.value\.replace\(\/\\D\/g, ''\)\.slice\(0, 4\)/);
  assert.match(layout, /id="admin-security-pin"/);
});
