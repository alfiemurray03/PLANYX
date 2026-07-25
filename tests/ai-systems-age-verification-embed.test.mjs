import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Contact and Age AI includes the full age verification control centre', async () => {
  const enhancer = await read('src/components/AISystemsControlEnhancer.tsx');

  assert.match(enhancer, /ContactAndAgeAiWorkspace/);
  assert.match(enhancer, /AgeVerificationAIControl/);
  assert.match(enhancer, /EmbeddedAgeVerificationControlCentre/);
  assert.match(enhancer, /src="\/admin\/age-verification\?embedded=contact-age-ai"/);
  assert.match(enhancer, /Age Verification Control Centre/);
});

test('embedded age controls remain functional and visually integrated', async () => {
  const enhancer = await read('src/components/AISystemsControlEnhancer.tsx');

  assert.match(enhancer, /\.admin-portal > header/);
  assert.match(enhancer, /\.admin-portal > footer/);
  assert.match(enhancer, /\.admin-portal > main/);
  assert.match(enhancer, /ResizeObserver/);
  assert.match(enhancer, /credentials/);
  assert.match(enhancer, /Open full page/);
});
