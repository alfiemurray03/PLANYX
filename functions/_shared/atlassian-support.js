const ATLASSIAN_GATEWAY = "https://api.atlassian.com/ex/jira";
const DEFAULT_TIMEOUT_MS = 8_000;

const REQUEST_KIND_KEYS = {
  question: "ATLASSIAN_REQUEST_TYPE_QUESTION_ID",
  problem: "ATLASSIAN_REQUEST_TYPE_PROBLEM_ID",
  suggestion: "ATLASSIAN_REQUEST_TYPE_SUGGESTION_ID"
};

function clean(value, max = 4_000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function cleanEmail(value) {
  const email = clean(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function configuredValue(env, name) {
  return clean(env?.[name], 2_000);
}

export function getAtlassianSupportConfig(env) {
  const requestTypes = Object.fromEntries(
    Object.entries(REQUEST_KIND_KEYS).map(([kind, key]) => [kind, configuredValue(env, key)])
  );
  const config = {
    cloudId: configuredValue(env, "ATLASSIAN_CLOUD_ID"),
    serviceDeskId: configuredValue(env, "ATLASSIAN_SERVICE_DESK_ID"),
    serviceEmail: cleanEmail(env?.ATLASSIAN_SERVICE_EMAIL),
    apiToken: String(env?.ATLASSIAN_API_TOKEN || "").trim(),
    requestTypes
  };
  const missing = [];
  if (!config.cloudId) missing.push("ATLASSIAN_CLOUD_ID");
  if (!config.serviceDeskId) missing.push("ATLASSIAN_SERVICE_DESK_ID");
  if (!config.serviceEmail) missing.push("ATLASSIAN_SERVICE_EMAIL");
  if (!config.apiToken) missing.push("ATLASSIAN_API_TOKEN");
  for (const [kind, key] of Object.entries(REQUEST_KIND_KEYS)) {
    if (!config.requestTypes[kind]) missing.push(key);
  }
  return { ...config, configured: missing.length === 0, missing };
}

function basicAuthorization(email, token) {
  return `Basic ${btoa(`${email}:${token}`)}`;
}

async function atlassianRequest(env, path, options = {}) {
  const config = getAtlassianSupportConfig(env);
  if (!config.configured) {
    const error = new Error("Atlassian support is not configured.");
    error.code = "ATLASSIAN_NOT_CONFIGURED";
    error.status = 501;
    error.missing = config.missing;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${ATLASSIAN_GATEWAY}/${encodeURIComponent(config.cloudId)}${path}`, {
      method: options.method || "GET",
      headers: {
        "Authorization": basicAuthorization(config.serviceEmail, config.apiToken),
        "Accept": "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });

    const responseText = await response.text().catch(() => "");
    let payload = {};
    try { payload = responseText ? JSON.parse(responseText) : {}; }
    catch { payload = {}; }

    if (!response.ok) {
      const error = new Error("Atlassian rejected the support request.");
      error.code = `ATLASSIAN_HTTP_${response.status}`;
      error.status = response.status;
      error.atlassianCode = clean(payload?.error || payload?.errorKey || payload?.code, 120);
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError" || error === "timeout") {
      const timeoutError = new Error("Atlassian did not respond in time.");
      timeoutError.code = "ATLASSIAN_TIMEOUT";
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function classifyAtlassianRequestType(env, input = {}) {
  const config = getAtlassianSupportConfig(env);
  const explicit = clean(input.requestKind || input.atlassianRequestKind, 40).toLowerCase();
  let kind = ["question", "problem", "suggestion"].includes(explicit) ? explicit : "";

  if (!kind) {
    const category = clean(input.category, 120).toLowerCase();
    const combined = `${clean(input.subject, 500)}\n${clean(input.message, 20_000)}`.toLowerCase();
    const suggestionPattern = /\b(suggestion|feature request|new feature|idea|improvement|could you add|please add|would be useful|would be good)\b/i;
    const problemPattern = /\b(error|bug|broken|not working|doesn['’]?t work|failed|failure|fault|unable to|cannot|can['’]?t|won['’]?t|issue|problem)\b/i;

    if (category === "feedback" || category === "suggestion" || suggestionPattern.test(combined)) kind = "suggestion";
    else if (["technical support", "technical", "problem"].includes(category) || problemPattern.test(combined)) kind = "problem";
    else kind = "question";
  }

  return {
    kind,
    requestTypeId: config.requestTypes[kind] || ""
  };
}

function buildDescription(enquiry, localReference) {
  const customerName = clean(enquiry.customerName || enquiry.name, 160) || "Customer";
  const customerEmail = cleanEmail(enquiry.customerEmail || enquiry.email);
  const category = clean(enquiry.category, 120) || "General Enquiry";
  const priority = clean(enquiry.priority, 40) || "Normal";
  const source = clean(enquiry.source || enquiry.enquiryType, 160) || "Planyx Support Assistant";
  const message = clean(enquiry.message, 28_000);

  return [
    `Planyx reference: ${clean(localReference, 120)}`,
    `Customer: ${customerName}`,
    `Customer email: ${customerEmail}`,
    `Category: ${category}`,
    `Priority: ${priority}`,
    `Source: ${source}`,
    "",
    message
  ].join("\n").slice(0, 30_000);
}

async function ensureLinkTable(DB) {
  if (!DB) return;
  await DB.prepare(`CREATE TABLE IF NOT EXISTS atlassian_support_requests (
    local_reference TEXT PRIMARY KEY,
    issue_key TEXT,
    issue_id TEXT,
    request_kind TEXT,
    request_type_id TEXT,
    service_desk_id TEXT,
    portal_url TEXT,
    agent_url TEXT,
    status TEXT NOT NULL,
    last_error_code TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

export async function getAtlassianRequestLink(DB, localReference) {
  if (!DB || !clean(localReference, 120)) return null;
  await ensureLinkTable(DB);
  const row = await DB.prepare(`SELECT local_reference,issue_key,issue_id,request_kind,request_type_id,
      service_desk_id,portal_url,agent_url,status,last_error_code,created_at,updated_at
    FROM atlassian_support_requests WHERE local_reference=?`)
    .bind(clean(localReference, 120)).first().catch(() => null);
  if (!row) return null;
  return {
    status: clean(row.status, 40),
    localReference: clean(row.local_reference, 120),
    issueKey: clean(row.issue_key, 120),
    issueId: clean(row.issue_id, 120),
    requestKind: clean(row.request_kind, 40),
    requestTypeId: clean(row.request_type_id, 80),
    serviceDeskId: clean(row.service_desk_id, 80),
    portalUrl: clean(row.portal_url, 2_000),
    agentUrl: clean(row.agent_url, 2_000),
    errorCode: clean(row.last_error_code, 120)
  };
}

async function saveLink(DB, localReference, values) {
  if (!DB) return;
  await ensureLinkTable(DB);
  await DB.prepare(`INSERT INTO atlassian_support_requests
      (local_reference,issue_key,issue_id,request_kind,request_type_id,service_desk_id,portal_url,agent_url,status,last_error_code,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(local_reference) DO UPDATE SET
      issue_key=excluded.issue_key,issue_id=excluded.issue_id,request_kind=excluded.request_kind,
      request_type_id=excluded.request_type_id,service_desk_id=excluded.service_desk_id,
      portal_url=excluded.portal_url,agent_url=excluded.agent_url,status=excluded.status,
      last_error_code=excluded.last_error_code,updated_at=CURRENT_TIMESTAMP`)
    .bind(
      clean(localReference, 120), clean(values.issueKey, 120), clean(values.issueId, 120),
      clean(values.requestKind, 40), clean(values.requestTypeId, 80), clean(values.serviceDeskId, 80),
      clean(values.portalUrl, 2_000), clean(values.agentUrl, 2_000), clean(values.status, 40),
      clean(values.errorCode, 120)
    ).run();
}

export async function createAtlassianCustomerRequest(env, enquiry, localReference) {
  const config = getAtlassianSupportConfig(env);
  const customerEmail = cleanEmail(enquiry.customerEmail || enquiry.email);
  if (!customerEmail) {
    const error = new Error("A verified customer email is required.");
    error.code = "ATLASSIAN_CUSTOMER_EMAIL_REQUIRED";
    error.status = 400;
    throw error;
  }

  const classification = classifyAtlassianRequestType(env, enquiry);
  if (!classification.requestTypeId) {
    const error = new Error("The Atlassian request type is not configured.");
    error.code = "ATLASSIAN_REQUEST_TYPE_MISSING";
    error.status = 501;
    throw error;
  }

  const summary = clean(enquiry.subject, 255) || "Planyx customer support request";
  const payload = await atlassianRequest(env, "/rest/servicedeskapi/request", {
    method: "POST",
    body: {
      serviceDeskId: config.serviceDeskId,
      requestTypeId: classification.requestTypeId,
      requestFieldValues: {
        summary,
        description: buildDescription(enquiry, localReference)
      },
      raiseOnBehalfOf: customerEmail
    }
  });

  return {
    status: "created",
    localReference: clean(localReference, 120),
    issueKey: clean(payload?.issueKey, 120),
    issueId: clean(payload?.issueId, 120),
    requestKind: classification.kind,
    requestTypeId: classification.requestTypeId,
    serviceDeskId: config.serviceDeskId,
    portalUrl: clean(payload?._links?.web, 2_000),
    agentUrl: clean(payload?._links?.agent, 2_000)
  };
}

export async function syncAtlassianSupportRequest({ env, DB, localReference, enquiry }) {
  const reference = clean(localReference, 120);
  const existing = await getAtlassianRequestLink(DB, reference);
  if (existing?.status === "created" && existing.issueKey) return { ...existing, reused: true };

  try {
    const created = await createAtlassianCustomerRequest(env, enquiry, reference);
    await saveLink(DB, reference, { ...created, errorCode: "" });
    return { ...created, reused: false };
  } catch (error) {
    const config = getAtlassianSupportConfig(env);
    const classification = classifyAtlassianRequestType(env, enquiry);
    const errorCode = clean(error?.code || `ATLASSIAN_HTTP_${error?.status || 500}`, 120);
    await saveLink(DB, reference, {
      status: "failed",
      requestKind: classification.kind,
      requestTypeId: classification.requestTypeId,
      serviceDeskId: config.serviceDeskId,
      errorCode
    }).catch(() => undefined);
    console.error(JSON.stringify({
      event: "atlassian_support_request_failed",
      reference,
      error_code: errorCode,
      http_status: Number(error?.status || 500)
    }));
    return {
      status: config.configured ? "failed" : "not_configured",
      localReference: reference,
      requestKind: classification.kind,
      requestTypeId: classification.requestTypeId,
      serviceDeskId: config.serviceDeskId,
      errorCode
    };
  }
}

export async function testAtlassianSupportConnection(env) {
  const config = getAtlassianSupportConfig(env);
  if (!config.configured) return { ok: false, configured: false, missing: config.missing };
  try {
    const serviceDesk = await atlassianRequest(env, `/rest/servicedeskapi/servicedesk/${encodeURIComponent(config.serviceDeskId)}`);
    return {
      ok: true,
      configured: true,
      cloudId: config.cloudId,
      serviceDeskId: config.serviceDeskId,
      projectName: clean(serviceDesk?.projectName, 200),
      projectKey: clean(serviceDesk?.projectKey, 80),
      requestTypes: { ...config.requestTypes }
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      cloudId: config.cloudId,
      serviceDeskId: config.serviceDeskId,
      errorCode: clean(error?.code || "ATLASSIAN_CONNECTION_FAILED", 120),
      httpStatus: Number(error?.status || 500)
    };
  }
}
