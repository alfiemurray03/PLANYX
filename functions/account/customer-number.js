import { assertSameOrigin, nativeIdentity } from "../_shared/oidc.js";
import { getCustomerOpsConnection, syncCustomerWithHeadOffice } from "../_shared/customerops.js";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function wantsJson(request) {
  return (request.headers.get("Accept") || "").includes("application/json");
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function statusCopy(status) {
  const copies = {
    synced: ["Connected", "Planyx is linked to your Head Office customer record."],
    pending: ["Pending", "Planyx is waiting to complete the Head Office connection."],
    not_configured: ["Not configured", "The secure Planyx connector has not been activated yet."],
    review_required: ["Head Office review", "The identity match needs a member of Head Office staff to review it."],
    ucn_conflict: ["Head Office review", "Planyx has protected your existing customer number because a different number was returned."],
    error: ["Temporarily unavailable", "The connection will be retried automatically at your next sign-in."],
  };
  return copies[status] || ["Pending", "Planyx is waiting to complete the Head Office connection."];
}

function htmlPage(identity, connection) {
  const status = connection?.status || "pending";
  const [statusLabel, statusDescription] = statusCopy(status);
  const ucn = connection?.ucn || "Not allocated yet";
  const syncedAt = connection?.syncedAt
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(connection.syncedAt))
    : "Not yet synchronised";

  return new Response(`<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="theme-color" content="#0b1526">
  <title>Universal Customer Number · Planyx</title>
  <link rel="stylesheet" href="/customer-number.css?v=20260728-1">
</head>
<body>
  <main class="customer-number-shell">
    <a class="back-link" href="/account/dashboard/">← Return to your Planyx account</a>
    <section class="customer-number-card" data-state="${escapeHtml(status)}">
      <div class="brand-row"><span class="brand-mark">P</span><div><strong>Planyx</strong><small>JA Group Services Ltd customer connection</small></div></div>
      <p class="eyebrow">Universal customer record</p>
      <h1>Your Universal Customer Number</h1>
      <p class="intro">This permanent ten-digit number identifies your customer record across connected JA Group Services websites.</p>
      <div class="ucn-box"><span>Universal Customer Number</span><strong>${escapeHtml(ucn)}</strong></div>
      <dl class="connection-details">
        <div><dt>Connection status</dt><dd>${escapeHtml(statusLabel)}</dd></div>
        <div><dt>Customer</dt><dd>${escapeHtml(identity.name || identity.email)}</dd></div>
        <div><dt>Last synchronised</dt><dd>${escapeHtml(syncedAt)}</dd></div>
      </dl>
      <div class="status-note"><strong>${escapeHtml(statusLabel)}</strong><span>${escapeHtml(statusDescription)}</span></div>
      ${status !== "synced" ? `<form method="post"><button type="submit">Retry Head Office connection</button></form>` : ""}
      <p class="privacy-note">Your UCN contains numbers only. Planyx does not create or replace it independently; the number is issued by JA Group Services Ltd Head Office.</p>
    </section>
  </main>
</body>
</html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    }
  });
}

export async function onRequestGet(context) {
  const identity = nativeIdentity(context.request);
  if (!identity.email) return json({ success: false, error: "Please sign in to continue." }, 401);
  const connection = await getCustomerOpsConnection(context.env.DB, identity.email);
  if (wantsJson(context.request)) return json({ success: true, connection });
  return htmlPage(identity, connection);
}

export async function onRequestPost(context) {
  const identity = nativeIdentity(context.request);
  if (!identity.email) return json({ success: false, error: "Please sign in to continue." }, 401);
  if (!assertSameOrigin(context.request)) return json({ success: false, error: "Cross-origin request rejected." }, 403);

  const result = await syncCustomerWithHeadOffice(context, identity).catch((error) => ({
    ok: false,
    status: "error",
    error: error instanceof Error ? error.message : "CustomerOps connection failed."
  }));

  if (wantsJson(context.request)) return json({ success: Boolean(result.ok), result }, result.ok ? 200 : 503);
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/account/customer-number",
      "Cache-Control": "no-store"
    }
  });
}
