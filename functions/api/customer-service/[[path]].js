import { assertSameOrigin, getNativeSession } from "../../_shared/oidc.js";
import {
  centralConversationEvent,
  centralConversationMessages,
  centralCustomerMessage,
  centralCustomerServiceEnabled,
  centralEscalateConversation,
  centralKnowledge,
  centralSupportRequest,
  ensureCentralConversation
} from "../../_shared/customer-service-centre.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin"
    }
  });
}

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function segments(value) {
  if (Array.isArray(value)) return value.flatMap(item => String(item).split('/')).filter(Boolean);
  return String(value || '').split('/').filter(Boolean);
}

async function readBody(request, maximum = 64_000) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > maximum) throw Object.assign(new Error('The support request is too large.'), { status: 413, code: 'SUPPORT_REQUEST_TOO_LARGE' });
  const text = await request.text();
  if (text.length > maximum) throw Object.assign(new Error('The support request is too large.'), { status: 413, code: 'SUPPORT_REQUEST_TOO_LARGE' });
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw Object.assign(new Error('The support request must contain valid JSON.'), { status: 400, code: 'INVALID_SUPPORT_REQUEST' });
  }
}

async function identityFor(context) {
  return getNativeSession(context.request, context.env, 'customer').catch(() => null);
}

function failure(error) {
  const status = Number(error?.status || 502);
  return json({
    success: false,
    error: clean(error?.message || 'The Head Office Customer Service Centre is unavailable.', 1000),
    code: clean(error?.code || 'CENTRAL_SUPPORT_UNAVAILABLE', 120)
  }, status >= 400 && status <= 599 ? status : 502);
}

async function getConfig(context) {
  if (!centralCustomerServiceEnabled(context.env)) {
    return json({
      success: true,
      centralEnabled: false,
      connected: false,
      branch: null,
      config: null
    });
  }
  const payload = await centralSupportRequest(context.env, '/api/v1/platform/support-control', { method: 'GET' });
  return json({
    success: true,
    centralEnabled: true,
    connected: payload.connected === true,
    branch: payload.branch || payload.config || null,
    config: payload.config || payload.branch || null,
    connection: payload.connection || null
  });
}

async function getKnowledge(context) {
  const url = new URL(context.request.url);
  const payload = await centralKnowledge(context.env, {
    service: url.searchParams.get('service') || 'planyx',
    accountType: url.searchParams.get('accountType') || '',
    plan: url.searchParams.get('plan') || ''
  });
  return json({ success: true, articles: payload.articles || [] });
}

async function getMessages(context, sessionId) {
  const url = new URL(context.request.url);
  const payload = await centralConversationMessages(context.env, sessionId, url.searchParams.get('after') || '');
  return json({ success: true, ...payload });
}

async function startConversation(context) {
  const body = await readBody(context.request, 64_000);
  const identity = await identityFor(context);
  const result = await ensureCentralConversation(context.env, context.env.DB, identity, {
    sessionId: body.sessionId,
    visitorReference: body.visitorReference,
    category: body.category,
    priority: body.priority,
    pagePath: body.pagePath,
    pageTitle: body.pageTitle,
    serviceContext: body.serviceContext,
    safeSupportFlags: body.safeSupportFlags
  });
  return json({ success: true, ...result }, result.created ? 201 : 200);
}

async function addCustomerMessage(context, sessionId) {
  const body = await readBody(context.request, 40_000);
  const message = clean(body.body || body.message, 8000);
  if (!message) return json({ success: false, error: 'Enter a support message.', code: 'SUPPORT_MESSAGE_REQUIRED' }, 400);
  const result = await centralCustomerMessage(context.env, sessionId, {
    externalMessageId: body.externalMessageId,
    senderName: body.senderName,
    body: message,
    metadata: {
      pagePath: clean(body.pagePath, 500),
      source: 'planyx_customer_service_bridge'
    }
  });
  return json({ success: true, ...result }, result.duplicate ? 200 : 202);
}

async function recordEvent(context, sessionId) {
  const body = await readBody(context.request, 24_000);
  const allowed = new Set(['heartbeat', 'close', 'reopen', 'request_human', 'customer_typing', 'page_changed', 'consent_recorded']);
  const eventType = clean(body.eventType || body.event, 60).toLowerCase();
  if (!allowed.has(eventType)) return json({ success: false, error: 'The support event is not recognised.', code: 'INVALID_SUPPORT_EVENT' }, 400);
  const result = await centralConversationEvent(context.env, sessionId, eventType, {
    pagePath: body.pagePath,
    consentType: body.consentType,
    consentStatus: body.consentStatus,
    noticeVersion: body.noticeVersion,
    evidence: body.evidence,
    metadata: body.metadata
  });
  return json({ success: true, ...result }, 202);
}

async function escalate(context, sessionId) {
  const body = await readBody(context.request, 48_000);
  const identity = await identityFor(context);
  await ensureCentralConversation(context.env, context.env.DB, identity, {
    sessionId,
    category: body.category,
    priority: body.priority,
    pagePath: body.pagePath,
    pageTitle: body.pageTitle,
    serviceContext: body.serviceContext
  });
  const result = await centralEscalateConversation(context.env, sessionId, {
    category: body.category,
    priority: body.priority,
    title: body.title,
    summary: body.summary
  });
  return json({ success: true, ...result }, result.created ? 201 : 200);
}

export async function onRequest(context) {
  if (!assertSameOrigin(context.request)) return json({ success: false, error: 'Request origin was rejected.', code: 'SUPPORT_ORIGIN_REJECTED' }, 403);
  const route = segments(context.params.path);
  try {
    if (context.request.method === 'GET') {
      if (route.length === 1 && route[0] === 'config') return getConfig(context);
      if (route.length === 1 && route[0] === 'knowledge') return getKnowledge(context);
      if (route.length === 3 && route[0] === 'conversations' && route[2] === 'messages') return getMessages(context, route[1]);
    }
    if (context.request.method === 'POST') {
      if (!centralCustomerServiceEnabled(context.env)) {
        return json({ success: false, error: 'Head Office Customer Service is not enabled for Planyx.', code: 'CENTRAL_SUPPORT_DISABLED' }, 503);
      }
      if (route.length === 1 && route[0] === 'conversations') return startConversation(context);
      if (route.length === 3 && route[0] === 'conversations' && route[2] === 'messages') return addCustomerMessage(context, route[1]);
      if (route.length === 3 && route[0] === 'conversations' && route[2] === 'events') return recordEvent(context, route[1]);
      if (route.length === 3 && route[0] === 'conversations' && route[2] === 'escalate') return escalate(context, route[1]);
    }
    return json({ success: false, error: 'Customer Service route not found.', code: 'CUSTOMER_SERVICE_ROUTE_NOT_FOUND' }, 404);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'planyx_customer_service_bridge_error',
      code: clean(error?.code, 120),
      status: Number(error?.status || 0),
      message: clean(error?.message, 1000),
      route,
      method: context.request.method
    }));
    return failure(error);
  }
}
