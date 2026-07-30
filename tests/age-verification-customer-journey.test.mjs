import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('customer age assurance is a controlled Head Office and Didit journey', async () => {
  const retiredRoute = await read('functions/age-check.js');
  const page = await read('public/account/verification-required/index.html');
  const client = await read('public/head-office-age-assurance.js');
  const bridge = await read('functions/api/head-office-age-assurance.js');

  assert.match(retiredRoute, /\/account\/login\?return_to=/);
  assert.doesNotMatch(retiredRoute, /date_of_birth|createAgeAssurance/);

  assert.match(page, /Head Office age assurance/);
  assert.match(page, /Confirm that you are 16 or over/);
  assert.match(page, /uses Didit to carry out the secure check/);
  assert.match(page, /does not affect staff accounts/);
  assert.match(page, /Only the signed Didit webhook received by Head Office can approve/);
  assert.match(page, /I understand that Didit will process/);
  assert.match(page, /Start secure age check/);

  assert.match(client, /\/api\/head-office-age-assurance/);
  assert.match(client, /consentAccepted: true/);
  assert.match(client, /window\.open\(payload\.verificationUrl/);
  assert.match(client, /setInterval/);
  assert.doesNotMatch(client, /innerHTML/);

  assert.match(bridge, /requestHeadOfficeAgeAssuranceSession/);
  assert.match(bridge, /checkHeadOfficeAccessByReference/);
  assert.match(bridge, /decisionAuthority: "HEAD_OFFICE"/);
  assert.match(bridge, /staffAccountsAffected: false/);
});

test('Age Verification AI retains safe explanatory guidance without deciding access', async () => {
  const api = await read('functions/api/age-verification-assistant.js');

  assert.match(api, /KNOWLEDGE_VERSION/);
  assert.match(api, /not independent proof of age/);
  assert.match(api, /highly effective age assurance/);
  assert.match(api, /Online Safety Act/);
  assert.match(api, /ICO/);
  assert.match(api, /facial age estimation/);
  assert.match(api, /photo-ID matching/);
  assert.match(api, /digital identity/);
  assert.match(api, /debit-card payment/);
  assert.match(api, /asksToBypass/);
  assert.match(api, /offersSensitiveMaterial/);
  assert.match(api, /Microsoft sign-in by itself does not prove age/);
  assert.match(api, /The visitor's message content was not stored/);
});
