import { assertSameOrigin, getNativeSession } from "../../_shared/oidc.js";
import { getAtlassianSupportConfig, testAtlassianSupportConnection } from "../../_shared/atlassian-support.js";

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

function configuredAdmins(env) {
  const raw = env.ADMIN_EMAILS || env.ADMIN_EMAIL || "alfieholywoodmurray@jagroupservices.co.uk";
  return String(raw).split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

async function isAdmin(identity, env) {
  const email = clean(identity?.email, 254).toLowerCase();
  if (!email || identity?.realm !== "admin") return false;
  if (configuredAdmins(env).includes(email)) return true;
  if (!env.DB) return false;
  const row = await env.DB.prepare("SELECT status FROM admin_users WHERE lower(email)=lower(?)")
    .bind(email).first().catch(() => null);
  if (!row) return false;
  return !["blocked", "closed", "disabled", "inactive", "suspended"]
    .includes(clean(row.status || "Active", 40).toLowerCase());
}

export async function onRequestGet(context) {
  if (!assertSameOrigin(context.request)) {
    return json({ success: false, error: "Request origin was rejected." }, 403);
  }
  if (!context.env.DB) {
    return json({ success: false, error: "Administrator authentication is temporarily unavailable." }, 503);
  }

  let identity = null;
  try {
    identity = await getNativeSession(context.request, context.env, "admin");
  } catch (error) {
    console.error(JSON.stringify({
      event: "atlassian_admin_connection_session_failed",
      message: clean(error?.message || error, 160)
    }));
    return json({ success: false, error: "Administrator authentication is temporarily unavailable." }, 503);
  }

  if (!(await isAdmin(identity, context.env))) {
    return json({ success: false, error: "Administrator access is required." }, 401);
  }

  const config = getAtlassianSupportConfig(context.env);
  const result = await testAtlassianSupportConnection(context.env);
  return json({
    success: result.ok,
    configured: result.configured,
    serviceDeskId: config.serviceDeskId || null,
    cloudId: config.cloudId || null,
    requestTypes: {
      question: config.requestTypes.question || null,
      problem: config.requestTypes.problem || null,
      suggestion: config.requestTypes.suggestion || null
    },
    projectName: result.projectName || null,
    projectKey: result.projectKey || null,
    errorCode: result.errorCode || null,
    httpStatus: result.httpStatus || null,
    missing: result.missing || []
  }, result.ok ? 200 : (result.configured ? 502 : 501));
}

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return json({ success: false, error: "Method not allowed." }, 405, { Allow: "GET" });
  }
  return onRequestGet(context);
}
