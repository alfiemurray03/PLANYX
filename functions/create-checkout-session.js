import { readFeatureFlag } from "./_shared/feature-flags.js";
import { expireOidcCookie, getNativeSession, loginRedirect } from "./_shared/oidc.js";
import { issueCustomerAgeChallenge } from "./_shared/customerops-age-assurance.js";
import {
  blocksAccess,
  checkHeadOfficeAccess,
  isHeadOfficeAgeStepUp,
  revokeLocalCustomerSession
} from "./_shared/customerops-central.js";

const DEFAULT_PLANS = [
  ["personal", "Explore Plan", "Standard monthly subscription", "£5.99", 599, "prod_UtkvP5dvxrwLNa", "price_1TtxPrDZzb3r6Q3cIViE64O4", "Essential planning builders", "Save and revisit your plans", "A simple starting point for exploring ideas and building clear, practical plans.", "Start 30-day free trial", 1, 0, 10],
  ["standard", "Plan Plan", "Standard monthly subscription", "£7.99", 799, "prod_UtkvpswzvV53y7", "price_1TtxPyDZzb3r6Q3cg9hcgXeA", "More builders and planning tools", "Download your finished plans", "For regularly creating detailed destination, itinerary, experience and everyday plans.", "Start 30-day free trial", 1, 1, 20],
  ["professional", "Complete Plan", "Standard monthly subscription", "£14.99", 1499, "prod_Utkv85XaRxReja", "price_1TtxQ5DZzb3r6Q3c0XxvHRDY", "Full planning-builder access", "Enhanced planning and outputs", "Complete access for building and managing more comprehensive personalised plans.", "Start 30-day free trial", 1, 0, 30],
  ["org_starter", "Together Plan", "Standard monthly subscription", "£39.99", 3999, "prod_Utkwas33GBC6Yn", "price_1TtxQDDZzb3r6Q3cI8rCEJwJ", "High-capacity personal planning", "All builders and unlimited use", "High-capacity private planning for households and individuals who do not need an organisation workspace.", "Start 30-day free trial", 1, 0, 40],
  ["business_personal", "Explore Plan", "Business monthly subscription", "£5.99", 599, "prod_Uwgus0xRHwgrlj", "price_1TwnWFDZzb3r6Q3c0SKHckVo", "Essential business planning builders", "Read-only itinerary sharing", "For small businesses and organisations that need core planning tools and a separate organisation workspace.", "Start 30-day free trial", 1, 0, 110],
  ["business_standard", "Plan Plan", "Business monthly subscription", "£7.99", 799, "prod_UwgunfLOeoBA9V", "price_1TwnWVDZzb3r6Q3caG24V63l", "Expanded business planning builders", "Read-only itinerary sharing", "For organisations that need a wider range of guided builders and regular read-only sharing.", "Start 30-day free trial", 1, 1, 120],
  ["business_professional", "Complete Plan", "Business monthly subscription", "£14.99", 1499, "prod_UwgujYPsJYBj1F", "price_1TwnWjDZzb3r6Q3crQKwr2bw", "Complete business planning access", "Advanced tools and read-only sharing", "For organisations that need full planning-builder access, advanced planning tools and read-only sharing.", "Start 30-day free trial", 1, 0, 130],
  ["business_org_starter", "Together Plan", "Business monthly subscription", "£39.99", 3999, "prod_Uwgu4EVCfy4wKb", "price_1TwnWxDZzb3r6Q3cxqCPgI3o", "Shared planning for teams", "Invited editing and member workspace", "For businesses, teams and organisations that need shared planning, invited editing and member administration.", "Start 30-day free trial", 1, 0, 140]
];

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const planCode = String(url.searchParams.get("plan") || "").trim();
    const accountType = String(url.searchParams.get("accountType") || "").trim();
    if (!planCode) return redirectTo(getSiteUrl(context.env) + "/pricing/");

    const identity = await customerIdentity(context);
    if (!identity?.email) return loginRedirect(context.request, "customer");
    const authority = await requireCheckoutAccess(context, identity);
    if (authority.response) return authority.response;
    return await createCheckoutSession(planCode, accountType, context.env, identity, authority.access);
  } catch (error) {
    console.error(JSON.stringify({ event: "checkout_get_failed", message: errorMessage(error) }));
    return redirectTo(getSiteUrl(context.env) + "/pricing/?checkout=unavailable");
  }
}

