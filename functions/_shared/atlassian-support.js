const ATLASSIAN_GATEWAY = "https://api.atlassian.com/ex/jira";
const DEFAULT_TIMEOUT_MS = 10_000;
const ALLOWED_ROUTING_MODES = new Set(["auto", "question", "problem", "suggestion"]);
const ALLOWED_AUTH_MODES = new Set(["auto", "bearer", "basic"]);

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

function normaliseAuthMode(value) {
  const mode = clean(value, 20).toLowerCase();
  return ALLOWED_AUTH_MODES.has(mode) ? mode : "auto";
}

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return ""; }
}

function extractErrorMessage(payload, responseText = "") {
  const messages = [];
  const push = (value) => {
    const text = clean(value, 600);
    if (text && !messages.includes(text)) messages.push(text);
  };

  if (Array.isArray(payload?.errorMessages)) payload.errorMessages.forEach(push);
  if (payload?.errors && typeof payload.errors === "object") Object.values(payload.errors).forEach(push);
  push(payload?.message);
  push(payload?.errorMessage);
  push(payload?.error);
  push(payload?.errorKey);
  push(payload?.code);
  if (!messages.length && responseText && !responseText.trim().startsWith("<")) push(responseText);
  return messages.join(" · ").slice(0, 900);
}

export function atlassianErrorHelp(status, detail = "") {
  const lower = clean(detail, 900).toLowerCase();
  if (status === 401) {
    return "The API token was not accepted by this Customer Service API endpoint. Confirm the service-account token is current, use the api.atlassian.com gateway, and recreate the token if it has expired or been revoked.";
  }
  if (status === 403) {
    if (lower.includes("scope")) {
      return "The token is authenticated but does not include the required Jira Service Management scopes. Add read:servicedesk-request and write:servicedesk-request, then replace the Cloudflare token.";
    }
    if (lower.includes("behalf") || lower.includes("reporter")) {
      return "The service account cannot raise requests for other customers. Add it to the PXCS Customer Service Team or Administrator role and confirm the request type reports canRaiseOnBehalfOf=true.";
    }
    return "Atlassian authenticated the service account but refused this action. The usual causes are a missing write:servicedesk-request scope, no PXCS Customer Service Team or administrator role, or no permission to raise requests on behalf of customers.";
  }
  if (status === 404) {
    return "The configured Cloud ID, service desk ID or request type could not be accessed. Confirm PXCS uses service desk 169 and request types 356, 357 and 358.";
  }
  if (status === 409) {
    return "The Atlassian customer already exists. The system can continue by associating the existing customer with PXCS.";
  }
  if (status === 422 || status === 400) {
    if (lower.includes("customer") || lower.includes("user")) {
      return "The selected CRM customer is not available to the PXCS portal. Enable customer provisioning or add that email as a customer in Planyx Customer Services.";
    }
    return "Atlassian rejected one or more request fields. Run diagnostics to re-check the current request-type fields and required permissions.";
  }
  if (status === 429) return "Atlassian rate-limited the request. Wait briefly and retry the saved CRM case.";
  if (status >= 500) return "Atlassian is temporarily unavailable. The Planyx CRM case remains saved and can be retried safely.";
  return "Run the full connection diagnostics to identify the failed authentication, project-access or request-type check.";
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
    authMode: normaliseAuthMode(env?.ATLASSIAN_AUTH_MODE || "auto"),
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

function authorizationHeader(config, mode) {
  if (mode === "bearer") return `Bearer ${config.apiToken}`;
  return `Basic ${btoa(`${config.serviceEmail}:${config.apiToken}`)}`;
}

async function performAtlassianRequest(config, path, options, authMode) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${ATLASSIAN_GATEWAY}/${encodeURIComponent(config.cloudId)}${path}`, {
      method: options.method || "GET",
      headers: {
        "Authorization": authorizationHeader(config, authMode),
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

    const accepted = new Set(options.acceptStatuses || []);
    if (!response.ok && !accepted.has(response.status)) {
      const detail = extractErrorMessage(payload, responseText);
      const error = new Error(detail || "Atlassian rejected the request.");
      error.code = `ATLASSIAN_HTTP_${response.status}`;
      error.status = response.status;
      error.detail = detail;
      error.help = atlassianErrorHelp(response.status, detail);
      error.authMode = authMode;
      throw error;
    }
    return { payload, status: response.status, authMode };
  } catch (error) {
    if (error?.name === "AbortError" || error === "timeout") {
      const timeoutError = new Error("Atlassian did not respond in time.");
      timeoutError.code = "ATLASSIAN_TIMEOUT";
      timeoutError.status = 504;
      timeoutError.detail = "The request exceeded the ten-second connection timeout.";
      timeoutError.help = atlassianErrorHelp(504, timeoutError.detail);
      timeoutError.authMode = authMode;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function atlassianRequest(env, path, options = {}) {
  const config = getAtlassianSupportConfig(env);
  if (!config.configured) {
    const error = new Error("Atlassian support is not configured.");
    error.code = "ATLASSIAN_NOT_CONFIGURED";
    error.status = 501;
    error.detail = `Missing: ${config.missing.join(", ")}`;
    error.help = "Add the missing Atlassian variables and secret in Cloudflare, then redeploy.";
    error.missing = config.missing;
    throw error;
  }

  const requestedMode = normaliseAuthMode(options.authMode || config.authMode);
  const modes = requestedMode === "auto" ? ["bearer", "basic"] : [requestedMode];
  const failures = [];
  for (let index = 0; index < modes.length; index += 1) {
    const mode = modes[index];
    try {
      return await performAtlassianRequest(config, path, options, mode);
    } catch (error) {
      failures.push(error);
      const canTryCompatibilityMode = index < modes.length - 1 && [401, 403].includes(Number(error?.status || 0));
      if (!canTryCompatibilityMode) break;
    }
  }

  const preferred = failures.find((failure) => Number(failure?.status || 0) === 403)
    || failures.find((failure) => Number(failure?.status || 0) !== 401)
    || failures[0];
  throw preferred;
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

  return { kind, requestTypeId: config.requestTypes[kind] || "" };
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

async function safeAlter(DB, statement) {
  try { await DB.prepare(statement).run(); } catch {
    // Cloudflare requests can race while applying an idempotent column upgrade.
  }
}

export async function ensureAtlassianSupportTables(DB) {
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
  const requestColumns = [
    ["customer_email", "TEXT"], ["customer_name", "TEXT"], ["subject", "TEXT"],
    ["source", "TEXT"], ["priority", "TEXT"], ["last_http_status", "INTEGER"],
    ["last_error_message", "TEXT"], ["last_error_help", "TEXT"], ["auth_mode", "TEXT"],
    ["attempt_count", "INTEGER DEFAULT 0"]
  ];
  for (const [column, definition] of requestColumns) {
    await safeAlter(DB, `ALTER TABLE atlassian_support_requests ADD COLUMN ${column} ${definition}`);
  }

  await DB.prepare(`CREATE TABLE IF NOT EXISTS atlassian_support_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 1,
    routing_mode TEXT NOT NULL DEFAULT 'auto',
    updated_by TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await safeAlter(DB, "ALTER TABLE atlassian_support_settings ADD COLUMN auth_mode TEXT DEFAULT 'auto'");
  await safeAlter(DB, "ALTER TABLE atlassian_support_settings ADD COLUMN sync_customers INTEGER DEFAULT 0");
  await DB.prepare(`INSERT OR IGNORE INTO atlassian_support_settings
    (id,enabled,routing_mode,auth_mode,sync_customers) VALUES (1,1,'auto','auto',0)`).run();
}

