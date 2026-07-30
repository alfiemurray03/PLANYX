import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [connector, challenge, endpoint, callback, heartbeat, page, browser, localAge, securityApi, securityUi, app] = await Promise.all([
  read('functions/_shared/customerops-central.js'),
  read('functions/_shared/customerops-age-assurance.js'),
  read('functions/api/head-office-age-assurance.js'),
  read('functions/account/auth/callback.js'),
  read('functions/api/session-heartbeat.js'),
  read('public/account/verification-required/index.html'),
  read('public/head-office-age-assurance.js'),
  read('functions/_shared/age-assurance.js'),
  read('functions/api/admin/head-office-security.js'),
  read('src/components/HeadOfficeSecurityCrmEnhancer.tsx'),
  read('src/App.tsx')
]);

assert.match(connector, /HEAD_OFFICE_AGE_CONTRACT = "ja-head-office-age-assurance-v1"/, 'Planyx must require the versioned Head Office age contract.');
assert.match(connector, /requestHeadOfficeAgeAssuranceSession/, 'Planyx must request age sessions through its Head Office connector.');
assert.match(connector, /\/api\/platform\/age-assurance\/session/, 'The connector must call the central Head Office age-assurance endpoint.');
assert.match(connector, /Authorization: `Bearer \$\{key\}`/, 'Only the Head Office platform credential may leave the Planyx backend.');
assert.doesNotMatch(connector, /DIDIT_API_KEY|DIDIT_WEBHOOK_SECRET/, 'Planyx must never receive or use Didit secrets.');
assert.match(connector, /assurance\?\.accountPopulation === "customers_only"/, 'A step-up must be explicitly customer-only before the age journey is issued.');
assert.match(connector, /assurance\?\.staffAccountsExcluded === true/, 'Head Office must explicitly confirm staff exclusion.');
assert.match(connector, /assurance\?\.deploymentKey === "PLANYX"/, 'Planyx must reject an age deployment bound to another service.');
assert.match(connector, /assurance\?\.minimumAge === 16/, 'The central contract must confirm the Planyx 16+ threshold.');
assert.match(connector, /if \(!headOfficeAgeAuthorityReady\(access\)\) return true/, 'Missing or invalid central age authority must fail closed.');
assert.match(connector, /held safely rather than bypassing age assurance/, 'A contract failure must never silently allow customer access.');

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

assert.match(securityApi, /getNativeSession\(request, env, "admin"\)/, 'Only a native Planyx administrator session may read the CRM security view.');
assert.match(securityApi, /readHeadOfficeSecurityForEmail/, 'Planyx must read the authoritative security state through the server-side connector.');
assert.match(securityApi, /customerops_security_state_cache/, 'Branch-safe security state must be cached for degraded operation.');
assert.doesNotMatch(securityApi, /CUSTOMEROPS_API_KEY.*json|DIDIT_API_KEY|DIDIT_WEBHOOK_SECRET/, 'The admin response must never expose connector or Didit secrets.');
assert.match(securityUi, /Head Office security authority/, 'The customer CRM must display the central security authority.');
assert.match(securityUi, /Head Office security markers/, 'The customer CRM must display branch-visible markers.');
assert.match(securityUi, /Confidential Head Office reasoning is withheld/, 'The customer CRM must explain that confidential reasons are not copied to the branch.');
assert.match(securityUi, /cannot create, clear or override a central marker/, 'Planyx must remain an enforcing branch rather than the marker authority.');
assert.match(app, /HeadOfficeSecurityCrmEnhancer/, 'The route-aware security CRM enhancer must be mounted.');

assert.match(localAge, /const MINIMUM_AGE = 16/, 'The Planyx safeguarding threshold must remain 16.');
assert.doesNotMatch(`${connector}\n${challenge}\n${endpoint}\n${securityApi}`, /DIDIT_API_KEY|DIDIT_WEBHOOK_SECRET/, 'No Didit secret may be introduced into the Planyx repository.');

console.log('Head Office customer age assurance and security-state bridge regression checks passed.');
