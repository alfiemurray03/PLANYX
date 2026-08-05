import {
  ensureEnquiryTables,
  normaliseEnquiry,
  recordEnquiryConsent,
  sendNewEnquiryNotifications,
  storeEnquiry,
  validateEnquiry
} from "../../_shared/enquiries.js";
import { markConversationEscalated } from "../../_shared/support-assistant-monitor.js";
import { configFrom, loadAssistantSettings } from "../../_shared/support-assistant-core.js";

const ALLOWED_CHAT_CATEGORIES = new Set([
  "General Enquiry", "Sales", "Billing", "Technical Support", "Partnerships",
  "Accessibility", "Data Protection", "Safeguarding", "Complaints", "Feedback", "Other"
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function identityOf(request) {
  const email = String(request.headers.get("x-ja-auth-email") || "").trim().toLowerCase();
  const name = String(request.headers.get("x-ja-auth-name") || email).trim();
  return { email, name };
}

function clean(value, max = 4000) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

async function sendTeamsSupportCard(webhookValue, request, reference, enquiry, priority) {
  const webhook = clean(webhookValue, 2000);
  if (!webhook) return { sent: false, reason: "not_configured" };

  let target;
  try {
    target = new URL(webhook);
  } catch {
    throw new Error("The Teams support webhook URL is invalid.");
  }
  if (target.protocol !== "https:" || !target.hostname.endsWith(".environment.api.powerplatform.com")) {
    throw new Error("The Teams support webhook host is not permitted.");
  }

  const submittedAt = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });
  const card = {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      contentUrl: null,
      content: {
        type: "AdaptiveCard",
        version: "1.4",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        body: [
          { type: "TextBlock", size: "Large", weight: "Bolder", text: "Chatbot escalation", wrap: true },
          { type: "TextBlock", text: `Reference: ${reference}`, weight: "Bolder", wrap: true },
          {
            type: "FactSet",
            facts: [
              { title: "Source", value: "Sousa Murray Planeia Support Assistant" },
              { title: "Submitted", value: `${submittedAt} (UK time)` },
              { title: "Priority", value: priority },
              { title: "Category", value: clean(enquiry.category, 80) || "General Enquiry" },
              { title: "Customer", value: clean(enquiry.name, 120) || "Customer" },
              { title: "Email", value: clean(enquiry.email, 254) },
              { title: "Telephone", value: clean(enquiry.telephone, 40) || "Not provided" },
              { title: "Subject", value: clean(enquiry.subject, 180) }
            ]
          },
          { type: "TextBlock", text: "Complete conversation transcript", weight: "Bolder", wrap: true, spacing: "Medium", separator: true },
          { type: "TextBlock", text: clean(enquiry.message, 20000), wrap: true, fontType: "Monospace", size: "Small" },
          { type: "TextBlock", text: "To email the customer from Teams, open this message's More actions menu, choose Workflows, then select Sousa Murray Planeia – Reply to Customer.", wrap: true, spacing: "Medium", separator: true, isSubtle: true }
        ]
      }
    }]
  };

  const response = await fetch(target.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card)
  });
  if (!response.ok) {
    const detail = clean(await response.text().catch(() => ""), 240);
    throw new Error(`Teams workflow returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return { sent: true };
}

async function sendManualSupportCard(webhookValue, request, reference, enquiry, priority) {
  const webhook = clean(webhookValue, 2000);
  if (!webhook) throw new Error("The manual support webhook is not configured.");

  let target;
  try {
    target = new URL(webhook);
  } catch {
    throw new Error("The manual support webhook URL is invalid.");
  }
  if (target.protocol !== "https:" || !target.hostname.endsWith(".environment.api.powerplatform.com")) {
    throw new Error("The manual support webhook host is not permitted.");
  }

  const submittedAt = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });
  const card = {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      contentUrl: null,
      content: {
        type: "AdaptiveCard",
        version: "1.4",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        body: [
          { type: "TextBlock", size: "Large", weight: "Bolder", text: "New manual support enquiry", wrap: true },
          { type: "TextBlock", text: `Reference: ${reference}`, weight: "Bolder", wrap: true },
          {
            type: "FactSet",
            facts: [
              { title: "Source", value: "Contact Support form (manual enquiry)" },
              { title: "Submitted", value: `${submittedAt} (UK time)` },
              { title: "Priority", value: priority },
              { title: "Category", value: clean(enquiry.category, 80) || "General Enquiry" },
              { title: "Customer", value: clean(enquiry.name, 120) || "Customer" },
              { title: "Email", value: clean(enquiry.email, 254) },
              { title: "Telephone", value: clean(enquiry.telephone, 40) || "Not provided" },
              { title: "Subject", value: clean(enquiry.subject, 180) }
            ]
          },
          { type: "TextBlock", text: "This enquiry was submitted manually. The AI chatbot has not spoken with the customer.", wrap: true, spacing: "Medium" },
          { type: "TextBlock", text: "Complete customer message", weight: "Bolder", wrap: true, spacing: "Medium", separator: true },
          { type: "TextBlock", text: clean(enquiry.message, 20000), wrap: true, size: "Small" },
          { type: "TextBlock", text: "To email the customer from Teams, open this message's More actions menu, choose Workflows, then select Sousa Murray Planeia – Reply to Customer.", wrap: true, spacing: "Medium", separator: true, isSubtle: true }
        ]
      }
    }]
  };

  const response = await fetch(target.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card)
  });
  if (!response.ok) {
    const detail = clean(await response.text().catch(() => ""), 240);
    throw new Error(`Manual support workflow returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }
}

