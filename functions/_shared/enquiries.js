export const ENQUIRY_CATEGORIES = [
  "General Enquiry",
  "Sales",
  "Billing",
  "Technical Support",
  "Partnerships",
  "Accessibility",
  "Data Protection",
  "Safeguarding",
  "Complaints",
  "Feedback",
  "Other"
];

export const ENQUIRY_STATUSES = ["New", "Open", "In Progress", "Awaiting Customer", "Resolved", "Closed"];
export const ENQUIRY_PRIORITIES = ["Low", "Normal", "High", "Urgent"];

export function clean(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

export function cleanEmail(value) {
  return clean(value, 254).toLowerCase();
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export function getAccessIdentity(request) {
  const nativeEmail = request.headers.get("x-ja-auth-email") || "";
  return {
    email: cleanEmail(nativeEmail),
    name: clean(request.headers.get("x-ja-auth-name") || nativeEmail, 160),
    realm: clean(request.headers.get("x-ja-auth-realm"), 40),
    subject: clean(request.headers.get("x-ja-auth-subject"), 200),
    tenantId: clean(request.headers.get("x-ja-auth-tenant"), 120),
    objectId: clean(request.headers.get("x-ja-auth-object-id"), 120),
    givenName: clean(request.headers.get("x-ja-auth-given-name"), 120),
    familyName: clean(request.headers.get("x-ja-auth-family-name"), 120),
    preferredUsername: clean(request.headers.get("x-ja-auth-preferred-username"), 254),
    locale: clean(request.headers.get("x-ja-auth-locale"), 20),
    jobTitle: clean(request.headers.get("x-ja-auth-job-title"), 120),
    department: clean(request.headers.get("x-ja-auth-department"), 120),
    companyName: clean(request.headers.get("x-ja-auth-company-name"), 180),
    mobilePhone: clean(request.headers.get("x-ja-auth-mobile-phone"), 40),
    businessPhone: clean(request.headers.get("x-ja-auth-business-phone"), 40),
    country: clean(request.headers.get("x-ja-auth-country"), 80),
    preferredLanguage: clean(request.headers.get("x-ja-auth-preferred-language"), 20),
    photoUrl: clean(request.headers.get("x-ja-auth-photo-url"), 500)
  };
}

export async function hashValue(value) {
  if (!value) return "";
  const bytes = new TextEncoder().encode(String(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function safeAlter(DB, sql) {
  try {
    await DB.prepare(sql).run();
  } catch {
    // D1 reports duplicate-column errors when a safe migration has already run.
  }
}

export async function ensureEnquiryTables(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS enquiries (
      reference TEXT PRIMARY KEY,
      id TEXT,
      customer_id TEXT,
      name TEXT,
      email TEXT,
      telephone TEXT,
      form_type TEXT,
      enquiry_type TEXT,
      subject TEXT,
      category TEXT,
      message TEXT,
      booking_reference TEXT,
      order_reference TEXT,
      status TEXT DEFAULT 'New',
      priority TEXT DEFAULT 'Normal',
      assigned_admin TEXT,
      notification_status TEXT DEFAULT 'Pending',
      idempotency_key TEXT,
      content_hash TEXT,
      ip_hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  const columns = [
    ["id", "TEXT"], ["customer_id", "TEXT"], ["subject", "TEXT"], ["category", "TEXT"],
    ["booking_reference", "TEXT"], ["order_reference", "TEXT"], ["priority", "TEXT DEFAULT 'Normal'"],
    ["assigned_admin", "TEXT"], ["notification_status", "TEXT DEFAULT 'Pending'"],
    ["idempotency_key", "TEXT"], ["content_hash", "TEXT"], ["ip_hash", "TEXT"],
    ["updated_at", "TEXT"]
  ];
  for (const [name, type] of columns) await safeAlter(DB, `ALTER TABLE enquiries ADD COLUMN ${name} ${type}`);

  await DB.prepare(`UPDATE enquiries SET id = COALESCE(NULLIF(id, ''), reference), updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP) WHERE id IS NULL OR id = '' OR updated_at IS NULL`).run();
  await DB.prepare(`UPDATE enquiries SET subject = COALESCE(NULLIF(subject, ''), NULLIF(enquiry_type, ''), NULLIF(form_type, ''), 'Website enquiry') WHERE subject IS NULL OR subject = ''`).run();
  await DB.prepare(`UPDATE enquiries SET category = COALESCE(NULLIF(category, ''), NULLIF(enquiry_type, ''), 'General Enquiry') WHERE category IS NULL OR category = ''`).run();
  await DB.prepare(`UPDATE enquiries SET status = 'New' WHERE lower(COALESCE(status, '')) = 'new'`).run();
  await DB.prepare(`UPDATE enquiries SET priority = 'Normal' WHERE priority IS NULL OR priority = ''`).run();
  await DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS enquiries_id_unique ON enquiries(id) WHERE id IS NOT NULL AND id <> ''`).run();
  await DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS enquiries_idempotency_unique ON enquiries(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> ''`).run();
  await DB.prepare(`CREATE INDEX IF NOT EXISTS enquiries_email_created ON enquiries(email, created_at DESC)`).run();
  await DB.prepare(`CREATE INDEX IF NOT EXISTS enquiries_status_updated ON enquiries(status, updated_at DESC)`).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS enquiry_messages (
      id TEXT PRIMARY KEY,
      enquiry_reference TEXT NOT NULL,
      author_type TEXT NOT NULL,
      author_email TEXT,
      message TEXT NOT NULL,
      is_internal INTEGER DEFAULT 0,
      notification_status TEXT DEFAULT 'Not required',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await DB.prepare(`CREATE INDEX IF NOT EXISTS enquiry_messages_reference ON enquiry_messages(enquiry_reference, created_at ASC)`).run();
  await DB.prepare(`
    INSERT OR IGNORE INTO enquiry_messages (id, enquiry_reference, author_type, author_email, message, is_internal, notification_status, created_at)
    SELECT 'legacy-' || e.reference, e.reference, 'customer', e.email, e.message, 0, 'Not required', COALESCE(e.created_at, CURRENT_TIMESTAMP)
    FROM enquiries e
    WHERE COALESCE(e.message, '') <> ''
      AND NOT EXISTS (SELECT 1 FROM enquiry_messages m WHERE m.enquiry_reference = e.reference)
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS enquiry_notifications (
      id TEXT PRIMARY KEY,
      enquiry_reference TEXT NOT NULL,
      message_id TEXT,
      notification_type TEXT NOT NULL,
      recipient TEXT,
      status TEXT DEFAULT 'Pending',
      provider TEXT,
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await DB.prepare(`CREATE INDEX IF NOT EXISTS enquiry_notifications_reference ON enquiry_notifications(enquiry_reference, created_at DESC)`).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS enquiry_sequences (
      sequence_date TEXT PRIMARY KEY,
      last_value INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

export function normaliseEnquiry(body = {}) {
  const rawCategory = clean(body.category || body.enquiryType, 80);
  const category = ENQUIRY_CATEGORIES.find((item) => item.toLowerCase() === rawCategory.toLowerCase()) || rawCategory;
  return {
    name: clean(body.name, 120),
    email: cleanEmail(body.email),
    telephone: clean(body.telephone, 40),
    subject: clean(body.subject || body.enquiryType || body.formType, 180),
    category,
    message: clean(body.message, 20000),
    bookingReference: clean(body.bookingReference, 80),
    orderReference: clean(body.orderReference, 80),
    formType: clean(body.formType, 80),
    enquiryType: clean(body.enquiryType, 120),
    plan: clean(body.plan, 120),
    destination: clean(body.destination, 120),
    dates: clean(body.dates, 120),
    travellers: clean(body.travellers, 120),
    travellerType: clean(body.travellerType, 120),
    budget: clean(body.budget, 120),
    supportNeeds: clean(body.supportNeeds, 1500),
    socialTariff: Boolean(body.socialTariff),
    specialCategoryConsent: Boolean(body.specialCategoryConsent),
    transportConfirmed: Boolean(body.transportConfirmed),
    termsAccepted: Boolean(body.termsAccepted),
    privacyAccepted: Boolean(body.privacyAccepted),
    marketingConsent: Boolean(body.marketingConsent),
    idempotencyKey: clean(body.idempotencyKey, 120),
    startedAt: Number(body.startedAt),
    website: clean(body.website, 100),
    turnstileToken: clean(body.turnstileToken || body["cf-turnstile-response"], 4096)
  };
}

export function validateEnquiry(enquiry) {
  const errors = [];
  const isContact = enquiry.formType.toLowerCase() === "contact us";
  if (!enquiry.name || enquiry.name.length < 2) errors.push("Enter your name.");
  if (!isValidEmail(enquiry.email)) errors.push("Enter a valid email address.");
  if (!enquiry.subject || (isContact && enquiry.subject.length < 3)) errors.push("Enter a subject.");
  if (!enquiry.category) errors.push("Select a category.");
  if (isContact && !ENQUIRY_CATEGORIES.includes(enquiry.category)) errors.push("Select a valid category.");
  if (!enquiry.message || enquiry.message.length < 10) errors.push("Enter a message of at least 10 characters.");
  if (!enquiry.termsAccepted || !enquiry.privacyAccepted) errors.push("Confirm the Terms of Service and Privacy Notice.");
  if (enquiry.supportNeeds && !enquiry.specialCategoryConsent) errors.push("Confirm the sensitive-information consent or remove the accessibility information.");
  if (enquiry.formType === "Free Discovery Enquiry" && !enquiry.transportConfirmed) errors.push("Confirm the travel and transport responsibility.");
  if (!enquiry.startedAt || Date.now() - enquiry.startedAt < 2500) errors.push("Please wait a moment before sending the form.");
  if (enquiry.startedAt && Date.now() - enquiry.startedAt > 24 * 60 * 60 * 1000) errors.push("This form has expired. Refresh the page and try again.");
  return errors;
}

export function isSameOriginRequest(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function turnstileConfig(request, env, storedSiteKey = "") {
  const host = new URL(request.url).hostname;
  const preview = host === "localhost" || host === "127.0.0.1" || host.endsWith(".pages.dev");
  const secret = env.TURNSTILE_SECRET_KEY || env.TURNSTILE_SECRET || "";
  const siteKey = env.TURNSTILE_SITE_KEY || storedSiteKey || "";
  const disabled = String(env.TURNSTILE_DISABLED || "").toLowerCase() === "true" || (preview && !secret);
  const configured = Boolean(siteKey && secret);
  return {
    enabled: configured && !disabled,
    available: configured || disabled,
    siteKey: configured && !disabled ? String(siteKey) : ""
  };
}

export async function verifyTurnstile(request, env, token, storedSiteKey = "") {
  const config = turnstileConfig(request, env, storedSiteKey);
  if (!config.available) return { ok: false, unavailable: true };
  if (!config.enabled) return { ok: true, skipped: true };
  if (!token) return { ok: false };
  try {
    const form = new FormData();
    form.set("secret", env.TURNSTILE_SECRET_KEY || env.TURNSTILE_SECRET);
    form.set("response", token);
    form.set("remoteip", request.headers.get("cf-connecting-ip") || "");
    form.set("idempotency_key", crypto.randomUUID());
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    if (!response.ok) return { ok: false };
    const result = await response.json();
    const requestHost = new URL(request.url).hostname;
    const actionMatches = !result.action || result.action === "contact_enquiry";
    const hostMatches = !result.hostname || result.hostname === requestHost;
    return { ok: result.success === true && actionMatches && hostMatches };
  } catch {
    return { ok: false };
  }
}

export async function enforceRateLimit(DB, email, ipHash) {
  const byEmail = await DB.prepare(`SELECT COUNT(*) AS count FROM enquiries WHERE lower(email) = lower(?) AND created_at >= datetime('now', '-15 minutes')`).bind(email).first();
  const byIp = ipHash ? await DB.prepare(`SELECT COUNT(*) AS count FROM enquiries WHERE ip_hash = ? AND created_at >= datetime('now', '-15 minutes')`).bind(ipHash).first() : { count: 0 };
  if (Number(byEmail?.count || 0) >= 3 || Number(byIp?.count || 0) >= 5) {
    const error = new Error("Too many enquiries have been sent. Please wait 15 minutes and try again.");
    error.status = 429;
    throw error;
  }
}

export async function findDuplicate(DB, enquiry, contentHash) {
  if (enquiry.idempotencyKey) {
    const exact = await DB.prepare(`SELECT reference FROM enquiries WHERE idempotency_key = ? LIMIT 1`).bind(enquiry.idempotencyKey).first();
    if (exact) return exact;
  }
  return DB.prepare(`
    SELECT reference FROM enquiries
    WHERE lower(email) = lower(?) AND content_hash = ? AND created_at >= datetime('now', '-10 minutes')
    ORDER BY created_at DESC LIMIT 1
  `).bind(enquiry.email, contentHash).first();
}

export async function generateReference(DB, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const row = await DB.prepare(`
    INSERT INTO enquiry_sequences (sequence_date, last_value, updated_at)
    VALUES (?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(sequence_date) DO UPDATE SET last_value = last_value + 1, updated_at = CURRENT_TIMESTAMP
    RETURNING last_value
  `).bind(day).first();
  return `ENQ-${day.replaceAll("-", "")}-${String(Number(row?.last_value || 1)).padStart(6, "0")}`;
}

export async function storeEnquiry(DB, enquiry, request) {
  await ensureEnquiryTables(DB);
  const identity = getAccessIdentity(request);
  const ipHash = await hashValue(request.headers.get("cf-connecting-ip") || "");
  const contentHash = await hashValue(`${enquiry.email}\n${enquiry.subject}\n${enquiry.category}\n${enquiry.message}`.toLowerCase());
  await enforceRateLimit(DB, enquiry.email, ipHash);
  const duplicate = await findDuplicate(DB, enquiry, contentHash);
  if (duplicate) return { reference: duplicate.reference, duplicate: true };

  const reference = await generateReference(DB);
  const id = crypto.randomUUID();
  const customerId = identity.email || enquiry.email;
  await DB.prepare(`
    INSERT INTO enquiries (
      reference, id, customer_id, name, email, telephone, subject, category, message,
      booking_reference, order_reference, status, priority, assigned_admin,
      notification_status, idempotency_key, content_hash, ip_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', 'Normal', NULL, 'Pending', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    reference, id, customerId, enquiry.name, enquiry.email, enquiry.telephone, enquiry.subject,
    enquiry.category, enquiry.message, enquiry.bookingReference, enquiry.orderReference,
    enquiry.idempotencyKey || null, contentHash, ipHash
  ).run();

  await DB.prepare(`
    INSERT INTO enquiry_messages (id, enquiry_reference, author_type, author_email, message, is_internal, notification_status)
    VALUES (?, ?, 'customer', ?, ?, 0, 'Pending')
  `).bind(crypto.randomUUID(), reference, enquiry.email, enquiry.message).run();
  return { reference, id, duplicate: false };
}

export async function recordEnquiryConsent(DB, enquiry, request, reference) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS consent_records (
      id TEXT PRIMARY KEY,
      email TEXT,
      source TEXT,
      reference TEXT,
      terms_accepted INTEGER DEFAULT 0,
      terms_version TEXT,
      terms_accepted_at TEXT,
      privacy_accepted INTEGER DEFAULT 0,
      privacy_version TEXT,
      privacy_accepted_at TEXT,
      marketing_consent INTEGER DEFAULT 0,
      marketing_consent_at TEXT,
      ip_hash TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  const now = new Date().toISOString();
  await DB.prepare(`
    INSERT INTO consent_records (
      id, email, source, reference, terms_accepted, terms_version, terms_accepted_at,
      privacy_accepted, privacy_version, privacy_accepted_at, marketing_consent,
      marketing_consent_at, ip_hash, user_agent
    ) VALUES (?, ?, 'enquiry', ?, ?, '1.0', ?, ?, '1.0', ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), enquiry.email, reference, enquiry.termsAccepted ? 1 : 0,
    enquiry.termsAccepted ? now : null, enquiry.privacyAccepted ? 1 : 0,
    enquiry.privacyAccepted ? now : null, enquiry.marketingConsent ? 1 : 0,
    enquiry.marketingConsent ? now : null,
    await hashValue(request.headers.get("cf-connecting-ip") || ""),
    clean(request.headers.get("user-agent") || "", 500)
  ).run();
}

async function settingMap(DB, keys) {
  try {
    const placeholders = keys.map(() => "?").join(", ");
    const result = await DB.prepare(`SELECT key, value FROM site_settings WHERE key IN (${placeholders})`).bind(...keys).all();
    return Object.fromEntries((result.results || []).map((row) => [row.key, row.value]));
  } catch {
    return {};
  }
}

async function providerSettings(DB, env) {
  const stored = await settingMap(DB, ["email_provider", "email_api_key", "email_api_endpoint", "smtp_from_name", "smtp_from_email", "admin_notification_email"]);
  return {
    provider: (stored.email_provider || env.EMAIL_PROVIDER || "resend").toLowerCase(),
    apiKey: stored.email_api_key || env.EMAIL_API_TOKEN || env.RESEND_API_KEY || env.SENDGRID_API_KEY || env.POSTMARK_API_KEY || env.BREVO_API_KEY || "",
    endpoint: stored.email_api_endpoint || env.EMAIL_API_ENDPOINT || "",
    fromName: stored.smtp_from_name || "Sousa Murray Planeia",
    fromEmail: stored.smtp_from_email || env.ENQUIRY_FROM_EMAIL || "noreply@jagroupservices.co.uk",
    adminEmail: stored.admin_notification_email || env.ADMIN_NOTIFICATION_EMAIL || env.ENQUIRY_TO_EMAIL || ""
  };
}

async function sendProviderEmail(DB, env, message) {
  const settings = await providerSettings(DB, env);
  const recipient = cleanEmail(message.to || settings.adminEmail);
  if (!recipient) throw new Error("Recipient email is not configured.");
  if (!settings.apiKey && settings.provider !== "mailchannels") throw new Error("Email API key is not configured.");
  const from = `${settings.fromName} <${settings.fromEmail}>`;
  const headers = { "Content-Type": "application/json" };
  let endpoint = settings.endpoint;
  let body;
  if (settings.provider === "sendgrid") {
    endpoint ||= "https://api.sendgrid.com/v3/mail/send";
    headers.Authorization = `Bearer ${settings.apiKey}`;
    body = { personalizations: [{ to: [{ email: recipient }] }], from: { email: settings.fromEmail, name: settings.fromName }, reply_to: message.replyTo ? { email: message.replyTo } : undefined, subject: message.subject, content: [{ type: "text/plain", value: message.text }, { type: "text/html", value: message.html }] };
  } else if (settings.provider === "postmark") {
    endpoint ||= "https://api.postmarkapp.com/email";
    headers["X-Postmark-Server-Token"] = settings.apiKey;
    body = { From: from, To: recipient, ReplyTo: message.replyTo || undefined, Subject: message.subject, TextBody: message.text, HtmlBody: message.html };
  } else if (settings.provider === "brevo") {
    endpoint ||= "https://api.brevo.com/v3/smtp/email";
    headers["api-key"] = settings.apiKey;
    body = { sender: { name: settings.fromName, email: settings.fromEmail }, to: [{ email: recipient }], replyTo: message.replyTo ? { email: message.replyTo } : undefined, subject: message.subject, textContent: message.text, htmlContent: message.html };
  } else if (settings.provider === "mailchannels") {
    endpoint ||= "https://api.mailchannels.net/tx/v1/send";
    body = { personalizations: [{ to: [{ email: recipient }] }], from: { email: settings.fromEmail, name: settings.fromName }, reply_to: message.replyTo ? { email: message.replyTo } : undefined, subject: message.subject, content: [{ type: "text/plain", value: message.text }, { type: "text/html", value: message.html }] };
  } else {
    endpoint ||= "https://api.resend.com/emails";
    headers.Authorization = `Bearer ${settings.apiKey}`;
    body = { from, to: [recipient], reply_to: message.replyTo || undefined, subject: message.subject, text: message.text, html: message.html };
  }
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  const responseText = await response.text().catch(() => "");
  if (!response.ok) throw new Error(`Email provider returned ${response.status}: ${responseText.slice(0, 160)}`);
  return { provider: settings.provider, recipient };
}

function brandedEmail(title, paragraphs, details = []) {
  const detailHtml = details.length ? `<table role="presentation" style="border-collapse:collapse;width:100%;margin:20px 0">${details.map(([label, value]) => `<tr><th style="padding:9px;text-align:left;vertical-align:top;background:#f1f5f9;border:1px solid #cbd5e1">${escapeHtml(label)}</th><td style="padding:9px;white-space:pre-wrap;border:1px solid #cbd5e1">${escapeHtml(value || "Not provided")}</td></tr>`).join("")}</table>` : "";
  return `<!doctype html><html lang="en-GB"><body style="margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif"><div style="max-width:720px;margin:0 auto;padding:28px"><div style="background:#1d4ed8;color:#fff;padding:20px;border-radius:12px 12px 0 0"><strong>Sousa Murray Planeia</strong></div><main style="background:#fff;border:1px solid #cbd5e1;border-top:0;padding:24px;border-radius:0 0 12px 12px"><h1 style="font-size:24px">${escapeHtml(title)}</h1>${paragraphs.map((paragraph) => `<p style="line-height:1.6">${escapeHtml(paragraph)}</p>`).join("")}${detailHtml}<p style="line-height:1.6">Kind regards,<br>Sousa Murray Planeia<br>JA Group Services Ltd</p></main></div></body></html>`;
}

async function deliverNotification(DB, env, notification) {
  const id = crypto.randomUUID();
  await DB.prepare(`
    INSERT INTO enquiry_notifications (id, enquiry_reference, message_id, notification_type, recipient, status)
    VALUES (?, ?, ?, ?, ?, 'Pending')
  `).bind(id, notification.reference, notification.messageId || null, notification.type, cleanEmail(notification.to)).run();
  try {
    const result = await sendProviderEmail(DB, env, notification);
    await DB.prepare(`UPDATE enquiry_notifications SET status = 'Sent', provider = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(result.provider, id).run();
    return true;
  } catch (error) {
    console.error("Enquiry notification failed", notification.type, notification.reference, String(error?.message || error).slice(0, 240));
    await DB.prepare(`UPDATE enquiry_notifications SET status = 'Failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(clean(error?.message || error, 500), id).run();
    return false;
  }
}

export async function sendNewEnquiryNotifications(DB, env, reference) {
  const enquiry = await DB.prepare(`SELECT * FROM enquiries WHERE reference = ?`).bind(reference).first();
  if (!enquiry) return;
  const adminSettings = await providerSettings(DB, env);
  const adminDetails = [
    ["Reference", enquiry.reference], ["Customer", enquiry.name], ["Email", enquiry.email],
    ["Telephone", enquiry.telephone], ["Subject", enquiry.subject], ["Category", enquiry.category],
    ["Booking reference", enquiry.booking_reference], ["Order reference", enquiry.order_reference], ["Message", enquiry.message]
  ];
  const adminOk = await deliverNotification(DB, env, {
    reference, type: "new_admin_notification", to: adminSettings.adminEmail, replyTo: enquiry.email,
    subject: `${reference}: New ${enquiry.category} enquiry from ${enquiry.name}`,
    text: `A new enquiry has been received.\n\nReference: ${reference}\nCustomer: ${enquiry.name}\nEmail: ${enquiry.email}\nTelephone: ${enquiry.telephone || "Not provided"}\nSubject: ${enquiry.subject}\nCategory: ${enquiry.category}\nBooking reference: ${enquiry.booking_reference || "Not provided"}\nOrder reference: ${enquiry.order_reference || "Not provided"}\n\n${enquiry.message}\n\nAdministrator: https://sousamurrayplaneia.jagroupservices.co.uk/admin/?section=enquiries&reference=${encodeURIComponent(reference)}`,
    html: brandedEmail("New customer enquiry", ["A new customer enquiry has been received.", `Open it in the Administrator Control Centre: https://sousamurrayplaneia.jagroupservices.co.uk/admin/?section=enquiries&reference=${encodeURIComponent(reference)}`], adminDetails)
  });
  const customerOk = await deliverNotification(DB, env, {
    reference, type: "customer_confirmation", to: enquiry.email,
    subject: `${reference}: We have received your enquiry`,
    text: `Hello ${enquiry.name},\n\nThank you for contacting Sousa Murray Planeia. We have received your enquiry.\n\nReference: ${reference}\nExpected response time: within 2 working days.\n\nView My Enquiries: https://sousamurrayplaneia.jagroupservices.co.uk/account/enquiries/`,
    html: brandedEmail("We have received your enquiry", [`Hello ${enquiry.name},`, "Thank you for contacting us. We have received your enquiry and normally respond within 2 working days.", `Your reference is ${reference}.`, "View My Enquiries: https://sousamurrayplaneia.jagroupservices.co.uk/account/enquiries/"])
  });
  const status = adminOk && customerOk ? "Sent" : adminOk || customerOk ? "Partially failed" : "Failed";
  await DB.prepare(`UPDATE enquiries SET notification_status = ?, updated_at = CURRENT_TIMESTAMP WHERE reference = ?`).bind(status, reference).run();
}

export async function listAdminEnquiries(DB, filters = {}) {
  await ensureEnquiryTables(DB);
  const clauses = [];
  const values = [];
  const search = clean(filters.search, 120);
  if (search) {
    clauses.push(`(reference LIKE ? OR name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ?)`);
    const term = `%${search}%`;
    values.push(term, term, term, term, term);
  }
  if (ENQUIRY_STATUSES.includes(filters.status)) { clauses.push("status = ?"); values.push(filters.status); }
  if (ENQUIRY_PRIORITIES.includes(filters.priority)) { clauses.push("priority = ?"); values.push(filters.priority); }
  if (ENQUIRY_CATEGORIES.includes(filters.category)) { clauses.push("category = ?"); values.push(filters.category); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await DB.prepare(`SELECT * FROM enquiries ${where} ORDER BY updated_at DESC, created_at DESC LIMIT 500`).bind(...values).all();
  return result.results || [];
}

export async function getEnquiryThread(DB, reference, includeInternal = false) {
  await ensureEnquiryTables(DB);
  const enquiry = await DB.prepare(`SELECT * FROM enquiries WHERE reference = ?`).bind(reference).first();
  if (!enquiry) return null;
  const messages = await DB.prepare(`SELECT * FROM enquiry_messages WHERE enquiry_reference = ? ${includeInternal ? "" : "AND is_internal = 0"} ORDER BY created_at ASC`).bind(reference).all();
  const notifications = includeInternal ? await DB.prepare(`SELECT * FROM enquiry_notifications WHERE enquiry_reference = ? ORDER BY created_at DESC`).bind(reference).all() : { results: [] };
  return { enquiry, messages: messages.results || [], notifications: notifications.results || [] };
}

export async function updateEnquiryAsAdmin(DB, env, body, identity) {
  await ensureEnquiryTables(DB);
  const reference = clean(body.reference, 40);
  const current = await DB.prepare(`SELECT * FROM enquiries WHERE reference = ?`).bind(reference).first();
  if (!current) { const error = new Error("Enquiry not found."); error.status = 404; throw error; }
  const status = ENQUIRY_STATUSES.includes(body.status) ? body.status : current.status;
  const priority = ENQUIRY_PRIORITIES.includes(body.priority) ? body.priority : current.priority;
  const assigned = clean(body.assignedAdmin, 254);
  await DB.prepare(`UPDATE enquiries SET status = ?, priority = ?, assigned_admin = ?, updated_at = CURRENT_TIMESTAMP WHERE reference = ?`).bind(status, priority, assigned || null, reference).run();

  const internalNote = clean(body.internalNote, 6000);
  if (internalNote) {
    await DB.prepare(`INSERT INTO enquiry_messages (id, enquiry_reference, author_type, author_email, message, is_internal) VALUES (?, ?, 'administrator', ?, ?, 1)`).bind(crypto.randomUUID(), reference, identity.email, internalNote).run();
  }
  const reply = clean(body.reply, 6000);
  let messageId = "";
  if (reply) {
    messageId = crypto.randomUUID();
    await DB.prepare(`INSERT INTO enquiry_messages (id, enquiry_reference, author_type, author_email, message, is_internal, notification_status) VALUES (?, ?, 'administrator', ?, ?, 0, 'Pending')`).bind(messageId, reference, identity.email, reply).run();
    const ok = await deliverNotification(DB, env, {
      reference, messageId, type: status === "Awaiting Customer" ? "additional_information_requested" : "administrator_reply", to: current.email,
      subject: `${reference}: Reply from Sousa Murray Planeia`,
      text: `Hello ${current.name},\n\n${reply}\n\nStatus: ${status}\nReference: ${reference}\n\nContinue the conversation: https://sousamurrayplaneia.jagroupservices.co.uk/account/enquiries/`,
      html: brandedEmail("We have replied to your enquiry", [`Hello ${current.name},`, reply, `Status: ${status}`, `Reference: ${reference}`, "Continue the conversation: https://sousamurrayplaneia.jagroupservices.co.uk/account/enquiries/"])
    });
    await DB.prepare(`UPDATE enquiry_messages SET notification_status = ? WHERE id = ?`).bind(ok ? "Sent" : "Failed", messageId).run();
  } else if (status !== current.status) {
    await deliverNotification(DB, env, {
      reference, type: status === "Resolved" ? "enquiry_resolved" : status === "Closed" ? "enquiry_closed" : status === "Awaiting Customer" ? "additional_information_requested" : "status_change", to: current.email,
      subject: `${reference}: Enquiry status updated to ${status}`,
      text: `Hello ${current.name},\n\nThe status of your enquiry is now ${status}.\n\nReference: ${reference}\n\nView My Enquiries: https://sousamurrayplaneia.jagroupservices.co.uk/account/enquiries/`,
      html: brandedEmail("Your enquiry status has changed", [`Hello ${current.name},`, `The status of your enquiry is now ${status}.`, `Reference: ${reference}`, "View My Enquiries: https://sousamurrayplaneia.jagroupservices.co.uk/account/enquiries/"])
    });
  }
  return getEnquiryThread(DB, reference, true);
}

export async function listCustomerEnquiries(DB, email) {
  await ensureEnquiryTables(DB);
  const result = await DB.prepare(`SELECT reference, subject, category, status, priority, created_at, updated_at FROM enquiries WHERE lower(email) = lower(?) OR lower(customer_id) = lower(?) ORDER BY updated_at DESC`).bind(email, email).all();
  return result.results || [];
}

export async function getCustomerEnquiry(DB, reference, email) {
  const thread = await getEnquiryThread(DB, reference, false);
  if (!thread || (cleanEmail(thread.enquiry.email) !== cleanEmail(email) && cleanEmail(thread.enquiry.customer_id) !== cleanEmail(email))) return null;
  return thread;
}

export async function addCustomerReply(DB, env, reference, email, message) {
  const thread = await getCustomerEnquiry(DB, reference, email);
  if (!thread) { const error = new Error("Enquiry not found."); error.status = 404; throw error; }
  const reply = clean(message, 6000);
  if (reply.length < 2) { const error = new Error("Enter a reply."); error.status = 400; throw error; }
  const messageId = crypto.randomUUID();
  await DB.prepare(`INSERT INTO enquiry_messages (id, enquiry_reference, author_type, author_email, message, is_internal, notification_status) VALUES (?, ?, 'customer', ?, ?, 0, 'Pending')`).bind(messageId, reference, email, reply).run();
  await DB.prepare(`UPDATE enquiries SET status = CASE WHEN status IN ('Resolved', 'Closed') THEN 'Open' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE reference = ?`).bind(reference).run();
  const settings = await providerSettings(DB, env);
  const ok = await deliverNotification(DB, env, {
    reference, messageId, type: "customer_reply", to: settings.adminEmail, replyTo: email,
    subject: `${reference}: Customer reply from ${thread.enquiry.name}`,
    text: `${thread.enquiry.name} replied to enquiry ${reference}:\n\n${reply}\n\nAdministrator: https://sousamurrayplaneia.jagroupservices.co.uk/admin/?section=enquiries&reference=${encodeURIComponent(reference)}`,
    html: brandedEmail("Customer reply received", [`${thread.enquiry.name} replied to enquiry ${reference}.`, reply, `Open in the Administrator Control Centre: https://sousamurrayplaneia.jagroupservices.co.uk/admin/?section=enquiries&reference=${encodeURIComponent(reference)}`])
  });
  await DB.prepare(`UPDATE enquiry_messages SET notification_status = ? WHERE id = ?`).bind(ok ? "Sent" : "Failed", messageId).run();
  return getCustomerEnquiry(DB, reference, email);
}
