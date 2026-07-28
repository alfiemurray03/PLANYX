import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";
import { isUniversalCustomerNumber } from "../functions/_shared/customerops.js";

test("Universal Customer Numbers contain exactly ten digits", () => {
  assert.equal(isUniversalCustomerNumber("1000000001"), true);
  assert.equal(isUniversalCustomerNumber("0000000000"), true);
  assert.equal(isUniversalCustomerNumber("100000001"), false);
  assert.equal(isUniversalCustomerNumber("10000000001"), false);
  assert.equal(isUniversalCustomerNumber("UCN1000001"), false);
  assert.equal(isUniversalCustomerNumber("10000A0001"), false);
  assert.equal(isUniversalCustomerNumber("1000 000001"), false);
});

test("Planyx protects an existing UCN from silent replacement", async () => {
  const source = await readFile(new URL("../functions/_shared/customerops.js", import.meta.url), "utf8");
  assert.match(source, /existingUcn\s*&&\s*existingUcn\s*!==\s*ucn/);
  assert.match(source, /status:\s*"ucn_conflict"/);
  assert.match(source, /universal_customer_number\s*=\s*COALESCE\(NULLIF\(universal_customer_number,\s*''\),\s*\?\)/);
});

test("CustomerOps credential remains server-side", async () => {
  const source = await readFile(new URL("../functions/_shared/customerops.js", import.meta.url), "utf8");
  assert.match(source, /context\.env\.CUSTOMEROPS_API_KEY/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|window\./);
  assert.match(source, /Authorization:\s*`Bearer \$\{apiKey\}`/);
});

test("customer number uses a static account page and separate authenticated API", async () => {
  const page = await readFile(new URL("../static/account/customer-number/index.html", import.meta.url), "utf8");
  const client = await readFile(new URL("../static/customer-number.js", import.meta.url), "utf8");
  const api = await readFile(new URL("../functions/api/account/customer-number.js", import.meta.url), "utf8");

  assert.match(page, /id="ucnValue"/);
  assert.match(page, /customer-number\.js/);
  assert.match(client, /\/api\/account\/customer-number/);
  assert.match(client, /window\.location\.replace\(`\/account\/login/);
  assert.match(api, /getNativeSession\(context\.request, context\.env, "customer"\)/);
  assert.match(api, /profileAgeStatus/);

  await assert.rejects(access(new URL("../functions/account/customer-number.js", import.meta.url)));
});
