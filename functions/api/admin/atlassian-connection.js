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
    defaultAuthMode: config.authMode || "auto",
    requestTypes: {
      question: config.requestTypes.question || null,
      problem: config.requestTypes.problem || null,
      suggestion: config.requestTypes.suggestion || null
    },
    missing: config.missing
  };
}

async function audit(DB, actorEmail, action, summary, metadata = {}, entityId = "PXCS") {
  try {
    await DB.prepare(`INSERT INTO admin_audit_log
      (id,actor_email,action,entity_type,entity_id,summary,metadata)
      VALUES (?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), cleanEmail(actorEmail), clean(action, 120), "atlassian_support",
      clean(entityId, 160), clean(summary, 500), JSON.stringify(metadata).slice(0, 4000)
    ).run();
  } catch {
    // The support operation remains valid if the inherited audit table is unavailable.
  }
}

async function safeAlter(DB, sql) {
  try { await DB.prepare(sql).run(); } catch {
    // Safe schema upgrades may already have been applied in another request.
  }
}

async function ensureCustomerSupportSchema(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS customer_support_cases (
    id TEXT PRIMARY KEY,
    reference TEXT UNIQUE,
    email TEXT NOT NULL,
    request_type TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT DEFAULT 'New',
    priority TEXT DEFAULT 'Normal',
    assigned_department TEXT,
    assigned_admin TEXT,
    subject TEXT NOT NULL,
    latest_message TEXT,
    attachments TEXT DEFAULT '[]',
    audit_history TEXT DEFAULT '[]',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const columns = [
    ["planyx_reference", "TEXT"], ["atlassian_issue_key", "TEXT"], ["atlassian_issue_id", "TEXT"],
    ["atlassian_request_kind", "TEXT"], ["atlassian_status", "TEXT"], ["atlassian_portal_url", "TEXT"],
    ["atlassian_agent_url", "TEXT"], ["atlassian_error_code", "TEXT"], ["atlassian_error_message", "TEXT"],
    ["created_by", "TEXT"]
  ];
  for (const [column, definition] of columns) {
    await safeAlter(DB, `ALTER TABLE customer_support_cases ADD COLUMN ${column} ${definition}`);
  }
  await DB.prepare(`CREATE INDEX IF NOT EXISTS customer_support_cases_email_updated
    ON customer_support_cases(email, updated_at DESC)`).run().catch(() => undefined);
  await DB.prepare(`CREATE INDEX IF NOT EXISTS customer_support_cases_planyx_reference
    ON customer_support_cases(planyx_reference)`).run().catch(() => undefined);

  await DB.prepare(`CREATE TABLE IF NOT EXISTS customer_timeline_events (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT,
    actor_type TEXT NOT NULL DEFAULT 'system',
    actor_email TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

function requestCategory(kind) {
  if (kind === "problem") return "Technical Support";
  if (kind === "suggestion") return "Feedback";
  return "General Enquiry";
}

function requestTypeLabel(kind) {
  if (kind === "problem") return "Problem";
  if (kind === "suggestion") return "Suggestion";
  return "Question";
}

function manualReference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `CRM-${date}-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

async function updateManualCase(DB, caseId, localReference, result, actorEmail) {
  const row = await DB.prepare("SELECT audit_history FROM customer_support_cases WHERE id=?")
    .bind(caseId).first().catch(() => null);
  let history = [];
  try {
    const parsed = JSON.parse(row?.audit_history || "[]");
    history = Array.isArray(parsed) ? parsed : [];
  } catch {
    history = [];
  }
  history.push({
    at: new Date().toISOString(),
    action: result.status === "created" ? "atlassian_created" : "atlassian_delivery_failed",
    actor: cleanEmail(actorEmail),
    localReference,
    issueKey: result.issueKey || null,
    requestKind: result.requestKind || null,
    errorCode: result.errorCode || null,
    errorMessage: result.errorMessage || null,
    httpStatus: result.httpStatus || null,
    authMode: result.authMode || null
  });

  const visibleReference = result.status === "created" && result.issueKey ? result.issueKey : localReference;
  await DB.prepare(`UPDATE customer_support_cases SET
      reference=?,planyx_reference=?,status=?,atlassian_issue_key=?,atlassian_issue_id=?,
      atlassian_request_kind=?,atlassian_status=?,atlassian_portal_url=?,atlassian_agent_url=?,
      atlassian_error_code=?,atlassian_error_message=?,audit_history=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?`).bind(
      visibleReference,
      localReference,
      result.status === "created" ? "Open" : "Delivery failed",
      clean(result.issueKey, 120) || null,
      clean(result.issueId, 120) || null,
      clean(result.requestKind, 40) || null,
      clean(result.status, 40) || null,
      clean(result.portalUrl, 2000) || null,
      clean(result.agentUrl, 2000) || null,
      clean(result.errorCode, 120) || null,
      clean(result.errorMessage, 900) || null,
      JSON.stringify(history).slice(0, 20000),
      caseId
    ).run();
  return visibleReference;
}

async function dashboardPayload(context, includeConnection = false) {
  const config = getAtlassianSupportConfig(context.env);
  const settings = await loadAtlassianSupportSettings(context.env.DB);
  const [stats, requests, connection] = await Promise.all([
    getAtlassianSupportStats(context.env.DB),
    listAtlassianSupportRequests(context.env.DB, 150),
    includeConnection
      ? testAtlassianSupportConnection(context.env, { authMode: settings.authMode })
      : Promise.resolve(null)
  ]);
  return {
    success: true,
    config: publicConfig(config),
    settings,
    stats,
    requests,
    connection: connection ? {
      ok: connection.ok,
      readyToCreate: connection.readyToCreate,
      configured: connection.configured,
      projectName: connection.projectName || null,
      projectKey: connection.projectKey || null,
      serviceDeskId: connection.serviceDeskId || config.serviceDeskId || null,
      authMode: connection.authMode || settings.authMode,
      errorCode: connection.errorCode || null,
      errorMessage: connection.errorMessage || null,
      errorHelp: connection.errorHelp || null,
      httpStatus: connection.httpStatus || null,
      checks: connection.checks || [],
      requiredScopes: connection.requiredScopes || [],
      optionalCustomerScopes: connection.optionalCustomerScopes || [],
      checkedAt: new Date().toISOString()
    } : null
  };
}

async function createCustomerRequest(context, actorEmail, body) {
  await ensureCustomerSupportSchema(context.env.DB);
  const customerEmail = cleanEmail(body.customerEmail || body.email);
  if (!customerEmail) return json({ success: false, error: "Select a valid Planyx customer." }, 400);

  const customer = await context.env.DB.prepare(`SELECT email,verified_name,display_name,contact_email
    FROM profiles WHERE lower(email)=lower(?)`).bind(customerEmail).first().catch(() => null);
  if (!customer) return json({ success: false, error: "That email is not linked to a Planyx CRM customer." }, 404);

  const subject = clean(body.subject, 255);
  const message = clean(body.message, 28000);
  const requestedKind = clean(body.requestKind, 40).toLowerCase();
  const requestKind = ["question", "problem", "suggestion"].includes(requestedKind) ? requestedKind : "question";
  const requestedPriority = clean(body.priority, 40);
  const priority = ["Low", "Normal", "High", "Urgent"].includes(requestedPriority) ? requestedPriority : "Normal";
  if (subject.length < 3) return json({ success: false, error: "Enter a subject of at least three characters." }, 400);
  if (message.length < 10) return json({ success: false, error: "Enter details of at least ten characters." }, 400);

  const customerName = clean(customer.verified_name || customer.display_name || customer.email, 160);
  const localReference = manualReference();
  const caseId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const initialHistory = [{
    at: createdAt,
    action: "raised_for_customer",
    actor: cleanEmail(actorEmail),
    localReference,
    requestKind,
    priority
  }];

  await context.env.DB.prepare(`INSERT INTO customer_support_cases
      (id,reference,planyx_reference,email,request_type,category,status,priority,assigned_department,
       assigned_admin,subject,latest_message,attachments,audit_history,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      caseId,
      localReference,
      localReference,
      customerEmail,
      requestTypeLabel(requestKind),
      requestCategory(requestKind),
      "New",
      priority,
      "Planyx Customer Services",
      cleanEmail(actorEmail),
      subject,
      message,
      "[]",
      JSON.stringify(initialHistory),
      cleanEmail(actorEmail),
      createdAt,
      createdAt
    ).run();

  const result = await syncAtlassianSupportRequest({
    env: context.env,
    DB: context.env.DB,
    localReference,
    force: true,
    enquiry: {
      customerEmail,
      customerName,
      subject,
      message,
      category: requestCategory(requestKind),
      priority,
      source: "Planyx Admin Centre – raised for customer",
      requestKind
    }
  });

  const visibleReference = await updateManualCase(context.env.DB, caseId, localReference, result, actorEmail);
  await context.env.DB.prepare(`INSERT INTO customer_timeline_events
      (id,email,event_type,title,detail,actor_type,actor_email,metadata,created_at)
    VALUES (?,?,?,?,?,'admin',?,?,CURRENT_TIMESTAMP)`).bind(
      crypto.randomUUID(),
      customerEmail,
      result.status === "created" ? "support_issue_raised" : "support_issue_delivery_failed",
      result.status === "created" ? "Support issue raised in Atlassian" : "Support issue saved; Atlassian delivery failed",
      `${visibleReference}: ${subject}`,
      cleanEmail(actorEmail),
      JSON.stringify({
        localReference, issueKey: result.issueKey || null, requestKind, priority,
        status: result.status, errorCode: result.errorCode || null, httpStatus: result.httpStatus || null
      })
    ).run().catch(() => undefined);

  await audit(
    context.env.DB,
    actorEmail,
    "atlassian_support_raised_for_customer",
    `Raised ${requestTypeLabel(requestKind).toLowerCase()} for ${customerEmail}.`,
    {
      customerEmail, localReference, issueKey: result.issueKey || null, requestKind, priority,
      status: result.status, errorCode: result.errorCode || null, httpStatus: result.httpStatus || null,
      authMode: result.authMode || null
    },
    customerEmail
  );

  const responseBody = {
    success: result.status === "created",
    savedToCrm: true,
    customer: { email: customerEmail, name: customerName },
    localReference,
    reference: visibleReference,
    issueKey: result.issueKey || null,
    agentUrl: result.agentUrl || null,
    portalUrl: result.portalUrl || null,
    requestKind,
    errorCode: result.errorCode || null,
    errorMessage: result.errorMessage || null,
    errorHelp: result.errorHelp || null,
    httpStatus: result.httpStatus || null,
    authMode: result.authMode || null,
    dashboard: await dashboardPayload(context, false)
  };
  return json(responseBody, result.status === "created" ? 201 : 502);
}

async function findRetryRecord(context, reference) {
  let enquiry = await context.env.DB.prepare(`SELECT reference,name,email,subject,category,message,priority,enquiry_type
    FROM enquiries WHERE reference=?`).bind(reference).first().catch(() => null);
  let manualCase = null;

  if (!enquiry) {
    await ensureCustomerSupportSchema(context.env.DB);
    manualCase = await context.env.DB.prepare(`SELECT c.*,p.verified_name,p.display_name
      FROM customer_support_cases c
      LEFT JOIN profiles p ON lower(p.email)=lower(c.email)
      WHERE c.planyx_reference=? OR c.reference=? LIMIT 1`).bind(reference, reference).first().catch(() => null);
    if (manualCase) {
      enquiry = {
        reference,
        name: manualCase.verified_name || manualCase.display_name || manualCase.email,
        email: manualCase.email,
        subject: manualCase.subject,
        category: manualCase.category,
        message: manualCase.latest_message,
        priority: manualCase.priority,
        enquiry_type: "Planyx Admin Centre – raised for customer",
        request_kind: manualCase.atlassian_request_kind || String(manualCase.request_type || "").toLowerCase()
      };
    }
  }
  return { enquiry, manualCase };
}

async function retryRequestResult(context, actorEmail, localReference) {
  const reference = clean(localReference, 120);
  if (!reference) return { statusCode: 400, body: { success: false, error: "A Planyx enquiry reference is required." } };
  const { enquiry, manualCase } = await findRetryRecord(context, reference);
  if (!enquiry) {
    return { statusCode: 404, body: { success: false, error: "The matching Planyx enquiry or CRM support case could not be found." } };
  }
  if (!cleanEmail(enquiry.email)) {
    return { statusCode: 400, body: { success: false, error: "The support record does not contain a valid customer email." } };
  }

  const explicitKind = ["question", "problem", "suggestion"].includes(clean(enquiry.request_kind, 40).toLowerCase())
    ? clean(enquiry.request_kind, 40).toLowerCase()
    : undefined;
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
      source: clean(enquiry.enquiry_type, 160) || "Planyx Support Assistant",
      requestKind: explicitKind
    }
  });

  if (manualCase) await updateManualCase(context.env.DB, manualCase.id, reference, result, actorEmail);
  await audit(context.env.DB, actorEmail, "atlassian_support_retry", `Retried Atlassian delivery for ${reference}.`, {
    reference, status: result.status, issueKey: result.issueKey || null,
    errorCode: result.errorCode || null, httpStatus: result.httpStatus || null
  }, cleanEmail(enquiry.email) || reference);
  return {
    statusCode: result.status === "created" ? 200 : 502,
    body: { success: result.status === "created", result }
  };
}

