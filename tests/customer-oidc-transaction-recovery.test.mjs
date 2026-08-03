import assert from "node:assert/strict";
import fs from "node:fs";

const recovery = fs.readFileSync("functions/_shared/oidc-transaction-recovery.js", "utf8");
const login = fs.readFileSync("functions/account/login.js", "utf8");
const callback = fs.readFileSync("functions/account/auth/callback.js", "utf8");

assert.match(recovery, /oidc_transaction_cookie_backups/);
assert.match(recovery, /state_hash TEXT PRIMARY KEY/);
assert.match(recovery, /encrypted_cookie TEXT NOT NULL/);
assert.match(recovery, /datetime\('now', '\+10 minutes'\)/);
assert.match(recovery, /used_at IS NULL/);
assert.match(recovery, /Number\(claimed\?\.meta\?\.changes \|\| 0\) !== 1/);
assert.match(recovery, /crypto\.subtle\.digest\("SHA-256"/);
assert.doesNotMatch(recovery, /state TEXT PRIMARY KEY/);

assert.match(login, /backupCustomerOidcTransaction/);
assert.match(login, /await backupCustomerOidcTransaction\(context\.env, response\)/);
assert.match(login, /backup write failure must not stop Microsoft sign-in/i);

assert.match(callback, /recoverCustomerOidcTransactionRequest/);
assert.match(callback, /message !== "Authentication state validation failed\."/);
assert.match(callback, /completeLogin\(\{ \.\.\.context, request: recoveredRequest \}, "customer"\)/);
assert.match(callback, /transaction_state_missing/);
assert.match(callback, /transaction_recovery_retry/);
assert.match(callback, /customer_oidc_transaction_recovered/);

console.log("Customer OIDC transaction recovery checks passed.");
