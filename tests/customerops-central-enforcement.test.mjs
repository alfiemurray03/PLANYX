import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [central, callback, heartbeat, auth, stripe, stripeBridge, restrictedPage, restrictedStyle, restrictedClient, verificationPage, verificationClient, redirects] = await Promise.all([
  read('functions/_shared/customerops-central.js'),
  read('functions/account/auth/callback.js'),
  read('functions/api/session-heartbeat.js'),
  read('src/lib/auth-context.tsx'),
  read('functions/stripe-webhook.js'),
  read('functions/_shared/stripe-customerops.js'),
  read('static/account/access-restricted/index.html'),
  read('static/account-access-restricted.css'),
  read('static/account-access-restricted.js'),
  read('static/account/verification-required/index.html'),
  read('static/head-office-age-assurance.js'),
  read('public/_redirects')
]);

assert.match(central, /checkHeadOfficeAccess/, 'Planyx must request an authoritative access decision.');
assert.match(central, /revokeLocalCustomerSession/, 'Planyx must be able to revoke its own active customer session.');
assert.match(central, /UPDATE customer_oidc_sessions SET revoked_at=/, 'The real customer OIDC session must be revoked.');
assert.match(central, /customerops_outbox/, 'Customer and Stripe events must use a durable delivery outbox.');
assert.match(central, /next_attempt_at=datetime\('now',\?\)/, 'Failed CustomerOps events must use controlled retry backoff.');
assert.match(central, /\/api\/platform\/heartbeat/, 'Planyx must report website health and release information.');
assert.match(central, /\/api\/platform\/customers\/snapshot/, 'Planyx must report its customer account snapshot.');
assert.match(central, /decision === "deny" \|\| decision === "step_up"/, 'Deny and step-up decisions must stop access.');
assert.match(central, /\/api\/platform\/age-assurance\/session/, 'Planyx must request Didit sessions through Head Office rather than using Didit credentials locally.');

