import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [central, callback, heartbeat, auth, stripe, stripeBridge, restrictedPage, restrictedStyle, restrictedClient, verificationPage] = await Promise.all([
  read('functions/_shared/customerops-central.js'),
  read('functions/account/auth/callback.js'),
  read('functions/api/session-heartbeat.js'),
  read('src/lib/auth-context.tsx'),
  read('functions/stripe-webhook.js'),
  read('functions/_shared/stripe-customerops.js'),
  read('static/account/access-restricted/index.html'),
  read('static/account-access-restricted.css'),
  read('static/account-access-restricted.js'),
  read('static/account/verification-required/index.html')
]);

assert.match(central, /checkHeadOfficeAccess/, 'Planyx must request an authoritative access decision.');
assert.match(central, /revokeLocalCustomerSession/, 'Planyx must be able to revoke its own active customer session.');
assert.match(central, /UPDATE customer_oidc_sessions SET revoked_at=/, 'The real customer OIDC session must be revoked.');
assert.match(central, /customerops_outbox/, 'Customer and Stripe events must use a durable delivery outbox.');
assert.match(central, /next_attempt_at=datetime\('now',\?\)/, 'Failed CustomerOps events must use controlled retry backoff.');
assert.match(central, /\/api\/platform\/heartbeat/, 'Planyx must report website health and release information.');
assert.match(central, /\/api\/platform\/customers\/snapshot/, 'Planyx must report its customer account snapshot.');
assert.match(central, /decision === "deny" \|\| decision === "step_up"/, 'Deny and step-up decisions must stop access.');

assert.match(callback, /const syncResult = await syncCustomerWithHeadOffice/, 'Head Office synchronisation must complete before a customer session is released.');
assert.match(callback, /if \(!syncResult\?\.ok\)/, 'Sign-in must fail closed when the central security authority is unavailable.');
assert.match(callback, /blocksAccess\(access\)/, 'The sign-in callback must enforce the returned access decision.');
assert.match(callback, /expireOidcCookie\("customer"\)/, 'Blocked sign-ins must clear the customer cookie.');
assert.doesNotMatch(callback, /CustomerOps is deliberately non-blocking/, 'The former non-authoritative sign-in behaviour must not return.');

assert.match(heartbeat, /checkHeadOfficeAccess/, 'Active sessions must be checked against Head Office.');
assert.match(heartbeat, /revokeLocalCustomerSession/, 'A newly applied restriction must terminate an open Planyx session.');
assert.match(heartbeat, /},\s*403,\s*\{\s*"Set-Cookie":\s*expireOidcCookie\("customer"\)/, 'A denied live session must receive HTTP 403 and clear its customer cookie.');
assert.match(heartbeat, /},\s*503,\s*\{[\s\S]*expireOidcCookie\("customer"\)/, 'A live session must fail closed when Head Office protection is unavailable.');
assert.match(heartbeat, /reportPlatformHeartbeat/, 'Live activity must update website health in CustomerOps.');
assert.match(auth, /60_000/, 'The browser must re-check customer access at least every minute.');
assert.match(auth, /'step_up'/, 'The browser access model must explicitly recognise Head Office step-up decisions.');
assert.match(auth, /payload\.access && payload\.access !== 'allowed'/, 'Every non-allow decision must leave the customer account.');
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
assert.match(verificationPage, /not part of normal Planyx sign-in/, 'Identity verification must be clearly separated from ordinary login.');
assert.match(verificationPage, /Only a verification request created by Head Office/, 'Only Head Office may initiate an identity-document check.');
assert.match(verificationPage, /Check access and sign in again/, 'A lifted verification request must let the customer re-check access.');

console.log('CustomerOps central enforcement regression checks passed.');