export async function loadAtlassianSupportSettings(DB) {
  if (!DB) return { enabled: true, routingMode: "auto", authMode: "auto", syncCustomers: false, updatedBy: "", updatedAt: "" };
  await ensureAtlassianSupportTables(DB);
  const row = await DB.prepare(`SELECT enabled,routing_mode,auth_mode,sync_customers,updated_by,updated_at
    FROM atlassian_support_settings WHERE id=1`).first();
  const routingMode = ALLOWED_ROUTING_MODES.has(clean(row?.routing_mode, 40)) ? clean(row?.routing_mode, 40) : "auto";
  return {
    enabled: Number(row?.enabled ?? 1) === 1,
    routingMode,
    authMode: normaliseAuthMode(row?.auth_mode),
    syncCustomers: Number(row?.sync_customers || 0) === 1,
    updatedBy: clean(row?.updated_by, 254),
    updatedAt: clean(row?.updated_at, 80)
  };
}

export async function saveAtlassianSupportSettings(DB, input = {}, actorEmail = "") {
  await ensureAtlassianSupportTables(DB);
  const enabled = input.enabled === true;
  const requestedMode = clean(input.routingMode, 40).toLowerCase();
  const routingMode = ALLOWED_ROUTING_MODES.has(requestedMode) ? requestedMode : "auto";
  const authMode = normaliseAuthMode(input.authMode);
  const syncCustomers = input.syncCustomers === true;
  await DB.prepare(`UPDATE atlassian_support_settings
    SET enabled=?,routing_mode=?,auth_mode=?,sync_customers=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=1`)
    .bind(enabled ? 1 : 0, routingMode, authMode, syncCustomers ? 1 : 0, cleanEmail(actorEmail)).run();
  return loadAtlassianSupportSettings(DB);
}