export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const planCode = String(formData.get("plan") || "").trim();
    const accountType = String(formData.get("accountType") || "").trim();
    const identity = await customerIdentity(context);
    if (!identity?.email) return loginRedirect(context.request, "customer");
    const authority = await requireCheckoutAccess(context, identity);
    if (authority.response) return authority.response;
    return await createCheckoutSession(planCode, accountType, context.env, identity, authority.access);
  } catch (error) {
    console.error(JSON.stringify({ event: "checkout_post_failed", message: errorMessage(error) }));
    return redirectTo(getSiteUrl(context.env) + "/pricing/?checkout=unavailable");
  }
}

async function customerIdentity(context) {
  try {
    return await getNativeSession(context.request, context.env, "customer");
  } catch (error) {
    console.error(JSON.stringify({ event: "checkout_customer_session_unavailable", message: errorMessage(error) }));
    return null;
  }
}

function protectedCheckoutRedirect(path, challengeCookie = "") {
  const headers = new Headers({ Location: path, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  headers.append("Set-Cookie", expireOidcCookie("customer"));
  if (challengeCookie) headers.append("Set-Cookie", challengeCookie);
  return new Response(null, { status: 303, headers });
}

async function requireCheckoutAccess(context, identity) {
  if (!context.env?.DB || !identity?.email) {
    return { response: protectedCheckoutRedirect("/account/access-restricted/") };
  }
  try {
    const result = await checkHeadOfficeAccess(context.env, context.env.DB, identity);
    const access = result.access || { decision: "review", revokeSessions: true };
    if (!blocksAccess(access)) return { access };

    let challengeCookie = "";
    if (isHeadOfficeAgeStepUp(access)) {
      const challenge = await issueCustomerAgeChallenge(context.env.DB, identity, result.reference, access.ageAssurance);
      challengeCookie = challenge.cookie;
    }
    await revokeLocalCustomerSession(context.env.DB, identity, access.reason || "Head Office checkout protection");
    return {
      response: protectedCheckoutRedirect(
        isHeadOfficeAgeStepUp(access) ? "/account/verification-required/" : "/account/access-restricted/",
        challengeCookie
      )
    };
  } catch (error) {
    await revokeLocalCustomerSession(context.env.DB, identity, errorMessage(error)).catch(() => null);
    return { response: protectedCheckoutRedirect("/account/access-restricted/") };
  }
}

async function createCheckoutSession(planCode, requestedAccountType, env, identity, access) {
  const siteUrl = getSiteUrl(env);
  if (!env || !env.DB) return redirectTo(siteUrl + "/pricing/?checkout=unavailable");

  const paymentsEnabled = await readFeatureFlag(env.DB, "payments", false);
  if (!paymentsEnabled) return redirectTo(siteUrl + "/pricing/?payments=disabled");

  const stripeSecret = await getStripeSecret(env);
  if (!stripeSecret) {
    console.error(JSON.stringify({ event: "checkout_stripe_secret_missing" }));
    return redirectTo(siteUrl + "/pricing/?checkout=unavailable");
  }

  await syncServicePlans(env.DB);

  const selectedPlan = await env.DB.prepare(`
    SELECT id, plan_name, plan_type, price_label, price_pence, stripe_product_id, stripe_price_id, is_active
    FROM service_plans WHERE id = ?
  `).bind(planCode).first();

  if (!selectedPlan || Number(selectedPlan.is_active || 0) !== 1) return redirectTo(siteUrl + "/pricing/?plan=coming-soon");

  const businessPlan = String(selectedPlan.id || "").startsWith("business_");
  const accountType = businessPlan ? "organisation" : "individual";
  if (requestedAccountType && ![accountType, businessPlan ? "business" : "personal"].includes(requestedAccountType.toLowerCase())) {
    return redirectTo(siteUrl + "/pricing/?plan=account-type-mismatch");
  }

  const priceId = await resolveStripePriceId(selectedPlan, env, env.DB, stripeSecret);
  if (!priceId) {
    console.error(JSON.stringify({ event: "checkout_price_unresolved", planCode }));
    return redirectTo(siteUrl + "/pricing/?checkout=unavailable");
  }

  const params = new URLSearchParams();
  params.append("mode", "subscription");
  params.append("line_items[0][price]", priceId);
  params.append("line_items[0][quantity]", "1");
  params.append("billing_address_collection", "auto");
  params.append("allow_promotion_codes", "true");
  const accountEmail = String(identity.email || "").trim().toLowerCase();
  const profile = await env.DB.prepare(`SELECT stripe_customer_id, age_band, minor_safeguards_enabled
    FROM profiles WHERE lower(email) = lower(?)`).bind(accountEmail).first().catch(() => null);
  const threshold = Number(access?.ageAssurance?.evidence?.confirmedMinimumAge || access?.ageAssurance?.minimumAge || 16);
  const ageDescriptor = String(profile?.age_band || `${threshold}+`);
  if (profile?.stripe_customer_id) params.append("customer", String(profile.stripe_customer_id));
  else params.append("customer_email", accountEmail);
  params.append("client_reference_id", accountEmail);
  params.append("subscription_data[trial_period_days]", "30");
  params.append("success_url", siteUrl + "/payment-success/?session_id={CHECKOUT_SESSION_ID}");
  params.append("cancel_url", siteUrl + "/pricing/?payment=cancelled");
  params.append("metadata[service_line]", "Sousa Murray Planeia");
  params.append("metadata[plan_code]", selectedPlan.id);
  params.append("metadata[plan_name]", selectedPlan.plan_name || selectedPlan.id);
  params.append("metadata[plan_type]", selectedPlan.plan_type || "");
  params.append("metadata[account_type]", accountType);
  params.append("metadata[catalogue]", businessPlan ? "business" : "standard");
  params.append("metadata[account_email]", accountEmail);
  params.append("metadata[age_band]", ageDescriptor);
  params.append("metadata[age_assurance_authority]", "HEAD_OFFICE");
  params.append("metadata[age_assurance_threshold]", String(threshold));
  params.append("metadata[young_person_safeguards]", Number(profile?.minor_safeguards_enabled || 0) === 1 ? "enabled" : "head_office_policy");
  params.append("subscription_data[metadata][service_line]", "Sousa Murray Planeia");
  params.append("subscription_data[metadata][plan_code]", selectedPlan.id);
  params.append("subscription_data[metadata][plan_name]", selectedPlan.plan_name || selectedPlan.id);
  params.append("subscription_data[metadata][account_type]", accountType);
  params.append("subscription_data[metadata][catalogue]", businessPlan ? "business" : "standard");
  params.append("subscription_data[metadata][customer_email]", accountEmail);
  params.append("subscription_data[metadata][age_band]", ageDescriptor);
  params.append("subscription_data[metadata][age_assurance_authority]", "HEAD_OFFICE");
  params.append("subscription_data[metadata][age_assurance_threshold]", String(threshold));

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { "Authorization": "Bearer " + stripeSecret, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  const responseText = await stripeResponse.text();
  let session;
  try {
    session = JSON.parse(responseText);
  } catch {
    console.error(JSON.stringify({ event: "checkout_stripe_non_json", status: stripeResponse.status }));
    return redirectTo(siteUrl + "/pricing/?checkout=unavailable");
  }

  if (!stripeResponse.ok || !session?.url) {
    console.error(JSON.stringify({ event: "checkout_stripe_rejected", status: stripeResponse.status, message: session?.error?.message || "Stripe did not return a Checkout URL." }));
    return redirectTo(siteUrl + "/pricing/?checkout=unavailable");
  }

  return redirectTo(session.url);
}

async function syncServicePlans(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS service_plans (
      id TEXT PRIMARY KEY, plan_name TEXT, plan_type TEXT, price_label TEXT, price_pence INTEGER,
      stripe_price_id TEXT, delivery_time TEXT, revisions TEXT, description TEXT, button_label TEXT,
      is_active INTEGER DEFAULT 1, is_featured INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 100,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();
  await safeAlter(DB, `ALTER TABLE service_plans ADD COLUMN stripe_product_id TEXT`);
  for (const plan of DEFAULT_PLANS) {
    await DB.prepare(`INSERT INTO service_plans (
        id, plan_name, plan_type, price_label, price_pence, stripe_product_id, stripe_price_id,
        delivery_time, revisions, description, button_label, is_active, is_featured, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`).bind(...plan).run();
  }
}

async function getStripeSecret(env) {
  const stored = await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'stripe_secret_key'").first().catch(() => null);
  return String(stored?.value || env.STRIPE_SECRET_KEY || "").trim();
}

async function resolveStripePriceId(plan, env, DB, stripeSecret) {
  if (plan.stripe_price_id) return String(plan.stripe_price_id);
  const overrideByPlan = { personal: "stripe_price_personal_override", standard: "stripe_price_standard_override", professional: "stripe_price_professional_override", org_starter: "stripe_price_org_starter_override" };
  const overrideKey = overrideByPlan[plan.id];
  if (DB && overrideKey) {
    const row = await DB.prepare("SELECT value FROM site_settings WHERE key = ?").bind(overrideKey).first().catch(() => null);
    const override = String(row?.value || "").trim();
    if (override) return override;
  }
  const secretByPlan = { personal: "STRIPE_PRICE_EXPLORE", standard: "STRIPE_PRICE_PLAN", professional: "STRIPE_PRICE_COMPLETE", org_starter: "STRIPE_PRICE_TOGETHER" };
  const configured = env[secretByPlan[plan.id]];
  if (configured) return String(configured);
  const response = await fetch("https://api.stripe.com/v1/prices?active=true&type=recurring&limit=100&expand[]=data.product", { headers: { "Authorization": "Bearer " + stripeSecret } });
  if (!response.ok) return "";
  const catalogue = await response.json();
  const stripeProductNames = {
    personal: "Sousa Murray Planeia – Explore", standard: "Sousa Murray Planeia – Plan", professional: "Sousa Murray Planeia – Complete", org_starter: "Sousa Murray Planeia – Together",
    business_personal: "Sousa Murray Planeia Business – Explore", business_standard: "Sousa Murray Planeia Business – Plan", business_professional: "Sousa Murray Planeia Business – Complete", business_org_starter: "Sousa Murray Planeia Business – Together"
  };
  const acceptedNames = new Set([String(plan.plan_name || "").trim().toLowerCase(), String(stripeProductNames[plan.id] || "").trim().toLowerCase()]);
  const match = (catalogue.data || []).find(price => {
    const product = price && typeof price.product === "object" ? price.product : null;
    return product && product.active !== false
      && acceptedNames.has(String(product.name || "").trim().toLowerCase())
      && String(price.currency || "").toLowerCase() === "gbp"
      && Number(price.unit_amount || 0) === Number(plan.price_pence || 0)
      && price.recurring && price.recurring.interval === "month";
  });
  return match?.id ? String(match.id) : "";
}

async function safeAlter(DB, sql) {
  try { await DB.prepare(sql).run(); } catch { /* Column already exists. */ }
}

function getSiteUrl(env) {
  return String(env?.SITE_URL || "https://sousamurrayplaneia.jagroupservices.co.uk").replace(/\/+$/, "");
}

function redirectTo(url) {
  return new Response("", { status: 303, headers: { "Location": url, "Cache-Control": "no-store" } });
}

function errorMessage(error) {
  return error?.message ? error.message : String(error);
}
