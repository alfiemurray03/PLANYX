function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function getAccessIdentity(request) {
  const nativeEmail = request.headers.get("x-ja-auth-email") || "";
  return {
    email: nativeEmail.trim().toLowerCase(),
    name: (request.headers.get("x-ja-auth-name") || nativeEmail).trim(),
    realm: (request.headers.get("x-ja-auth-realm") || "").trim(),
    subject: (request.headers.get("x-ja-auth-subject") || "").trim(),
    tenantId: (request.headers.get("x-ja-auth-tenant") || "").trim(),
    objectId: (request.headers.get("x-ja-auth-object-id") || "").trim(),
    givenName: (request.headers.get("x-ja-auth-given-name") || "").trim(),
    familyName: (request.headers.get("x-ja-auth-family-name") || "").trim(),
    preferredUsername: (request.headers.get("x-ja-auth-preferred-username") || "").trim(),
    locale: (request.headers.get("x-ja-auth-locale") || "").trim(),
    jobTitle: (request.headers.get("x-ja-auth-job-title") || "").trim(),
    department: (request.headers.get("x-ja-auth-department") || "").trim(),
    companyName: (request.headers.get("x-ja-auth-company-name") || "").trim(),
    mobilePhone: (request.headers.get("x-ja-auth-mobile-phone") || "").trim(),
    businessPhone: (request.headers.get("x-ja-auth-business-phone") || "").trim(),
    country: (request.headers.get("x-ja-auth-country") || "").trim(),
    preferredLanguage: (request.headers.get("x-ja-auth-preferred-language") || "").trim(),
    photoUrl: (request.headers.get("x-ja-auth-photo-url") || "").trim()
  };
}

