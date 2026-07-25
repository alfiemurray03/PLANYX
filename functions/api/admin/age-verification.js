import { isSameOriginRequest } from "../../_shared/enquiries.js";
import { getNativeSession } from "../../_shared/oidc.js";
import { calculateAge, ageBandFor } from "../../_shared/age-assurance.js";
import {
  ageVerificationDiagnostics,
  ensureAgeVerificationControlTables,
  getAgeVerificationSettings,
  recordAgeVerificationEvent,
  saveAgeVerificationSettings,
} from "../../_shared/age-verification-settings.js";

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
  return String(value ?? "").trim().slice(0, max);
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
  if (explicit.includes("*") || explicit.includes("manage_age_verification") || explicit.includes("manage_system_settings") || explicit.includes("manage_settings")) {
    return { authenticated: true, authorised: true };
  }
  const permission = await DB.prepare(`SELECT permission_code FROM role_permissions
    WHERE role_name=? AND permission_code IN ('manage_age_verification','manage_system_settings','manage_settings') LIMIT 1`)
    .bind(clean(admin.role || "Auditor", 100)).first().catch(() => null);
  return { authenticated: true, authorised: Boolean(permission) };
}

async function ensureAuditTable(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY, actor_email TEXT, action TEXT, entity_type TEXT,
    entity_id TEXT, summary TEXT, metadata TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function audit(DB, identity, action, summary, metadata = {}) {
  await ensureAuditTable(DB);
  await DB.prepare(`INSERT INTO admin_audit_log
    (id,actor_email,action,entity_type,entity_id,summary,metadata)
    VALUES (?,?,?,?,?,?,?)`).bind(
    crypto.randomUUID(), identity.email, action, "age_verification", "singleton", summary,
    JSON.stringify(metadata)
  ).run();
}

async function profileStats(DB) {
  const columns = await DB.prepare("PRAGMA table_info(profiles)").all().catch(() => ({ results: [] }));
  const names = new Set((columns.results || []).map((column) => column.name));
  if (!names.has("age_band")) return { total: 0, verified: 0, youngPeople: 0, adults: 0, blockedUnder16: 0, checkRequired: 0 };
  const row = await DB.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN registration_eligible=1 THEN 1 ELSE 0 END) AS verified,
      SUM(CASE WHEN age_band='16-17' THEN 1 ELSE 0 END) AS young_people,
      SUM(CASE WHEN age_band='18+' THEN 1 ELSE 0 END) AS adults,
      SUM(CASE WHEN age_band='under-16' THEN 1 ELSE 0 END) AS blocked_under_16,
      SUM(CASE WHEN age_band IS NULL OR age_verified_at IS NULL THEN 1 ELSE 0 END) AS check_required
    FROM profiles`).first().catch(() => null);
  return {
    total: Number(row?.total || 0),
    verified: Number(row?.verified || 0),
    youngPeople: Number(row?.young_people || 0),
    adults: Number(row?.adults || 0),
    blockedUnder16: Number(row?.blocked_under_16 || 0),
    checkRequired: Number(row?.check_required || 0),
  };
}

async function eventStats(DB) {
  const row = await DB.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN outcome='passed' THEN 1 ELSE 0 END) AS passed,
      SUM(CASE WHEN outcome='blocked' THEN 1 ELSE 0 END) AS blocked,
      SUM(CASE WHEN outcome='failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN created_at >= datetime('now','-24 hours') THEN 1 ELSE 0 END) AS last_24_hours
    FROM age_verification_events`).first().catch(() => null);
  return {
    total: Number(row?.total || 0), passed: Number(row?.passed || 0),
    blocked: Number(row?.blocked || 0), failed: Number(row?.failed || 0),
    last24Hours: Number(row?.last_24_hours || 0),
  };
}

async function recentEvents(DB) {
  const result = await DB.prepare(`SELECT id,event_type,outcome,age_band,subject_email,method,provider,
      detail,correlation_id,ip_address,user_agent,created_at
    FROM age_verification_events ORDER BY created_at DESC LIMIT 100`).all().catch(() => ({ results: [] }));
  return result.results || [];
}

