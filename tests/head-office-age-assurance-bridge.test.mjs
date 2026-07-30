import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [connector, challenge, endpoint, callback, heartbeat, page, browser, localAge] = await Promise.all([
  read('functions/_shared/customerops-central.js'),
  read('functions/_shared/customerops-age-assurance.js'),
  read('functions/api/head-office-age-assurance.js'),
  read('functions/account/auth/callback.js'),
  read('functions/api/session-heartbeat.js'),
  read('public/account/verification-required/index.html'),
  read('public/head-office-age-assurance.js'),
  read('functions/_shared/age-assurance.js')
]);

assert.match(connector, /requestHeadOfficeAgeAssuranceSession/, 'Planyx must request age sessions through its Head Office connector.');
assert.match(connector, /\/api\/platform\/age-assurance\/session/, 'The connector must call the central Head Office age-assurance endpoint.');
assert.match(connector, /Authorization: `Bearer \$\{key\}`/, 'Only the Head Office platform credential may leave the Planyx backend.');
assert.doesNotMatch(connector, /DIDIT_API_KEY|DIDIT_WEBHOOK_SECRET/, 'Planyx must never receive or use Didit secrets.');
assert.match(connector, /assurance\?\.accountPopulation === "customers_only"/, 'A step-up must be explicitly customer-only before the age journey is issued.');
assert.match(connector, /assurance\?\.staffAccountsExcluded === true/, 'Head Office must explicitly confirm staff exclusion.');

assert.match(challenge, /customerops_age_assurance_challenges/, 'A limited opaque customer challenge must be retained in D1.');
assert.match(challenge, /crypto\.randomUUID\(\).*crypto\.randomUUID/, 'The browser challenge must use a high-entropy opaque token.');
assert.match(challenge, /token_hash TEXT PRIMARY KEY/, 'Only a hash of the browser challenge may be stored.');
assert.match(challenge, /HttpOnly; Secure; SameSite=Lax/, 'The limited challenge cookie must be protected.');
assert.match(challenge, /customer_number TEXT/, 'The challenge must resolve a Universal Customer Number rather than a staff number.');
assert.doesNotMatch(challenge, /staff|admin|ja_staff|microsoft_staff/i, 'The customer challenge store must have no staff or admin identity field.');

assert.match(endpoint, /readCustomerAgeChallenge/, 'The local bridge must require the limited customer challenge.');
assert.match(endpoint, /assertSameOrigin/, 'Creating a Didit session must be protected from cross-site requests.');
assert.match(endpoint, /consentVersion.*planyx-head-office-age-v1/, 'The customer disclosure version must be validated.');
assert.match(endpoint, /checkHeadOfficeAccessByReference/, 'Browser completion must be confirmed against Head Office.');
assert.match(endpoint, /staffAccountsAffected: false/, 'Every local response must confirm staff accounts are not affected.');
assert.doesNotMatch(endpoint, /getNativeSession\([^)]*admin|realm[^\n]*admin/, 'The age bridge must not accept a staff or admin session as its authority.');
assert.doesNotMatch(endpoint, /DIDIT_API_KEY|DIDIT_WEBHOOK_SECRET|X-Signature/, 'The browser bridge must not contain Didit credentials or approve a provider callback itself.');

assert.match(callback, /issueCustomerAgeChallenge/, 'A blocked customer sign-in must be able to issue the limited age challenge.');
assert.match(callback, /isHeadOfficeAgeStepUp\(access\)/, 'The callback must distinguish customer age assurance from generic identity verification.');
assert.match(callback, /revokeLocalCustomerSession/, 'The normal customer session must still be revoked before the verification page is used.');
assert.match(callback, /headers\.append\("Set-Cookie", challengeCookie\)/, 'The limited challenge must be issued separately from the revoked customer session.');

assert.match(heartbeat, /realm === "customer"/, 'Only the customer realm may receive Head Office customer age policy.');
assert.match(heartbeat, /let realm = "admin"[\s\S]*if \(realm === "customer"\)/, 'Admin/staff heartbeat handling must remain outside the customer enforcement branch.');
assert.match(heartbeat, /issueCustomerAgeChallenge/, 'An already signed-in customer can be sent into the same controlled age journey.');
assert.match(heartbeat, /expireOidcCookie\("customer"\)/, 'The unrestricted customer session must be cleared during step-up.');
assert.doesNotMatch(heartbeat, /expireOidcCookie\("admin"\)/, 'Age assurance must never clear an admin or staff cookie.');

assert.match(page, /Planyx is a 16\+ customer service/, 'The customer page must state the Planyx threshold.');
assert.match(page, /does not affect staff accounts, staff numbers, Microsoft staff sign-in or Head Office staff access/, 'The visible policy must state the permanent staff exclusion.');
assert.match(page, /Only the signed Didit webhook received by Head Office can approve/, 'The customer must be told that browser completion is not approval.');
assert.match(browser, /window\.open/, 'The Didit hosted check must open separately so the Planyx page can continue polling.');
assert.match(browser, /checkStatus\(true\)/, 'The page must poll the central Head Office decision.');
assert.match(browser, /data\.allowed === true/, 'Only the Head Office allow response may release the journey.');

assert.match(localAge, /const MINIMUM_AGE = 16/, 'The existing Planyx 16+ safeguarding baseline must remain unchanged while central enforcement is not started.');
assert.doesNotMatch(`${connector}\n${challenge}\n${endpoint}`, /DIDIT_API_KEY|DIDIT_WEBHOOK_SECRET/, 'No Didit secret may be introduced into the Planyx repository.');

console.log('Head Office customer age assurance bridge regression checks passed.');
