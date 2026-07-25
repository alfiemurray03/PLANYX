import { isSameOriginRequest } from "../../_shared/enquiries.js";
import { getNativeSession } from "../../_shared/oidc.js";
import { readPartnerGalleryConfig, savePartnerGalleryConfig } from "../../_shared/partner-galleries.js";

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

function clean(value, max = 300) {
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
  const direct = permissions.includes("*") || permissions.includes("manage_content") || permissions.includes("manage_system_settings") || permissions.includes("manage_affiliates");
  return {
    authenticated: true,
    authorised: direct || ["Platform Owner", "System Administrator", "Senior Administrator"].includes(clean(row.role, 100)),
    email,
    role: clean(row.role, 100),
  };
}

async function audit(DB, admin, config, correlationId) {
  try {
    await DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY, actor_email TEXT, action TEXT, entity_type TEXT,
      entity_id TEXT, summary TEXT, metadata TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();
    await DB.prepare(`INSERT INTO admin_audit_log
      (id,actor_email,action,entity_type,entity_id,summary,metadata)
      VALUES (?,?,?,?,?,?,?)`).bind(
        crypto.randomUUID(), admin.email, "partner_galleries_saved", "affiliate_gallery", "headout-getyourguide",
        "Updated Headout and GetYourGuide destination galleries.",
        JSON.stringify({
          headout_enabled: config.headout.enabled,
          headout_destinations: config.headout.destinations.length,
          getyourguide_enabled: config.getyourguide.enabled,
          getyourguide_destinations: config.getyourguide.destinations.length,
          correlation_id: correlationId,
        })
      ).run();
  } catch {
    // Content saving must not fail solely because audit logging is unavailable.
  }
}

export async function onRequest({ request, env }) {
  const correlationId = clean(request.headers.get("cf-ray") || request.headers.get("x-request-id") || crypto.randomUUID(), 120);
  if (!env.DB) return json({ success: false, error: "Partner gallery configuration is unavailable because the database binding is missing.", correlationId }, 500);

  try {
    const identity = await getNativeSession(request, env, "admin");
    const admin = await authorise(env.DB, identity, env);
    if (!admin.authenticated) return json({ success: false, error: "Your administrator session has expired.", code: "SESSION_EXPIRED", correlationId }, 401);
    if (!admin.authorised) return json({ success: false, error: "You do not have permission to manage partner galleries.", code: "FORBIDDEN", correlationId }, 403);

    if (request.method === "GET") {
      return json({ success: true, config: await readPartnerGalleryConfig(env.DB), admin: { email: admin.email, role: admin.role }, correlationId });
    }
    if (request.method !== "POST") return json({ success: false, error: "Method not allowed.", correlationId }, 405);
    if (!isSameOriginRequest(request)) return json({ success: false, error: "This request could not be verified.", correlationId }, 403);

    const body = await request.json().catch(() => ({}));
    const config = await savePartnerGalleryConfig(env.DB, body.config || body);
    await audit(env.DB, admin, config, correlationId);
    return json({ success: true, saved: true, config, correlationId });
  } catch (error) {
    console.error(JSON.stringify({ event: "partner_gallery_settings_failed", correlation_id: correlationId, error: error instanceof Error ? error.message : "Unknown error" }));
    return json({ success: false, error: error instanceof Error ? error.message : "Partner galleries could not be saved.", correlationId }, 500);
  }
}
