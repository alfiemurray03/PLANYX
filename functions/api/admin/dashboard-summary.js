import { getNativeSession, withIdentity } from "../../_shared/oidc.js";

const DEFAULT_ADMIN_EMAIL = "alfieholywoodmurray@jagroupservices.co.uk";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0"
    }
  });
}

function configuredAdmins(env) {
  const raw = env.ADMIN_EMAILS || env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
  return String(raw).split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
}

async function withTimeout(promise, milliseconds, fallback) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), milliseconds);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function authorisedAdmin(env, identity) {
  const email = String(identity?.email || "").trim().toLowerCase();
  if (!email) return false;
  if (configuredAdmins(env).includes(email)) return true;
  if (!env.DB) return false;

  const row = await withTimeout(
    env.DB.prepare("SELECT status FROM admin_users WHERE lower(email)=lower(?)").bind(email).first().catch(() => null),
    1200,
    null
  );
  const status = String(row?.status || "active").toLowerCase();
  return Boolean(row) && !["blocked", "closed", "disabled", "inactive", "suspended"].includes(status);
}

async function safeFirst(DB, sql, fallback = { count: 0 }) {
  return withTimeout(DB.prepare(sql).first().catch(() => fallback), 1200, fallback);
}

async function safeAll(DB, sql) {
  const result = await withTimeout(DB.prepare(sql).all().catch(() => ({ results: [] })), 1500, { results: [] });
  return Array.isArray(result?.results) ? result.results : [];
}

function count(row) {
  const value = Number(row?.count || 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return json({ success: false, error: "Dashboard database is unavailable." }, 503);

  const identity = await withTimeout(
    getNativeSession(withIdentity(context.request, null), env, "admin").catch(() => null),
    2200,
    null
  );

  if (!identity) return json({ success: false, error: "Administrator session required." }, 401);
  if (!(await authorisedAdmin(env, identity))) return json({ success: false, error: "Administrator access was denied." }, 403);

  const [
    customers,
    outputs,
    activePlans,
    lifetimeUsers,
    pendingDpr,
    openIssues,
    openSupport,
    admins,
    launchSetting,
    maintenanceSetting,
    latestCustomers,
    latestAudit,
    latestSupport
  ] = await Promise.all([
    safeFirst(env.DB, "SELECT COUNT(*) AS count FROM profiles"),
    safeFirst(env.DB, "SELECT COUNT(*) AS count FROM builder_outputs WHERE archived_at IS NULL"),
    safeFirst(env.DB, "SELECT COUNT(*) AS count FROM service_plans WHERE is_active = 1"),
    safeFirst(env.DB, "SELECT COUNT(*) AS count FROM profiles WHERE admin_lifetime = 1"),
    safeFirst(env.DB, "SELECT COUNT(*) AS count FROM data_protection_requests WHERE lower(COALESCE(status,'')) NOT IN ('completed','closed','sent','rejected')"),
    safeFirst(env.DB, "SELECT COUNT(*) AS count FROM system_events WHERE lower(COALESCE(status,'open')) NOT IN ('resolved','closed')"),
    safeFirst(env.DB, "SELECT COUNT(*) AS count FROM support_tickets WHERE lower(COALESCE(status,'open')) NOT IN ('resolved','closed')"),
    safeFirst(env.DB, "SELECT COUNT(*) AS count FROM admin_users WHERE lower(COALESCE(status,'active')) NOT IN ('suspended','disabled','blocked','closed','inactive')"),
    safeFirst(env.DB, "SELECT value FROM site_settings WHERE key='launchgateway_enabled'", { value: "false" }),
    safeFirst(env.DB, "SELECT value FROM site_settings WHERE key='maintenance_enabled'", { value: "false" }),
    safeAll(env.DB, "SELECT email, COALESCE(display_name, verified_name, email) AS display_name, created_at, updated_at FROM profiles ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 5"),
    safeAll(env.DB, "SELECT actor_email, action, summary, created_at FROM admin_audit_log ORDER BY created_at DESC LIMIT 6"),
    safeAll(env.DB, "SELECT id, subject, status, priority, updated_at FROM support_tickets ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 5")
  ]);

  return json({
    success: true,
    checkedAt: new Date().toISOString(),
    administrator: {
      email: String(identity.email || ""),
      name: String(identity.name || identity.email || "Administrator")
    },
    data: {
      customers: count(customers),
      outputs: count(outputs),
      activePlans: count(activePlans),
      lifetimeUsers: count(lifetimeUsers),
      pendingDpr: count(pendingDpr),
      openIssues: count(openIssues),
      openSupport: count(openSupport),
      admins: count(admins),
      launchGatewayStatus: String(launchSetting?.value || "false").toLowerCase() === "true" ? "On" : "Off",
      maintenanceStatus: String(maintenanceSetting?.value || "false").toLowerCase() === "true" ? "On" : "Off",
      latestCustomers,
      latestAudit,
      latestSupport
    }
  });
}

export async function onRequest(context) {
  if (context.request.method !== "GET") return json({ success: false, error: "Method not allowed." }, 405);
  return onRequestGet(context);
}
