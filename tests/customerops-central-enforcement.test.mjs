import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [central, callback, heartbeat, auth, stripe, stripeBridge, restrictedPage, restrictedStyle, restrictedClient] = await Promise.all([
  read('functions/_shared/customerops-central.js'),
  read('functions/account/auth/callback.js'),
  read('functions/api/session-heartbeat.js'),
  read('src/lib/auth-context.tsx'),
  read('functions/stripe-webhook.js'),
  read('functions/_shared/stripe-customerops.js'),
  read('static/account/access-restricted/index.html'),
  read('static/account-access-restricted.css'),
  read('static/account-access-restricted.js')
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
assert.match(heartbeat, /status:\s*403/, 'A denied live session must receive an HTTP 403 response.');
assert.match(heartbeat, /reportPlatformHeartbeat/, 'Live activity must update website health in CustomerOps.');
assert.match(auth, /60_000/, 'The browser must re-check customer access at least every minute.');
assert.match(auth, /window\.location\.replace/, 'The browser must leave the account when Head Office denies access.');

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
assert.match(restrictedPage, /account-access-restricted\.css/, 'The restricted page must load its production stylesheet.');
assert.match(restrictedPage, /account-access-restricted\.js/, 'The restricted page must load its controlled browser behaviour.');
assert.match(restrictedStyle, /\.restricted-card/, 'The restricted page must use its complete production styling.');
assert.match(restrictedClient, /history\.replaceState/, 'The browser must remove confidential decision details from the visible URL after rendering.');

console.log('CustomerOps central enforcement regression checks passed.');
