import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { verifyConfiguredPrice } from "../functions/api/admin/stripe/verify-prices.js";

const root = new URL("../", import.meta.url);
const verifierUrl = new URL("functions/api/admin/stripe/verify-prices.js", root);

const plan = {
  key: "personal",
  label: "Explore Plan",
  amount: 599,
  productId: "prod_expected",
  productNames: ["Explore Plan"],
  defaultPriceId: "price_expected",
};

function stripeResponse(payload, ok = true) {
  return {
    ok,
    async json() {
      return payload;
    },
  };
}

test("Stripe price resolution retains submitted, database, secret and default precedence", async () => {
  const source = await readFile(verifierUrl, "utf8");

  const submittedPosition = source.indexOf("if (submitted) return");
  const databasePosition = source.indexOf('source: "database"');
  const secretPosition = source.indexOf('source: "secret"');
  const defaultPosition = source.indexOf('source: "default"');

  assert.ok(submittedPosition >= 0, "Submitted Admin values must be supported.");
  assert.ok(databasePosition > submittedPosition, "Database values must follow submitted values.");
  assert.ok(secretPosition > databasePosition, "Environment secrets must follow database values.");
  assert.ok(defaultPosition > secretPosition, "Approved defaults must remain the final fallback.");
});

test("Stripe verifier accepts the correct active monthly GBP plan mapping", async () => {
  const result = await verifyConfiguredPrice(
    async () => stripeResponse({
      id: "price_expected",
      active: true,
      currency: "gbp",
      unit_amount: 599,
      type: "recurring",
      recurring: { interval: "month", interval_count: 1 },
      product: { id: "prod_expected", name: "Explore Plan", active: true },
    }),
    "sk_test_example",
    plan,
    "price_expected",
    "database",
  );

  assert.equal(result.valid, true);
  assert.equal(result.id, "price_expected");
  assert.equal(result.source, "database");
  assert.equal(result.checks.amountMatches, true);
  assert.equal(result.checks.currencyMatches, true);
  assert.equal(result.checks.intervalMatches, true);
});

test("Stripe verifier rejects a Price ID mapped to the wrong amount", async () => {
  const result = await verifyConfiguredPrice(
    async () => stripeResponse({
      id: "price_other",
      active: true,
      currency: "gbp",
      unit_amount: 799,
      type: "recurring",
      recurring: { interval: "month", interval_count: 1 },
      product: { id: "prod_expected", name: "Explore Plan", active: true },
    }),
    "sk_test_example",
    plan,
    "price_other",
    "database",
  );

  assert.equal(result.valid, false);
  assert.match(result.error, /wrong amount/i);
});

test("Coming Soon page follows the current Planyx launch-page structure", async () => {
  const html = await readFile(new URL("public/coming-soon/index.html", root), "utf8");
  const script = await readFile(new URL("public/assets/js/coming-soon.js", root), "utf8");
  assert.match(html, /class="signal"/);
  assert.match(html, /class="countdown-grid"/);
  assert.match(html, /id="coming-soon-features"/);
  assert.match(html, /Build experiences\. Create memories\./);
  assert.match(html, /Copyright 2025–2026 JA Group Services Ltd/);
  assert.doesNotMatch(html, /sign[ -]?in/i);
  assert.match(script, /renderFeatures/);
  assert.match(script, /startCountdown/);
  assert.match(script, /cache: "no-store"/);
});
