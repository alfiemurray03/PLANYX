import { isSameOriginRequest } from "../../_shared/enquiries.js";
import { getNativeSession } from "../../_shared/oidc.js";
import {
  gateSettingsEntries,
  normaliseGateConfig,
  readGateSettings,
  renderLaunchGate,
  renderMaintenanceGate,
} from "../../_shared/site-gates.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value, max = 1000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function configuredAdmins(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || "alfieholywoodmurray@jagroupservices.co.uk")
    .split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function parsePermissions(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function authorise(DB, identity, env) {
  const email = clean(identity?.email, 254).toLowerCase();
  if (!email) return { authenticated: false, authorised: false };
  if (configuredAdmins(env).includes(email)) return { authenticated: true, authorised: true, email, role: "Platform Owner" };
  const row = await DB.prepare("SELECT email,role,status,permissions FROM admin_users WHERE lower(email)=lower(?)")
    .bind(email).first().catch(() => null);
  if (!row || ["blocked", "closed", "disabled", "inactive", "suspended"].includes(clean(row.status || "Active", 80).toLowerCase())) {
    return { authenticated: true, authorised: false, email };
  }
  const permissions = parsePermissions(row.permissions);
  const direct = permissions.includes("*") || permissions.includes("manage_system_settings") || permissions.includes("manage_site_status") || permissions.includes("manage_content");
  if (direct || ["Platform Owner", "System Administrator", "Senior Administrator"].includes(clean(row.role, 100))) {
    return { authenticated: true, authorised: true, email, role: clean(row.role, 100) };
  }
  const permission = await DB.prepare(`SELECT permission_code FROM role_permissions
    WHERE role_name=? AND permission_code IN ('manage_system_settings','manage_site_status','manage_content') LIMIT 1`)
    .bind(clean(row.role, 100)).first().catch(() => null);
  return { authenticated: true, authorised: Boolean(permission), email, role: clean(row.role, 100) };
}

async function ensureAudit(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY, actor_email TEXT, action TEXT, entity_type TEXT,
    entity_id TEXT, summary TEXT, metadata TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function audit(DB, admin, action, summary, metadata = {}) {
  try {
    await ensureAudit(DB);
    await DB.prepare(`INSERT INTO admin_audit_log
      (id,actor_email,action,entity_type,entity_id,summary,metadata)
      VALUES (?,?,?,?,?,?,?)`).bind(
        crypto.randomUUID(), admin.email, action, "site_gate", "public-gates", summary, JSON.stringify(metadata)
      ).run();
  } catch {
    // Gate settings must not fail solely because the audit table is unavailable.
  }
}

async function saveEntries(DB, entries) {
  const hasUpdatedAt = await DB.prepare("PRAGMA table_info(site_settings)").all()
    .then((result) => (result.results || []).some((row) => row.name === "updated_at"))
    .catch(() => false);
  const sql = hasUpdatedAt
    ? `INSERT INTO site_settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`
    : `INSERT INTO site_settings (key,value) VALUES (?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`;
  await DB.batch(Object.entries(entries).map(([key, value]) => DB.prepare(sql).bind(key, String(value ?? ""))));
}

export async function onRequest(context) {
  const { request, env } = context;
  const correlationId = clean(request.headers.get("cf-ray") || request.headers.get("x-request-id") || crypto.randomUUID(), 120);
  if (!env.DB) return json({ success: false, error: "Gate configuration is unavailable because the database binding is missing.", correlationId }, 500);

  try {
    const identity = await getNativeSession(request, env, "admin");
    const admin = await authorise(env.DB, identity, env);
    if (!admin.authenticated) return json({ success: false, error: "Your administrator session has expired.", code: "SESSION_EXPIRED", correlationId }, 401);
    if (!admin.authorised) return json({ success: false, error: "You do not have permission to manage the public website gates.", code: "FORBIDDEN", correlationId }, 403);

    if (request.method === "GET") {
      const config = await readGateSettings(env.DB);
      return json({ success: true, config, admin: { email: admin.email, role: admin.role }, correlationId });
    }

    if (request.method !== "POST") return json({ success: false, error: "Method not allowed.", correlationId }, 405);
    if (!isSameOriginRequest(request)) return json({ success: false, error: "This request could not be verified.", correlationId }, 403);

    const body = await request.json().catch(() => ({}));
    const action = clean(body.action || "save", 40);
    const config = normaliseGateConfig(body.config || body);
    if (config.launch.countdownEnabled && !config.launch.launchDate) {
      return json({ success: false, error: "Choose a launch date when the launch countdown is enabled.", correlationId }, 400);
    }

    if (action === "preview") {
      const mode = body.mode === "maintenance" ? "maintenance" : "launch";
      const html = mode === "maintenance" ? renderMaintenanceGate(config) : renderLaunchGate(config);
      return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }

    const entries = gateSettingsEntries(config);
    entries.launchgateway_content_mode = "html";
    entries.launchgateway_content = renderLaunchGate(config);
    entries.maintenance_content_mode = "html";
    entries.maintenance_content = renderMaintenanceGate(config);
    await saveEntries(env.DB, entries);
    await audit(env.DB, admin, "site_gate_settings_saved", "Updated Launch Gate and Maintenance Gate configuration.", {
      site_status: config.siteStatus,
      launch_feature_count: config.launch.features.length,
      launch_owner_sign_in: config.launch.ownerEnabled,
      maintenance_owner_sign_in: config.maintenance.ownerEnabled,
      correlation_id: correlationId,
    });
    return json({ success: true, saved: true, config, correlationId });
  } catch (error) {
    console.error(JSON.stringify({ event: "gate_settings_failed", correlation_id: correlationId, error: error instanceof Error ? error.message : "Unknown error" }));
    return json({ success: false, error: error instanceof Error ? error.message : "Gate settings could not be saved.", correlationId }, 500);
  }
}
