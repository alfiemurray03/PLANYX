import { readFeatureFlag } from "./_shared/feature-flags.js";
import { getNativeSession, loginRedirect } from "./_shared/oidc.js";

const DEFAULT_PLANS = [
  ["personal", "Explore Plan", "Monthly subscription", "£5.99", 599, "prod_UtkvP5dvxrwLNa", "price_1TtxPrDZzb3r6Q3cIViE64O4", "Essential planning builders", "Save and revisit your plans", "A simple starting point for exploring ideas and building clear, practical plans.", "Start 30-day free trial", 1, 0, 10],
  ["standard", "Plan Plan", "Monthly subscription", "£7.99", 799, "prod_UtkvpswzvV53y7", "price_1TtxPyDZzb3r6Q3cg9hcgXeA", "More builders and planning tools", "Download your finished plans", "For regularly creating detailed destination, itinerary, experience and everyday plans.", "Start 30-day free trial", 1, 1, 20],
  ["professional", "Complete Plan", "Monthly subscription", "£14.99", 1499, "prod_Utkv85XaRxReja", "price_1TtxQ5DZzb3r6Q3c0XxvHRDY", "Full planning-builder access", "Enhanced planning and outputs", "Complete access for building and managing more comprehensive personalised plans.", "Start 30-day free trial", 1, 0, 30],
  ["org_starter", "Together Plan", "Monthly subscription", "£39.99", 3999, "prod_Utkwas33GBC6Yn", "price_1TtxQDDZzb3r6Q3cI8rCEJwJ", "Shared planning for groups", "All builders and collaborative tools", "Shared planning for households, families and groups who want to build plans together.", "Start 30-day free trial", 1, 0, 40]
];

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const planCode = String(url.searchParams.get("plan") || "").trim();

    if (!planCode) {
      return redirectTo(getSiteUrl(context.env) + "/pricing/");
    }

    const identity = await customerIdentity(context);
    if (!identity?.email) return loginRedirect(context.request, "customer");
    return await createCheckoutSession(planCode, context.env, identity);
  } catch (error) {
    console.error(JSON.stringify({ event: "checkout_get_failed", message: errorMessage(error) }));
    return redirectTo(getSiteUrl(context.env) + "/pricing/?checkout=unavailable");
  }
}

export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const planCode = String(formData.get("plan") || "").trim();
    const identity = await customerIdentity(context);
    if (!identity?.email) return loginRedirect(context.request, "customer");
    return await createCheckoutSession(planCode, context.env, identity);
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

async function createCheckoutSession(planCode, env, identity) {
  const siteUrl = getSiteUrl(env);
  if (!env || !env.DB) {
    return redirectTo(siteUrl + "/pricing/?checkout=unavailable");
  }

  const paymentsEnabled = await readFeatureFlag(env.DB, "payments", false);
  if (!paymentsEnabled) {
    return redirectTo(siteUrl + "/pricing/?payments=disabled");
  }

  if (!env.STRIPE_SECRET_KEY) {
    console.error(JSON.stringify({ event: "checkout_stripe_secret_missing" }));
    return redirectTo(siteUrl + "/pricing/?checkout=unavailable");
  }

  await syncServicePlans(env.DB);

  const selectedPlan = await env.DB.prepare(`
    SELECT id, plan_name, plan_type, price_label, price_pence, stripe_price_id, is_active
    FROM service_plans
    WHERE id = ?
  `).bind(planCode).first();

  if (!selectedPlan || Number(selectedPlan.is_active || 0) !== 1) {
    return redirectTo(siteUrl + "/pricing/?plan=unavailable");
  }

  const priceId = await resolveStripePriceId(selectedPlan, env, env.DB);
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
  const profile = await env.DB.prepare(`
    SELECT stripe_customer_id FROM profiles WHERE lower(email) = lower(?)
  `).bind(accountEmail).first().catch(() => null);
  if (profile?.stripe_customer_id) params.append("customer", String(profile.stripe_customer_id));
  else params.append("customer_email", accountEmail);
  params.append("client_reference_id", accountEmail);
  params.append("subscription_data[trial_period_days]", "30");
  params.append("success_url", siteUrl + "/payment-success/?session_id={CHECKOUT_SESSION_ID}");
  params.append("cancel_url", siteUrl + "/pricing/?payment=cancelled");
  params.append("metadata[service_line]", "Planyx");
  params.append("metadata[plan_code]", selectedPlan.id);
  params.append("metadata[plan_name]", selectedPlan.plan_name || selectedPlan.id);
  params.append("metadata[plan_type]", selectedPlan.plan_type || "");
  params.append("metadata[account_email]", accountEmail);
  params.append("subscription_data[metadata][service_line]", "Planyx");
  params.append("subscription_data[metadata][plan_code]", selectedPlan.id);
  params.append("subscription_data[metadata][plan_name]", selectedPlan.plan_name || selectedPlan.id);
  params.append("subscription_data[metadata][customer_email]", accountEmail);

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded"
    },
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
    console.error(JSON.stringify({
      event: "checkout_stripe_rejected",
      status: stripeResponse.status,
      message: session?.error?.message || "Stripe did not return a Checkout URL."
    }));
    return redirectTo(siteUrl + "/pricing/?checkout=unavailable");
  }

  return redirectTo(session.url);
}

