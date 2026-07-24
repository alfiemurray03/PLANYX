import { assertSameOrigin, getNativeSession, withIdentity } from "../../../_shared/oidc.js";

const APPROVED_PLAN_PRICES = [
  { key: "personal", configKey: "stripe_price_personal_override", envKeys: ["STRIPE_PRICE_EXPLORE", "STRIPE_PRICE_PERSONAL"], label: "Explore Plan", amount: 599, productId: "prod_UtkvP5dvxrwLNa", productNames: ["Explore Plan", "Planyx – Explore", "Planyx - Explore"], defaultPriceId: "price_1TtxPrDZzb3r6Q3cIViE64O4" },
  { key: "standard", configKey: "stripe_price_standard_override", envKeys: ["STRIPE_PRICE_PLAN", "STRIPE_PRICE_STANDARD"], label: "Plan Plan", amount: 799, productId: "prod_UtkvpswzvV53y7", productNames: ["Plan Plan", "Planyx – Plan", "Planyx - Plan"], defaultPriceId: "price_1TtxPyDZzb3r6Q3cg9hcgXeA" },
  { key: "professional", configKey: "stripe_price_professional_override", envKeys: ["STRIPE_PRICE_COMPLETE", "STRIPE_PRICE_PROFESSIONAL"], label: "Complete Plan", amount: 1499, productId: "prod_Utkv85XaRxReja", productNames: ["Complete Plan", "Planyx – Complete", "Planyx - Complete"], defaultPriceId: "price_1TtxQ5DZzb3r6Q3c0XxvHRDY" },
  { key: "org_starter", configKey: "stripe_price_org_starter_override", envKeys: ["STRIPE_PRICE_TOGETHER", "STRIPE_PRICE_ORG_STARTER"], label: "Together Plan", amount: 3999, productId: "prod_Utkwas33GBC6Yn", productNames: ["Together Plan", "Planyx – Together", "Planyx - Together"], defaultPriceId: "price_1TtxQDDZzb3r6Q3cI8rCEJwJ" },
  { key: "business_personal", configKey: "", envKeys: [], label: "Business Explore Plan", amount: 599, productId: "prod_Uwgus0xRHwgrlj", productNames: ["Explore Plan", "Planyx Business – Explore", "Planyx Business - Explore"], defaultPriceId: "price_1TwnWFDZzb3r6Q3c0SKHckVo" },
  { key: "business_standard", configKey: "", envKeys: [], label: "Business Plan Plan", amount: 799, productId: "prod_UwgunfLOeoBA9V", productNames: ["Plan Plan", "Planyx Business – Plan", "Planyx Business - Plan"], defaultPriceId: "price_1TwnWVDZzb3r6Q3caG24V63l" },
  { key: "business_professional", configKey: "", envKeys: [], label: "Business Complete Plan", amount: 1499, productId: "prod_UwgujYPsJYBj1F", productNames: ["Complete Plan", "Planyx Business – Complete", "Planyx Business - Complete"], defaultPriceId: "price_1TwnWjDZzb3r6Q3crQKwr2bw" },
  { key: "business_org_starter", configKey: "", envKeys: [], label: "Business Together Plan", amount: 3999, productId: "prod_Uwgu4EVCfy4wKb", productNames: ["Together Plan", "Planyx Business – Together", "Planyx Business - Together"], defaultPriceId: "price_1TwnWxDZzb3r6Q3cxqCPgI3o" }
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function configuredAdmins(env) {
  const raw = env.ADMIN_EMAILS || env.ADMIN_EMAIL || "alfieholywoodmurray@jagroupservices.co.uk";
  return String(raw).split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

async function isAuthorisedAdmin(env, identity) {
  const email = String(identity?.email || "").trim().toLowerCase();
  if (!email) return false;
  if (configuredAdmins(env).includes(email)) return true;
  if (!env.DB) return false;
  try {
    const admin = await env.DB.prepare("SELECT status FROM admin_users WHERE lower(email)=lower(?)").bind(email).first();
    const status = String(admin?.status || "active").trim().toLowerCase();
    return Boolean(admin) && !["blocked", "closed", "disabled", "inactive", "suspended"].includes(status);
  } catch {
    return false;
  }
}

async function requestBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

async function readSetting(DB, key) {
  if (!DB || !key) return "";
  try {
    const row = await DB.prepare("SELECT value FROM site_settings WHERE key=?").bind(key).first();
    return String(row?.value || "").trim();
  } catch {
    return "";
  }
}

function uniqueNames(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

async function loadExpectedPlans(DB) {
  let rows = [];
  try {
    const result = await DB.prepare(`
      SELECT id, plan_name, price_pence, stripe_product_id, stripe_price_id
      FROM service_plans
      ORDER BY sort_order ASC, plan_name ASC
    `).all();
    rows = result.results || [];
  } catch {
    rows = [];
  }

  return APPROVED_PLAN_PRICES.map((approved) => {
    const record = rows.find((row) => row.id === approved.key);
    const editedAmount = Number(record?.price_pence);
    return {
      ...approved,
      label: String(record?.plan_name || approved.label).trim(),
      amount: Number.isFinite(editedAmount) && editedAmount >= 0 ? editedAmount : approved.amount,
      productId: String(record?.stripe_product_id || approved.productId).trim(),
      productNames: uniqueNames([record?.plan_name, ...approved.productNames]),
      databasePriceId: String(record?.stripe_price_id || "").trim()
    };
  });
}

function submittedPrice(body, plan) {
  const values = body.prices && typeof body.prices === "object" ? body.prices : body;
  return String(values?.[plan.configKey] ?? values?.[plan.key] ?? "").trim();
}

async function resolvePriceId(env, body, plan) {
  const submitted = submittedPrice(body, plan);
  if (submitted) return { id: submitted, source: "submitted" };

  if (plan.databasePriceId) return { id: plan.databasePriceId, source: "database" };

  const saved = await readSetting(env.DB, plan.configKey);
  if (saved) return { id: saved, source: "database" };

  for (const envKey of plan.envKeys || []) {
    const configured = String(env[envKey] || "").trim();
    if (configured) return { id: configured, source: "secret" };
  }

  return { id: plan.defaultPriceId, source: "default" };
}

function invalidResult(plan, id, source, error, extra = {}) {
  return { set: Boolean(id), valid: false, label: plan.label, id: id || undefined, source, error, ...extra };
}

function normaliseName(value) {
  return String(value || "").trim().toLowerCase();
}

export async function verifyConfiguredPrice(fetchImpl, secretKey, plan, id, source) {
  if (!id) return invalidResult(plan, "", source, "No Price ID is configured.");
  if (!/^price_[A-Za-z0-9]+$/.test(id)) return invalidResult(plan, id, source, "This is not a valid Stripe Price ID format.");
  if (!secretKey) return invalidResult(plan, id, source, "The Stripe secret key is not configured.");

  let response;
  let payload;
  try {
    const params = new URLSearchParams();
    params.append("expand[]", "product");
    response = await fetchImpl(`https://api.stripe.com/v1/prices/${encodeURIComponent(id)}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    payload = await response.json().catch(() => ({}));
  } catch {
    return invalidResult(plan, id, source, "Stripe could not be reached. Please try again.");
  }

  if (!response.ok || payload?.error) return invalidResult(plan, id, source, String(payload?.error?.message || "Stripe could not find this Price ID."));

  const product = payload && typeof payload.product === "object" ? payload.product : null;
  const productId = product?.id || (typeof payload.product === "string" ? payload.product : "");
  const productName = String(product?.name || "").trim();
  const acceptedNames = new Set((plan.productNames || []).map(normaliseName));
  const productMatches = productId === plan.productId || acceptedNames.has(normaliseName(productName));
  const priceActive = payload.active !== false;
  const productActive = product ? product.active !== false : true;
  const currencyMatches = String(payload.currency || "").toLowerCase() === "gbp";
  const amountMatches = Number(payload.unit_amount) === Number(plan.amount);
  const intervalMatches = payload.recurring?.interval === "month" && Number(payload.recurring?.interval_count || 1) === 1;

  const failures = [];
  if (!productMatches) failures.push(`belongs to the wrong product (expected ${plan.label})`);
  if (!amountMatches) failures.push(`has the wrong amount (expected £${(Number(plan.amount) / 100).toFixed(2)})`);
  if (!currencyMatches) failures.push("is not priced in GBP");
  if (!intervalMatches) failures.push("is not a monthly recurring price");
  if (!priceActive) failures.push("is inactive");
  if (!productActive) failures.push("belongs to an inactive product");

  const valid = failures.length === 0;
  return {
    set: true,
    valid,
    label: plan.label,
    id: String(payload.id || id),
    source,
    product: productName || productId || "Unknown product",
    productId: productId || undefined,
    amount: typeof payload.unit_amount === "number" ? payload.unit_amount : null,
    currency: String(payload.currency || "").toUpperCase(),
    interval: payload.recurring?.interval || "one_time",
    active: priceActive && productActive,
    matchesExpectedId: id === plan.defaultPriceId,
    checks: { productMatches, amountMatches, currencyMatches, intervalMatches, priceActive, productActive },
    error: valid ? undefined : `Price ID ${failures.join(", ")}.`
  };
}

async function writeAudit(env, identity, results) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(`INSERT INTO admin_audit_log
      (id, actor_email, action, entity_type, entity_id, summary, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(), identity.email, "stripe.verify_prices", "stripe", "subscription_prices",
        "Verified all Planyx Standard and Business Stripe Price IDs.",
        JSON.stringify({ valid: Object.values(results).filter((item) => item.valid).length, total: Object.keys(results).length })
      ).run();
  } catch {
    // Verification must still complete if audit storage is unavailable.
  }
}

export async function onRequestPost(context) {
  const { env } = context;
  let request = withIdentity(context.request, null);
  let identity;
  try {
    identity = await getNativeSession(request, env, "admin");
  } catch {
    return json({ success: false, error: "Stripe verification is temporarily unavailable. Please try again." }, 503);
  }

  if (!identity) return json({ success: false, error: "Administrator session required." }, 401);
  if (!(await isAuthorisedAdmin(env, identity))) return json({ success: false, error: "Administrator access was denied." }, 403);
  if (!assertSameOrigin(request)) return json({ success: false, error: "Request origin was rejected." }, 403);

  request = withIdentity(request, identity);
  const body = await requestBody(request);
  const storedSecret = await readSetting(env.DB, "stripe_secret_key");
  const secretKey = storedSecret || String(env.STRIPE_SECRET_KEY || "").trim();
  const expectedPlans = await loadExpectedPlans(env.DB);
  const results = {};

  for (const plan of expectedPlans) {
    const { id, source } = await resolvePriceId(env, body, plan);
    results[plan.key] = await verifyConfiguredPrice(fetch, secretKey, plan, id, source);
  }

  await writeAudit(env, identity, results);
  return json({
    success: true,
    prices: results,
    summary: {
      valid: Object.values(results).filter((item) => item.valid).length,
      total: Object.keys(results).length,
      allValid: Object.values(results).every((item) => item.valid)
    }
  });
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  return onRequestPost(context);
}
