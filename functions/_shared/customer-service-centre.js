import { customerReferenceForIdentity } from "./customerops-central.js";

const DEFAULT_BASE_URL = "https://customerops.jagroupservices.co.uk";
const HUMAN_ONLY_CATEGORIES = new Set(["data_protection", "safeguarding", "security"]);

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function safeObject(value, depth = 0) {
  if (depth > 3 || !value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 40)) {
    const key = clean(rawKey, 80);
    if (!key || /secret|token|password|credential|authori[sz]ation|cookie|marker[ _-]?reason|safeguarding[ _-]?detail/i.test(key)) continue;
    if (rawValue === null || ["boolean", "number"].includes(typeof rawValue)) output[key] = rawValue;
    else if (typeof rawValue === "string") output[key] = clean(rawValue, 1000);
    else if (Array.isArray(rawValue)) output[key] = rawValue.slice(0, 25).map(item => typeof item === "string" ? clean(item, 500) : item).filter(item => item === null || ["string", "number", "boolean"].includes(typeof item));
    else if (typeof rawValue === "object") output[key] = safeObject(rawValue, depth + 1);
  }
  return output;
}

function normaliseCategory(value) {
  const category = clean(value || "general", 80).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const aliases = {
    privacy: "data_protection",
    data_subject_rights: "data_protection",
    subject_access_request: "data_protection",
    sar: "data_protection",
    young_person: "safeguarding",
    child_safety: "safeguarding",
    fraud: "security",
    account_compromise: "security",
    suspected_account_compromise: "security",
    sign_in: "account_recovery",
    login: "account_recovery"
  };
  return aliases[category] || category || "general";
}

function baseUrl(env) {
  const configured = clean(env.CUSTOMEROPS_BASE_URL || DEFAULT_BASE_URL, 500).replace(/\/$/, "");
  const url = new URL(configured);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw Object.assign(new Error("The Head Office Customer Service URL must use HTTPS."), { code: "CENTRAL_SUPPORT_URL_INVALID" });
  }
  return url.origin;
}

function apiKey(env) {
  return clean(env.CUSTOMEROPS_API_KEY, 500);
}

export function centralCustomerServiceEnabled(env) {
  const switchValue = String(env.HEAD_OFFICE_SUPPORT_CENTRE_ENABLED ?? "true").trim().toLowerCase();
  return switchValue !== "false" && Boolean(apiKey(env));
}

