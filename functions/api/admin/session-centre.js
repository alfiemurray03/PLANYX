import { assertSameOrigin, getNativeSession } from "../../_shared/oidc.js";
import {
  ensureSessionTrackingTables,
  importLegacySessions,
  recordSessionHeartbeat,
  writeSessionEvent
} from "../../_shared/session-tracking.js";

const DEFAULT_ADMIN_EMAIL = "alfieholywoodmurray@jagroupservices.co.uk";

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanEmail(value) {
  return clean(value, 254).toLowerCase();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function configuredAdmins(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL)
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
}

async function isAuthorisedAdmin(env, identity) {
  const email = cleanEmail(identity?.email);
  if (!email) return false;
  if (configuredAdmins(env).includes(email)) return true;
  if (!env.DB) return false;
  try {
    const row = await env.DB.prepare(`SELECT status FROM admin_users WHERE lower(email)=lower(?)`).bind(email).first();
    const status = clean(row?.status || "Active", 80).toLowerCase();
    return Boolean(row) && !["blocked", "closed", "disabled", "inactive", "suspended"].includes(status);
  } catch {
    return false;
  }
}

async function requestBody(request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

async function safeAll(DB, sql, bindings = []) {
  try {
    const statement = DB.prepare(sql);
    const result = bindings.length ? await statement.bind(...bindings).all() : await statement.all();
    return result.results || [];
  } catch {
    return [];
  }
}

async function ensureAdminAudit(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY,
    actor_email TEXT,
    action TEXT,
    entity_type TEXT,
    entity_id TEXT,
    summary TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function writeAdminAudit(DB, identity, action, entityId, summary, metadata = {}) {
  await ensureAdminAudit(DB);
  await DB.prepare(`
    INSERT INTO admin_audit_log (id, actor_email, action, entity_type, entity_id, summary, metadata)
    VALUES (?, ?, ?, 'auth_session', ?, ?, ?)
  `).bind(
    crypto.randomUUID(), cleanEmail(identity.email), clean(action, 120), clean(entityId, 300),
    clean(summary, 1000), JSON.stringify(metadata)
  ).run();
}

function parseDetails(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function sessionState(row) {
  const now = Date.now();
  const revoked = row.revoked_at ? Date.parse(row.revoked_at) : 0;
  const absolute = row.absolute_expires_at ? Date.parse(row.absolute_expires_at) : 0;
  const idle = row.idle_expires_at ? Date.parse(row.idle_expires_at) : 0;
  const lastSeen = row.last_seen_at ? Date.parse(row.last_seen_at) : 0;
  if (revoked) return "Signed out";
  if (absolute && absolute <= now) return "Expired";
  if (idle && idle <= now) return "Idle expired";
  if (lastSeen && now - lastSeen <= 15 * 60 * 1000) return "Active now";
  if (lastSeen && now - lastSeen <= 24 * 60 * 60 * 1000) return "Recent";
  return clean(row.status || "Historical", 80);
}

function maskFingerprint(value) {
  const hash = clean(value, 256);
  if (!hash) return "Not recorded";
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function profileUrl(row) {
  const email = encodeURIComponent(cleanEmail(row.linked_user_id || row.email));
  return row.realm === "customer" ? `/admin/users/${email}` : "/admin/admin-users";
}

async function buildPayload(DB, currentIdentity) {
  await importLegacySessions(DB);
  const [rows, events, reports] = await Promise.all([
    safeAll(DB, `SELECT * FROM auth_sessions ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 1500`),
    safeAll(DB, `SELECT * FROM auth_session_events ORDER BY created_at DESC LIMIT 2500`),
    safeAll(DB, `SELECT id, reference, report_type, urgency, status, linked_session_id, linked_user_email, created_at, updated_at FROM authority_reports ORDER BY updated_at DESC LIMIT 1000`)
  ]);

  const eventCount = new Map();
  const failedCount = new Map();
  for (const event of events) {
    const id = clean(event.session_id, 300);
    eventCount.set(id, Number(eventCount.get(id) || 0) + 1);
    if (clean(event.result, 40).toLowerCase() !== "success") failedCount.set(id, Number(failedCount.get(id) || 0) + 1);
  }

  const activeByEmail = new Map();
  for (const row of rows) {
    if (sessionState(row) !== "Active now") continue;
    const email = cleanEmail(row.email);
    activeByEmail.set(email, Number(activeByEmail.get(email) || 0) + 1);
  }

  const reportsBySession = new Map();
  for (const report of reports) {
    const id = clean(report.linked_session_id, 300);
    if (!id) continue;
    if (!reportsBySession.has(id)) reportsBySession.set(id, []);
    reportsBySession.get(id).push(report);
  }

  const sessions = rows.map(row => {
    const state = sessionState(row);
    const id = clean(row.session_id, 300);
    const riskFlags = [];
    if (clean(row.match_basis, 120).toLowerCase().includes("no matching")) riskFlags.push("User profile not linked");
    if (!row.ip_address && !row.ip_hash) riskFlags.push("Network address unavailable");
    if (Number(activeByEmail.get(cleanEmail(row.email)) || 0) > 1 && state === "Active now") riskFlags.push("Multiple active sessions");
    if (Number(failedCount.get(id) || 0) > 0) riskFlags.push("Failed authentication events");
    if (Number(row.legal_hold || 0) === 1) riskFlags.push("Evidence hold");
    if (row.realm === "admin" && clean(row.linked_user_status, 80).toLowerCase() !== "active") riskFlags.push("Administrator status needs review");

    return {
      session_id: id,
      reference: row.session_reference,
      realm: row.realm,
      status: state,
      created_at: row.created_at,
      last_seen_at: row.last_seen_at,
      idle_expires_at: row.idle_expires_at,
      absolute_expires_at: row.absolute_expires_at,
      revoked_at: row.revoked_at,
      auth_method: row.auth_method || "Microsoft OIDC",
      fingerprint: maskFingerprint(row.token_hash),
      user_agent: row.user_agent || "",
      ip_address: row.ip_address || "",
      network_fingerprint: maskFingerprint(row.ip_hash),
      country_code: row.country_code || "",
      cf_colo: row.cf_colo || "",
      request_id: row.request_id || "",
      subject: row.subject || "",
      tenant_id: row.tenant_id || "",
      microsoft_object_id: row.microsoft_object_id || "",
      legal_hold: Number(row.legal_hold || 0) === 1,
      legal_hold_reason: row.legal_hold_reason || "",
      retained_until: row.retained_until || null,
      linked_user: {
        type: row.linked_user_type || (row.realm === "admin" ? "Administrator" : "Customer"),
        id: row.linked_user_id || row.email,
        email: row.email,
        name: row.linked_user_name || row.display_name || row.email,
        role: row.linked_user_role || (row.realm === "admin" ? "Administrator" : "Customer"),
        status: row.linked_user_status || "Unknown",
        match_basis: row.match_basis || "Email",
        profile_url: profileUrl(row)
      },
      risk_flags: riskFlags,
      event_count: Number(eventCount.get(id) || 0),
      linked_reports: reportsBySession.get(id) || [],
      is_current: clean(row.token_hash, 256) === clean(currentIdentity.tokenHash, 256)
    };
  });

  const recentEvents = events.map(event => ({
    id: event.id,
    session_id: event.session_id,
    session_reference: event.session_reference,
    event_type: event.event_type,
    result: event.result,
    realm: event.realm,
    email: event.email,
    actor_email: event.actor_email,
    ip_address: event.ip_address,
    network_fingerprint: maskFingerprint(event.ip_hash),
    user_agent: event.user_agent,
    request_id: event.request_id,
    details: parseDetails(event.details),
    created_at: event.created_at
  }));

  const today = new Date().toISOString().slice(0, 10);
  return {
    summary: {
      total_sessions: sessions.length,
      active_now: sessions.filter(item => item.status === "Active now").length,
      signed_in_today: sessions.filter(item => String(item.created_at || "").slice(0, 10) === today).length,
      administrators: sessions.filter(item => item.realm === "admin").length,
      customers: sessions.filter(item => item.realm === "customer").length,
      unique_users: new Set(sessions.map(item => cleanEmail(item.linked_user.email)).filter(Boolean)).size,
      sessions_needing_review: sessions.filter(item => item.risk_flags.length > 0).length,
      evidence_holds: sessions.filter(item => item.legal_hold).length,
      authority_reports: reports.length
    },
    sessions,
    events: recentEvents,
    reports,
    retention: {
      standard_days: 365,
      legal_hold: "Sessions linked to an authority report can be placed on evidence hold. Retention must remain aligned with the company retention schedule and legal advice.",
      token_notice: "Secret cookies and full session tokens are never returned to the Admin Centre. Only a masked one-way fingerprint is displayed."
    }
  };
}

async function authenticate(context) {
  if (!context.env.DB) return { error: json({ success: false, error: "Session database is unavailable." }, 503) };
  const identity = await getNativeSession(context.request, context.env, "admin").catch(() => null);
  if (!identity) return { error: json({ success: false, error: "Administrator session required." }, 401) };
  if (!(await isAuthorisedAdmin(context.env, identity))) return { error: json({ success: false, error: "Administrator access was denied." }, 403) };
  await ensureSessionTrackingTables(context.env.DB);
  await recordSessionHeartbeat(context.env.DB, context.request, identity, "admin");
  return { identity };
}

export async function onRequestGet(context) {
  const auth = await authenticate(context);
  if (auth.error) return auth.error;
  return json({ success: true, data: await buildPayload(context.env.DB, auth.identity) });
}

export async function onRequestPost(context) {
  if (!assertSameOrigin(context.request)) return json({ success: false, error: "Request origin was rejected." }, 403);
  const auth = await authenticate(context);
  if (auth.error) return auth.error;
  const body = await requestBody(context.request);
  const sessionId = clean(body.session_id, 300);
  if (!sessionId) return json({ success: false, error: "Session reference is required." }, 400);

  const session = await context.env.DB.prepare(`SELECT * FROM auth_sessions WHERE session_id = ?`).bind(sessionId).first();
  if (!session) return json({ success: false, error: "Session could not be found." }, 404);

  if (body.action === "set_legal_hold") {
    const enabled = Boolean(body.enabled);
    const reason = clean(body.reason, 1000);
    if (enabled && !reason) return json({ success: false, error: "Enter the reason for the evidence hold." }, 400);
    await context.env.DB.prepare(`
      UPDATE auth_sessions SET legal_hold = ?, legal_hold_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ?
    `).bind(enabled ? 1 : 0, enabled ? reason : "", sessionId).run();
    await writeSessionEvent(context.env.DB, session, enabled ? "Evidence hold applied" : "Evidence hold removed", context.request, { result: "Success", reason }, auth.identity.email);
    await writeAdminAudit(context.env.DB, auth.identity, enabled ? "session_legal_hold_apply" : "session_legal_hold_remove", sessionId, `${enabled ? "Applied" : "Removed"} an evidence hold for ${session.session_reference}.`, { reason });
  } else if (body.action === "mark_reviewed") {
    await writeSessionEvent(context.env.DB, session, "Session reviewed", context.request, { result: "Success", note: clean(body.note, 1000) }, auth.identity.email);
    await writeAdminAudit(context.env.DB, auth.identity, "session_review", sessionId, `Reviewed session ${session.session_reference}.`, { note: clean(body.note, 1000) });
  } else {
    return json({ success: false, error: "Unsupported session action." }, 400);
  }

  return json({ success: true, data: await buildPayload(context.env.DB, auth.identity) });
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ success: false, error: "Method not allowed." }, 405);
}
