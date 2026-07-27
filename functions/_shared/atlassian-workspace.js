const ATLASSIAN_GATEWAY = "https://api.atlassian.com/ex/jira";
const DEFAULT_TIMEOUT_MS = 12_000;
const STATUS_FILTERS = new Map([
  ["open", "OPEN_REQUESTS"],
  ["closed", "CLOSED_REQUESTS"],
  ["all", "ALL_REQUESTS"]
]);

function clean(value, max = 4_000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function cleanEmail(value) {
  const email = clean(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function safeInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function extractError(payload, responseText = "") {
  const messages = [];
  const add = (value) => {
    const text = clean(value, 800);
    if (text && !messages.includes(text)) messages.push(text);
  };
  if (Array.isArray(payload?.errorMessages)) payload.errorMessages.forEach(add);
  if (payload?.errors && typeof payload.errors === "object") Object.values(payload.errors).forEach(add);
  add(payload?.message);
  add(payload?.errorMessage);
  add(payload?.error);
  add(payload?.code);
  if (!messages.length && responseText && !responseText.trim().startsWith("<")) add(responseText);
  return messages.join(" · ").slice(0, 1_000);
}

function config(env) {
  const value = {
    cloudId: clean(env?.ATLASSIAN_CLOUD_ID, 200),
    serviceDeskId: clean(env?.ATLASSIAN_SERVICE_DESK_ID, 80),
    serviceEmail: cleanEmail(env?.ATLASSIAN_SERVICE_EMAIL),
    apiToken: String(env?.ATLASSIAN_API_TOKEN || "").trim()
  };
  const missing = [];
  if (!value.cloudId) missing.push("ATLASSIAN_CLOUD_ID");
  if (!value.serviceDeskId) missing.push("ATLASSIAN_SERVICE_DESK_ID");
  if (!value.serviceEmail) missing.push("ATLASSIAN_SERVICE_EMAIL");
  if (!value.apiToken) missing.push("ATLASSIAN_API_TOKEN");
  return { ...value, configured: missing.length === 0, missing };
}

function authHeader(current, mode) {
  if (mode === "bearer") return `Bearer ${current.apiToken}`;
  return `Basic ${btoa(`${current.serviceEmail}:${current.apiToken}`)}`;
}

async function performRequest(current, path, options, mode) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${ATLASSIAN_GATEWAY}/${encodeURIComponent(current.cloudId)}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: authHeader(current, mode),
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const responseText = await response.text().catch(() => "");
    let payload = {};
    try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = {}; }
    if (!response.ok) {
      const detail = extractError(payload, responseText);
      const error = new Error(detail || "Atlassian rejected the request.");
      error.code = `ATLASSIAN_WORKSPACE_HTTP_${response.status}`;
      error.status = response.status;
      error.detail = detail;
      error.authMode = mode;
      throw error;
    }
    return { payload, status: response.status, authMode: mode };
  } catch (error) {
    if (error?.name === "AbortError" || error === "timeout") {
      const timeoutError = new Error("Atlassian did not respond in time.");
      timeoutError.code = "ATLASSIAN_WORKSPACE_TIMEOUT";
      timeoutError.status = 504;
      timeoutError.detail = "The live PXCS request workspace timed out while contacting Atlassian.";
      timeoutError.authMode = mode;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function atlassianRequest(env, path, options = {}) {
  const current = config(env);
  if (!current.configured) {
    const error = new Error("The Atlassian request workspace is not configured.");
    error.code = "ATLASSIAN_WORKSPACE_NOT_CONFIGURED";
    error.status = 501;
    error.detail = `Missing ${current.missing.join(", ")}.`;
    throw error;
  }
  const failures = [];
  for (const mode of ["bearer", "basic"]) {
    try {
      return await performRequest(current, path, options, mode);
    } catch (error) {
      failures.push(error);
      if (![401, 403].includes(Number(error?.status || 0))) break;
    }
  }
  throw failures.find((failure) => Number(failure?.status || 0) === 403) || failures[0];
}

function dateValue(value) {
  return clean(value?.iso8601 || value?.jira || value?.friendly, 100);
}

function fieldValue(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return clean(value, 10_000);
  if (Array.isArray(value)) return value.map((item) => fieldValue(item)).filter(Boolean).join(", ").slice(0, 10_000);
  if (typeof value === "object") {
    const preferred = value.displayName || value.name || value.value || value.label || value.text || value.emailAddress;
    if (preferred != null) return fieldValue(preferred);
    try { return JSON.stringify(value).slice(0, 10_000); } catch { return ""; }
  }
  return "";
}

function normaliseField(field) {
  return {
    id: clean(field?.fieldId, 160),
    label: clean(field?.label || field?.fieldId, 200),
    value: fieldValue(field?.value),
    renderedText: clean(field?.renderedValue?.text || "", 10_000)
  };
}

function normaliseRequest(request) {
  const fields = Array.isArray(request?.requestFieldValues) ? request.requestFieldValues.map(normaliseField) : [];
  const descriptionField = fields.find((field) => field.id === "description");
  const description = descriptionField?.value || descriptionField?.renderedText || "";
  return {
    issueId: clean(request?.issueId, 120),
    issueKey: clean(request?.issueKey, 120),
    summary: clean(request?.summary, 500) || fields.find((field) => field.id === "summary")?.value || "Untitled request",
    description,
    requestTypeId: clean(request?.requestTypeId, 80),
    requestTypeName: clean(request?.requestType?.name || request?.requestType?.description, 200),
    serviceDeskId: clean(request?.serviceDeskId, 80),
    serviceDeskName: clean(request?.serviceDesk?.projectName, 200),
    status: clean(request?.currentStatus?.status, 160) || "Unknown",
    statusCategory: clean(request?.currentStatus?.statusCategory, 80),
    statusUpdatedAt: dateValue(request?.currentStatus?.statusDate),
    createdAt: dateValue(request?.createdDate),
    reporter: {
      accountId: clean(request?.reporter?.accountId, 200),
      displayName: clean(request?.reporter?.displayName, 200) || "Customer",
      email: cleanEmail(request?.reporter?.emailAddress)
    },
    fields,
    portalUrl: clean(request?._links?.web, 2_000),
    agentUrl: clean(request?._links?.agent, 2_000)
  };
}

function normaliseComment(comment) {
  return {
    id: clean(comment?.id, 120),
    body: clean(comment?.body || comment?.renderedBody?.text, 20_000),
    public: comment?.public !== false,
    createdAt: dateValue(comment?.created),
    author: {
      accountId: clean(comment?.author?.accountId, 200),
      displayName: clean(comment?.author?.displayName, 200) || "Atlassian user",
      email: cleanEmail(comment?.author?.emailAddress)
    }
  };
}

function warningFromFailure(section, failure) {
  const reason = failure?.reason || failure;
  return {
    section,
    code: clean(reason?.code || `ATLASSIAN_WORKSPACE_${section.toUpperCase()}_UNAVAILABLE`, 160),
    message: clean(reason?.detail || reason?.message || `${section} could not be loaded.`, 500),
    httpStatus: Number(reason?.status || 0)
  };
}

export async function listAtlassianWorkspaceRequests(env, options = {}) {
  const current = config(env);
  const status = STATUS_FILTERS.has(clean(options.status, 20).toLowerCase())
    ? clean(options.status, 20).toLowerCase()
    : "open";
  const start = safeInteger(options.start, 0, 0, 10_000);
  const limit = safeInteger(options.limit, 50, 1, 100);
  const params = new URLSearchParams({
    serviceDeskId: current.serviceDeskId,
    requestStatus: STATUS_FILTERS.get(status),
    start: String(start),
    limit: String(limit)
  });
  const searchTerm = clean(options.searchTerm, 200);
  if (searchTerm) params.set("searchTerm", searchTerm);
  params.append("expand", "requestType");
  params.append("expand", "serviceDesk");
  const response = await atlassianRequest(env, `/rest/servicedeskapi/request?${params.toString()}`);
  const payload = response.payload || {};
  const values = Array.isArray(payload.values) ? payload.values : [];
  return {
    requests: values.map(normaliseRequest).filter((request) => request.serviceDeskId === current.serviceDeskId),
    start: Number(payload.start ?? start),
    limit: Number(payload.limit ?? limit),
    size: Number(payload.size ?? values.length),
    isLastPage: payload.isLastPage === true,
    nextStart: payload.isLastPage === true ? null : Number(payload.start ?? start) + Number(payload.limit ?? limit),
    previousStart: start > 0 ? Math.max(0, start - limit) : null,
    status,
    searchTerm,
    authMode: response.authMode
  };
}

export async function getAtlassianWorkspaceRequest(env, issueKey) {
  const current = config(env);
  const key = clean(issueKey, 120).toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) {
    const error = new Error("A valid PXCS request key is required.");
    error.code = "ATLASSIAN_WORKSPACE_INVALID_KEY";
    error.status = 400;
    throw error;
  }

  const detailParams = new URLSearchParams();
  ["requestType", "serviceDesk", "status"].forEach((value) => detailParams.append("expand", value));
  let requestResponse;
  try {
    requestResponse = await atlassianRequest(env, `/rest/servicedeskapi/request/${encodeURIComponent(key)}?${detailParams.toString()}`);
  } catch (error) {
    if (Number(error?.status || 0) !== 400) throw error;
    requestResponse = await atlassianRequest(env, `/rest/servicedeskapi/request/${encodeURIComponent(key)}`);
  }

  const request = normaliseRequest(requestResponse.payload);
  if (!request.issueKey) {
    const error = new Error(`Atlassian returned no request data for ${key}.`);
    error.code = "ATLASSIAN_WORKSPACE_EMPTY_REQUEST";
    error.status = 502;
    throw error;
  }
  if (request.serviceDeskId && request.serviceDeskId !== current.serviceDeskId) {
    const error = new Error(`${key} does not belong to the configured PXCS service desk.`);
    error.code = "ATLASSIAN_WORKSPACE_WRONG_SERVICE_DESK";
    error.status = 404;
    throw error;
  }

  const commentParams = new URLSearchParams({ start: "0", limit: "100", public: "true", internal: "true" });
  commentParams.append("expand", "renderedBody");
  const [commentsResult, statusResult] = await Promise.allSettled([
    atlassianRequest(env, `/rest/servicedeskapi/request/${encodeURIComponent(key)}/comment?${commentParams.toString()}`),
    atlassianRequest(env, `/rest/servicedeskapi/request/${encodeURIComponent(key)}/status?start=0&limit=50`)
  ]);

  const comments = commentsResult.status === "fulfilled" && Array.isArray(commentsResult.value.payload?.values)
    ? commentsResult.value.payload.values.map(normaliseComment)
    : [];
  const statusHistory = statusResult.status === "fulfilled" && Array.isArray(statusResult.value.payload?.values)
    ? statusResult.value.payload.values.map((entry) => ({
      status: clean(entry?.status, 160),
      statusDate: dateValue(entry?.statusDate)
    }))
    : [];
  const warnings = [];
  if (commentsResult.status === "rejected") warnings.push(warningFromFailure("conversation", commentsResult));
  if (statusResult.status === "rejected") warnings.push(warningFromFailure("status_history", statusResult));

  return {
    request,
    comments,
    statusHistory,
    warnings,
    authMode: requestResponse.authMode
  };
}

export async function addAtlassianWorkspaceComment(env, issueKey, input = {}) {
  const key = clean(issueKey, 120).toUpperCase();
  const body = clean(input.body, 10_000);
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) {
    const error = new Error("A valid PXCS request key is required.");
    error.code = "ATLASSIAN_WORKSPACE_INVALID_KEY";
    error.status = 400;
    throw error;
  }
  if (body.length < 1) {
    const error = new Error("Enter a reply or internal note.");
    error.code = "ATLASSIAN_WORKSPACE_COMMENT_REQUIRED";
    error.status = 400;
    throw error;
  }
  const response = await atlassianRequest(env, `/rest/servicedeskapi/request/${encodeURIComponent(key)}/comment`, {
    method: "POST",
    body: { body, public: input.public !== false }
  });
  return {
    comment: normaliseComment(response.payload),
    authMode: response.authMode,
    status: response.status
  };
}
