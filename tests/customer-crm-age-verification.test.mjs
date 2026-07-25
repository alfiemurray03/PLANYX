import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('eligible age checks create an encrypted verification record and link it to Microsoft identity', async () => {
  const assurance = await read('functions/_shared/age-assurance.js');
  const records = await read('functions/_shared/age-verification-records.js');
  const ageCheck = await read('functions/age-check.js');
  const callback = await read('functions/account/auth/callback.js');

  assert.match(assurance, /verificationId/);
  assert.match(assurance, /ref:\s*verificationId/);
  assert.match(assurance, /age_verification_id TEXT/);
  assert.match(assurance, /linkAgeVerificationRecord/);
  assert.match(ageCheck, /createAgeVerificationRecord/);
  assert.match(ageCheck, /dateOfBirth:\s*assurance\.dateOfBirth/);
  assert.match(callback, /persistAgeAssurance/);

  assert.match(records, /AES-GCM/);
  assert.match(records, /encrypted_date_of_birth TEXT NOT NULL/);
  assert.doesNotMatch(records, /\bdate_of_birth TEXT\b/);
  assert.match(records, /AGE-\$\{date\}/);
});

test('Customer CRM masks DOB and requires an audited Admin PIN reveal', async () => {
  const api = await read('functions/api/admin/customer-age-verification.js');
  const panel = await read('src/components/CustomerAgeVerificationCrmPanel.tsx');
  const enhancer = await read('src/components/CustomerCrmAgeVerificationEnhancer.tsx');
  const app = await read('src/App.tsx');

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

test('public age-check wording explains restricted encrypted CRM retention', async () => {
  const ageCheck = await read('functions/age-check.js');
  assert.match(ageCheck, /encrypted in a restricted age-verification record linked to your Customer CRM profile/);
  assert.match(ageCheck, /masked by default and access is audited/);
  assert.match(ageCheck, /The normal customer profile stores only eligibility, age band and safeguarding status/);
});