async function retryRequest(context, actorEmail, localReference) {
  const outcome = await retryRequestResult(context, actorEmail, localReference);
  return json({ ...outcome.body, dashboard: await dashboardPayload(context, false) }, outcome.statusCode);
}

async function retryAllFailed(context, actorEmail) {
  const records = await listAtlassianSupportRequests(context.env.DB, 100);
  const failed = records.filter((record) => ["failed", "not_configured"].includes(record.status)).slice(0, 20);
  if (!failed.length) return json({ success: true, retried: 0, created: 0, failed: 0, dashboard: await dashboardPayload(context, false) });

  let created = 0;
  let failedCount = 0;
  const results = [];
  for (const record of failed) {
    const outcome = await retryRequestResult(context, actorEmail, record.localReference);
    if (outcome.body?.success) created += 1;
    else failedCount += 1;
    results.push({
      localReference: record.localReference,
      success: outcome.body?.success === true,
      issueKey: outcome.body?.result?.issueKey || null,
      errorCode: outcome.body?.result?.errorCode || outcome.body?.error || null
    });
  }
  await audit(context.env.DB, actorEmail, "atlassian_support_retry_all", `Retried ${failed.length} failed Atlassian deliveries.`, {
    retried: failed.length, created, failed: failedCount
  });
  return json({
    success: failedCount === 0,
    retried: failed.length,
    created,
    failed: failedCount,
    results,
    dashboard: await dashboardPayload(context, false)
  }, failedCount === 0 ? 200 : 207);
}

