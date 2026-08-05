import { normalisePlanCode } from "./_shared/subscription-entitlements.js";
import { claimPaidStripeSubscription } from "./_shared/stripe-subscription-claim.js";
import { queueStripeCustomerOpsEvent } from "./_shared/stripe-customerops.js";

const SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.finalized",
  "charge.refunded",
  "charge.dispute.created"
]);

export async function onRequestPost({ request, env }) {
  const payload = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");

  try {
    if (!env.DB) return response("Database binding DB is missing.", 500);

    const webhookSecret = await getWebhookSecret(env);
    if (!webhookSecret) {
      console.error("Missing Stripe webhook signing secret.");
      return response("Webhook secret not configured.", 500);
    }

    if (!(await verifyStripeWebhookSignature(payload, signatureHeader, webhookSecret))) {
      console.error("Stripe webhook signature verification failed.");
      return response("Invalid Stripe signature.", 400);
    }

    let event;
    try {
      event = JSON.parse(payload);
    } catch (error) {
      console.error("Invalid Stripe webhook JSON payload.", error);
      return response("Invalid payload.", 400);
    }

    if (!event?.id || !event?.type || !event?.data?.object) {
      return response("Invalid Stripe event.", 400);
    }

    await ensureStripeTables(env.DB);
    const existing = await env.DB.prepare(`SELECT status FROM stripe_webhook_events WHERE event_id = ?`).bind(event.id).first();
    if (existing?.status === "processed") return response("Webhook already processed.", 200);

    await env.DB.prepare(`
      INSERT INTO stripe_webhook_events (event_id, event_type, object_id, status, payload, received_at, error)
      VALUES (?, ?, ?, 'processing', ?, CURRENT_TIMESTAMP, NULL)
      ON CONFLICT(event_id) DO UPDATE SET status = 'processing', payload = excluded.payload, error = NULL
    `).bind(event.id, event.type, event.data.object.id || null, payload).run();

    if (SUPPORTED_EVENTS.has(event.type)) await processEvent(env.DB, event, env);

    // The local Stripe record is written first. The central event is then placed
    // in a durable outbox and retried automatically if CustomerOps is temporarily
    // unavailable, so Stripe can still receive a prompt successful response.
    await queueStripeCustomerOpsEvent(env, env.DB, event).catch(error => {
      console.error(JSON.stringify({
        event: "stripe_customerops_forwarding_deferred",
        stripe_event_id: event.id,
        stripe_event_type: event.type,
        message: error instanceof Error ? error.message : "Unknown CustomerOps forwarding error"
      }));
    });

    await env.DB.prepare(`
      UPDATE stripe_webhook_events
      SET status = 'processed', processed_at = CURRENT_TIMESTAMP, error = NULL
      WHERE event_id = ?
    `).bind(event.id).run();

    return response(SUPPORTED_EVENTS.has(event.type) ? "Webhook processed." : "Webhook acknowledged.", 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "stripe_webhook_failure", message }));
    try {
      const eventId = JSON.parse(payload)?.id;
      if (eventId && env.DB) {
        await env.DB.prepare(`UPDATE stripe_webhook_events SET status = 'failed', error = ? WHERE event_id = ?`)
          .bind(message.slice(0, 1000), eventId).run();
      }
    } catch {
      // Preserve the original processing failure.
    }
    return response("Webhook processing failed.", 500);
  }
}

export async function onRequestGet() {
  return response("Stripe webhook endpoint is active.", 200);
}

async function getWebhookSecret(env) {
  const stored = await env.DB.prepare(`SELECT value FROM site_settings WHERE key = 'stripe_webhook_signing_secret'`).first().catch(() => null);
  return String(stored?.value || env.STRIPE_WEBHOOK_SECRET || "").trim();
}

