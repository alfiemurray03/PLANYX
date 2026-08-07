const DEFAULT_HEAD_OFFICE_URL = "https://customerops.jagroupservices.co.uk";
const BRAND = "SOUSA_MURRAY_PLANEIA";

export const PLANEIA_CENTRAL_PLANS = Object.freeze({
  personal: Object.freeze({ productCode: "PLANEIA_EXPLORE", priceCode: "PLANEIA_EXPLORE_MONTHLY", planCode: "personal", planName: "Explore Plan" }),
  standard: Object.freeze({ productCode: "PLANEIA_PLAN", priceCode: "PLANEIA_PLAN_MONTHLY", planCode: "standard", planName: "Plan Plan" }),
  professional: Object.freeze({ productCode: "PLANEIA_COMPLETE", priceCode: "PLANEIA_COMPLETE_MONTHLY", planCode: "professional", planName: "Complete Plan" }),
  org_starter: Object.freeze({ productCode: "PLANEIA_TOGETHER", priceCode: "PLANEIA_TOGETHER_MONTHLY", planCode: "org_starter", planName: "Together Plan" }),
  business_personal: Object.freeze({ productCode: "PLANEIA_BUSINESS_EXPLORE", priceCode: "PLANEIA_BUSINESS_EXPLORE_MONTHLY", planCode: "personal", planName: "Explore Plan" }),
  business_standard: Object.freeze({ productCode: "PLANEIA_BUSINESS_PLAN", priceCode: "PLANEIA_BUSINESS_PLAN_MONTHLY", planCode: "standard", planName: "Plan Plan" }),
  business_professional: Object.freeze({ productCode: "PLANEIA_BUSINESS_COMPLETE", priceCode: "PLANEIA_BUSINESS_COMPLETE_MONTHLY", planCode: "professional", planName: "Complete Plan" }),
  business_org_starter: Object.freeze({ productCode: "PLANEIA_BUSINESS_TOGETHER", priceCode: "PLANEIA_BUSINESS_TOGETHER_MONTHLY", planCode: "org_starter", planName: "Together Plan" }),
});

const PRICE_TO_LOCAL_PLAN = Object.freeze(Object.fromEntries(
  Object.values(PLANEIA_CENTRAL_PLANS).map(plan => [plan.priceCode, plan])
));

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function headOfficeOrigin(env) {
  const value = clean(env.CUSTOMEROPS_BASE_URL || DEFAULT_HEAD_OFFICE_URL, 500).replace(/\/$/, "");
  const url = new URL(value);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw Object.assign(new Error("CUSTOMEROPS_BASE_URL must use HTTPS."), { code: "CENTRAL_PAYMENTS_URL_INVALID" });
  }
  return url.origin;
}

function credential(env) {
  return clean(env.CUSTOMEROPS_API_KEY, 500);
}

export function centralPaymentsConfigured(env) {
  return credential(env).length > 20;
}