assert.match(callback, /const syncResult = await syncCustomerWithHeadOffice/, 'Head Office synchronisation must complete before a customer session is released.');
assert.match(callback, /if \(!syncResult\?\.ok\)/, 'Sign-in must fail closed when the central security authority is unavailable.');
assert.match(callback, /blocksAccess\(access\)/, 'The sign-in callback must enforce the returned access decision.');
assert.match(callback, /expireOidcCookie\("customer"\)/, 'Blocked sign-ins must clear the customer cookie.');
assert.match(callback, /normalized === "step_up"[\s\S]*\/account\/verification-required\//, 'The customer callback must use the verification page for a current step-up decision.');
assert.match(callback, /isHeadOfficeAgeStepUp\(access\)[\s\S]*issueCustomerAgeChallenge/, 'Only a Head Office customer age step-up may issue the limited age challenge.');
assert.doesNotMatch(callback, /searchParams\.set\(["']reason["']/, 'The customer callback must never expose a Head Office reason in the URL.');
assert.doesNotMatch(callback, /searchParams\.set\(["']decision["']/, 'The customer callback must never expose the access decision in the URL.');
assert.doesNotMatch(callback, /CustomerOps is deliberately non-blocking/, 'The former non-authoritative sign-in behaviour must not return.');

assert.match(heartbeat, /checkHeadOfficeAccess/, 'Active customer sessions must be checked against Head Office.');
assert.match(heartbeat, /revokeLocalCustomerSession/, 'A newly applied restriction must terminate an open Planyx customer session.');
assert.match(heartbeat, /blockedResponse[\s\S]*expireOidcCookie\("customer"\)/, 'A denied live customer session must clear its customer cookie.');
assert.match(heartbeat, /realm === "customer"[\s\S]*isHeadOfficeAgeStepUp/, 'Age assurance must remain inside the customer realm and never apply to admin sessions.');
assert.match(heartbeat, /logoutUrl: ageStepUp \? "\/account\/verification-required\/"/, 'Customer age step-up must use the controlled verification journey.');
assert.match(heartbeat, /reportPlatformHeartbeat/, 'Live activity must update website health in CustomerOps.');
assert.match(auth, /60_000/, 'The browser must re-check customer access at least every minute.');
assert.match(auth, /'step_up'/, 'The browser access model must explicitly recognise Head Office step-up decisions.');
assert.match(auth, /function explicitlyBlocked[\s\S]*'denied'[\s\S]*'review'[\s\S]*'step_up'[\s\S]*'session_revoked'/, 'Explicit Head Office restrictions and central session revocation must leave the customer account.');
assert.match(auth, /response\.status >= 500 \|\| payload\.access === 'unavailable'/, 'A temporary central-register outage must preserve an otherwise valid local session.');
assert.match(auth, /access === 'step_up'[\s\S]*\/account\/verification-required\//, 'Step-up decisions must use the dedicated verification journey.');
assert.doesNotMatch(auth, /searchParams\.set\(['"]reason['"]/, 'Confidential Head Office reasons must never be added to the browser URL.');
assert.doesNotMatch(auth, /searchParams\.set\(['"]decision['"]/, 'Access decisions must not remain in the visible browser URL.');

for (const event of ['charge.refunded', 'charge.dispute.created', 'invoice.payment_failed', 'customer.subscription.updated']) {
  assert.match(stripe, new RegExp(event.replaceAll('.', '\\.')), `${event} must be handled by the central payment integration.`);
}
assert.match(stripe, /queueStripeCustomerOpsEvent/, 'Stripe webhooks must be forwarded into CustomerOps.');
assert.match(stripeBridge, /payment\.disputed/, 'Stripe disputes must become central payment-dispute and fraud activity.');
assert.match(stripeBridge, /riskScore:\s*disputed \? 80/, 'A Stripe dispute must create a high-risk signal.');
assert.match(stripeBridge, /subscriptionPayload/, 'Stripe subscription information must enter the central customer record.');
assert.match(stripeBridge, /orderPayload/, 'Stripe checkout order history must enter the central customer record.');

assert.match(restrictedPage, /Access is temporarily restricted/, 'Blocked customers need a clear controlled access page.');
assert.match(restrictedPage, /does not display confidential investigation details/, 'The restriction page must not reveal confidential fraud or investigation information.');
assert.match(restrictedPage, /Check access and sign in again/, 'A cleared customer must be able to request a fresh access decision.');
assert.match(restrictedPage, /account-access-restricted\.css/, 'The restricted page must load its production stylesheet.');
assert.match(restrictedPage, /account-access-restricted\.js/, 'The restricted page must load its controlled browser behaviour.');
assert.match(restrictedStyle, /\.restricted-card/, 'The restricted page must use its complete production styling.');
assert.match(restrictedClient, /decision === 'step_up'/, 'An old step-up URL must move to the dedicated verification page.');
assert.match(restrictedClient, /history\.replaceState/, 'The browser must remove stale decision details from the visible URL.');
assert.doesNotMatch(restrictedClient, /params\.get\('reason'\)/, 'The restricted page must not read or display confidential reason text.');
assert.match(verificationPage, /Confirm that you are 16 or over/, 'The Planyx deployment must clearly state its 16+ threshold.');
assert.match(verificationPage, /Head Office controls the age requirement/, 'The page must identify Head Office as the policy authority.');
assert.match(verificationPage, /does not affect staff accounts/, 'The page must explicitly confirm staff accounts are outside the customer flow.');
assert.match(verificationPage, /Only the signed Didit webhook/, 'The page must identify the signed webhook as the approval authority.');
assert.match(verificationClient, /\/api\/head-office-age-assurance/, 'The browser must use the local customer-only Head Office bridge.');
assert.match(verificationClient, /consentVersion: 'planyx-head-office-age-v1'/, 'The disclosure version must be retained when the customer starts Didit.');
assert.match(verificationClient, /window\.setTimeout\(\(\) => void checkStatus\(true\), 5000\)/, 'The page must poll Head Office for the signed decision without trusting the Didit browser window.');
assert.match(redirects, /^\/account\/access-restricted\/ .*index\.html 200/m, 'Cloudflare must serve the restricted-account file before the SPA fallback.');
assert.match(redirects, /^\/account\/verification-required\/ .*index\.html 200/m, 'Cloudflare must serve the verification page before the SPA fallback.');
assert.ok(redirects.indexOf('/account/access-restricted/') < redirects.indexOf('/* /index.html 200'), 'Protected routes must be ordered before the SPA fallback.');

console.log('CustomerOps central enforcement regression checks passed.');