function clean(value, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function cleanEmail(value) {
  return clean(value, 254).toLowerCase();
}

function hasEligibleAccess(profile = {}) {
  const status = String(profile.admin_customer_status || "").trim().toLowerCase();
  return Boolean(
    Number(profile.admin_lifetime || 0) === 1 ||
    profile.admin_lifetime_plan_id ||
    (status && !["standard", "free", "secure", "secure account"].includes(status))
  );
}

const DPR_TYPES = new Set([
  "Access my personal data / Subject Access Request",
  "Correct my personal data",
  "Delete my personal data",
  "Restrict the use of my personal data",
  "Object to processing",
  "Data portability",
  "Withdraw consent",
  "Other data protection request"
]);

const SYS_TYPES = new Set([
  "Website not loading",
  "Page not responding",
  "Booking widget not working",
  "Broken link",
  "Login or account issue",
  "Access or membership issue",
  "Incorrect destination, activity or tour information",
  "Mobile display issue",
  "Payment or checkout issue",
  "Other technical issue"
]);

async function safeAlter(DB, sql) {
  try {
    await DB.prepare(sql).run();
  } catch {
    // D1 throws if the column already exists. That is expected during safe migrations.
  }
}

async function ensureTables(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS profiles (
      email TEXT PRIMARY KEY,
      verified_name TEXT,
      display_name TEXT,
      contact_email TEXT,
      phone TEXT,
      communication_preference TEXT,
      support_notes TEXT,
      microsoft_object_id TEXT,
      microsoft_tenant_id TEXT,
      microsoft_display_name TEXT,
      microsoft_given_name TEXT,
      microsoft_family_name TEXT,
      microsoft_email TEXT,
      microsoft_preferred_username TEXT,
      microsoft_locale TEXT,
      microsoft_updated_at TEXT,
      stripe_customer_id TEXT,
      stripe_customer_created_at TEXT,
      stripe_customer_synced_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN admin_lifetime INTEGER DEFAULT 0`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN admin_lifetime_plan_id TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN admin_customer_status TEXT DEFAULT 'Standard'`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN signup_notification_attempted_at TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN signup_notification_status TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN signup_notification_provider TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN signup_notification_to TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_object_id TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_tenant_id TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_display_name TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_given_name TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_family_name TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_email TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_preferred_username TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_locale TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_updated_at TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN stripe_customer_id TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN stripe_customer_created_at TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN stripe_customer_synced_at TEXT`);

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY,
      actor_email TEXT,
      action TEXT,
      entity_type TEXT,
      entity_id TEXT,
      summary TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS data_protection_requests (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE,
      user_id TEXT,
      customer_name TEXT,
      customer_email TEXT,
      request_type TEXT,
      customer_message TEXT,
      status TEXT DEFAULT 'New',
      submitted_at TEXT,
      due_at TEXT,
      completed_at TEXT,
      assigned_admin_id TEXT,
      internal_notes TEXT,
      attachments TEXT,
      audit_log TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS system_reports (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE,
      user_id TEXT,
      customer_name TEXT,
      customer_email TEXT,
      issue_type TEXT,
      affected_url TEXT,
      device_browser TEXT,
      description TEXT,
      status TEXT DEFAULT 'New',
      priority TEXT DEFAULT 'Normal',
      submitted_at TEXT,
      resolved_at TEXT,
      assigned_admin_id TEXT,
      internal_notes TEXT,
      attachments TEXT,
      audit_log TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS customer_support_cases (
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
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS customer_support_messages (
      id TEXT PRIMARY KEY,
      case_reference TEXT NOT NULL,
      author_type TEXT NOT NULL,
      author_email TEXT,
      message TEXT NOT NULL,
      is_internal INTEGER DEFAULT 0,
      attachments TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS customer_notifications (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT DEFAULT 'Normal',
      title TEXT NOT NULL,
      body TEXT,
      status TEXT DEFAULT 'Unread',
      archived_at TEXT,
      reference_type TEXT,
      reference_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS customer_timeline_events (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      actor_type TEXT DEFAULT 'system',
      actor_email TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function settingMap(DB, keys, defaults = {}) {
  try {
    const placeholders = keys.map(() => "?").join(", ");
    const result = await DB.prepare(`SELECT key, value FROM site_settings WHERE key IN (${placeholders})`).bind(...keys).all();
    const settings = { ...defaults };
    for (const row of result.results || []) settings[row.key] = row.value;
    return settings;
  } catch {
    return { ...defaults };
  }
}

async function providerSettings(DB, env) {
  const stored = await settingMap(DB, ["email_provider", "email_api_key", "email_api_endpoint", "smtp_from_name", "smtp_from_email", "admin_notification_email"], {});
  const provider = (stored.email_provider || env.EMAIL_PROVIDER || "resend").toLowerCase();
  const apiKey = stored.email_api_key || env.EMAIL_API_TOKEN || env.RESEND_API_KEY || env.SENDGRID_API_KEY || env.POSTMARK_API_KEY || env.BREVO_API_KEY || "";

  return {
    provider,
    apiKey,
    endpoint: stored.email_api_endpoint || env.EMAIL_API_ENDPOINT || "",
    fromName: stored.smtp_from_name || "Sousa Murray Planeia",
    fromEmail: stored.smtp_from_email || env.ENQUIRY_FROM_EMAIL || "noreply@jagroupservices.co.uk",
    to: stored.admin_notification_email || env.ADMIN_NOTIFICATION_EMAIL || env.ENQUIRY_TO_EMAIL || ""
  };
}

async function sendProviderEmail(DB, env, message) {
  const settings = await providerSettings(DB, env);
  const to = cleanEmail(message.to || settings.to);
  if (!to) throw new Error("Recipient email is not configured.");
  if (!settings.apiKey && settings.provider !== "mailchannels") throw new Error("Email API key is not configured.");

  const from = settings.fromName ? `${settings.fromName} <${settings.fromEmail}>` : settings.fromEmail;
  let endpoint = settings.endpoint;
  const headers = { "Content-Type": "application/json" };
  let body;

  if (settings.provider === "sendgrid") {
    endpoint ||= "https://api.sendgrid.com/v3/mail/send";
    headers.Authorization = `Bearer ${settings.apiKey}`;
    body = { personalizations: [{ to: [{ email: to }] }], from: { email: settings.fromEmail, name: settings.fromName }, subject: message.subject, content: [{ type: "text/plain", value: message.text }] };
  } else if (settings.provider === "postmark") {
    endpoint ||= "https://api.postmarkapp.com/email";
    headers["X-Postmark-Server-Token"] = settings.apiKey;
    body = { From: from, To: to, Subject: message.subject, TextBody: message.text };
  } else if (settings.provider === "brevo") {
    endpoint ||= "https://api.brevo.com/v3/smtp/email";
    headers["api-key"] = settings.apiKey;
    body = { sender: { name: settings.fromName, email: settings.fromEmail }, to: [{ email: to }], subject: message.subject, textContent: message.text };
  } else if (settings.provider === "mailchannels") {
    endpoint ||= "https://api.mailchannels.net/tx/v1/send";
    body = { personalizations: [{ to: [{ email: to }] }], from: { email: settings.fromEmail, name: settings.fromName }, subject: message.subject, content: [{ type: "text/plain", value: message.text }] };
  } else {
    endpoint ||= "https://api.resend.com/emails";
    headers.Authorization = `Bearer ${settings.apiKey}`;
    body = { from, to, subject: message.subject, text: message.text };
  }

  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  const responseText = await response.text().catch(() => "");
  if (!response.ok) throw new Error(`Email provider returned ${response.status}: ${responseText.slice(0, 240)}`);

  return { provider: settings.provider, to, status: response.status };
}

async function recordSignupNotification(DB, email, result) {
  await DB.prepare(`
    UPDATE profiles
    SET signup_notification_attempted_at = CURRENT_TIMESTAMP,
      signup_notification_status = ?,
      signup_notification_provider = ?,
      signup_notification_to = ?
    WHERE lower(email) = lower(?)
  `).bind(
    clean(result.status, 500),
    clean(result.provider, 80),
    cleanEmail(result.to),
    cleanEmail(email)
  ).run();
}

async function writeCustomerAudit(DB, identity, action, summary, metadata = {}) {
  await DB.prepare(`
    INSERT INTO admin_audit_log (id, actor_email, action, entity_type, entity_id, summary, metadata)
    VALUES (?, ?, ?, 'profiles', ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    cleanEmail(identity.email) || "system-account",
    clean(action, 120),
    cleanEmail(identity.email),
    clean(summary, 1000),
    JSON.stringify(metadata)
  ).run();
}

async function notifyCustomerSignup(DB, env, identity, profile) {
  const createdAt = new Date().toISOString();
  const customerName = profile.display_name || profile.verified_name || identity.name || identity.email;

  try {
    const sent = await sendProviderEmail(DB, env, {
      subject: "New Sousa Murray Planeia customer signup",
      text: [
        "A new customer account has been created or first detected by Sousa Murray Planeia.",
        "",
        `Customer name: ${customerName || "Not provided"}`,
        `Customer email: ${identity.email}`,
        `Signup date/time: ${createdAt}`,
        `Account/customer ID: ${identity.email}`,
        "Source/provider: Microsoft Entra ID / JA customer CIAM"
      ].join("\n")
    });

    await recordSignupNotification(DB, identity.email, { status: "sent", provider: sent.provider, to: sent.to });
    await writeCustomerAudit(DB, identity, "customer_signup_notification_sent", "Sent new customer signup notification email.", { sent: true, provider: sent.provider, to: sent.to });
  } catch (error) {
    const settings = await providerSettings(DB, env);
    await recordSignupNotification(DB, identity.email, { status: `failed: ${error.message || "Unknown email error"}`, provider: settings.provider, to: settings.to });
    await writeCustomerAudit(DB, identity, "customer_signup_notification_failed", "Customer signup notification email failed.", { sent: false, provider: settings.provider, to: settings.to, error: error.message || "Unknown email error" });
  }
}

async function ensureProfile(DB, identity, env = {}) {
  const existing = await DB.prepare(`
    SELECT email, verified_name, display_name, contact_email, admin_lifetime, admin_lifetime_plan_id, admin_customer_status
    FROM profiles
    WHERE lower(email) = lower(?)
  `).bind(identity.email).first();
  if (existing) return existing;

  await DB.prepare(`
    INSERT INTO profiles (email, verified_name, display_name, contact_email)
    VALUES (?, ?, ?, ?)
  `).bind(identity.email, identity.name, identity.name || identity.email, identity.email).run();

  const profile = await DB.prepare(`
    SELECT email, verified_name, display_name, contact_email, admin_lifetime, admin_lifetime_plan_id, admin_customer_status
    FROM profiles
    WHERE lower(email) = lower(?)
  `).bind(identity.email).first();
  await notifyCustomerSignup(DB, env, identity, profile).catch(() => {});
  return profile;
}

async function nextReference(DB, table, prefix) {
  const row = await DB.prepare(`
    SELECT reference FROM ${table}
    WHERE reference LIKE ?
    ORDER BY reference DESC
    LIMIT 1
  `).bind(`${prefix}-%`).first();

  const last = row?.reference ? Number(String(row.reference).replace(`${prefix}-`, "")) : 0;
  return `${prefix}-${String(last + 1).padStart(6, "0")}`;
}

function auditEvent(type, actor, detail = {}) {
  return JSON.stringify([{
    type,
    actor: actor.email || actor.name || "customer",
    timestamp: new Date().toISOString(),
    ...detail
  }]);
}

function supportReference(prefix = "SUP") {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Math.floor(Math.random() * 900000) + 100000)}`;
}

async function createSupportCase(DB, identity, profile, body, kind) {
  const subject = clean(body.subject || kind, 180);
  const message = clean(body.customer_message || body.message || body.description, 4000);
  const category = clean(body.category || kind, 80);
  if (!subject || !message || !category) return json({ error: "Subject, category and message are required." }, 400);
  const reference = supportReference("SUP");
  const createdAt = new Date().toISOString();
  const attachments = JSON.stringify(Array.isArray(body.attachments) ? body.attachments.slice(0, 10) : []);
  const audit = JSON.stringify([{ event: "created", at: createdAt, actor: identity.email, kind }]);
  await DB.prepare(`
    INSERT INTO customer_support_cases
    (id, reference, email, request_type, category, status, priority, assigned_department, subject, latest_message, attachments, audit_history, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'New', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    crypto.randomUUID(), reference, identity.email, kind, category,
    clean(body.priority || "Normal", 20), kind === "gdpr" ? "Data Protection" : kind === "billing" ? "Billing" : kind === "website" ? "Technical" : "Support",
    subject, message, attachments, audit
  ).run();
  await DB.prepare(`INSERT INTO customer_support_messages (id, case_reference, author_type, author_email, message, is_internal, attachments) VALUES (?, ?, 'customer', ?, ?, 0, ?)`)
    .bind(crypto.randomUUID(), reference, identity.email, message, attachments).run();
  await DB.prepare(`
    INSERT INTO customer_timeline_events (id, email, event_type, title, detail, actor_type, actor_email, metadata)
    VALUES (?, ?, ?, ?, ?, 'customer', ?, ?)
  `).bind(crypto.randomUUID(), identity.email, `${kind}_submitted`, subject, message, identity.email, JSON.stringify({ reference, kind })).run();
  return { reference };
}

