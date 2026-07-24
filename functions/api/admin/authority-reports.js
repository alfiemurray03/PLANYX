import { assertSameOrigin, getNativeSession } from "../../_shared/oidc.js";
import { ensureSessionTrackingTables, recordSessionHeartbeat, writeSessionEvent } from "../../_shared/session-tracking.js";

const DEFAULT_ADMIN_EMAIL = "alfieholywoodmurray@jagroupservices.co.uk";
const REPORT_TYPES = new Set([
  "police-emergency",
  "police-non-emergency",
  "child-safeguarding",
  "adult-safeguarding",
  "data-breach-ico",
  "local-authority",
  "other-authority"
]);
const STATUSES = new Set(["Draft", "Ready to report", "Reported", "Further information requested", "Closed"]);
const URGENCIES = new Set(["Emergency", "Urgent", "Routine"]);

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanEmail(value) {
  return clean(value, 254).toLowerCase();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
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
  try {
    const row = await env.DB.prepare(`SELECT status FROM admin_users WHERE lower(email)=lower(?)`).bind(email).first();
    const status = clean(row?.status || "Active", 80).toLowerCase();
    return Boolean(row) && !["blocked", "closed", "disabled", "inactive", "suspended"].includes(status);
  } catch {
    return false;
  }
}

async function authenticate(context) {
  if (!context.env.DB) return { error: json({ success: false, error: "Authority-report storage is unavailable." }, 503) };
  const identity = await getNativeSession(context.request, context.env, "admin").catch(() => null);
  if (!identity) return { error: json({ success: false, error: "Administrator session required." }, 401) };
  if (!(await isAuthorisedAdmin(context.env, identity))) return { error: json({ success: false, error: "Administrator access was denied." }, 403) };
  await recordSessionHeartbeat(context.env.DB, context.request, identity, "admin");
  return { identity };
}

