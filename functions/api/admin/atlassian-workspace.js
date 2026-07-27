import { assertSameOrigin, getNativeSession } from "../../_shared/oidc.js";
import {
  addAtlassianWorkspaceComment,
  getAtlassianWorkspaceRequest,
  listAtlassianWorkspaceRequests
} from "../../_shared/atlassian-workspace.js";

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
  if (!assertSameOrigin(context.request)) {
    return { response: json({ success: false, error: "Request origin was rejected." }, 403) };
  }
  if (!context.env.DB) {
    return { response: json({ success: false, error: "Administrator authentication is temporarily unavailable." }, 503) };
  }
  let identity = null;
  try {
    identity = await getNativeSession(context.request, context.env, "admin");
  } catch (error) {
    console.error(JSON.stringify({
      event: "atlassian_workspace_session_failed",
      message: clean(error?.message || error, 160)
    }));
    return { response: json({ success: false, error: "Administrator authentication is temporarily unavailable." }, 503) };
  }
  if (!(await isAdmin(identity, context.env))) {
    return { response: json({ success: false, error: "Administrator access is required." }, 401) };
  }
  return { identity };
}

async function audit(DB, actorEmail, action, summary, metadata = {}, entityId = "PXCS") {
  try {
    await DB.prepare(`INSERT INTO admin_audit_log
      (id,actor_email,action,entity_type,entity_id,summary,metadata)
      VALUES (?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), cleanEmail(actorEmail), clean(action, 120), "atlassian_workspace",
      clean(entityId, 160), clean(summary, 500), JSON.stringify(metadata).slice(0, 4_000)
    ).run();
  } catch {
    // Viewing and replying remain available if the inherited audit table is unavailable.
  }
}

function errorResponse(error) {
  const status = Math.min(599, Math.max(400, Number(error?.status || 500)));
  const detail = clean(error?.detail || error?.message || "The live PXCS workspace request failed.", 1_000);
  const code = clean(error?.code || `ATLASSIAN_WORKSPACE_HTTP_${status}`, 160);
  return json({
    success: false,
    error: detail,
    code,
    httpStatus: status,
    authMode: clean(error?.authMode, 20) || null
  }, status);
}

export async function onRequestGet(context) {
  const auth = await authenticate(context);
  if (auth.response) return auth.response;
  const url = new URL(context.request.url);
  const issueKey = clean(url.searchParams.get("issueKey"), 120);
  try {
    if (issueKey) {
      const result = await getAtlassianWorkspaceRequest(context.env, issueKey);
      await audit(context.env.DB, auth.identity.email, "pxcs_request_viewed", `Viewed ${issueKey} in the Planyx support workspace.`, {
        issueKey,
        authMode: result.authMode
      }, issueKey);
      return json({ success: true, ...result });
    }

    const result = await listAtlassianWorkspaceRequests(context.env, {
      status: url.searchParams.get("status"),
      searchTerm: url.searchParams.get("search"),
      start: url.searchParams.get("start"),
      limit: url.searchParams.get("limit")
    });
    return json({ success: true, ...result });
  } catch (error) {
    console.error(JSON.stringify({
      event: "atlassian_workspace_get_failed",
      error_code: clean(error?.code || "ATLASSIAN_WORKSPACE_FAILED", 160),
      http_status: Number(error?.status || 500)
    }));
    return errorResponse(error);
  }
}

export async function onRequestPost(context) {
  const auth = await authenticate(context);
  if (auth.response) return auth.response;
  const body = await context.request.json().catch(() => ({}));
  const action = clean(body.action, 80).toLowerCase();
  if (action !== "add_comment") {
    return json({ success: false, error: "Unsupported PXCS workspace action." }, 400);
  }

  const issueKey = clean(body.issueKey, 120).toUpperCase();
  const message = clean(body.body, 10_000);
  const isPublic = body.public !== false;
  try {
    const result = await addAtlassianWorkspaceComment(context.env, issueKey, {
      body: message,
      public: isPublic
    });
    await audit(
      context.env.DB,
      auth.identity.email,
      isPublic ? "pxcs_public_reply_added" : "pxcs_internal_note_added",
      `${isPublic ? "Added a public reply" : "Added an internal note"} to ${issueKey}.`,
      { issueKey, public: isPublic, authMode: result.authMode },
      issueKey
    );
    return json({ success: true, ...result }, 201);
  } catch (error) {
    console.error(JSON.stringify({
      event: "atlassian_workspace_comment_failed",
      issue_key: issueKey,
      error_code: clean(error?.code || "ATLASSIAN_WORKSPACE_COMMENT_FAILED", 160),
      http_status: Number(error?.status || 500)
    }));
    return errorResponse(error);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ success: false, error: "Method not allowed." }, 405, { Allow: "GET, POST" });
}
