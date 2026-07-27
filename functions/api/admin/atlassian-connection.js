import { assertSameOrigin, getNativeSession } from "../../_shared/oidc.js";
import {
  getAtlassianSupportConfig,
  getAtlassianSupportStats,
  listAtlassianSupportRequests,
  loadAtlassianSupportSettings,
  saveAtlassianSupportSettings,
  syncAtlassianSupportRequest,
  testAtlassianSupportConnection
} from "../../_shared/atlassian-support.js";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Cookie",
      ...extraHeaders
    }
  });
}

function clean(value, max = 500) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function cleanEmail(value) {
  const email = clean(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function configuredAdmins(env) {
  const raw = env.ADMIN_EMAILS || env.ADMIN_EMAIL || "alfieholywoodmurray@jagroupservices.co.uk";
  return String(raw).split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

async function isAdmin(identity, env) {
  const email = cleanEmail(identity?.email);
  if (!email || identity?.realm !== "admin") return false;
  if (configuredAdmins(env).includes(email)) return true;
  if (!env.DB) return false;
  const row = await env.DB.prepare("SELECT status FROM admin_users WHERE lower(email)=lower(?)")
    .bind(email).first().catch(() => null);
  if (!row) return false;
  return !["blocked", "closed", "disabled", "inactive", "suspended"]
    .includes(clean(row.status || "Active", 40).toLowerCase());
}

async function authenticate(context) {
  if (!assertSameOrigin(context.request)) return { response: json({ success: false, error: "Request origin was rejected." }, 403) };
  if (!context.env.DB) return { response: json({ success: false, error: "Administrator authentication is temporarily unavailable." }, 503) };

  let identity = null;
  try {
    identity = await getNativeSession(context.request, context.env, "admin");
  } catch (error) {
    console.error(JSON.stringify({
      event: "atlassian_admin_connection_session_failed",
      message: clean(error?.message || error, 160)
    }));
    return { response: json({ success: false, error: "Administrator authentication is temporarily unavailable." }, 503) };
  }
  if (!(await isAdmin(identity, context.env))) {
    return { response: json({ success: false, error: "Administrator access is required." }, 401) };
  }
  return { identity };
}

function publicConfig(config) {
  const serviceEmail = cleanEmail(config.serviceEmail);
  const [local, domain] = serviceEmail.split("@");
  const maskedServiceEmail = local && domain ? `${local.slice(0, 5)}…@${domain}` : "";
  return {
    configured: config.configured,
    cloudId: config.cloudId || null,
    serviceDeskId: config.serviceDeskId || null,
    serviceAccount: maskedServiceEmail || null,
    tokenConfigured: Boolean(config.apiToken),
    requestTypes: {
      question: config.requestTypes.question || null,
      problem: config.requestTypes.problem || null,
      suggestion: config.requestTypes.suggestion || null
    },
    missing: config.missing
  };
}

async function audit(DB, actorEmail, action, summary, metadata = {}) {
  try {
    await DB.prepare(`INSERT INTO admin_audit_log
      (id,actor_email,action,entity_type,entity_id,summary,metadata)
      VALUES (?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), cleanEmail(actorEmail), clean(action, 120), "atlassian_support",
      "PXCS", clean(summary, 500), JSON.stringify(metadata).slice(0, 4000)
    ).run();
  } catch {
    // The control action remains valid if the inherited audit table is unavailable.
  }
}

async function dashboardPayload(context, includeConnection = false) {
  const config = getAtlassianSupportConfig(context.env);
  const [settings, stats, requests, connection] = await Promise.all([
    loadAtlassianSupportSettings(context.env.DB),
    getAtlassianSupportStats(context.env.DB),
    listAtlassianSupportRequests(context.env.DB, 50),
    includeConnection ? testAtlassianSupportConnection(context.env) : Promise.resolve(null)
  ]);
  return {
    success: true,
    config: publicConfig(config),
    settings,
    stats,
    requests,
    connection: connection ? {
      ok: connection.ok,
      configured: connection.configured,
      projectName: connection.projectName || null,
      projectKey: connection.projectKey || null,
      serviceDeskId: connection.serviceDeskId || config.serviceDeskId || null,
      errorCode: connection.errorCode || null,
      httpStatus: connection.httpStatus || null,
      checkedAt: new Date().toISOString()
    } : null
  };
}

export async function onRequestGet(context) {
  const auth = await authenticate(context);
  if (auth.response) return auth.response;
  const includeConnection = new URL(context.request.url).searchParams.get("test") === "1";
  return json(await dashboardPayload(context, includeConnection));
}

async function retryRequest(context, actorEmail, localReference) {
  const reference = clean(localReference, 120);
  if (!reference) return json({ success: false, error: "A Planyx enquiry reference is required." }, 400);

  const enquiry = await context.env.DB.prepare(`SELECT reference,name,email,subject,category,message,priority,enquiry_type
    FROM enquiries WHERE reference=?`).bind(reference).first().catch(() => null);
  if (!enquiry) return json({ success: false, error: "The matching Planyx enquiry could not be found." }, 404);
  if (!cleanEmail(enquiry.email)) return json({ success: false, error: "The enquiry does not contain a valid customer email." }, 400);

  const result = await syncAtlassianSupportRequest({
    env: context.env,
    DB: context.env.DB,
    localReference: reference,
    force: true,
    enquiry: {
      customerEmail: cleanEmail(enquiry.email),
      customerName: clean(enquiry.name, 160),
      subject: clean(enquiry.subject, 255),
      message: clean(enquiry.message, 28000),
      category: clean(enquiry.category, 120),
      priority: clean(enquiry.priority, 40),
      source: clean(enquiry.enquiry_type, 160) || "Planyx Support Assistant"
    }
  });
  await audit(context.env.DB, actorEmail, "atlassian_support_retry", `Retried Atlassian delivery for ${reference}.`, {
    reference, status: result.status, issueKey: result.issueKey || null, errorCode: result.errorCode || null
  });
  return json({ success: result.status === "created", result, dashboard: await dashboardPayload(context, false) }, result.status === "created" ? 200 : 502);
}

export async function onRequestPost(context) {
  const auth = await authenticate(context);
  if (auth.response) return auth.response;
  const body = await context.request.json().catch(() => ({}));
  const action = clean(body.action, 80).toLowerCase();
  const actorEmail = cleanEmail(auth.identity?.email);

  if (action === "save_settings") {
    const settings = await saveAtlassianSupportSettings(context.env.DB, {
      enabled: body.enabled === true,
      routingMode: clean(body.routingMode, 40)
    }, actorEmail);
    await audit(context.env.DB, actorEmail, "atlassian_support_settings_updated", "Updated Atlassian support integration controls.", settings);
    return json({ success: true, settings, dashboard: await dashboardPayload(context, false) });
  }

  if (action === "test_connection") {
    const result = await testAtlassianSupportConnection(context.env);
    await audit(context.env.DB, actorEmail, "atlassian_support_connection_tested", "Tested the Atlassian support connection.", {
      ok: result.ok, errorCode: result.errorCode || null, httpStatus: result.httpStatus || null
    });
    return json({ success: result.ok, connection: {
      ok: result.ok,
      configured: result.configured,
      projectName: result.projectName || null,
      projectKey: result.projectKey || null,
      serviceDeskId: result.serviceDeskId || null,
      errorCode: result.errorCode || null,
      httpStatus: result.httpStatus || null,
      checkedAt: new Date().toISOString()
    } }, result.ok ? 200 : (result.configured ? 502 : 501));
  }

  if (action === "retry") return retryRequest(context, actorEmail, body.localReference);
  return json({ success: false, error: "Unsupported Atlassian control action." }, 400);
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ success: false, error: "Method not allowed." }, 405, { Allow: "GET, POST" });
}