export async function getAtlassianRequestLink(DB, localReference) {
  if (!DB || !clean(localReference, 120)) return null;
  await ensureAtlassianSupportTables(DB);
  const row = await DB.prepare(`SELECT * FROM atlassian_support_requests WHERE local_reference=?`)
    .bind(clean(localReference, 120)).first().catch(() => null);
  if (!row) return null;
  return {
    status: clean(row.status, 40), localReference: clean(row.local_reference, 120),
    issueKey: clean(row.issue_key, 120), issueId: clean(row.issue_id, 120),
    requestKind: clean(row.request_kind, 40), requestTypeId: clean(row.request_type_id, 80),
    serviceDeskId: clean(row.service_desk_id, 80), portalUrl: clean(row.portal_url, 2_000),
    agentUrl: clean(row.agent_url, 2_000), errorCode: clean(row.last_error_code, 120),
    errorMessage: clean(row.last_error_message, 900), errorHelp: clean(row.last_error_help, 900),
    httpStatus: Number(row.last_http_status || 0), authMode: clean(row.auth_mode, 20),
    customerEmail: cleanEmail(row.customer_email), customerName: clean(row.customer_name, 160),
    subject: clean(row.subject, 255), source: clean(row.source, 160), priority: clean(row.priority, 40),
    attempts: Number(row.attempt_count || 0), createdAt: clean(row.created_at, 80), updatedAt: clean(row.updated_at, 80)
  };
}

async function saveLink(DB, localReference, values) {
  if (!DB) return;
  await ensureAtlassianSupportTables(DB);
  await DB.prepare(`INSERT INTO atlassian_support_requests
      (local_reference,issue_key,issue_id,request_kind,request_type_id,service_desk_id,portal_url,agent_url,
       status,last_error_code,customer_email,customer_name,subject,source,priority,last_http_status,
       last_error_message,last_error_help,auth_mode,attempt_count,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(local_reference) DO UPDATE SET
      issue_key=excluded.issue_key,issue_id=excluded.issue_id,request_kind=excluded.request_kind,
      request_type_id=excluded.request_type_id,service_desk_id=excluded.service_desk_id,
      portal_url=excluded.portal_url,agent_url=excluded.agent_url,status=excluded.status,
      last_error_code=excluded.last_error_code,customer_email=excluded.customer_email,
      customer_name=excluded.customer_name,subject=excluded.subject,source=excluded.source,
      priority=excluded.priority,last_http_status=excluded.last_http_status,
      last_error_message=excluded.last_error_message,last_error_help=excluded.last_error_help,
      auth_mode=excluded.auth_mode,attempt_count=COALESCE(atlassian_support_requests.attempt_count,0)+1,
      updated_at=CURRENT_TIMESTAMP`)
    .bind(
      clean(localReference, 120), clean(values.issueKey, 120), clean(values.issueId, 120),
      clean(values.requestKind, 40), clean(values.requestTypeId, 80), clean(values.serviceDeskId, 80),
      clean(values.portalUrl, 2_000), clean(values.agentUrl, 2_000), clean(values.status, 40),
      clean(values.errorCode, 120), cleanEmail(values.customerEmail), clean(values.customerName, 160),
      clean(values.subject, 255), clean(values.source, 160), clean(values.priority, 40),
      Number(values.httpStatus || 0), clean(values.errorMessage, 900), clean(values.errorHelp, 900),
      clean(values.authMode, 20), 1
    ).run();
}

