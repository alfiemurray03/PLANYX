import { assertSameOrigin, getNativeSession } from "../../../_shared/oidc.js";
import { ensureAssistantMonitoringTables } from "../../../_shared/support-assistant-monitor.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function configuredAdmins(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || "alfieholywoodmurray@jagroupservices.co.uk")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

function webhookSlots(env) {
  return [
    { id: "teams", label: "Microsoft Teams Support", configured: Boolean(env.TEAMS_SUPPORT_WEBHOOK_URL), url: env.TEAMS_SUPPORT_WEBHOOK_URL },
    { id: "secondary", label: "Additional workflow 1", configured: Boolean(env.SUPPORT_WEBHOOK_2_URL), url: env.SUPPORT_WEBHOOK_2_URL },
    { id: "tertiary", label: "Additional workflow 2", configured: Boolean(env.SUPPORT_WEBHOOK_3_URL), url: env.SUPPORT_WEBHOOK_3_URL },
    { id: "quaternary", label: "Additional workflow 3", configured: Boolean(env.SUPPORT_WEBHOOK_4_URL), url: env.SUPPORT_WEBHOOK_4_URL }
  ];
}

function permittedWebhook(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.hostname.endsWith(".environment.api.powerplatform.com");
  } catch {
    return false;
  }
}

