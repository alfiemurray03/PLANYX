import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
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
