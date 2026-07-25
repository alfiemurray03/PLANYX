import { isSameOriginRequest } from "../../_shared/enquiries.js";
import { getNativeSession } from "../../_shared/oidc.js";

const DEFAULTS = {
  status: "live",
  maintenanceMessage: "The AI Website Builder is temporarily unavailable while maintenance is completed.",
  maintenanceStart: "",
  maintenanceEnd: "",
  readOnly: false,
  aiEnabled: true,
  aiModel: "@cf/meta/llama-3.1-8b-instruct-fast",
  maxContextMessages: 12,
  acknowledgementSound: true,
  livePreview: true,
  allowHtml: true,
  allowCss: true,
  allowPageCreate: true,
  allowPageDelete: true,
  requirePublishConfirmation: true,
  keepDraftHistory: true,
  draftRetentionDays: 90,
  diagnosticsEnabled: true,
};

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

function clean(value, max = 4000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function bool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function configuredAdmins(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || "alfieholywoodmurray@jagroupservices.co.uk")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

function parsePermissions(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function authorise(DB, identity, env) {
  const email = clean(identity?.email, 254).toLowerCase();
  if (!email) return { authenticated: false, authorised: false };
  if (configuredAdmins(env).includes(email)) return { authenticated: true, authorised: true };
  const admin = await DB.prepare("SELECT role,status,permissions FROM admin_users WHERE lower(email)=lower(?)")
    .bind(email).first().catch(() => null);
  if (!admin || ["blocked", "closed", "disabled", "inactive", "suspended"].includes(clean(admin.status || "Active", 80).toLowerCase())) {
    return { authenticated: true, authorised: false };
  }
  if (admin.role === "Platform Owner") return { authenticated: true, authorised: true };
  const explicit = parsePermissions(admin.permissions);
  if (explicit.includes("*") || explicit.includes("manage_content") || explicit.includes("manage_pages") || explicit.includes("manage_system_settings")) {
    return { authenticated: true, authorised: true };
  }
  const permission = await DB.prepare(`SELECT permission_code FROM role_permissions
    WHERE role_name=? AND permission_code IN ('manage_content','manage_pages','manage_system_settings') LIMIT 1`)
    .bind(clean(admin.role || "Auditor", 100)).first().catch(() => null);
  return { authenticated: true, authorised: Boolean(permission) };
}

async function ensureTable(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS website_builder_config (
    id INTEGER PRIMARY KEY,
    config_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT DEFAULT ''
  )`).run();
  await DB.prepare("INSERT OR IGNORE INTO website_builder_config (id,config_json,updated_by) VALUES (1,'{}','system-default')").run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY, actor_email TEXT, action TEXT, entity_type TEXT,
    entity_id TEXT, summary TEXT, metadata TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

function normalise(raw = {}) {
  return {
    status: ["live", "maintenance", "offline"].includes(raw.status) ? raw.status : DEFAULTS.status,
    maintenanceMessage: clean(raw.maintenanceMessage || DEFAULTS.maintenanceMessage, 800),
    maintenanceStart: clean(raw.maintenanceStart, 40),
    maintenanceEnd: clean(raw.maintenanceEnd, 40),
    readOnly: bool(raw.readOnly, DEFAULTS.readOnly),
    aiEnabled: bool(raw.aiEnabled, DEFAULTS.aiEnabled),
    aiModel: clean(raw.aiModel || DEFAULTS.aiModel, 180),
    maxContextMessages: integer(raw.maxContextMessages, DEFAULTS.maxContextMessages, 2, 30),
    acknowledgementSound: bool(raw.acknowledgementSound, DEFAULTS.acknowledgementSound),
    livePreview: bool(raw.livePreview, DEFAULTS.livePreview),
    allowHtml: bool(raw.allowHtml, DEFAULTS.allowHtml),
    allowCss: bool(raw.allowCss, DEFAULTS.allowCss),
    allowPageCreate: bool(raw.allowPageCreate, DEFAULTS.allowPageCreate),
    allowPageDelete: bool(raw.allowPageDelete, DEFAULTS.allowPageDelete),
    requirePublishConfirmation: bool(raw.requirePublishConfirmation, DEFAULTS.requirePublishConfirmation),
    keepDraftHistory: bool(raw.keepDraftHistory, DEFAULTS.keepDraftHistory),
    draftRetentionDays: integer(raw.draftRetentionDays, DEFAULTS.draftRetentionDays, 1, 3650),
    diagnosticsEnabled: bool(raw.diagnosticsEnabled, DEFAULTS.diagnosticsEnabled),
  };
}

async function loadConfig(DB) {
  const row = await DB.prepare("SELECT config_json,updated_at,updated_by FROM website_builder_config WHERE id=1").first();
  let parsed = {};
  try { parsed = JSON.parse(row?.config_json || "{}"); } catch { parsed = {}; }
  return { ...normalise(parsed), updatedAt: row?.updated_at || "", updatedBy: row?.updated_by || "" };
}

async function audit(DB, identity, summary, metadata) {
  await DB.prepare(`INSERT INTO admin_audit_log
    (id,actor_email,action,entity_type,entity_id,summary,metadata)
    VALUES (?,?,?,?,?,?,?)`).bind(
    crypto.randomUUID(), clean(identity.email, 254), "website_builder_settings_update",
    "website_builder", "settings", clean(summary, 1000), JSON.stringify(metadata || {})
  ).run();
}

export async function onRequest(context) {
  const { request, env } = context;
  const correlationId = clean(request.headers.get("cf-ray") || request.headers.get("x-request-id") || crypto.randomUUID(), 120);
  if (!env.DB) return json({ success: false, error: "Website Builder Settings are unavailable because the database binding is missing.", correlationId }, 500);

  try {
    const identity = await getNativeSession(request, env, "admin");
    const access = await authorise(env.DB, identity, env);
    if (!access.authenticated) return json({ success: false, error: "Your administrator session has expired. Please sign in again.", code: "SESSION_EXPIRED", correlationId }, 401);
    if (!access.authorised) return json({ success: false, error: "You do not have permission to manage the Website Builder.", code: "FORBIDDEN", correlationId }, 403);
    await ensureTable(env.DB);

    if (request.method === "GET") {
      const settings = await loadConfig(env.DB);
      const diagnostics = settings.diagnosticsEnabled ? {
        database: true,
        aiBinding: Boolean(env.AI?.run),
        modelConfigured: Boolean(settings.aiModel),
        status: settings.status,
        readOnly: settings.readOnly,
      } : null;
      return json({ success: true, settings, diagnostics, correlationId });
    }

    if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
    if (!isSameOriginRequest(request)) return json({ success: false, error: "This request could not be verified." }, 403);
    const body = await request.json().catch(() => ({}));
    if (clean(body.action, 80) !== "save") return json({ success: false, error: "Unknown settings action." }, 400);

    const before = await loadConfig(env.DB);
    const settings = normalise(body.settings || {});
    await env.DB.prepare("UPDATE website_builder_config SET config_json=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=1")
      .bind(JSON.stringify(settings), clean(identity.email, 254)).run();
    await audit(env.DB, identity, `AI Website Builder settings updated. Status: ${settings.status}.`, {
      previousStatus: before.status,
      newStatus: settings.status,
      readOnly: settings.readOnly,
      aiEnabled: settings.aiEnabled,
      correlationId,
    });
    return json({ success: true, settings: await loadConfig(env.DB), correlationId });
  } catch (error) {
    console.error(JSON.stringify({ event: "website_builder_settings_failed", correlation_id: correlationId, error: error instanceof Error ? error.message : "Unknown error" }));
    return json({ success: false, error: "Website Builder Settings could not be completed.", detail: error instanceof Error ? error.message : "Unknown error", correlationId }, 500);
  }
}
