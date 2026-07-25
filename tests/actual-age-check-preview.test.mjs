import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('admin age verification route mounts the actual customer preview enhancer', async () => {
  const app = await read('src/App.tsx');
  const route = await read('src/pages/admin/age-verification-route.tsx');

  assert.match(app, /pages\/admin\/age-verification-route/);
  assert.match(route, /AdminAgeVerificationPage/);
  assert.match(route, /ActualAgeCheckPreviewEnhancer/);
});

test('the fake card is replaced with the real customer age-check route', async () => {
  const enhancer = await read('src/components/ActualAgeCheckPreviewEnhancer.tsx');

  assert.match(enhancer, /src="\/age-check\?return_to=%2Fdashboard&admin_preview=1"/);
  assert.match(enhancer, /Actual customer page/);
  assert.match(enhancer, /existingPreview\.hidden = true/);
  assert.match(enhancer, /age-check-title/);
  assert.match(enhancer, /age-description/);
  assert.match(enhancer, /age-button/);
  assert.match(enhancer, /age-design/);
  assert.match(enhancer, /Show privacy and data-minimisation notice/);
  assert.match(enhancer, /event => event\.preventDefault\(\)/);
});