async function submitManualEnquiry(context, identity) {
  const { request, env } = context;
  const body = await request.json().catch(() => ({}));
  const requestedCategory = clean(body.category, 80);
  const manualCategories = {
    general: "General Enquiry",
    billing: "Billing",
    technical: "Technical Support",
    templates: "Technical Support",
    account: "Technical Support",
    feedback: "Feedback",
    other: "Other"
  };
  const category = manualCategories[requestedCategory.toLowerCase()]
    || (ALLOWED_CHAT_CATEGORIES.has(requestedCategory) ? requestedCategory : "General Enquiry");
  const enquiry = normaliseEnquiry({
    ...body,
    name: clean(body.name || identity.name || identity.email, 120),
    email: clean(identity.email || body.email, 254).toLowerCase(),
    subject: clean(body.subject, 180),
    category,
    message: clean(body.message, 20000),
    formType: "Contact Support form",
    enquiryType: "Manual support enquiry",
    termsAccepted: false,
    privacyAccepted: false,
    marketingConsent: false,
    startedAt: 0
  });

  const supportOnlyErrors = new Set([
    "Confirm the Terms of Service and Privacy Notice.",
    "Please wait a moment before sending the form.",
    "This form has expired. Refresh the page and try again."
  ]);
  const errors = validateEnquiry(enquiry).filter((error) => !supportOnlyErrors.has(error));
  if (enquiry.subject.length < 3) errors.unshift("Enter a subject of at least 3 characters.");
  if (errors.length) return json({ success: false, error: errors[0], errors }, 400);

  await ensureEnquiryTables(env.DB);
  const result = await storeEnquiry(env.DB, enquiry, request);
  if (!result.duplicate) {
    const requestedPriority = clean(body.priority, 20);
    const priorityMap = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" };
    const priority = priorityMap[requestedPriority.toLowerCase()] || "Normal";
    await sendManualSupportCard(env.MANUAL_SUPPORT_WEBHOOK_URL, request, result.reference, enquiry, priority);
  }

  return json({
    success: true,
    reference: result.reference,
    duplicate: result.duplicate,
    category,
    source: "Manual support enquiry",
    adminPath: `/admin/enquiries?reference=${encodeURIComponent(result.reference)}`,
    message: result.duplicate ? "This enquiry has already been received." : "Your manual support enquiry has been sent to the Sousa Murray Planeia team."
  }, result.duplicate ? 200 : 201);
}