export async function listAtlassianSupportRequests(DB, limit = 100) {
  if (!DB) return [];
  await ensureAtlassianSupportTables(DB);
  const safeLimit = Math.min(250, Math.max(1, Number(limit) || 100));
  const rows = await DB.prepare(`SELECT * FROM atlassian_support_requests ORDER BY updated_at DESC LIMIT ?`)
    .bind(safeLimit).all();
  return (rows.results || []).map((row) => ({
    localReference: clean(row.local_reference, 120), issueKey: clean(row.issue_key, 120),
    issueId: clean(row.issue_id, 120), requestKind: clean(row.request_kind, 40),
    requestTypeId: clean(row.request_type_id, 80), serviceDeskId: clean(row.service_desk_id, 80),
    portalUrl: clean(row.portal_url, 2_000), agentUrl: clean(row.agent_url, 2_000),
    status: clean(row.status, 40), errorCode: clean(row.last_error_code, 120),
    errorMessage: clean(row.last_error_message, 900), errorHelp: clean(row.last_error_help, 900),
    httpStatus: Number(row.last_http_status || 0), authMode: clean(row.auth_mode, 20),
    customerEmail: cleanEmail(row.customer_email), customerName: clean(row.customer_name, 160),
    subject: clean(row.subject, 255), source: clean(row.source, 160), priority: clean(row.priority, 40),
    attempts: Number(row.attempt_count || 0), createdAt: clean(row.created_at, 80), updatedAt: clean(row.updated_at, 80)
  }));
}