async function listSupportCases(DB, email) {
  const result = await DB.prepare(`SELECT * FROM customer_support_cases WHERE lower(email) = lower(?) ORDER BY updated_at DESC`).bind(email).all();
  return result.results || [];
}

async function listNotifications(DB, email) {
  const result = await DB.prepare(`SELECT * FROM customer_notifications WHERE lower(email) = lower(?) ORDER BY created_at DESC LIMIT 200`).bind(email).all();
  return result.results || [];
}

async function listTimeline(DB, email) {
  const result = await DB.prepare(`SELECT * FROM customer_timeline_events WHERE lower(email) = lower(?) ORDER BY created_at DESC LIMIT 200`).bind(email).all();
  return result.results || [];
}

async function createDataProtectionRequest(DB, identity, profile, body) {
  const requestType = clean(body.request_type, 160);
  const message = clean(body.customer_message, 4000);
  const confirmed = Boolean(body.confirmed);

  if (!DPR_TYPES.has(requestType) || !message || !confirmed) {
    return json({ error: "Request type, details and confirmation are required." }, 400);
  }

  const reference = await nextReference(DB, "data_protection_requests", "DPR");
  const submittedAt = new Date().toISOString();
  const dueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await DB.prepare(`
    INSERT INTO data_protection_requests (
      id, reference, user_id, customer_name, customer_email, request_type, customer_message,
      status, submitted_at, due_at, attachments, audit_log, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'New', ?, ?, '[]', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    crypto.randomUUID(),
    reference,
    identity.email,
    profile.display_name || profile.verified_name || identity.name || identity.email,
    identity.email,
    requestType,
    message,
    submittedAt,
    dueAt,
    auditEvent("Record created", identity, { newValue: "New" })
  ).run();

  const record = await getOwnDataRequest(DB, identity.email, reference);
  await sendConfirmationEmail(body.env, identity.email, "Data Protection Request", reference, requestType).catch(() => {});
  return json({ saved: true, record });
}

async function createSystemReport(DB, identity, profile, body) {
  const issueType = clean(body.issue_type, 180);
  const description = clean(body.description, 4000);
  if (!SYS_TYPES.has(issueType) || !description) {
    return json({ error: "Issue type and description are required." }, 400);
  }

  const reference = await nextReference(DB, "system_reports", "SYS");
  const submittedAt = new Date().toISOString();

  await DB.prepare(`
    INSERT INTO system_reports (
      id, reference, user_id, customer_name, customer_email, issue_type, affected_url,
      device_browser, description, status, priority, submitted_at, attachments, audit_log,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', 'Normal', ?, '[]', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    crypto.randomUUID(),
    reference,
    identity.email,
    profile.display_name || profile.verified_name || identity.name || identity.email,
    identity.email,
    issueType,
    clean(body.affected_url, 500),
    clean(body.device_browser, 500),
    description,
    submittedAt,
    auditEvent("Record created", identity, { newValue: "New" })
  ).run();

  const record = await getOwnSystemReport(DB, identity.email, reference);
  await sendConfirmationEmail(body.env, identity.email, "System Report", reference, issueType).catch(() => {});
  return json({ saved: true, record });
}

async function sendConfirmationEmail(env, email, label, reference, type) {
  if (!env?.RESEND_API_KEY || !env.ENQUIRY_FROM_EMAIL) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: env.ENQUIRY_FROM_EMAIL,
      to: [email],
      subject: `${reference}: ${label} received`,
      html: `<p>Thank you. Sousa Murray Planeia has received your ${label.toLowerCase()}.</p><p><strong>Reference:</strong> ${reference}<br><strong>Type:</strong> ${escapeHtml(type)}</p><p>We will review your submission and respond where appropriate.</p>`
    })
  });
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

