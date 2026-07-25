import { getNativeSession } from "../_shared/oidc.js";

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function configuredAdmins(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || "alfieholywoodmurray@jagroupservices.co.uk")
    .split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

async function authorised(DB, identity, env) {
  const email = String(identity?.email || "").trim().toLowerCase();
  if (!email) return false;
  if (configuredAdmins(env).includes(email)) return true;
  if (!DB) return false;
  const row = await DB.prepare("SELECT role,status,permissions FROM admin_users WHERE lower(email)=lower(?)").bind(email).first().catch(() => null);
  if (!row || ["blocked", "closed", "disabled", "inactive", "suspended"].includes(String(row.status || "Active").toLowerCase())) return false;
  let permissions = [];
  try { permissions = JSON.parse(row.permissions || "[]"); } catch { permissions = []; }
  return permissions.includes("*") || permissions.includes("manage_content") || permissions.includes("manage_system_settings") || permissions.includes("manage_affiliates")
    || ["Platform Owner", "System Administrator", "Senior Administrator"].includes(String(row.role || ""));
}

export async function onRequestGet({ request, env }) {
  const identity = await getNativeSession(request, env, "admin").catch(() => null);
  if (!identity) {
    const target = encodeURIComponent(new URL(request.url).pathname);
    return new Response(null, { status: 302, headers: { Location: `/admin?return_to=${target}`, "Cache-Control": "no-store" } });
  }
  if (!(await authorised(env.DB, identity, env))) return new Response("Forbidden", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

  const name = identity.name || identity.email;
  return new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Partner Gallery Manager | Planyx Admin</title><meta name="robots" content="noindex,nofollow"><link rel="icon" href="/assets/brand/planyx-icon.png?v=1"><link rel="stylesheet" href="/assets/admin-partner-galleries.css?v=1"></head><body><div class="pg-admin"><header class="pg-admin__header"><a href="/admin/dashboard" class="pg-admin__brand"><img src="/assets/brand/planyx-logo.svg?v=1" alt="Planyx"><span>ADMIN CENTRE</span></a><div class="pg-admin__identity"><span>Signed in as</span><strong>${escapeHtml(name)}</strong></div></header><main id="partner-gallery-app" aria-live="polite"><div class="pg-loading"><span></span><p>Loading Partner Gallery Manager…</p></div></main><footer class="pg-admin__footer"><a href="/admin/dashboard">Back to Admin Dashboard</a><span>Headout · GetYourGuide · Admin-only access</span></footer></div><script src="/assets/admin-partner-galleries.js?v=1" defer></script></body></html>`, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "SAMEORIGIN" },
  });
}