async function testWebhook(slot) {
  if (!slot?.configured || !permittedWebhook(slot.url)) throw new Error("The selected webhook is not configured with a permitted Power Platform URL.");
  const response = await fetch(slot.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "message",
      attachments: [{
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          type: "AdaptiveCard",
          version: "1.4",
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          body: [
            { type: "TextBlock", size: "Large", weight: "Bolder", text: "Sousa Murray Planeia webhook test", wrap: true },
            { type: "TextBlock", text: `${slot.label} is connected to the AI Chatbot Control Centre.`, wrap: true },
            { type: "TextBlock", text: new Date().toISOString(), size: "Small", isSubtle: true }
          ]
        }
      }]
    })
  });
  if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}.`);
}

async function authorised(DB, identity, env) {
  if (configuredAdmins(env).includes(String(identity.email || "").toLowerCase())) return true;
  try {
    const row = await DB.prepare("SELECT status FROM admin_users WHERE lower(email)=lower(?)").bind(identity.email).first();
    return Boolean(row) && !["blocked", "closed", "disabled", "inactive", "suspended"].includes(String(row.status || "active").toLowerCase());
  } catch {
    return false;
  }
}

function partsOf(context) {
  const value = context.params?.path;
  const raw = Array.isArray(value) ? value.join("/") : String(value || "");
  return raw.split("/").filter(Boolean).map(decodeURIComponent);
}

async function bodyOf(request) {
  try { return await request.json(); } catch { return {}; }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) return json({ success: false, error: "Database binding is unavailable." }, 503);
  let identity;
  try {
    identity = await getNativeSession(request, env, "admin");
  } catch {
    return json({ success: false, error: "Admin authentication is temporarily unavailable." }, 503);
  }
  if (!identity) return json({ success: false, error: "Admin session expired. Please sign in again." }, 401);
  if (!assertSameOrigin(request)) return json({ success: false, error: "The request origin could not be verified." }, 403);
  if (!(await authorised(env.DB, identity, env))) return json({ success: false, error: "This account is not authorised for the admin portal." }, 403);

  await ensureAssistantMonitoringTables(env.DB);
  await env.DB.prepare("UPDATE support_ai_conversations SET status='abandoned',ended_at=CURRENT_TIMESTAMP WHERE status='active' AND last_activity < datetime('now','-30 minutes')").run();
  const parts = partsOf(context);

  if (request.method === "GET" && parts[0]) {
    const conversation = await env.DB.prepare("SELECT * FROM support_ai_conversations WHERE session_id=?").bind(parts[0]).first();
    if (!conversation) return json({ success: false, error: "Conversation not found." }, 404);
    const messages = await env.DB.prepare("SELECT id,role,message,response_source,matched_article,escalated,created_at FROM support_ai_messages WHERE session_id=? ORDER BY created_at,id").bind(parts[0]).all();
    return json({ success: true, conversation, messages: messages.results || [] });
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const status = String(url.searchParams.get("status") || "all").toLowerCase();
    const search = String(url.searchParams.get("search") || "").trim().toLowerCase().slice(0, 120);
    const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit") || 75)));
    const conditions = [];
    const bindings = [];
    if (status !== "all") { conditions.push("lower(status)=?"); bindings.push(status); }
    if (search) {
      conditions.push("(lower(COALESCE(customer_email,'')) LIKE ? OR lower(COALESCE(last_user_message,'')) LIKE ? OR lower(session_id) LIKE ? OR lower(COALESCE(enquiry_reference,'')) LIKE ?)");
      const like = `%${search}%`;
      bindings.push(like, like, like, like);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await env.DB.prepare(`SELECT * FROM support_ai_conversations ${where} ORDER BY last_activity DESC LIMIT ?`).bind(...bindings, limit).all();
    const statsRows = await env.DB.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status='escalated' THEN 1 ELSE 0 END) AS escalated,
      SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) AS resolved,
      SUM(CASE WHEN status='abandoned' THEN 1 ELSE 0 END) AS abandoned,
      SUM(CASE WHEN visitor_type='anonymous' THEN 1 ELSE 0 END) AS anonymous,
      SUM(CASE WHEN visitor_type='authenticated' THEN 1 ELSE 0 END) AS authenticated,
      SUM(CASE WHEN date(started_at)=date('now') THEN 1 ELSE 0 END) AS today,
      SUM(message_count) AS messages
      FROM support_ai_conversations`).first();
    const settingsRows = await env.DB.prepare("SELECT key,value FROM site_settings WHERE key LIKE 'ai_chatbot_%'").all();
    const settings = Object.fromEntries((settingsRows.results || []).map((row) => [row.key, row.value]));
    return json({
      success: true,
      conversations: rows.results || [],
      stats: {
        total: Number(statsRows?.total || 0), active: Number(statsRows?.active || 0),
        escalated: Number(statsRows?.escalated || 0), resolved: Number(statsRows?.resolved || 0),
        abandoned: Number(statsRows?.abandoned || 0), anonymous: Number(statsRows?.anonymous || 0),
        authenticated: Number(statsRows?.authenticated || 0), today: Number(statsRows?.today || 0),
        messages: Number(statsRows?.messages || 0)
      },
      diagnostics: {
        database: true,
        workersAiBinding: Boolean(env.AI && typeof env.AI.run === "function"),
        provider: settings.ai_chatbot_provider || "built_in",
        model: settings.ai_chatbot_model || "",
        debugEnabled: settings.ai_chatbot_debug_enabled === "true",
        maintenanceEnabled: settings.ai_chatbot_maintenance_enabled === "true",
        webhookDeliveryEnabled: settings.ai_chatbot_webhook_delivery_enabled !== "false",
        webhooks: webhookSlots(env).map(({ id, label, configured }) => ({ id, label, configured }))
      }
    });
  }

  const body = await bodyOf(request);
  const action = String(body.action || "set_status");
  if (action === "test_webhook") {
    const slot = webhookSlots(env).find((item) => item.id === String(body.slot || ""));
    if (!slot) return json({ success: false, error: "Webhook slot was not found." }, 404);
    try {
      await testWebhook(slot);
      return json({ success: true, slot: slot.id, message: `${slot.label} test delivered.` });
    } catch (error) {
      return json({ success: false, error: String(error?.message || error).slice(0, 240) }, 502);
    }
  }
  if (action === "purge_abandoned") {
    const days = Math.min(365, Math.max(1, Number(body.days || 30)));
    const sessions = await env.DB.prepare("SELECT session_id FROM support_ai_conversations WHERE status='abandoned' AND last_activity < datetime('now', ?)").bind(`-${days} days`).all();
    const ids = (sessions.results || []).map((row) => row.session_id);
    for (const id of ids) {
      await env.DB.prepare("DELETE FROM support_ai_messages WHERE session_id=?").bind(id).run();
      await env.DB.prepare("DELETE FROM support_ai_conversations WHERE session_id=?").bind(id).run();
    }
    return json({ success: true, deleted: ids.length });
  }

  const sessionId = String(parts[0] || body.sessionId || "").slice(0, 120);
  if (!sessionId) return json({ success: false, error: "Conversation session is required." }, 400);
  if (action === "delete") {
    await env.DB.prepare("DELETE FROM support_ai_messages WHERE session_id=?").bind(sessionId).run();
    await env.DB.prepare("DELETE FROM support_ai_conversations WHERE session_id=?").bind(sessionId).run();
    return json({ success: true });
  }
  const status = ["active", "resolved", "escalated", "completed", "abandoned"].includes(String(body.status)) ? String(body.status) : "completed";
  await env.DB.prepare("UPDATE support_ai_conversations SET status=?,last_activity=CURRENT_TIMESTAMP,ended_at=CASE WHEN ?='active' THEN NULL ELSE CURRENT_TIMESTAMP END WHERE session_id=?").bind(status, status, sessionId).run();
  return json({ success: true, status });
}