export async function centralSupportRequest(env, path, options = {}) {
  if (!centralCustomerServiceEnabled(env)) {
    throw Object.assign(new Error("The Head Office Customer Service Centre is not enabled for Planyx."), { code: "CENTRAL_SUPPORT_DISABLED", status: 503 });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Math.min(20_000, Number(options.timeoutMs || 8000))));
  const method = clean(options.method || "GET", 12).toUpperCase();
  try {
    const headers = {
      Authorization: `Bearer ${apiKey(env)}`,
      Accept: "application/json",
      "User-Agent": "Planyx-Head-Office-Customer-Service/1.0"
    };
    const request = { method, headers, signal: controller.signal };
    if (!["GET", "HEAD"].includes(method)) {
      headers["Content-Type"] = "application/json";
      request.body = JSON.stringify(options.body || {});
    }
    const response = await fetch(`${baseUrl(env)}${path}`, request);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = clean(payload?.error?.message || payload?.message || `Head Office returned HTTP ${response.status}.`, 1000);
      throw Object.assign(new Error(message), {
        code: clean(payload?.error?.code || "CENTRAL_SUPPORT_REQUEST_FAILED", 120),
        status: response.status,
        payload
      });
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw Object.assign(new Error("Head Office Customer Service did not respond within the secure timeout."), { code: "CENTRAL_SUPPORT_TIMEOUT", status: 504 });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function centralSupportIdentity(DB, identity) {
  if (!DB || !identity) return { authenticated: false, identity: {}, serviceContext: {} };
  const { profile, reference } = await customerReferenceForIdentity(DB, identity);
  const displayName = clean(identity.name || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim(), 160);
  return {
    authenticated: true,
    identity: {
      customerNumber: reference.customerNumber,
      platformAccountId: reference.platformCustomerId,
      verifiedEmail: clean(identity.email || profile?.email, 254).toLowerCase(),
      displayName
    },
    serviceContext: {
      plan: clean(profile?.plan || profile?.subscription_plan, 100),
      subscriptionStatus: clean(profile?.membership_status, 80),
      accountStatus: clean(profile?.admin_customer_status || "active", 80),
      organisationId: clean(profile?.org_id, 100)
    }
  };
}

export async function centralBranchConfig(env) {
  return centralSupportRequest(env, "/api/v1/platform/support/config", { method: "GET" });
}

export async function centralKnowledge(env, query = {}) {
  const params = new URLSearchParams();
  if (query.service) params.set("service", clean(query.service, 80));
  if (query.accountType) params.set("accountType", clean(query.accountType, 80));
  if (query.plan) params.set("plan", clean(query.plan, 80));
  return centralSupportRequest(env, `/api/v1/platform/support/knowledge?${params}`, { method: "GET" });
}

export async function ensureCentralConversation(env, DB, identity, input = {}) {
  const sessionId = clean(input.sessionId || input.externalConversationId, 180);
  if (sessionId.length < 8) throw Object.assign(new Error("A valid support session is required."), { code: "CENTRAL_SUPPORT_SESSION_INVALID", status: 400 });
  const customer = await centralSupportIdentity(DB, identity);
  const category = normaliseCategory(input.category);
  const payload = {
    externalConversationId: sessionId,
    visitorReference: clean(input.visitorReference, 200) || undefined,
    authenticated: customer.authenticated,
    identity: customer.identity,
    category,
    priority: clean(input.priority || "normal", 20).toLowerCase(),
    pagePath: clean(input.pagePath || "/", 500),
    pageTitle: clean(input.pageTitle, 200),
    serviceContext: { ...customer.serviceContext, ...safeObject(input.serviceContext) },
    safeSupportFlags: safeObject(input.safeSupportFlags)
  };
  const result = await centralSupportRequest(env, "/api/v1/platform/support/conversations", { method: "POST", body: payload, timeoutMs: 10_000 });
  return { ...result, category, humanOnly: HUMAN_ONLY_CATEGORIES.has(category) };
}

export async function centralClassifyConversation(env, sessionId, input = {}) {
  return centralSupportRequest(env, "/api/v1/platform/support-classification", {
    method: "POST",
    body: {
      externalConversationId: clean(sessionId, 180),
      category: normaliseCategory(input.category),
      priority: clean(input.priority || "normal", 20).toLowerCase()
    }
  });
}

export async function centralConversationMessages(env, sessionId, after = "") {
  const params = new URLSearchParams();
  if (after) params.set("after", clean(after, 40));
  return centralSupportRequest(env, `/api/v1/platform/support/conversations/${encodeURIComponent(clean(sessionId, 180))}/messages?${params}`, { method: "GET" });
}

export async function centralCustomerMessage(env, sessionId, input = {}) {
  return centralSupportRequest(env, `/api/v1/platform/support/conversations/${encodeURIComponent(clean(sessionId, 180))}/messages`, {
    method: "POST",
    body: {
      externalMessageId: clean(input.externalMessageId, 180) || undefined,
      senderType: "customer",
      senderName: clean(input.senderName, 120) || undefined,
      body: clean(input.body, 8000),
      metadata: safeObject(input.metadata)
    }
  });
}

export async function centralAiMessage(env, sessionId, input = {}) {
  const metadata = safeObject(input.metadata);
  const message = await centralSupportRequest(env, `/api/v1/platform/support/conversations/${encodeURIComponent(clean(sessionId, 180))}/messages`, {
    method: "POST",
    body: {
      externalMessageId: clean(input.externalMessageId, 180) || undefined,
      senderType: "ai",
      senderName: clean(input.senderName || "Planyx Support Assistant", 120),
      body: clean(input.body, 8000),
      metadata
    }
  });
  if (metadata.category || metadata.priority) {
    await centralClassifyConversation(env, sessionId, {
      category: metadata.category,
      priority: metadata.priority
    });
  }
  return message;
}

export async function centralConversationEvent(env, sessionId, eventType, input = {}) {
  return centralSupportRequest(env, `/api/v1/platform/support/conversations/${encodeURIComponent(clean(sessionId, 180))}/events`, {
    method: "POST",
    body: {
      eventType: clean(eventType, 60),
      pagePath: clean(input.pagePath, 500) || undefined,
      consentType: clean(input.consentType, 80) || undefined,
      consentStatus: clean(input.consentStatus, 40) || undefined,
      noticeVersion: clean(input.noticeVersion, 80) || undefined,
      evidence: safeObject(input.evidence),
      metadata: safeObject(input.metadata)
    }
  });
}

export async function centralEscalateConversation(env, sessionId, input = {}) {
  return centralSupportRequest(env, `/api/v1/platform/support/conversations/${encodeURIComponent(clean(sessionId, 180))}/escalate`, {
    method: "POST",
    body: {
      category: normaliseCategory(input.category),
      priority: clean(input.priority || "normal", 20).toLowerCase(),
      title: clean(input.title || "Planyx customer support escalation", 160),
      summary: clean(input.summary || "The customer requires Head Office assistance.", 4000)
    },
    timeoutMs: 12_000
  });
}

export async function mirrorCentralAssistantExchange(env, DB, identity, input = {}, result = {}) {
  if (!centralCustomerServiceEnabled(env)) return { enabled: false };
  const sessionId = clean(input.sessionId, 180);
  if (sessionId.length < 8) return { enabled: true, skipped: true, reason: "missing_session" };
  const category = normaliseCategory(result.category || input.category || "general");
  const priority = clean(result.priority || input.priority || "normal", 20).toLowerCase();
  const conversation = await ensureCentralConversation(env, DB, identity, {
    sessionId,
    category: "general",
    priority: "normal",
    pagePath: input.pagePath,
    pageTitle: input.pageTitle,
    serviceContext: input.serviceContext
  });
  const state = await centralConversationMessages(env, sessionId).catch(() => ({ conversation: conversation.conversation, messages: [] }));
  const handlingMode = state?.conversation?.handlingMode || conversation?.conversation?.handlingMode || "ai";
  const customerMessageId = clean(input.messageId, 160) || `customer-${sessionId}-${Number(input.turn || 0)}`;
  await centralCustomerMessage(env, sessionId, {
    externalMessageId: customerMessageId,
    senderName: clean(identity?.name, 120) || "Customer",
    body: input.message,
    metadata: { pagePath: input.pagePath, source: "planyx_support_assistant" }
  });

  if (!["ai", "hybrid"].includes(handlingMode)) {
    return { enabled: true, humanHandling: true, conversation: state.conversation || conversation.conversation };
  }

  if (result.reply) {
    await centralAiMessage(env, sessionId, {
      externalMessageId: `assistant-${customerMessageId}`,
      senderName: clean(result.assistantName || "Planyx Support Assistant", 120),
      body: result.reply,
      metadata: { category, priority, source: clean(result.source, 100), articleId: clean(result.article?.id, 100) }
    });
  }
  if (HUMAN_ONLY_CATEGORIES.has(category) || result.escalate) {
    await centralConversationEvent(env, sessionId, "request_human", {
      pagePath: input.pagePath,
      metadata: { category, priority, reason: HUMAN_ONLY_CATEGORIES.has(category) ? "restricted_category" : "assistant_escalation" }
    });
  }
  return { enabled: true, humanHandling: false, conversation: conversation.conversation, category, priority };
}
