import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

function isoYearsAgo(years) {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()));
  return date.toISOString().slice(0, 10);
}

test('legacy signed age-band utility remains privacy preserving for retained records', async () => {
  const module = await import(new URL('../functions/_shared/age-assurance.js', import.meta.url));
  const env = { AGE_ASSURANCE_SECRET: 'planyx-test-age-assurance-secret-00000000000000000000' };

  const under16 = await module.createAgeAssurance(isoYearsAgo(15), env);
  assert.equal(under16.eligible, false);
  assert.equal(under16.ageBand, 'under-16');

  const sixteen = await module.createAgeAssurance(isoYearsAgo(16), env);
  assert.equal(sixteen.eligible, true);
  assert.equal(sixteen.ageBand, '16-17');
  assert.match(sixteen.adultOn, /^\d{4}-\d{2}-\d{2}$/);

  const tokenPayload = JSON.parse(Buffer.from(sixteen.token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64url').toString('utf8'));
  assert.equal(tokenPayload.band, '16-17');
  assert.ok(!('dob' in tokenPayload), 'The signed token must not retain the exact date of birth.');
});

test('customer profiles retain privacy and safeguarding fields without exposing dates of birth', async () => {
  const source = await read('functions/_shared/age-assurance.js');
  assert.match(source, /age_transition_at TEXT/);
  assert.match(source, /minor_safeguards_enabled INTEGER DEFAULT 0/);
  assert.match(source, /profile_visibility TEXT DEFAULT 'private'/);
  assert.match(source, /public_discovery_allowed INTEGER DEFAULT 0/);
  assert.match(source, /profiling_allowed INTEGER DEFAULT 0/);
  assert.match(source, /marketing_allowed INTEGER DEFAULT 0/);
  assert.match(source, /precise_location_default INTEGER DEFAULT 0/);
  assert.doesNotMatch(source, /"date_of_birth TEXT"/);
  assert.doesNotMatch(source, /date_of_birth=\?/);
});

test('sign-in, customer routes and checkout use Head Office instead of the retired local age form', async () => {
  const login = await read('functions/account/login.js');
  const callback = await read('functions/account/auth/callback.js');
  const ageRoute = await read('functions/age-check.js');
  const middleware = await read('functions/_shared/age-gate-middleware.js');
  const checkout = await read('functions/create-checkout-session.js');
  const customerNumber = await read('functions/api/account/customer-number.js');
  const protectedPaths = [
    'functions/account/_middleware.js',
    'functions/api/_middleware.js',
    'functions/dashboard/_middleware.js',
    'functions/builders/_middleware.js',
    'functions/settings/_middleware.js',
    'functions/documents/_middleware.js',
    'functions/org/_middleware.js',
    'functions/signing/_middleware.js',
  ];

  assert.match(login, /beginLogin\(context, "customer"\)/);
  assert.doesNotMatch(login, /readAgeAssurance|\/age-check\?return_to=/);
  assert.match(callback, /syncCustomerWithHeadOffice/);
  assert.match(callback, /isHeadOfficeAgeStepUp/);
  assert.match(callback, /issueCustomerAgeChallenge/);
  assert.doesNotMatch(callback, /readAgeAssurance|persistAgeAssurance|microsoft_callback_without_age_result/);
  assert.match(ageRoute, /retired Planyx self-declaration token/);
  assert.match(ageRoute, /\/account\/login\?return_to=/);
  assert.doesNotMatch(ageRoute, /date_of_birth|createAgeAssurance/);
  assert.match(middleware, /checkHeadOfficeAccess/);
  assert.match(middleware, /HEAD_OFFICE_AGE_ASSURANCE_REQUIRED/);
  assert.doesNotMatch(middleware, /profileAgeStatus|under_16_not_eligible/);
  assert.match(checkout, /requireCheckoutAccess/);
  assert.match(checkout, /checkHeadOfficeAccess/);
  assert.match(checkout, /metadata\[age_assurance_authority\]/);
  assert.doesNotMatch(checkout, /profileAgeStatus|\/age-check\?return_to=/);
  assert.doesNotMatch(customerNumber, /profileAgeStatus|AGE_CHECK_REQUIRED/);
  for (const path of protectedPaths) {
    assert.match(await read(path), /enforceCustomerAge/);
  }
});

test('registration and public website state the strict 16+ Head Office journey', async () => {
  const register = await read('src/pages/register.tsx');
  const login = await read('src/pages/login.tsx');
  const safety = await read('src/pages/young-person-safety.tsx');
  const app = await read('src/App.tsx');
  const footer = await read('src/layouts/parts/Footer.tsx');

  assert.match(register, /Nobody under 16 may register/);
  assert.match(register, /Head Office then checks/);
  assert.doesNotMatch(register, /\/age-check\?return_to=/);
  assert.match(login, /Planyx is strictly 16\+/);
  assert.match(login, /Sign in with Microsoft first/);
  assert.match(login, /Head Office/);
  assert.match(safety, /Nobody under 16 is permitted to register/);
  assert.match(safety, /Payment-card ownership is not treated as proof of age/);
  assert.match(app, /path: '\/safety'/);
  assert.match(footer, /16\+ Safety & Safeguarding/);
});

test('support assistant separates safeguarding from ordinary customer support', async () => {
  const source = await read('functions/api/support-assistant.js');
  assert.match(source, /safeguardingIntent/);
  assert.match(source, /immediateDangerIntent/);
  assert.match(source, /call 999 now/i);
  assert.match(source, /children’s social care team at their local council/);
  assert.match(source, /underSixteenIntent/);
  assert.match(source, /Nobody under 16 is permitted/);
  assert.match(source, /href: "\/safety"/);
});