export async function getAtlassianSupportStats(DB) {
  if (!DB) return { total: 0, created: 0, failed: 0, disabled: 0 };
  await ensureAtlassianSupportTables(DB);
  const row = await DB.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN status='created' THEN 1 ELSE 0 END) created,
      SUM(CASE WHEN status='failed' OR status='not_configured' THEN 1 ELSE 0 END) failed,
      SUM(CASE WHEN status='disabled' THEN 1 ELSE 0 END) disabled
    FROM atlassian_support_requests`).first();
  return {
    total: Number(row?.total || 0), created: Number(row?.created || 0),
    failed: Number(row?.failed || 0), disabled: Number(row?.disabled || 0)
  };
}

async function provisionAtlassianCustomer(env, config, enquiry, authMode) {
  const email = cleanEmail(enquiry.customerEmail || enquiry.email);
  const displayName = clean(enquiry.customerName || enquiry.name, 160) || email;
  const created = await atlassianRequest(env, "/rest/servicedeskapi/customer?strictConflictStatusCode=true", {
    method: "POST", authMode, acceptStatuses: [409], body: { email, displayName }
  });
  await atlassianRequest(env, `/rest/servicedeskapi/servicedesk/${encodeURIComponent(config.serviceDeskId)}/customer`, {
    method: "POST", authMode, acceptStatuses: [204], body: { usernames: [email] }
  });
  return { created: created.status === 201, authMode: created.authMode };
}

async function assertRaiseOnBehalfCapability(env, config, requestTypeId, authMode) {
  const result = await atlassianRequest(
    env,
    `/rest/servicedeskapi/servicedesk/${encodeURIComponent(config.serviceDeskId)}/requesttype/${encodeURIComponent(requestTypeId)}/field`,
    { authMode }
  );
  if (result.payload?.canRaiseOnBehalfOf !== true) {
    const error = new Error("The service account cannot raise requests on behalf of customers.");
    error.code = "ATLASSIAN_RAISE_ON_BEHALF_FORBIDDEN";
    error.status = 403;
    error.detail = "The request type returned canRaiseOnBehalfOf=false for the configured service account.";
    error.help = atlassianErrorHelp(403, "raise on behalf");
    error.authMode = result.authMode;
    throw error;
  }
  return result;
}

export async function createAtlassianCustomerRequest(env, enquiry, localReference, options = {}) {
  const config = getAtlassianSupportConfig(env);
  const customerEmail = cleanEmail(enquiry.customerEmail || enquiry.email);
  if (!customerEmail) {
    const error = new Error("A verified customer email is required.");
    error.code = "ATLASSIAN_CUSTOMER_EMAIL_REQUIRED";
    error.status = 400;
    error.detail = "The request did not contain a valid verified CRM customer email.";
    error.help = "Select an existing customer from the Planyx CRM before creating the request.";
    throw error;
  }

  const classification = classifyAtlassianRequestType(env, enquiry);
  if (!classification.requestTypeId) {
    const error = new Error("The Atlassian request type is not configured.");
    error.code = "ATLASSIAN_REQUEST_TYPE_MISSING";
    error.status = 501;
    error.detail = `No request type ID is configured for ${classification.kind}.`;
    error.help = "Check the three ATLASSIAN_REQUEST_TYPE_* Cloudflare variables.";
    throw error;
  }

  const authMode = normaliseAuthMode(options.authMode || config.authMode);
  if (options.syncCustomers === true) {
    await provisionAtlassianCustomer(env, config, enquiry, authMode);
  }
  const capability = await assertRaiseOnBehalfCapability(env, config, classification.requestTypeId, authMode);

  const summary = clean(enquiry.subject, 255) || "Planyx customer support request";
  const result = await atlassianRequest(env, "/rest/servicedeskapi/request", {
    method: "POST",
    authMode: capability.authMode,
    body: {
      serviceDeskId: config.serviceDeskId,
      requestTypeId: classification.requestTypeId,
      requestFieldValues: { summary, description: buildDescription(enquiry, localReference) },
      raiseOnBehalfOf: customerEmail
    }
  });
  const payload = result.payload;

  return {
    status: "created", localReference: clean(localReference, 120),
    issueKey: clean(payload?.issueKey, 120), issueId: clean(payload?.issueId, 120),
    requestKind: classification.kind, requestTypeId: classification.requestTypeId,
    serviceDeskId: config.serviceDeskId, portalUrl: clean(payload?._links?.web, 2_000),
    agentUrl: clean(payload?._links?.agent, 2_000), authMode: result.authMode,
    customerEmail, customerName: clean(enquiry.customerName || enquiry.name, 160),
    subject: summary, source: clean(enquiry.source || enquiry.enquiryType, 160),
    priority: clean(enquiry.priority, 40), httpStatus: result.status
  };
}

export async function syncAtlassianSupportRequest({ env, DB, localReference, enquiry, force = false }) {
  const reference = clean(localReference, 120);
  const settings = await loadAtlassianSupportSettings(DB);
  const baseDetails = {
    customerEmail: cleanEmail(enquiry.customerEmail || enquiry.email),
    customerName: clean(enquiry.customerName || enquiry.name, 160),
    subject: clean(enquiry.subject, 255), source: clean(enquiry.source || enquiry.enquiryType, 160),
    priority: clean(enquiry.priority, 40)
  };
  if (!settings.enabled && !force) {
    const disabled = {
      status: "disabled", localReference: reference, requestKind: "", requestTypeId: "",
      serviceDeskId: getAtlassianSupportConfig(env).serviceDeskId, errorCode: "ATLASSIAN_DISABLED",
      errorMessage: "Automatic Atlassian ticket creation is disabled.",
      errorHelp: "The Planyx enquiry remains stored and can be raised manually from the Support Operations Centre.",
      httpStatus: 0, authMode: settings.authMode, ...baseDetails
    };
    await saveLink(DB, reference, disabled).catch(() => undefined);
    return disabled;
  }

  const existing = await getAtlassianRequestLink(DB, reference);
  if (existing?.status === "created" && existing.issueKey) return { ...existing, reused: true };

  const routedEnquiry = settings.routingMode === "auto" || enquiry.requestKind || enquiry.atlassianRequestKind
    ? enquiry
    : { ...enquiry, requestKind: settings.routingMode };

  try {
    const created = await createAtlassianCustomerRequest(env, routedEnquiry, reference, {
      authMode: settings.authMode,
      syncCustomers: settings.syncCustomers
    });
    await saveLink(DB, reference, { ...created, errorCode: "", errorMessage: "", errorHelp: "" });
    return { ...created, reused: false };
  } catch (error) {
    const config = getAtlassianSupportConfig(env);
    const classification = classifyAtlassianRequestType(env, routedEnquiry);
    const errorCode = clean(error?.code || `ATLASSIAN_HTTP_${error?.status || 500}`, 120);
    const errorMessage = clean(error?.detail || error?.message || "Atlassian rejected the request.", 900);
    const errorHelp = clean(error?.help || atlassianErrorHelp(Number(error?.status || 500), errorMessage), 900);
    const failure = {
      status: config.configured ? "failed" : "not_configured", localReference: reference,
      requestKind: classification.kind, requestTypeId: classification.requestTypeId,
      serviceDeskId: config.serviceDeskId, errorCode, errorMessage, errorHelp,
      httpStatus: Number(error?.status || 500), authMode: clean(error?.authMode || settings.authMode, 20),
      ...baseDetails
    };
    await saveLink(DB, reference, failure).catch(() => undefined);
    console.error(JSON.stringify({
      event: "atlassian_support_request_failed", reference, error_code: errorCode,
      http_status: failure.httpStatus, auth_mode: failure.authMode
    }));
    return failure;
  }
}

function diagnosticCheck(id, label, result = {}) {
  return {
    id, label, ok: result.ok === true, status: Number(result.status || 0),
    detail: clean(result.detail, 500), help: clean(result.help, 700),
    authMode: clean(result.authMode, 20), metadata: result.metadata || null
  };
}

export async function runAtlassianDiagnostics(env, options = {}) {
  const config = getAtlassianSupportConfig(env);
  const authMode = normaliseAuthMode(options.authMode || config.authMode);
  const checks = [];
  if (!config.configured) {
    checks.push(diagnosticCheck("configuration", "Cloudflare configuration", {
      ok: false, status: 501, detail: `Missing ${config.missing.join(", ")}.`,
      help: "Add the missing variables and secret to the production Cloudflare Pages environment."
    }));
    return { ok: false, readyToCreate: false, configured: false, checks, missing: config.missing, authMode };
  }
  checks.push(diagnosticCheck("configuration", "Cloudflare configuration", {
    ok: true, status: 200, detail: "All required IDs, service-account email and API token are present.", authMode
  }));

  let serviceDesk = null;
  let authenticatedMode = authMode;
  try {
    const response = await atlassianRequest(env, `/rest/servicedeskapi/servicedesk/${encodeURIComponent(config.serviceDeskId)}`, { authMode });
    serviceDesk = response.payload;
    authenticatedMode = response.authMode;
    checks.push(diagnosticCheck("authentication", "Service-account authentication", {
      ok: true, status: response.status, authMode: response.authMode,
      detail: `The service-account token was accepted by the Atlassian Customer Service API using ${response.authMode} authentication.`,
      metadata: { serviceAccount: config.serviceEmail }
    }));
    checks.push(diagnosticCheck("service-desk", "PXCS service-desk access", {
      ok: true, status: response.status, authMode: response.authMode,
      detail: `Access confirmed for ${clean(serviceDesk?.projectName, 200)} (${clean(serviceDesk?.projectKey, 80)}).`,
      metadata: { projectName: clean(serviceDesk?.projectName, 200), projectKey: clean(serviceDesk?.projectKey, 80) }
    }));
  } catch (error) {
    checks.push(diagnosticCheck("authentication", "Service-account authentication", {
      ok: false, status: error?.status, authMode: error?.authMode,
      detail: error?.detail || error?.message, help: error?.help
    }));
    checks.push(diagnosticCheck("service-desk", "PXCS service-desk access", {
      ok: false, status: error?.status, authMode: error?.authMode,
      detail: "PXCS access could not be checked because the Customer Service API did not accept the authenticated request.",
      help: error?.help
    }));
  }

  const capability = {};
  for (const [kind, requestTypeId] of Object.entries(config.requestTypes)) {
    try {
      const response = await atlassianRequest(env,
        `/rest/servicedeskapi/servicedesk/${encodeURIComponent(config.serviceDeskId)}/requesttype/${encodeURIComponent(requestTypeId)}/field`,
        { authMode: authenticatedMode }
      );
      const canRaise = response.payload?.canRaiseOnBehalfOf === true;
      capability[kind] = canRaise;
      checks.push(diagnosticCheck(`request-type-${kind}`, `${kind[0].toUpperCase()}${kind.slice(1)} request type`, {
        ok: canRaise, status: response.status, authMode: response.authMode,
        detail: canRaise
          ? `Request type ${requestTypeId} is visible and permits raising on behalf of customers.`
          : `Request type ${requestTypeId} is visible but canRaiseOnBehalfOf=false.`,
        help: canRaise ? "" : atlassianErrorHelp(403, "raise on behalf")
      }));
    } catch (error) {
      capability[kind] = false;
      checks.push(diagnosticCheck(`request-type-${kind}`, `${kind[0].toUpperCase()}${kind.slice(1)} request type`, {
        ok: false, status: error?.status, authMode: error?.authMode,
        detail: error?.detail || error?.message, help: error?.help
      }));
    }
  }

  const readyToCreate = Boolean(serviceDesk)
    && Object.values(capability).length === 3
    && Object.values(capability).every(Boolean);
  return {
    ok: readyToCreate && checks.every((check) => check.ok), readyToCreate, configured: true, checks,
    authMode: authenticatedMode,
    projectName: clean(serviceDesk?.projectName, 200), projectKey: clean(serviceDesk?.projectKey, 80),
    serviceDeskId: config.serviceDeskId, capability,
    requiredScopes: ["read:servicedesk-request", "write:servicedesk-request"],
    optionalCustomerScopes: ["manage:servicedesk-customer"]
  };
}

export async function testAtlassianSupportConnection(env, options = {}) {
  const diagnostic = await runAtlassianDiagnostics(env, options);
  const firstFailure = diagnostic.checks.find((check) => !check.ok);
  return {
    ok: diagnostic.ok, readyToCreate: diagnostic.readyToCreate,
    configured: diagnostic.configured, cloudId: getAtlassianSupportConfig(env).cloudId,
    serviceDeskId: diagnostic.serviceDeskId || getAtlassianSupportConfig(env).serviceDeskId,
    projectName: diagnostic.projectName, projectKey: diagnostic.projectKey,
    requestTypes: { ...getAtlassianSupportConfig(env).requestTypes },
    authMode: diagnostic.authMode, checks: diagnostic.checks,
    requiredScopes: diagnostic.requiredScopes || [], optionalCustomerScopes: diagnostic.optionalCustomerScopes || [],
    errorCode: firstFailure ? `ATLASSIAN_HTTP_${firstFailure.status || 500}` : "",
    errorMessage: firstFailure?.detail || "", errorHelp: firstFailure?.help || "",
    httpStatus: Number(firstFailure?.status || 0)
  };
}