async function ensureSupportTables(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY, reference TEXT UNIQUE, customer_email TEXT, customer_name TEXT,
    category TEXT, department TEXT, assigned_admin TEXT, subject TEXT, status TEXT,
    priority TEXT, sla_target TEXT, notes TEXT, customer_replies TEXT DEFAULT '[]',
    attachments TEXT DEFAULT '[]', resolution_summary TEXT, audit_log TEXT DEFAULT '[]',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL, sender_type TEXT NOT NULL,
    sender_name TEXT, sender_email TEXT, message TEXT NOT NULL, is_internal INTEGER DEFAULT 0,
    read_by_admin INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

function ticket(row) {
  return {
    id: row.id,
    uuid: row.reference || row.id,
    name: row.customer_name || "Customer",
    email: row.customer_email,
    subject: row.subject,
    message: row.notes || "",
    category: String(row.category || "general").toLowerCase(),
    priority: String(row.priority || "normal").toLowerCase(),
    status: String(row.status || "open").toLowerCase().replaceAll(" ", "_"),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function activeMaintenance(DB) {
  const config = configFrom(await loadAssistantSettings(DB));
  const now = Date.now();
  const start = config.maintenanceStart ? Date.parse(config.maintenanceStart) : 0;
  const end = config.maintenanceEnd ? Date.parse(config.maintenanceEnd) : 0;
  const scheduled = Boolean(start && now >= start && (!end || now <= end));
  return { active: config.maintenanceEnabled || scheduled, message: config.maintenanceMessage, config };
}

async function submitChatEnquiry(context, identity, assistantConfig) {
  const { request, env } = context;
  const body = await request.json().catch(() => ({}));
  const requestedCategory = clean(body.category, 80);
  const category = ALLOWED_CHAT_CATEGORIES.has(requestedCategory) ? requestedCategory : "Technical Support";
  const startedAt = Number(body.startedAt);
  const enquiry = normaliseEnquiry({
    ...body,
    name: clean(body.name || identity.name || identity.email, 120),
    // A signed-in session is authoritative. Never let typed form data attach a
    // support case to a different customer's CRM record.
    email: clean(identity.email || body.email, 254).toLowerCase(),
    subject: clean(body.subject, 180),
    category,
    message: clean(body.message, 20000),
    formType: "Support Chat",
    enquiryType: "AI Help Centre escalation",
    termsAccepted: body.termsAccepted === true,
    privacyAccepted: body.privacyAccepted === true,
    marketingConsent: false,
    startedAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : 0
  });

  if (enquiry.website) return json({ success: true, reference: "ENQ-RECEIVED" }, 201);
  // Signed-in support tickets do not require a separate acceptance of the
  // site's general Terms/Privacy documents, and this form has no anti-bot
  // dwell-time control. Keep the shared field validation while excluding
  // checks that only apply to public enquiry forms.
  const supportOnlyErrors = new Set([
    "Confirm the Terms of Service and Privacy Notice.",
    "Please wait a moment before sending the form.",
    "This form has expired. Refresh the page and try again."
  ]);
  const errors = validateEnquiry(enquiry).filter((error) => !supportOnlyErrors.has(error));
  if (enquiry.subject.length < 3) errors.unshift("Enter a subject of at least 3 characters.");
  if (errors.length) return json({ success: false, error: errors[0], errors }, 400);

  await ensureEnquiryTables(env.DB);
  const result = await storeEnquiry(env.DB, enquiry, request);
  await markConversationEscalated(env.DB, clean(body.sessionId, 120), result.reference, enquiry.email);

  if (!result.duplicate) {
    await recordEnquiryConsent(env.DB, enquiry, request, result.reference);
    const requestedPriority = clean(body.priority, 20);
    const priority = ["Urgent", "High", "Normal", "Low"].includes(requestedPriority) ? requestedPriority : "Normal";
    const configuredWebhooks = assistantConfig.webhookDeliveryEnabled ? [
      env.TEAMS_SUPPORT_WEBHOOK_URL,
      env.SUPPORT_WEBHOOK_2_URL,
      env.SUPPORT_WEBHOOK_3_URL,
      env.SUPPORT_WEBHOOK_4_URL
    ].filter(Boolean) : [];
    const deliveryTasks = [
      sendNewEnquiryNotifications(env.DB, env, result.reference),
      ...configuredWebhooks.map((webhook) => sendTeamsSupportCard(webhook, request, result.reference, enquiry, priority))
    ];
    const notificationWork = Promise.allSettled(deliveryTasks).then((results) => {
      results.forEach((outcome, index) => {
        if (outcome.status === "rejected") {
          console.error(JSON.stringify({
            event: index === 0 ? "support_chat_notification_failed" : "support_webhook_delivery_failed",
            reference: result.reference,
            webhookSlot: index === 0 ? undefined : index,
            message: String(outcome.reason?.message || outcome.reason).slice(0, 240)
          }));
        }
      });
    });
    if (typeof context.waitUntil === "function") context.waitUntil(notificationWork);
    else await notificationWork;
  }

  return json({
    success: true,
    reference: result.reference,
    duplicate: result.duplicate,
    category,
    source: "AI Help Centre escalation",
    adminPath: `/admin/enquiries?reference=${encodeURIComponent(result.reference)}`,
    message: result.duplicate ? "This enquiry has already been received." : "Your enquiry has been sent to the Sousa Murray Planeia team."
  }, result.duplicate ? 200 : 201);
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    if (!env.DB) return json({ success: false, error: "Support service is temporarily unavailable." }, 503);
    const parts = new URL(request.url).pathname.split("/").filter(Boolean).slice(2);
    const identity = identityOf(request);
    if (request.method === "POST" && !sameOrigin(request)) return json({ success: false, error: "Request origin was rejected." }, 403);
    if (request.method === "POST" && (parts[0] === "submit" || parts[0] === "manual-submit")) {
      const maintenance = await activeMaintenance(env.DB);
      if (maintenance.active) return json({ success: false, maintenance: true, error: maintenance.message }, 503);
      if (parts[0] === "manual-submit") return submitManualEnquiry(context, identity);
      return submitChatEnquiry(context, identity, maintenance.config);
    }
    if (!identity.email) return json({ success: false, error: "Please sign in to view support conversations." }, 401);
    await ensureSupportTables(env.DB);
    if (parts[0] !== "tickets") return json({ success: false, error: "Support route not found." }, 404);
    const ticketId = parts[1];
    if (!ticketId && request.method === "GET") {
      const rows = await env.DB.prepare("SELECT * FROM support_tickets WHERE lower(customer_email)=lower(?) ORDER BY updated_at DESC").bind(identity.email).all();
      return json({ success: true, tickets: (rows.results || []).map(ticket) });
    }
    const owned = await env.DB.prepare("SELECT * FROM support_tickets WHERE id=? AND lower(customer_email)=lower(?)").bind(ticketId, identity.email).first();
    if (!owned) return json({ success: false, error: "Support ticket not found." }, 404);
    if (parts[2] === "messages") {
      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const message = clean(body.message, 8000);
        if (!message) return json({ success: false, error: "Message is required." }, 400);
        await env.DB.prepare("INSERT INTO support_ticket_messages (ticket_id,sender_type,sender_name,sender_email,message,read_by_admin) VALUES (?,'customer',?,?,?,0)").bind(ticketId, identity.name || identity.email, identity.email, message).run();
        await env.DB.prepare("UPDATE support_tickets SET status=CASE WHEN lower(status) IN ('closed','resolved') THEN 'Open' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(ticketId).run();
      }
      const rows = await env.DB.prepare("SELECT id,sender_type,sender_name,message,created_at FROM support_ticket_messages WHERE ticket_id=? AND COALESCE(is_internal,0)=0 ORDER BY created_at,id").bind(ticketId).all();
      return json({ success: true, messages: (rows.results || []).map((row) => ({ id: row.id, senderType: row.sender_type, senderName: row.sender_name, message: row.message, createdAt: row.created_at })) });
    }
    return json({ success: true, ticket: ticket(owned) });
  } catch (error) {
    console.error(JSON.stringify({ event: "customer_support_error", message: String(error?.message || error) }));
    const status = Number(error?.status || 503);
    return json({ success: false, error: status === 429 ? String(error.message || "Too many enquiries have been sent. Please try again later.") : "The support assistant could not complete that request. Please try again." }, status);
  }
}