async function getOwnDataRequest(DB, email, reference) {
  return DB.prepare(`
    SELECT reference, request_type, customer_message, status, submitted_at, due_at, completed_at, created_at, updated_at
    FROM data_protection_requests
    WHERE lower(customer_email) = lower(?) AND reference = ?
  `).bind(email, reference).first();
}

async function getOwnSystemReport(DB, email, reference) {
  return DB.prepare(`
    SELECT reference, issue_type, affected_url, device_browser, description, status, priority, submitted_at, resolved_at, created_at, updated_at
    FROM system_reports
    WHERE lower(customer_email) = lower(?) AND reference = ?
  `).bind(email, reference).first();
}

async function listOwnRecords(DB, email) {
  const dpr = await DB.prepare(`
    SELECT reference, request_type, customer_message, status, submitted_at, due_at, completed_at, created_at, updated_at
    FROM data_protection_requests
    WHERE lower(customer_email) = lower(?)
    ORDER BY submitted_at DESC, created_at DESC
    LIMIT 100
  `).bind(email).all();

  const system = await DB.prepare(`
    SELECT reference, issue_type, affected_url, device_browser, description, status, priority, submitted_at, resolved_at, created_at, updated_at
    FROM system_reports
    WHERE lower(customer_email) = lower(?)
    ORDER BY submitted_at DESC, created_at DESC
    LIMIT 100
  `).bind(email).all();

  return {
    dataProtectionRequests: dpr.results || [],
    systemReports: system.results || []
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: "Database binding DB is missing." }, 500);

  const identity = getAccessIdentity(request);
  if (!identity.email) return json({ error: "Not signed in." }, 401);

  await ensureTables(env.DB);
  const profile = await ensureProfile(env.DB, identity, env);

  if (!hasEligibleAccess(profile)) {
    return json({
      error: "Your account is signed in, but no active service or eligible plan is currently assigned to this profile."
    }, 403);
  }

  if (request.method === "GET") {
    return json({
      ...await listOwnRecords(env.DB, identity.email),
      supportCases: await listSupportCases(env.DB, identity.email),
      notifications: await listNotifications(env.DB, identity.email),
      timeline: await listTimeline(env.DB, identity.email)
    });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const type = clean(body.type, 40);
    body.env = env;
    if (type === "data_protection") return createDataProtectionRequest(env.DB, identity, profile, body);
    if (type === "system_report") return createSystemReport(env.DB, identity, profile, body);
    if (type === "general_enquiry") return createSupportCase(env.DB, identity, profile, body, "general_enquiry");
    if (type === "website_issue") return createSupportCase(env.DB, identity, profile, body, "website_issue");
    if (type === "account_support") return createSupportCase(env.DB, identity, profile, body, "account_support");
    if (type === "billing_support") return createSupportCase(env.DB, identity, profile, body, "billing_support");
    if (type === "gdpr_request") return createSupportCase(env.DB, identity, profile, body, "gdpr_request");
    return json({ error: "Unknown request type." }, 400);
  }

  return json({ error: "Method not allowed." }, 405);
}