async function syncServicePlans(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS service_plans (
      id TEXT PRIMARY KEY,
      plan_name TEXT,
      plan_type TEXT,
      price_label TEXT,
      price_pence INTEGER,
      stripe_price_id TEXT,
      delivery_time TEXT,
      revisions TEXT,
      description TEXT,
      button_label TEXT,
      is_active INTEGER DEFAULT 1,
      is_featured INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 100,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await safeAlter(DB, `ALTER TABLE service_plans ADD COLUMN stripe_product_id TEXT`);

  for (const plan of DEFAULT_PLANS) {
    await DB.prepare(`
      INSERT INTO service_plans (
        id, plan_name, plan_type, price_label, price_pence, stripe_product_id, stripe_price_id,
        delivery_time, revisions, description, button_label, is_active, is_featured, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(...plan).run();
  }
}

async function resolveStripePriceId(plan, env, DB) {
  // The Admin Centre service_plans record is the live source of truth.
  // Legacy site-settings overrides remain only as a fallback for databases
  // that have not yet been edited through the dedicated plans page.
  if (plan.stripe_price_id) return String(plan.stripe_price_id);

  const overrideByPlan = {
    personal: "stripe_price_personal_override",
    standard: "stripe_price_standard_override",
    professional: "stripe_price_professional_override",
    org_starter: "stripe_price_org_starter_override"
  };
  const overrideKey = overrideByPlan[plan.id];
  if (DB && overrideKey) {
    const row = await DB.prepare("SELECT value FROM site_settings WHERE key = ?").bind(overrideKey).first().catch(() => null);
    const override = String(row?.value || "").trim();
    if (override) return override;
  }
  const secretByPlan = {
    personal: "STRIPE_PRICE_EXPLORE",
    standard: "STRIPE_PRICE_PLAN",
    professional: "STRIPE_PRICE_COMPLETE",
    org_starter: "STRIPE_PRICE_TOGETHER"
  };
  const configured = env[secretByPlan[plan.id]];
  if (configured) return String(configured);

  const response = await fetch("https://api.stripe.com/v1/prices?active=true&type=recurring&limit=100&expand[]=data.product", {
    headers: { "Authorization": "Bearer " + env.STRIPE_SECRET_KEY }
  });
  if (!response.ok) return "";
  const catalogue = await response.json();
  const stripeProductNames = {
    personal: "Planyx – Explore",
    standard: "Planyx – Plan",
    professional: "Planyx – Complete",
    org_starter: "Planyx – Together"
  };
  const acceptedNames = new Set([
    String(plan.plan_name || "").trim().toLowerCase(),
    String(stripeProductNames[plan.id] || "").trim().toLowerCase()
  ]);
  const match = (catalogue.data || []).find((price) => {
    const product = price && typeof price.product === "object" ? price.product : null;
    return product && product.active !== false
      && acceptedNames.has(String(product.name || "").trim().toLowerCase())
      && String(price.currency || "").toLowerCase() === "gbp"
      && Number(price.unit_amount || 0) === Number(plan.price_pence || 0)
      && price.recurring && price.recurring.interval === "month";
  });
  return match && match.id ? String(match.id) : "";
}

async function safeAlter(DB, sql) {
  try {
    await DB.prepare(sql).run();
  } catch {
    // Column already exists.
  }
}

function getSiteUrl(env) {
  return String(env && env.SITE_URL ? env.SITE_URL : "https://planyx.jagroupservices.co.uk").replace(/\/+$/, "");
}

function redirectTo(url) {
  return new Response("", {
    status: 303,
    headers: {
      "Location": url,
      "Cache-Control": "no-store"
    }
  });
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}