export async function onRequest(context) {
  const { request, env } = context;
  const correlationId = clean(request.headers.get("cf-ray") || request.headers.get("x-request-id") || crypto.randomUUID(), 120);
  if (!env.DB) return json({ success: false, error: "Age verification controls are unavailable because the database binding is missing.", correlationId }, 500);

  try {
    const identity = await getNativeSession(request, env, "admin");
    const access = await authorise(env.DB, identity, env);
    if (!access.authenticated) {
      return json({
        success: false,
        error: "Your administrator session has expired. Please sign in again.",
        code: "SESSION_EXPIRED",
        correlationId,
      }, 401);
    }
    if (!access.authorised) return json({ success: false, error: "You do not have permission to manage age verification.", code: "FORBIDDEN", correlationId }, 403);
    await ensureAgeVerificationControlTables(env.DB);

    if (request.method === "GET") {
      const diagnostics = await ageVerificationDiagnostics(env.DB, env);
      return json({
        success: true,
        settings: diagnostics.settings,
        diagnostics: { checks: diagnostics.checks, healthy: diagnostics.healthy },
        stats: { profiles: await profileStats(env.DB), events: await eventStats(env.DB) },
        events: await recentEvents(env.DB),
        legalNotice: "These controls support compliance and governance but do not replace a DPIA, legal advice, provider due diligence or Children's Code assessment.",
        correlationId,
      });
    }

    if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
    if (!isSameOriginRequest(request)) return json({ success: false, error: "This request could not be verified." }, 403);
    const body = await request.json().catch(() => ({}));
    const action = clean(body.action, 80);

    if (action === "save") {
      const before = await getAgeVerificationSettings(env.DB, env);
      const settings = await saveAgeVerificationSettings(env.DB, env, body.settings || {}, identity.email);
      await audit(env.DB, identity, "age_verification_settings_update", `Age verification settings updated. Service status: ${settings.serviceStatus}.`, {
        previous_status: before.serviceStatus,
        new_status: settings.serviceStatus,
        previous_method: before.verificationMethod,
        new_method: settings.verificationMethod,
        policy_version: settings.policyVersion,
        correlation_id: correlationId,
      });
      await recordAgeVerificationEvent(env.DB, request, {
        eventType: "admin_settings_update", outcome: "success", method: settings.verificationMethod,
        provider: settings.providerName, subjectEmail: identity.email,
        detail: `Service status changed from ${before.serviceStatus} to ${settings.serviceStatus}.`, correlationId,
      });
      return json({ success: true, settings, diagnostics: await ageVerificationDiagnostics(env.DB, env), correlationId });
    }

    if (action === "diagnostics") {
      const diagnostics = await ageVerificationDiagnostics(env.DB, env);
      await recordAgeVerificationEvent(env.DB, request, {
        eventType: "admin_diagnostics", outcome: diagnostics.healthy ? "passed" : "failed",
        subjectEmail: identity.email, detail: diagnostics.healthy ? "All mandatory diagnostics passed." : "One or more mandatory diagnostics failed.", correlationId,
      });
      return json({ success: true, diagnostics, correlationId });
    }

    if (action === "test_age") {
      const dateOfBirth = clean(body.dateOfBirth, 10);
      const age = calculateAge(dateOfBirth);
      const ageBand = ageBandFor(dateOfBirth);
      if (age < 0 || ageBand === "unknown") return json({ success: false, error: "Enter a valid test date of birth." }, 400);
      await recordAgeVerificationEvent(env.DB, request, {
        eventType: "admin_test_age", outcome: ageBand === "under-16" ? "blocked" : "passed",
        ageBand, subjectEmail: identity.email, method: "non-persistent-admin-test",
        detail: "Age-band calculation tested. The test date of birth was not stored.", correlationId,
      });
      return json({ success: true, result: { age, ageBand, eligible: age >= 16, youngPersonSafeguards: age >= 16 && age < 18 }, correlationId });
    }

    if (action === "clear_events") {
      await env.DB.prepare("DELETE FROM age_verification_events").run();
      await audit(env.DB, identity, "age_verification_events_clear", "Age-verification event records were cleared by an administrator.", { correlation_id: correlationId });
      return json({ success: true, cleared: true, correlationId });
    }

    return json({ success: false, error: "Unknown action." }, 400);
  } catch (error) {
    console.error(JSON.stringify({ event: "age_verification_admin_request_failed", correlation_id: correlationId, error: error instanceof Error ? error.message : "Unknown error" }));
    return json({ success: false, error: "Age verification controls could not be completed. Please retry or use the correlation reference when reporting the fault.", detail: error instanceof Error ? error.message : "Unknown error", correlationId }, 500);
  }
}