async function requestCentralPayments(env, path, { method = "GET", body } = {}) {
  const token = credential(env);
  if (!token) throw Object.assign(new Error("The Head Office Central Payments connector is not configured."), { code: "CENTRAL_PAYMENTS_NOT_CONFIGURED", status: 503 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${headOfficeOrigin(env)}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        "User-Agent": "Sousa-Murray-Planeia-Central-Payments/1.0",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const issue = new Error(clean(payload?.error?.message || payload?.message || `Central Payments returned HTTP ${response.status}.`, 1000));
      issue.code = clean(payload?.error?.code || "CENTRAL_PAYMENTS_REQUEST_FAILED", 120);
      issue.status = response.status;
      throw issue;
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("Head Office Central Payments did not respond in time."), { code: "CENTRAL_PAYMENTS_TIMEOUT", status: 504 });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function profileForEmail(DB, email) {
  return DB.prepare(`SELECT email,universal_customer_number,stripe_customer_id,membership_status,membership_renewal_at
    FROM profiles WHERE lower(email)=lower(?) LIMIT 1`).bind(clean(email, 254).toLowerCase()).first();
}

function requireUcn(profile) {
  const ucn = clean(profile?.universal_customer_number, 20).replace(/\s/g, "");
  if (!/^\d{10}$/.test(ucn)) {
    throw Object.assign(new Error("Your JA Group Services UCN is required before starting Central Payments checkout."), { code: "CENTRAL_PAYMENTS_UCN_REQUIRED", status: 409 });
  }
  return ucn;
}

export async function createPlaneiaCentralCheckout(env, DB, identity, planId, accountType, siteUrl) {
  const plan = PLANEIA_CENTRAL_PLANS[planId];
  if (!plan) throw Object.assign(new Error("That Sousa Murray Planeia plan is not available through Central Payments."), { code: "CENTRAL_PLAN_NOT_FOUND", status: 404 });
  const profile = await profileForEmail(DB, identity?.email);
  if (!profile) throw Object.assign(new Error("Your Sousa Murray Planeia customer profile could not be found."), { code: "CUSTOMER_PROFILE_NOT_FOUND", status: 404 });
  const ucn = requireUcn(profile);
  const orderReference = `PLANEIA-${planId.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-${crypto.randomUUID()}`;
  const payload = await requestCentralPayments(env, "/api/v1/payments/checkout", {
    method: "POST",
    body: {
      brand: BRAND,
      customerNumber: ucn,
      productCode: plan.productCode,
      priceCode: plan.priceCode,
      orderReference,
      serviceReference: `${accountType || "individual"}:${planId}`,
      successUrl: `${siteUrl}/payment-success/?central_payment=success`,
      cancelUrl: `${siteUrl}/pricing/?payment=cancelled`,
    },
  });
  if (!payload?.checkout?.url) throw Object.assign(new Error("Head Office did not return a Central Payments Checkout URL."), { code: "CENTRAL_CHECKOUT_URL_MISSING", status: 502 });
  return payload.checkout;
}

export async function createPlaneiaBillingPortal(env, DB, email, returnUrl) {
  const profile = await profileForEmail(DB, email);
  if (!profile) throw Object.assign(new Error("Your Sousa Murray Planeia customer profile could not be found."), { code: "CUSTOMER_PROFILE_NOT_FOUND", status: 404 });
  const ucn = requireUcn(profile);
  const payload = await requestCentralPayments(env, "/api/v1/payments/portal", {
    method: "POST",
    body: { brand: BRAND, customerNumber: ucn, returnUrl },
  });
  if (!payload?.portal?.url) throw Object.assign(new Error("Head Office did not return the Central Payments Billing Portal URL."), { code: "CENTRAL_PORTAL_URL_MISSING", status: 502 });
  return payload.portal;
}

export async function readPlaneiaCentralBilling(env, DB, email) {
  const profile = await profileForEmail(DB, email);
  if (!profile) return { profile: null, subscriptions: [], transactions: [], checkoutRequests: [] };
  const ucn = requireUcn(profile);
  const payload = await requestCentralPayments(env, `/api/v1/payments/status?customerNumber=${encodeURIComponent(ucn)}`);
  return { profile, ...payload };
}

async function ensureLocalBillingTables(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS stripe_subscriptions (
    id TEXT PRIMARY KEY, customer_id TEXT, customer_email TEXT, plan_code TEXT, plan_name TEXT,
    price_id TEXT, status TEXT, billing_status TEXT, billing_interval TEXT, subscription_start TEXT,
    current_period_start TEXT, current_period_end TEXT, next_payment_at TEXT, trial_start TEXT,
    trial_end TEXT, cancel_at_period_end INTEGER DEFAULT 0, cancel_at TEXT, canceled_at TEXT,
    latest_invoice_id TEXT, payment_method_brand TEXT, payment_method_last4 TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  for (const statement of [
    `ALTER TABLE profiles ADD COLUMN stripe_customer_id TEXT`,
    `ALTER TABLE profiles ADD COLUMN stripe_customer_synced_at TEXT`,
    `ALTER TABLE profiles ADD COLUMN membership_status TEXT DEFAULT 'Standard'`,
    `ALTER TABLE profiles ADD COLUMN membership_renewal_at TEXT`,
  ]) await DB.prepare(statement).run().catch(() => null);
}

export async function syncPlaneiaCentralBilling(env, DB, email) {
  if (!centralPaymentsConfigured(env) || !DB || !email) return { skipped: true };
  const data = await readPlaneiaCentralBilling(env, DB, email);
  if (!data.profile) return { skipped: true };
  await ensureLocalBillingTables(DB);
  const current = [...(data.subscriptions || [])].sort((a, b) => {
    const rank = value => ["active", "trialing", "past_due", "unpaid", "incomplete", "paused", "canceled", "cancelled"].indexOf(String(value || "").toLowerCase());
    return rank(a.status) - rank(b.status);
  })[0] || null;

  if (!current) return { synced: true, subscription: null };
  const plan = PRICE_TO_LOCAL_PLAN[String(current.price_code || "").toUpperCase()] || null;
  const status = clean(current.status, 80).toLowerCase();
  const customerId = clean(current.stripe_customer_id, 120) || null;
  const planName = plan?.planName || clean(current.product_code, 120) || "Central Payments subscription";
  const planCode = plan?.planCode || null;
  const isTrial = status === "trialing";
  const billingStatus = ["active", "trialing"].includes(status) ? (isTrial ? "trialing" : "paid") : status;

  await DB.prepare(`INSERT INTO stripe_subscriptions (
      id,customer_id,customer_email,plan_code,plan_name,status,billing_status,billing_interval,
      current_period_start,current_period_end,next_payment_at,trial_end,cancel_at_period_end,canceled_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET customer_id=excluded.customer_id,customer_email=excluded.customer_email,
      plan_code=excluded.plan_code,plan_name=excluded.plan_name,status=excluded.status,billing_status=excluded.billing_status,
      billing_interval=excluded.billing_interval,current_period_start=excluded.current_period_start,
      current_period_end=excluded.current_period_end,next_payment_at=excluded.next_payment_at,trial_end=excluded.trial_end,
      cancel_at_period_end=excluded.cancel_at_period_end,canceled_at=excluded.canceled_at,updated_at=CURRENT_TIMESTAMP`)
    .bind(
      current.stripe_subscription_id,
      customerId,
      clean(email, 254).toLowerCase(),
      planCode,
      planName,
      status,
      billingStatus,
      "month",
      current.current_period_start || null,
      current.current_period_end || null,
      current.current_period_end || null,
      isTrial ? current.current_period_end || null : null,
      current.cancel_at_period_end ? 1 : 0,
      current.cancelled_at || null,
    ).run();

  if (customerId) {
    const membership = ["active", "trialing"].includes(status) ? planName : status === "past_due" ? "Past due" : "Standard";
    await DB.prepare(`UPDATE profiles SET stripe_customer_id=?,stripe_customer_synced_at=CURRENT_TIMESTAMP,
      membership_status=?,membership_renewal_at=?,updated_at=CURRENT_TIMESTAMP WHERE lower(email)=lower(?)`)
      .bind(customerId, membership, current.current_period_end || null, clean(email, 254).toLowerCase()).run();
  }

  return { synced: true, subscription: current, plan };
}
