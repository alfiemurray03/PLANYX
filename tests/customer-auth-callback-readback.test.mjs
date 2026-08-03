import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const callback = await readFile(new URL('../functions/account/auth/callback.js', import.meta.url), 'utf8');

test('a completed Microsoft login is not converted into a false callback failure', () => {
  assert.match(callback, /const response = await completeLogin\(context, "customer"\)/);
  assert.match(callback, /continueAfterDeferredReadback/);
  assert.match(callback, /session_cookie_not_visible_to_callback/);
  assert.match(callback, /session_not_immediately_visible_after_creation/);
  assert.match(callback, /session_readback_failed/);
  assert.match(callback, /return response;/);
});

test('deferred read-back still leaves Head Office enforcement on the first dashboard heartbeat', () => {
  assert.match(callback, /AuthProvider performs an immediate server heartbeat/);
  assert.match(callback, /Head Office restrictions remain authoritative/);
  assert.match(callback, /const syncResult = await syncCustomerWithHeadOffice/);
  assert.match(callback, /if \(blocksAccess\(access\)\)/);
  assert.match(callback, /revokeLocalCustomerSession/);
});

test('genuine callback failures include a non-sensitive support reference', () => {
  assert.match(callback, /function callbackReference/);
  assert.match(callback, /PLX-AUTH-/);
  assert.match(callback, /X-Planyx-Authentication-Reference/);
  assert.match(callback, /recordAuthenticationFailure/);
  assert.doesNotMatch(callback, /Reference: \$\{error\.message\}/);
});