export async function onRequestGet(context) {
  const auth = await authenticate(context);
  if (auth.response) return auth.response;
  const includeConnection = new URL(context.request.url).searchParams.get("test") === "1";
  return json(await dashboardPayload(context, includeConnection));
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
      routingMode: clean(body.routingMode, 40),
      authMode: clean(body.authMode, 20),
      syncCustomers: body.syncCustomers === true
    }, actorEmail);
    await audit(context.env.DB, actorEmail, "atlassian_support_settings_updated", "Updated Atlassian support integration controls.", settings);
    return json({ success: true, settings, dashboard: await dashboardPayload(context, false) });
  }

  if (action === "test_connection" || action === "run_diagnostics") {
    const settings = await loadAtlassianSupportSettings(context.env.DB);
    const result = await testAtlassianSupportConnection(context.env, { authMode: settings.authMode });
    await audit(context.env.DB, actorEmail, "atlassian_support_connection_tested", "Ran Atlassian support diagnostics.", {
      ok: result.ok, readyToCreate: result.readyToCreate, errorCode: result.errorCode || null,
      httpStatus: result.httpStatus || null, authMode: result.authMode || settings.authMode
    });
    return json({ success: result.ok, connection: {
      ok: result.ok,
      readyToCreate: result.readyToCreate,
      configured: result.configured,
      projectName: result.projectName || null,
      projectKey: result.projectKey || null,
      serviceDeskId: result.serviceDeskId || null,
      authMode: result.authMode || settings.authMode,
      errorCode: result.errorCode || null,
      errorMessage: result.errorMessage || null,
      errorHelp: result.errorHelp || null,
      httpStatus: result.httpStatus || null,
      checks: result.checks || [],
      requiredScopes: result.requiredScopes || [],
      optionalCustomerScopes: result.optionalCustomerScopes || [],
      checkedAt: new Date().toISOString()
    } }, result.ok ? 200 : (result.configured ? 502 : 501));
  }

  if (action === "create_customer_request") return createCustomerRequest(context, actorEmail, body);
  if (action === "retry") return retryRequest(context, actorEmail, body.localReference);
  if (action === "retry_all_failed") return retryAllFailed(context, actorEmail);
  return json({ success: false, error: "Unsupported Atlassian support action." }, 400);
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ success: false, error: "Method not allowed." }, 405, { Allow: "GET, POST" });
}
