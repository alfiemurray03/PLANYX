import {
  centralPaymentsConfigured,
  createPlaneiaBillingPortal,
  readPlaneiaCentralBilling,
  syncPlaneiaCentralBilling,
} from "../_shared/central-payments.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function identityEmail(request) {
  return String(request.headers.get("x-ja-auth-email") || "").trim().toLowerCase();
}

function publicSubscription(row) {
  if (!row) return null;
  return {
    plan: row.plan_name || row.plan_code || "Central Payments membership",
    membershipStatus: row.status || "Not active",
    billingStatus: row.billing_status || "Not available",
    renewalDate: row.current_period_end,
    billingInterval: row.billing_interval || "month",
    nextPaymentDate: row.next_payment_at || row.current_period_end,
    subscriptionStartDate: row.subscription_start,
    subscriptionReference: row.id,
    paymentMethod: "Manage securely in the JA Group Services billing portal",
    trialStatus: row.trial_end ? (new Date(row.trial_end) > new Date() ? "Trial active" : "Trial ended") : "No trial",
    trialEndDate: row.trial_end,
    cancellationStatus: Number(row.cancel_at_period_end || 0) === 1
      ? "Scheduled to cancel"
      : ["canceled", "cancelled"].includes(String(row.status || "").toLowerCase()) ? "Cancelled" : "Not scheduled",
    scheduledCancellationDate: row.cancel_at || (Number(row.cancel_at_period_end || 0) === 1 ? row.current_period_end : null),
  };
}

function transactionInvoices(transactions = []) {
  const seen = new Set();
  return transactions
    .filter(row => row.stripe_invoice_id)
    .filter(row => {
      if (seen.has(row.stripe_invoice_id)) return false;
      seen.add(row.stripe_invoice_id);
      return true;
    })
    .slice(0, 10)
    .map(row => ({
      id: row.stripe_invoice_id,
      number: null,
      reference: row.stripe_invoice_id,
      status: row.status || "unknown",
      amountPaid: row.event_type === "invoice.paid" ? row.amount_minor : null,
      amountDue: row.amount_minor,
      currency: String(row.currency || "GBP").toLowerCase(),
      created: row.occurred_at ? Math.floor(new Date(row.occurred_at).getTime() / 1000) : 0,
      periodStart: 0,
      periodEnd: 0,
      pdfUrl: null,
      hostedUrl: null,
      description: "JA Group Services Central Payments invoice",
      lines: [],
      date: row.occurred_at || row.updated_at,
      invoiceUrl: null,
    }));
}

export async function onRequest({ request, env }) {
  if (!env.DB) return json({ error: "Database unavailable." }, 500);
  const email = identityEmail(request);
  if (!email) return json({ error: "Not signed in." }, 401);
  if (!centralPaymentsConfigured(env)) {
    return json({ success: false, error: "Head Office Central Payments is not configured for Sousa Murray Planeia." }, 503);
  }

  try {
    if (request.method === "POST") {
      const returnUrl = `${new URL(request.url).origin}/account/membership/`;
      const portal = await createPlaneiaBillingPortal(env, env.DB, email, returnUrl);
      return json({ url: portal.url });
    }
    if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

    await syncPlaneiaCentralBilling(env, env.DB, email).catch(error => {
      console.error(JSON.stringify({ event: "central_billing_sync_failed", email, message: error.message }));
    });
    const central = await readPlaneiaCentralBilling(env, env.DB, email).catch(() => ({ transactions: [] }));
    const subscription = await env.DB.prepare(`SELECT * FROM stripe_subscriptions
      WHERE lower(customer_email)=lower(?) ORDER BY updated_at DESC LIMIT 1`).bind(email).first();

    return json({
      success: true,
      portalAvailable: true,
      billingAuthority: "JA Group Services Central Payments",
      subscription: publicSubscription(subscription),
      invoices: transactionInvoices(central.transactions || []),
    });
  } catch (error) {
    return json({ success: false, error: error.message || "Central billing data is unavailable." }, Number(error?.status || 500));
  }
}