async function ensureStripeTables(DB) {
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, object_id TEXT, status TEXT NOT NULL,
      payload TEXT NOT NULL, error TEXT, received_at TEXT DEFAULT CURRENT_TIMESTAMP, processed_at TEXT
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS stripe_checkout_sessions (
      id TEXT PRIMARY KEY, customer_id TEXT, customer_email TEXT, payment_status TEXT,
      amount_total INTEGER, currency TEXT, plan_code TEXT, plan_name TEXT, payment_intent_id TEXT,
      stripe_created_at TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS stripe_subscriptions (
      id TEXT PRIMARY KEY, customer_id TEXT, customer_email TEXT, plan_code TEXT, plan_name TEXT, price_id TEXT,
      status TEXT, billing_status TEXT, billing_interval TEXT, subscription_start TEXT,
      current_period_start TEXT, current_period_end TEXT, next_payment_at TEXT, trial_start TEXT, trial_end TEXT,
      cancel_at_period_end INTEGER DEFAULT 0, cancel_at TEXT, canceled_at TEXT, latest_invoice_id TEXT,
      payment_method_brand TEXT, payment_method_last4 TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS stripe_invoices (
      id TEXT PRIMARY KEY, customer_id TEXT, customer_email TEXT, subscription_id TEXT, status TEXT,
      amount_due INTEGER, amount_paid INTEGER, currency TEXT, hosted_invoice_url TEXT, invoice_pdf TEXT,
      period_start TEXT, period_end TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`)
  ]);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN stripe_customer_id TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN stripe_customer_synced_at TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN membership_status TEXT DEFAULT 'Standard'`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN membership_renewal_at TEXT`);
  for (const sql of [
    `ALTER TABLE stripe_subscriptions ADD COLUMN plan_name TEXT`,
    `ALTER TABLE stripe_subscriptions ADD COLUMN billing_status TEXT`,
    `ALTER TABLE stripe_subscriptions ADD COLUMN billing_interval TEXT`,
    `ALTER TABLE stripe_subscriptions ADD COLUMN subscription_start TEXT`,
    `ALTER TABLE stripe_subscriptions ADD COLUMN next_payment_at TEXT`,
    `ALTER TABLE stripe_subscriptions ADD COLUMN trial_start TEXT`,
    `ALTER TABLE stripe_subscriptions ADD COLUMN trial_end TEXT`,
    `ALTER TABLE stripe_subscriptions ADD COLUMN cancel_at TEXT`,
    `ALTER TABLE stripe_subscriptions ADD COLUMN canceled_at TEXT`,
    `ALTER TABLE stripe_subscriptions ADD COLUMN payment_method_brand TEXT`,
    `ALTER TABLE stripe_subscriptions ADD COLUMN payment_method_last4 TEXT`
  ]) await safeAlter(DB, sql);
}

async function safeAlter(DB, sql) {
  try {
    await DB.prepare(sql).run();
  } catch {
    // Existing columns are expected in production.
  }
}

async function processEvent(DB, event, env) {
  const object = event.data.object;
  if (event.type === "checkout.session.completed") return saveCheckoutSession(DB, object);
  if (event.type.startsWith("customer.subscription.")) return saveSubscription(DB, object, event.type, env);
  if (event.type.startsWith("invoice.")) return saveInvoice(DB, object, event.type);
  // Refund and dispute events are retained in CustomerOps. They do not need a
  // second local Sousa Murray Planeia table because Stripe remains the payment processor.
  return undefined;
}

async function saveCheckoutSession(DB, session) {
  const email = session.customer_details?.email || session.customer_email || null;
  const customerId = idValue(session.customer);
  await DB.prepare(`
    INSERT INTO stripe_checkout_sessions (
      id, customer_id, customer_email, payment_status, amount_total, currency,
      plan_code, plan_name, payment_intent_id, stripe_created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      customer_id = excluded.customer_id, customer_email = excluded.customer_email,
      payment_status = excluded.payment_status, amount_total = excluded.amount_total,
      currency = excluded.currency, plan_code = excluded.plan_code, plan_name = excluded.plan_name,
      payment_intent_id = excluded.payment_intent_id, updated_at = CURRENT_TIMESTAMP
  `).bind(
    session.id, customerId, email, session.payment_status || null, session.amount_total ?? null,
    session.currency || null, session.metadata?.plan_code || null, session.metadata?.plan_name || null,
    idValue(session.payment_intent), stripeTime(session.created)
  ).run();
  const planCode = normalisePlanCode(session.metadata?.plan_code || session.metadata?.plan_name);
  await DB.prepare(`
    UPDATE stripe_subscriptions SET
      customer_email = COALESCE(customer_email, ?),
      plan_code = COALESCE(plan_code, ?),
      plan_name = COALESCE(plan_name, ?),
      updated_at = CURRENT_TIMESTAMP
    WHERE customer_id = ?
  `).bind(email, planCode || null, session.metadata?.plan_name || null, customerId).run();
  await updateProfile(DB, customerId, email, session.metadata?.plan_name || null, null);
}

async function saveSubscription(DB, subscription, eventType, env) {
  const customerId = idValue(subscription.customer);
  const checkout = customerId ? await DB.prepare(`
    SELECT customer_email, plan_code, plan_name FROM stripe_checkout_sessions
    WHERE customer_id = ? ORDER BY updated_at DESC LIMIT 1
  `).bind(customerId).first().catch(() => null) : null;
  const stripeCustomer = customerId && !subscription.metadata?.customer_email && !checkout?.customer_email
    ? await retrieveStripeCustomer(env, customerId)
    : null;
  const email = normaliseEmail(
    subscription.customer_details?.email ||
    subscription.metadata?.customer_email ||
    checkout?.customer_email ||
    stripeCustomer?.email
  );
  const item = subscription.items?.data?.[0] || null;
  const cataloguePlan = await resolveCataloguePlan(DB, idValue(item?.price));
  const planCode = normalisePlanCode(
    subscription.metadata?.plan_code ||
    item?.price?.metadata?.plan_code ||
    checkout?.plan_code ||
    checkout?.plan_name ||
    cataloguePlan?.id
  ) || null;
  const planName = subscription.metadata?.plan_name || checkout?.plan_name || cataloguePlan?.plan_name || item?.price?.product?.name || item?.price?.nickname || planCode;
  const paymentMethod = subscription.default_payment_method?.card || null;
  const latestInvoice = typeof subscription.latest_invoice === "object" ? subscription.latest_invoice : null;
  const status = eventType === "customer.subscription.deleted" ? "canceled" : (subscription.status || null);
  await DB.prepare(`
    INSERT INTO stripe_subscriptions (
      id, customer_id, customer_email, plan_code, plan_name, price_id, status, billing_status,
      billing_interval, subscription_start, current_period_start, current_period_end, next_payment_at,
      trial_start, trial_end, cancel_at_period_end, cancel_at, canceled_at, latest_invoice_id,
      payment_method_brand, payment_method_last4, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      customer_id = excluded.customer_id, customer_email = excluded.customer_email,
      plan_code = excluded.plan_code, plan_name = excluded.plan_name, price_id = excluded.price_id,
      status = excluded.status, billing_status = excluded.billing_status,
      billing_interval = excluded.billing_interval, subscription_start = excluded.subscription_start,
      current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
      next_payment_at = excluded.next_payment_at, trial_start = excluded.trial_start, trial_end = excluded.trial_end,
      cancel_at_period_end = excluded.cancel_at_period_end, cancel_at = excluded.cancel_at,
      canceled_at = excluded.canceled_at, latest_invoice_id = excluded.latest_invoice_id,
      payment_method_brand = excluded.payment_method_brand, payment_method_last4 = excluded.payment_method_last4,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    subscription.id, customerId, email, planCode, planName, idValue(item?.price), status,
    latestInvoice?.status || null, item?.price?.recurring?.interval || null,
    stripeTime(subscription.start_date || subscription.created), stripeTime(subscription.current_period_start),
    stripeTime(subscription.current_period_end), stripeTime(subscription.current_period_end),
    stripeTime(subscription.trial_start), stripeTime(subscription.trial_end), subscription.cancel_at_period_end ? 1 : 0,
    stripeTime(subscription.cancel_at), stripeTime(subscription.canceled_at), idValue(subscription.latest_invoice),
    paymentMethod?.brand || null, paymentMethod?.last4 || null
  ).run();
  await updateProfile(DB, customerId, email, status, stripeTime(subscription.current_period_end));
}

async function saveInvoice(DB, invoice, eventType) {
  const customerId = idValue(invoice.customer);
  const email = normaliseEmail(invoice.customer_email);
  const status = eventType === "invoice.payment_failed" ? "payment_failed" : (invoice.status || null);
  await DB.prepare(`
    INSERT INTO stripe_invoices (
      id, customer_id, customer_email, subscription_id, status, amount_due, amount_paid,
      currency, hosted_invoice_url, invoice_pdf, period_start, period_end, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      customer_id = excluded.customer_id, customer_email = excluded.customer_email,
      subscription_id = excluded.subscription_id, status = excluded.status,
      amount_due = excluded.amount_due, amount_paid = excluded.amount_paid, currency = excluded.currency,
      hosted_invoice_url = excluded.hosted_invoice_url, invoice_pdf = excluded.invoice_pdf,
      period_start = excluded.period_start, period_end = excluded.period_end, updated_at = CURRENT_TIMESTAMP
  `).bind(
    invoice.id, customerId, email, invoiceSubscriptionId(invoice), status,
    invoice.amount_due ?? null, invoice.amount_paid ?? null, invoice.currency || null,
    invoice.hosted_invoice_url || null, invoice.invoice_pdf || null,
    stripeTime(invoice.period_start), stripeTime(invoice.period_end)
  ).run();
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (subscriptionId) {
    await DB.prepare(`
      UPDATE stripe_subscriptions
      SET billing_status = ?, latest_invoice_id = ?,
        customer_email = COALESCE(NULLIF(?, ''), customer_email),
        next_payment_at = COALESCE(?, next_payment_at), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(status, invoice.id, email, stripeTime(invoice.period_end), subscriptionId).run();
  }
  if (eventType === "invoice.paid") {
    await updateProfile(DB, customerId, email, null, stripeTime(invoice.period_end));
    await claimPaidStripeSubscription(DB, email);
  } else if (eventType === "invoice.payment_failed") {
    await updateProfile(DB, customerId, email, "Past due", null);
  }
}

async function retrieveStripeCustomer(env, customerId) {
  const secret = String(env?.STRIPE_SECRET_KEY || "").trim();
  if (!secret || !customerId) return null;
  const result = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(customerId)}`, {
    headers: { Authorization: `Bearer ${secret}` }
  }).catch(() => null);
  if (!result?.ok) return null;
  return result.json().catch(() => null);
}

async function resolveCataloguePlan(DB, priceId) {
  if (!priceId) return null;
  const direct = await DB.prepare(`
    SELECT id, plan_name FROM service_plans WHERE stripe_price_id = ? LIMIT 1
  `).bind(priceId).first().catch(() => null);
  if (direct?.id) return direct;

  const override = await DB.prepare(`
    SELECT CASE key
      WHEN 'stripe_price_personal_override' THEN 'personal'
      WHEN 'stripe_price_standard_override' THEN 'standard'
      WHEN 'stripe_price_professional_override' THEN 'professional'
      WHEN 'stripe_price_org_starter_override' THEN 'org_starter'
    END AS id
    FROM site_settings
    WHERE value = ? AND key IN (
      'stripe_price_personal_override',
      'stripe_price_standard_override',
      'stripe_price_professional_override',
      'stripe_price_org_starter_override'
    )
    LIMIT 1
  `).bind(priceId).first().catch(() => null);
  if (!override?.id) return null;
  return DB.prepare(`SELECT id, plan_name FROM service_plans WHERE id = ? LIMIT 1`)
    .bind(override.id).first().catch(() => ({ id: override.id, plan_name: null }));
}

function normaliseEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

async function updateProfile(DB, customerId, email, membershipStatus, renewalAt) {
  if (!customerId && !email) return;
  await DB.prepare(`
    UPDATE profiles SET
      stripe_customer_id = COALESCE(?, stripe_customer_id),
      stripe_customer_synced_at = CURRENT_TIMESTAMP,
      membership_status = COALESCE(?, membership_status),
      membership_renewal_at = COALESCE(?, membership_renewal_at),
      updated_at = CURRENT_TIMESTAMP
    WHERE (? IS NOT NULL AND stripe_customer_id = ?)
       OR (? IS NOT NULL AND (lower(email) = lower(?) OR lower(contact_email) = lower(?)))
  `).bind(customerId, membershipStatus, renewalAt, customerId, customerId, email, email, email).run();
}

function idValue(value) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id || null;
}

function invoiceSubscriptionId(invoice) {
  return idValue(invoice?.subscription)
    || idValue(invoice?.parent?.subscription_details?.subscription)
    || idValue(invoice?.lines?.data?.find((line) => line?.subscription)?.subscription)
    || null;
}

function stripeTime(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? new Date(Number(value) * 1000).toISOString() : null;
}

async function verifyStripeWebhookSignature(payload, signatureHeader, webhookSecret) {
  if (!payload || !signatureHeader || !webhookSecret) return false;
  const parts = signatureHeader.split(",");
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signatureParts = parts.filter((part) => part.startsWith("v1="));
  if (!timestampPart || signatureParts.length === 0) return false;

  const timestamp = timestampPart.slice(2);
  if (!/^\d+$/.test(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const expectedSignature = [...new Uint8Array(signatureBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatureParts.some((part) => timingSafeEqual(expectedSignature, part.slice(3)));
}

function timingSafeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function response(body, status) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
