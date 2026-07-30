import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('new customer age decisions are owned by Head Office and do not create Planyx DOB records', async () => {
  const ageCheck = await read('functions/age-check.js');
  const callback = await read('functions/account/auth/callback.js');
  const central = await read('functions/_shared/customerops-central.js');
  const bridge = await read('functions/api/head-office-age-assurance.js');

  assert.match(ageCheck, /retired Planyx self-declaration token/);
  assert.doesNotMatch(ageCheck, /createAgeVerificationRecord|dateOfBirth|createAgeAssurance/);
  assert.match(callback, /syncCustomerWithHeadOffice/);
  assert.match(callback, /issueCustomerAgeChallenge/);
  assert.doesNotMatch(callback, /persistAgeAssurance|readAgeAssurance/);
  assert.match(central, /requestHeadOfficeAgeAssuranceSession/);
  assert.match(bridge, /decisionAuthority: "HEAD_OFFICE"/);
  assert.match(bridge, /staffAccountsAffected: false/);
});

test('Customer CRM masks retained legacy DOB records and requires an audited Admin PIN reveal', async () => {
  const api = await read('functions/api/admin/customer-age-verification.js');
  const panel = await read('src/components/CustomerAgeVerificationCrmPanel.tsx');
  const enhancer = await read('src/components/CustomerCrmAgeVerificationEnhancer.tsx');
  const app = await read('src/App.tsx');

  assert.match(api, /getNativeSession\(request, env, "admin"\)/);
  assert.match(api, /SESSION_EXPIRED/);
  assert.doesNotMatch(api, /x-ja-auth-email/);
  assert.match(api, /reveal_dob/);
  assert.match(api, /activeAdminPinSession/);
  assert.match(api, /reason\.length < 10/);
  assert.match(api, /age_dob_reveal/);
  assert.match(api, /date_of_birth_not_logged:\s*true/);
  assert.match(api, /No encrypted date-of-birth record exists/);

  assert.match(panel, /dateOfBirthMasked/);
  assert.match(panel, /Reveal DOB/);
  assert.match(panel, /revealed for 60 seconds/);
  assert.match(panel, /Verification ID/);
  assert.match(panel, /Legacy result/);
  assert.match(panel, /The DOB itself is not logged/);
  assert.match(enhancer, /data-customer-age-verification-crm/);
  assert.doesNotMatch(app, /CustomerCrmAgeVerificationEnhancer/, 'The CRM DOM enhancer must never be mounted globally because it can affect every Admin route.');
});

test('customer-facing central journey explains data minimisation and staff separation', async () => {
  const page = await read('public/account/verification-required/index.html');
  assert.match(page, /Planyx does not receive Didit’s API key, identity documents or biometric evidence/);
  assert.match(page, /customer account and Unique Customer Number/);
  assert.match(page, /does not affect staff accounts, staff numbers, Microsoft staff sign-in or Head Office staff access/);
  assert.match(page, /Only the signed Didit webhook received by Head Office can approve/);
});