async function requestBody(request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

async function ensureTables(DB) {
  await ensureSessionTrackingTables(DB);
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS authority_reports (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,
      report_type TEXT NOT NULL,
      authority_name TEXT,
      authority_channel TEXT,
      urgency TEXT DEFAULT 'Routine',
      status TEXT DEFAULT 'Draft',
      linked_session_id TEXT,
      linked_session_reference TEXT,
      linked_user_email TEXT,
      linked_user_name TEXT,
      linked_user_type TEXT,
      subject_name TEXT,
      subject_date_of_birth TEXT,
      incident_datetime TEXT,
      incident_location TEXT,
      summary TEXT,
      narrative TEXT,
      risk_details TEXT,
      people_involved TEXT,
      evidence_summary TEXT,
      immediate_actions TEXT,
      safeguarding_actions TEXT,
      data_categories TEXT,
      individuals_affected TEXT,
      containment_actions TEXT,
      external_reference TEXT,
      submitted_at TEXT,
      submitted_by TEXT,
      assigned_admin TEXT,
      internal_notes TEXT,
      staff_declaration TEXT,
      form_payload TEXT,
      legal_hold INTEGER DEFAULT 1,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS authority_report_events (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      report_reference TEXT,
      event_type TEXT NOT NULL,
      actor_email TEXT,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS idx_authority_reports_status ON authority_reports(status, updated_at DESC)`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS idx_authority_reports_user ON authority_reports(lower(linked_user_email), updated_at DESC)`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS idx_authority_reports_session ON authority_reports(linked_session_id, updated_at DESC)`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS idx_authority_report_events_report ON authority_report_events(report_id, created_at DESC)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY,
      actor_email TEXT,
      action TEXT,
      entity_type TEXT,
      entity_id TEXT,
      summary TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`)
  ]);
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

async function nextReference(DB) {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const row = await DB.prepare(`SELECT COUNT(*) AS count FROM authority_reports WHERE reference LIKE ?`).bind(`AUTH-${day}-%`).first();
  return `AUTH-${day}-${String(Number(row?.count || 0) + 1).padStart(4, "0")}`;
}

async function writeEvent(DB, report, eventType, actorEmail, details = {}) {
  await DB.prepare(`
    INSERT INTO authority_report_events (id, report_id, report_reference, event_type, actor_email, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), report.id, report.reference, clean(eventType, 120), cleanEmail(actorEmail), JSON.stringify(details || {})).run();
}

async function writeAudit(DB, identity, action, report, summary, metadata = {}) {
  await DB.prepare(`
    INSERT INTO admin_audit_log (id, actor_email, action, entity_type, entity_id, summary, metadata)
    VALUES (?, ?, ?, 'authority_report', ?, ?, ?)
  `).bind(crypto.randomUUID(), cleanEmail(identity.email), clean(action, 120), report.reference, clean(summary, 1000), JSON.stringify(metadata)).run();
}

function parsePayload(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normaliseReport(row, events = []) {
  return {
    ...row,
    legal_hold: Number(row.legal_hold || 0) === 1,
    form_payload: parsePayload(row.form_payload),
    events: events.map(event => ({ ...event, details: parsePayload(event.details) }))
  };
}

async function listReports(DB, selectedId = "") {
  const reports = await safeAll(DB, `SELECT * FROM authority_reports ORDER BY updated_at DESC, created_at DESC LIMIT 1000`);
  const events = await safeAll(DB, `SELECT * FROM authority_report_events ORDER BY created_at DESC LIMIT 5000`);
  const grouped = new Map();
  for (const event of events) {
    if (!grouped.has(event.report_id)) grouped.set(event.report_id, []);
    grouped.get(event.report_id).push(event);
  }
  const normalised = reports.map(report => normaliseReport(report, grouped.get(report.id) || []));
  return {
    reports: normalised,
    selected: selectedId ? normalised.find(report => report.id === selectedId || report.reference === selectedId) || null : null,
    summary: {
      total: normalised.length,
      drafts: normalised.filter(report => report.status === "Draft").length,
      ready: normalised.filter(report => report.status === "Ready to report").length,
      reported: normalised.filter(report => report.status === "Reported" || report.status === "Further information requested").length,
      emergency: normalised.filter(report => report.urgency === "Emergency" && report.status !== "Closed").length,
      evidence_holds: normalised.filter(report => report.legal_hold).length
    }
  };
}

function reportValues(body, existing = {}) {
  const reportType = REPORT_TYPES.has(clean(body.report_type, 80)) ? clean(body.report_type, 80) : clean(existing.report_type, 80) || "other-authority";
  const urgency = URGENCIES.has(clean(body.urgency, 40)) ? clean(body.urgency, 40) : clean(existing.urgency, 40) || "Routine";
  const status = STATUSES.has(clean(body.status, 80)) ? clean(body.status, 80) : clean(existing.status, 80) || "Draft";
  return {
    reportType,
    urgency,
    status,
    authorityName: clean(body.authority_name ?? existing.authority_name, 180),
    authorityChannel: clean(body.authority_channel ?? existing.authority_channel, 180),
    linkedSessionId: clean(body.linked_session_id ?? existing.linked_session_id, 300),
    linkedSessionReference: clean(body.linked_session_reference ?? existing.linked_session_reference, 120),
    linkedUserEmail: cleanEmail(body.linked_user_email ?? existing.linked_user_email),
    linkedUserName: clean(body.linked_user_name ?? existing.linked_user_name, 180),
    linkedUserType: clean(body.linked_user_type ?? existing.linked_user_type, 80),
    subjectName: clean(body.subject_name ?? existing.subject_name, 180),
    subjectDateOfBirth: clean(body.subject_date_of_birth ?? existing.subject_date_of_birth, 40),
    incidentDatetime: clean(body.incident_datetime ?? existing.incident_datetime, 60),
    incidentLocation: clean(body.incident_location ?? existing.incident_location, 500),
    summary: clean(body.summary ?? existing.summary, 1000),
    narrative: clean(body.narrative ?? existing.narrative, 12000),
    riskDetails: clean(body.risk_details ?? existing.risk_details, 6000),
    peopleInvolved: clean(body.people_involved ?? existing.people_involved, 6000),
    evidenceSummary: clean(body.evidence_summary ?? existing.evidence_summary, 6000),
    immediateActions: clean(body.immediate_actions ?? existing.immediate_actions, 6000),
    safeguardingActions: clean(body.safeguarding_actions ?? existing.safeguarding_actions, 6000),
    dataCategories: clean(body.data_categories ?? existing.data_categories, 4000),
    individualsAffected: clean(body.individuals_affected ?? existing.individuals_affected, 4000),
    containmentActions: clean(body.containment_actions ?? existing.containment_actions, 6000),
    externalReference: clean(body.external_reference ?? existing.external_reference, 180),
    assignedAdmin: cleanEmail(body.assigned_admin ?? existing.assigned_admin),
    internalNotes: clean(body.internal_notes ?? existing.internal_notes, 10000),
    staffDeclaration: clean(body.staff_declaration ?? existing.staff_declaration, 2000),
    formPayload: JSON.stringify(body.form_payload && typeof body.form_payload === "object" ? body.form_payload : parsePayload(existing.form_payload)),
    legalHold: body.legal_hold === undefined ? Number(existing.legal_hold ?? 1) === 1 : Boolean(body.legal_hold)
  };
}

async function preserveLinkedSession(DB, report, identity, request) {
  if (!report.linked_session_id) return;
  await DB.prepare(`
    UPDATE auth_sessions
    SET legal_hold = 1,
        legal_hold_reason = ?,
        retained_until = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE session_id = ?
  `).bind(`Linked to authority report ${report.reference}`, report.linked_session_id).run();
  const session = await DB.prepare(`SELECT * FROM auth_sessions WHERE session_id = ?`).bind(report.linked_session_id).first();
  if (session) {
    await writeSessionEvent(DB, session, "Evidence hold applied by authority report", request, {
      result: "Success",
      report_reference: report.reference,
      report_type: report.report_type
    }, identity.email);
  }
}

async function createReport(DB, body, identity, request) {
  const values = reportValues(body);
  if (!values.summary) throw new Error("Enter a clear incident or concern summary.");
  if (!values.narrative) throw new Error("Enter a factual chronology or narrative.");
  const id = crypto.randomUUID();
  const reference = await nextReference(DB);
  await DB.prepare(`
    INSERT INTO authority_reports (
      id, reference, report_type, authority_name, authority_channel, urgency, status,
      linked_session_id, linked_session_reference, linked_user_email, linked_user_name,
      linked_user_type, subject_name, subject_date_of_birth, incident_datetime,
      incident_location, summary, narrative, risk_details, people_involved, evidence_summary,
      immediate_actions, safeguarding_actions, data_categories, individuals_affected,
      containment_actions, external_reference, assigned_admin, internal_notes,
      staff_declaration, form_payload, legal_hold, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, reference, values.reportType, values.authorityName, values.authorityChannel, values.urgency, values.status,
    values.linkedSessionId, values.linkedSessionReference, values.linkedUserEmail, values.linkedUserName,
    values.linkedUserType, values.subjectName, values.subjectDateOfBirth, values.incidentDatetime,
    values.incidentLocation, values.summary, values.narrative, values.riskDetails, values.peopleInvolved,
    values.evidenceSummary, values.immediateActions, values.safeguardingActions, values.dataCategories,
    values.individualsAffected, values.containmentActions, values.externalReference, values.assignedAdmin,
    values.internalNotes, values.staffDeclaration, values.formPayload, values.legalHold ? 1 : 0,
    cleanEmail(identity.email), cleanEmail(identity.email)
  ).run();
  const report = await DB.prepare(`SELECT * FROM authority_reports WHERE id = ?`).bind(id).first();
  await writeEvent(DB, report, "Report created", identity.email, { status: values.status, urgency: values.urgency });
  await writeAudit(DB, identity, "authority_report_create", report, `Created authority report ${reference}.`, { report_type: values.reportType, urgency: values.urgency, linked_session_id: values.linkedSessionId });
  if (values.legalHold) await preserveLinkedSession(DB, report, identity, request);
  return report;
}

async function updateReport(DB, body, identity, request) {
  const id = clean(body.id || body.reference, 180);
  const existing = await DB.prepare(`SELECT * FROM authority_reports WHERE id = ? OR reference = ?`).bind(id, id).first();
  if (!existing) throw new Error("Authority report could not be found.");
  const values = reportValues(body, existing);
  const submittedAt = values.status === "Reported" ? (existing.submitted_at || new Date().toISOString()) : existing.submitted_at;
  const submittedBy = values.status === "Reported" ? (existing.submitted_by || cleanEmail(identity.email)) : existing.submitted_by;
  const closedAt = values.status === "Closed" ? (existing.closed_at || new Date().toISOString()) : null;

  await DB.prepare(`
    UPDATE authority_reports SET
      report_type = ?, authority_name = ?, authority_channel = ?, urgency = ?, status = ?,
      linked_session_id = ?, linked_session_reference = ?, linked_user_email = ?, linked_user_name = ?,
      linked_user_type = ?, subject_name = ?, subject_date_of_birth = ?, incident_datetime = ?,
      incident_location = ?, summary = ?, narrative = ?, risk_details = ?, people_involved = ?,
      evidence_summary = ?, immediate_actions = ?, safeguarding_actions = ?, data_categories = ?,
      individuals_affected = ?, containment_actions = ?, external_reference = ?, submitted_at = ?,
      submitted_by = ?, assigned_admin = ?, internal_notes = ?, staff_declaration = ?, form_payload = ?,
      legal_hold = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP, closed_at = ?
    WHERE id = ?
  `).bind(
    values.reportType, values.authorityName, values.authorityChannel, values.urgency, values.status,
    values.linkedSessionId, values.linkedSessionReference, values.linkedUserEmail, values.linkedUserName,
    values.linkedUserType, values.subjectName, values.subjectDateOfBirth, values.incidentDatetime,
    values.incidentLocation, values.summary, values.narrative, values.riskDetails, values.peopleInvolved,
    values.evidenceSummary, values.immediateActions, values.safeguardingActions, values.dataCategories,
    values.individualsAffected, values.containmentActions, values.externalReference, submittedAt,
    submittedBy, values.assignedAdmin, values.internalNotes, values.staffDeclaration, values.formPayload,
    values.legalHold ? 1 : 0, cleanEmail(identity.email), closedAt, existing.id
  ).run();

  const report = await DB.prepare(`SELECT * FROM authority_reports WHERE id = ?`).bind(existing.id).first();
  const eventType = existing.status !== values.status ? `Status changed to ${values.status}` : "Report updated";
  await writeEvent(DB, report, eventType, identity.email, { previous_status: existing.status, status: values.status, external_reference: values.externalReference });
  await writeAudit(DB, identity, "authority_report_update", report, `Updated authority report ${report.reference}.`, { status: values.status, urgency: values.urgency });
  if (values.legalHold) await preserveLinkedSession(DB, report, identity, request);
  return report;
}

export async function onRequestGet(context) {
  const auth = await authenticate(context);
  if (auth.error) return auth.error;
  await ensureTables(context.env.DB);
  const url = new URL(context.request.url);
  return json({ success: true, data: await listReports(context.env.DB, clean(url.searchParams.get("id"), 180)) });
}

export async function onRequestPost(context) {
  if (!assertSameOrigin(context.request)) return json({ success: false, error: "Request origin was rejected." }, 403);
  const auth = await authenticate(context);
  if (auth.error) return auth.error;
  await ensureTables(context.env.DB);
  const body = await requestBody(context.request);
  try {
    const report = body.action === "update"
      ? await updateReport(context.env.DB, body, auth.identity, context.request)
      : await createReport(context.env.DB, body, auth.identity, context.request);
    return json({ success: true, report: normaliseReport(report), data: await listReports(context.env.DB, report.id) });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "The authority report could not be saved." }, 400);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ success: false, error: "Method not allowed." }, 405);
}
