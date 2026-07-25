import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('customer age-check is a professional secure journey with accessible help', async () => {
  const page = await read('functions/age-check.js');
  const css = await read('public/assets/age-verification.css');
  const guide = await read('public/assets/age-verification-guide.js');

  assert.match(page, /age-verification\.css/);
  assert.match(page, /Your date of birth/);
  assert.match(page, /Secure field/);
  assert.match(page, /account eligibility check, not independent identity verification/);
  assert.match(page, /What happens next/);
  assert.match(page, /age-verification-guide\.js/);
  assert.match(page, /Do not enter your date of birth, upload identity documents or share payment details/);

  assert.match(css, /verification-layout/);
  assert.match(css, /date-field:focus/);
  assert.match(css, /@media \(max-width:860px\)/);
  assert.match(css, /@media \(prefers-color-scheme:dark\)/);

  assert.match(guide, /fetch\('\/api\/age-verification-assistant'/);
  assert.match(guide, /textContent/);
  assert.doesNotMatch(guide, /innerHTML/);
});

test('Age Verification AI explains regulatory limits, stronger methods and safe customer actions', async () => {
  const api = await read('functions/api/age-verification-assistant.js');

  assert.match(api, /KNOWLEDGE_VERSION/);
  assert.match(api, /not independent proof of age/);
  assert.match(api, /highly effective age assurance/);
  assert.match(api, /Online Safety Act/);
  assert.match(api, /ICO/);
  assert.match(api, /open-banking age-check/);
  assert.match(api, /mobile-network-operator age check/);
  assert.match(api, /facial age estimation/);
  assert.match(api, /photo-ID matching/);
  assert.match(api, /digital identity/);
  assert.match(api, /debit-card payment/);
  assert.match(api, /asksToBypass/);
  assert.match(api, /offersSensitiveMaterial/);
  assert.match(api, /Microsoft sign-in by itself does not prove age/);
  assert.match(api, /The visitor's message content was not stored/);
});
