import { isSameOriginRequest } from "../../_shared/enquiries.js";
import { getNativeSession } from "../../_shared/oidc.js";

const OWNER_EMAIL = "alfieholywoodmurray@jagroupservices.co.uk";
const SESSION_MINUTES = 15;
const EMAIL_CODE_MINUTES = 10;
const REQUEST_MINUTES = 60;
const APPROVAL_MINUTES = 15;

const REASONS = [
  { value: "pin_unavailable", label: "Customer cannot access their Support PIN" },
  { value: "pin_locked", label: "Support PIN is locked or repeatedly failing" },
  { value: "accessibility_adjustment", label: "Accessibility or reasonable-adjustment requirement" },
  { value: "account_recovery", label: "Account recovery or loss of account access" },
  { value: "incident_response", label: "Security or operational incident response" },
  { value: "legal_compliance", label: "Legal, regulatory or data-protection requirement" },
  { value: "supervisor_directed", label: "Supervisor-directed support action" },
  { value: "other", label: "Other exceptional reason" },
];

const CHANNELS = [
  { value: "inbound_phone", label: "Inbound telephone support" },
  { value: "outbound_callback", label: "Verified outbound callback" },
  { value: "live_chat", label: "Authenticated live chat" },
  { value: "email_case", label: "Existing email support case" },
  { value: "internal_investigation", label: "Internal investigation or incident" },
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Cookie",
    },
  });
}

function clean(value, max = 2000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function cleanEmail(value) {
  const email = clean(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function maskEmail(value) {
  const email = cleanEmail(value);
  if (!email) return "registered email address";
  const [local, domain] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

function configuredOwners(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || OWNER_EMAIL)
    .split(",").map(item => item.trim().toLowerCase()).filter(Boolean);
}

function parsePermissions(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(item => String(item)) : [];
  } catch {
    return [];
  }
}

function canonicalRole(value) {
  const role = clean(value, 100);
  if (role === "Admin") return "Senior Administrator";
  return role || "Auditor";
}

function approverRole(role) {
  return ["Platform Owner", "System Administrator", "Supervisor", "Senior Administrator"].includes(canonicalRole(role));
}

async function adminContext(DB, identity, env) {
  const email = cleanEmail(identity?.email);
  if (!email) return { authenticated: false, authorised: false };
  const owner = configuredOwners(env).includes(email);
  const row = await DB.prepare("SELECT email,name,role,status,permissions FROM admin_users WHERE lower(email)=lower(?)")
    .bind(email).first().catch(() => null);
  if (!owner && (!row || ["blocked", "closed", "disabled", "inactive", "suspended"].includes(clean(row.status || "Active", 80).toLowerCase()))) {
    return { authenticated: true, authorised: false };
  }
  const role = owner ? "Platform Owner" : canonicalRole(row?.role);
  let permissions = owner ? ["*"] : parsePermissions(row?.permissions);
  if (!permissions.length && row?.role) {
    const result = await DB.prepare("SELECT permission_code FROM role_permissions WHERE role_name=?")
      .bind(row.role).all().catch(() => ({ results: [] }));
    permissions = (result.results || []).map(item => String(item.permission_code || "")).filter(Boolean);
  }
  const authorised = permissions.includes("*") || permissions.includes("manage_crm") || permissions.includes("manage_users");
  const canApprove = permissions.includes("*") || permissions.includes("approve_crm_identity_override") || approverRole(role);
  return {
    authenticated: true,
    authorised,
    email,
    name: clean(row?.name || identity?.name || email, 180),
    role,
    permissions,
    canApprove,
  };
}

async function safeAlter(DB, sql) {
  try { await DB.prepare(sql).run(); } catch { /* additive migration already applied */ }
}

async function ensureTables(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS customer_identity_verification_sessions (
    id TEXT PRIMARY KEY, customer_email TEXT NOT NULL, admin_email TEXT NOT NULL,
    method TEXT NOT NULL, verified_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL, ended_at TEXT
  )`).run();
  await safeAlter(DB, "ALTER TABLE customer_identity_verification_sessions ADD COLUMN assurance_level TEXT DEFAULT 'standard'");
  await safeAlter(DB, "ALTER TABLE customer_identity_verification_sessions ADD COLUMN reason_code TEXT");
  await safeAlter(DB, "ALTER TABLE customer_identity_verification_sessions ADD COLUMN reason_detail TEXT");
  await safeAlter(DB, "ALTER TABLE customer_identity_verification_sessions ADD COLUMN support_channel TEXT");
  await safeAlter(DB, "ALTER TABLE customer_identity_verification_sessions ADD COLUMN case_reference TEXT");
  await safeAlter(DB, "ALTER TABLE customer_identity_verification_sessions ADD COLUMN approved_by TEXT");
  await safeAlter(DB, "ALTER TABLE customer_identity_verification_sessions ADD COLUMN source_request_id TEXT");

  await DB.prepare(`CREATE TABLE IF NOT EXISTS customer_support_email_codes (
    id TEXT PRIMARY KEY, customer_email TEXT NOT NULL, admin_email TEXT NOT NULL,
    code_hash TEXT NOT NULL, code_salt TEXT NOT NULL, sent_to TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active', attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5, expires_at TEXT NOT NULL,
    verified_at TEXT, revoked_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_customer_support_email_codes_lookup ON customer_support_email_codes(customer_email,admin_email,created_at)").run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS customer_identity_override_requests (
    id TEXT PRIMARY KEY, customer_email TEXT NOT NULL, requested_by TEXT NOT NULL,
    requester_role TEXT, reason_code TEXT NOT NULL, reason_detail TEXT NOT NULL,
    support_channel TEXT NOT NULL, case_reference TEXT,
    status TEXT NOT NULL DEFAULT 'Pending', requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL, reviewed_by TEXT, reviewed_at TEXT, review_note TEXT,
    approved_until TEXT, consumed_at TEXT
  )`).run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_identity_override_requests_customer ON customer_identity_override_requests(customer_email,status,requested_at)").run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS admin_security_pins (
    admin_email TEXT PRIMARY KEY, pin_hash TEXT NOT NULL, failed_attempts INTEGER DEFAULT 0,
    locked_until TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY, actor_email TEXT, action TEXT, entity_type TEXT,
    entity_id TEXT, summary TEXT, metadata TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function audit(DB, admin, action, customerEmail, summary, metadata = {}) {
  await DB.prepare(`INSERT INTO admin_audit_log
    (id,actor_email,action,entity_type,entity_id,summary,metadata)
    VALUES (?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), admin.email, clean(action, 120), "customer_identity_verification",
      cleanEmail(customerEmail), clean(summary, 1000), JSON.stringify(metadata)
    ).run();
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ""));
  const b = new TextEncoder().encode(String(right || ""));
  let diff = a.length ^ b.length;
  const size = Math.max(a.length, b.length);
  for (let index = 0; index < size; index += 1) diff |= (a[index] || 0) ^ (b[index] || 0);
  return diff === 0;
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function adminPinMac(env, pin, salt) {
  const pepper = clean(env.ADMIN_PIN_PEPPER || env.ADMIN_OIDC_CLIENT_SECRET, 1000);
  if (!pepper) throw new Error("Administrator PIN security is not configured.");
  return hmacHex(pepper, `${salt}:${pin}`);
}

function parseAdminPinHash(storedHash) {
  const value = clean(storedHash, 500);
  const [scheme, salt, expected] = value.split("$");
  if (scheme === "hmac_sha256" && salt && expected) return { salt, expected };
  const prefix = "hmac_sha256";
  if (value.startsWith(prefix) && value.length === prefix.length + 36 + 64) {
    return { salt: value.slice(prefix.length, prefix.length + 36), expected: value.slice(prefix.length + 36) };
  }
  return null;
}

async function verifySecretHash(value, storedHash) {
  const hash = clean(storedHash, 500);
  if (!hash) return false;
  if (hash.startsWith("pbkdf2_sha256$")) {
    const [, iterations, salt, expected] = hash.split("$");
    if (!iterations || !salt || !expected) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(value || "")), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: Number(iterations), hash: "SHA-256" }, key, 256);
    const actual = Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, "0")).join("");
    return timingSafeEqual(actual, expected);
  }
  return timingSafeEqual(await sha256Hex(value), hash);
}

async function verifyScopedAdminPin(DB, env, admin, pin, customerEmail, purpose) {
  const supplied = clean(pin, 4);
  if (!/^\d{4}$/.test(supplied)) throw new Error("Enter your four-digit administrator PIN.");
  const record = await DB.prepare("SELECT * FROM admin_security_pins WHERE lower(admin_email)=lower(?)")
    .bind(admin.email).first();
  if (!record) throw new Error("Create your individual administrator PIN in Admin Security before using CRM override.");
  if (record.locked_until && Date.parse(record.locked_until) > Date.now()) throw new Error("Administrator PIN access is temporarily locked.");
  const parsed = parseAdminPinHash(record.pin_hash);
  const valid = parsed
    ? timingSafeEqual(await adminPinMac(env, supplied, parsed.salt), parsed.expected)
    : await verifySecretHash(supplied, record.pin_hash);
  if (!valid) {
    const attempts = Number(record.failed_attempts || 0) + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    await DB.prepare("UPDATE admin_security_pins SET failed_attempts=?,locked_until=?,updated_at=CURRENT_TIMESTAMP WHERE lower(admin_email)=lower(?)")
      .bind(lockedUntil ? 0 : attempts, lockedUntil, admin.email).run();
    await audit(DB, admin, "crm_scoped_admin_pin_failed", customerEmail, "Administrator PIN verification failed for a customer-specific CRM action.", { purpose, attempts, locked: Boolean(lockedUntil) });
    throw new Error(lockedUntil ? "Too many incorrect attempts. Administrator PIN access is locked for 15 minutes." : "The administrator PIN is incorrect.");
  }
  await DB.prepare("UPDATE admin_security_pins SET failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE lower(admin_email)=lower(?)")
    .bind(admin.email).run();
  await audit(DB, admin, "crm_scoped_admin_pin_verified", customerEmail, "Administrator PIN re-entered for a customer-specific CRM action.", { purpose });
}

async function createSession(DB, admin, customerEmail, details) {
  const email = cleanEmail(customerEmail);
  await DB.prepare(`UPDATE customer_identity_verification_sessions SET ended_at=CURRENT_TIMESTAMP
    WHERE lower(customer_email)=lower(?) AND lower(admin_email)=lower(?) AND ended_at IS NULL`)
    .bind(email, admin.email).run();
  const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60 * 1000).toISOString();
  await DB.prepare(`INSERT INTO customer_identity_verification_sessions
    (id,customer_email,admin_email,method,expires_at,assurance_level,reason_code,reason_detail,
     support_channel,case_reference,approved_by,source_request_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), email, admin.email, clean(details.method, 100), expiresAt,
      clean(details.assuranceLevel || "standard", 40), clean(details.reasonCode, 80) || null,
      clean(details.reasonDetail, 1500) || null, clean(details.supportChannel, 80) || null,
      clean(details.caseReference, 120) || null, cleanEmail(details.approvedBy) || null,
      clean(details.sourceRequestId, 120) || null
    ).run();
  return expiresAt;
}

async function verificationState(DB, admin, customerEmail) {
  const session = await DB.prepare(`SELECT * FROM customer_identity_verification_sessions
    WHERE lower(customer_email)=lower(?) AND lower(admin_email)=lower(?)
      AND ended_at IS NULL AND datetime(expires_at)>datetime('now')
    ORDER BY verified_at DESC LIMIT 1`).bind(cleanEmail(customerEmail), admin.email).first().catch(() => null);
  return {
    verified: Boolean(session),
    method: session?.method || "",
    assuranceLevel: session?.assurance_level || "",
    verifiedAt: session?.verified_at || null,
    expiresAt: session?.expires_at || null,
    reasonCode: session?.reason_code || "",
    approvedBy: session?.approved_by || "",
  };
}

function validateGovernance(body) {
  const reasonCode = clean(body.reasonCode || body.reason_code, 80);
  const reason = REASONS.find(item => item.value === reasonCode);
  if (!reason) throw new Error("Select a recognised override reason.");
  const supportChannel = clean(body.supportChannel || body.support_channel, 80);
  if (!CHANNELS.some(item => item.value === supportChannel)) throw new Error("Select the support or investigation channel.");
  const reasonDetail = clean(body.reasonDetail || body.reason_detail, 1500);
  if (reasonDetail.length < 20) throw new Error("Enter a professional justification of at least 20 characters.");
  const caseReference = clean(body.caseReference || body.case_reference, 120);
  if (["incident_response", "legal_compliance"].includes(reasonCode) && caseReference.length < 3) {
    throw new Error("A case, incident or legal reference is required for this reason.");
  }
  return { reasonCode, reasonLabel: reason.label, reasonDetail, supportChannel, caseReference };
}

async function customerExists(DB, email) {
  return DB.prepare("SELECT email,verified_name,display_name FROM profiles WHERE lower(email)=lower(?)").bind(email).first();
}

async function providerSettings(DB, env) {
  const keys = ["email_provider","email_api_key","email_api_endpoint","smtp_from_name","smtp_from_email"];
  const rows = await DB.prepare(`SELECT key,value FROM site_settings WHERE key IN (${keys.map(() => "?").join(",")})`)
    .bind(...keys).all().catch(() => ({ results: [] }));
  const stored = Object.fromEntries((rows.results || []).map(row => [row.key, row.value]));
  return {
    provider: clean(stored.email_provider || env.EMAIL_PROVIDER || "resend", 40).toLowerCase(),
    apiKey: clean(stored.email_api_key || env.EMAIL_API_TOKEN || env.RESEND_API_KEY || env.SENDGRID_API_KEY || env.POSTMARK_API_KEY || env.BREVO_API_KEY, 1000),
    endpoint: clean(stored.email_api_endpoint || env.EMAIL_API_ENDPOINT, 500),
    fromName: clean(stored.smtp_from_name || "Planyx", 120),
    fromEmail: cleanEmail(stored.smtp_from_email || env.EMAIL_FROM || "noreply@jagroupservices.co.uk"),
  };
}

async function sendEmail(DB, env, message) {
  const settings = await providerSettings(DB, env);
  if (!settings.fromEmail) throw new Error("The sender email address is not configured.");
  if (!settings.apiKey && settings.provider !== "mailchannels") throw new Error("The email provider API key is not configured.");
  const from = `${settings.fromName} <${settings.fromEmail}>`;
  let endpoint = settings.endpoint;
  const headers = { "Content-Type": "application/json" };
  let payload;
  if (settings.provider === "sendgrid") {
    endpoint ||= "https://api.sendgrid.com/v3/mail/send";
    headers.Authorization = `Bearer ${settings.apiKey}`;
    payload = { personalizations: [{ to: [{ email: message.to }] }], from: { email: settings.fromEmail, name: settings.fromName }, subject: message.subject, content: [{ type: "text/plain", value: message.text }, { type: "text/html", value: message.html }] };
  } else if (settings.provider === "postmark") {
    endpoint ||= "https://api.postmarkapp.com/email";
    headers["X-Postmark-Server-Token"] = settings.apiKey;
    payload = { From: from, To: message.to, Subject: message.subject, TextBody: message.text, HtmlBody: message.html };
  } else if (settings.provider === "brevo") {
    endpoint ||= "https://api.brevo.com/v3/smtp/email";
    headers["api-key"] = settings.apiKey;
    payload = { sender: { name: settings.fromName, email: settings.fromEmail }, to: [{ email: message.to }], subject: message.subject, textContent: message.text, htmlContent: message.html };
  } else if (settings.provider === "mailchannels") {
    endpoint ||= "https://api.mailchannels.net/tx/v1/send";
    payload = { personalizations: [{ to: [{ email: message.to }] }], from: { email: settings.fromEmail, name: settings.fromName }, subject: message.subject, content: [{ type: "text/plain", value: message.text }, { type: "text/html", value: message.html }] };
  } else {
    endpoint ||= "https://api.resend.com/emails";
    headers.Authorization = `Bearer ${settings.apiKey}`;
    payload = { from, to: message.to, subject: message.subject, text: message.text, html: message.html };
  }
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
  const responseText = await response.text().catch(() => "");
  if (!response.ok) throw new Error(`Email provider returned ${response.status}: ${responseText.slice(0, 180)}`);
  return { provider: settings.provider, status: response.status };
}

function randomSixDigitCode() {
  const maximum = 0x100000000;
  const limit = maximum - (maximum % 1000000);
  const values = new Uint32Array(1);
  do { crypto.getRandomValues(values); } while (values[0] >= limit);
  return String(values[0] % 1000000).padStart(6, "0");
}

async function emailCodeHash(env, salt, code) {
  const secret = clean(env.CUSTOMER_VERIFICATION_CODE_PEPPER || env.ADMIN_PIN_PEPPER || env.ADMIN_OIDC_CLIENT_SECRET, 1000);
  if (!secret) throw new Error("Customer verification-code security is not configured.");
  return hmacHex(secret, `${salt}:${code}`);
}

async function sendCustomerEmailCode(DB, env, admin, customerEmail) {
  const email = cleanEmail(customerEmail);
  const profile = await customerExists(DB, email);
  if (!profile) throw new Error("Customer profile not found.");
  const latest = await DB.prepare(`SELECT created_at FROM customer_support_email_codes
    WHERE lower(customer_email)=lower(?) AND lower(admin_email)=lower(?) ORDER BY created_at DESC LIMIT 1`)
    .bind(email, admin.email).first().catch(() => null);
  if (latest?.created_at && Date.now() - Date.parse(latest.created_at) < 60_000) throw new Error("Wait one minute before sending another code.");
  const recent = await DB.prepare(`SELECT COUNT(*) AS count FROM customer_support_email_codes
    WHERE lower(customer_email)=lower(?) AND lower(admin_email)=lower(?)
      AND datetime(created_at)>datetime('now','-30 minutes')`).bind(email, admin.email).first();
  if (Number(recent?.count || 0) >= 3) throw new Error("Too many codes have been sent. Try again in 30 minutes.");

  await DB.prepare(`UPDATE customer_support_email_codes SET status='Revoked',revoked_at=CURRENT_TIMESTAMP
    WHERE lower(customer_email)=lower(?) AND lower(admin_email)=lower(?) AND status='Active'`)
    .bind(email, admin.email).run();
  const code = randomSixDigitCode();
  const salt = crypto.randomUUID();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + EMAIL_CODE_MINUTES * 60 * 1000).toISOString();
  const codeHash = await emailCodeHash(env, salt, code);
  await DB.prepare(`INSERT INTO customer_support_email_codes
    (id,customer_email,admin_email,code_hash,code_salt,sent_to,expires_at)
    VALUES (?,?,?,?,?,?,?)`).bind(id, email, admin.email, codeHash, salt, email, expiresAt).run();
  try {
    await sendEmail(DB, env, {
      to: email,
      subject: "Your Planyx support verification code",
      text: `Your Planyx support verification code is ${code}. It expires in ${EMAIL_CODE_MINUTES} minutes and can be used once. Only use this code during a Planyx support conversation you initiated or expected. Planyx will never ask for your Microsoft password.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0b172d"><h1 style="font-size:22px">Planyx support verification</h1><p>Your one-time support code is:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:18px;text-align:center">${code}</p><p>This code expires in ${EMAIL_CODE_MINUTES} minutes and can be used once.</p><p style="font-size:13px;color:#475569">Only use it during a Planyx support conversation you initiated or expected. Planyx will never ask for your Microsoft password.</p></div>`,
    });
  } catch (error) {
    await DB.prepare("UPDATE customer_support_email_codes SET status='Delivery failed',revoked_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
    await audit(DB, admin, "customer_email_verification_code_delivery_failed", email, "Customer support verification-code delivery failed.", { code_id: id, error: clean(error?.message, 240) });
    throw error;
  }
  await audit(DB, admin, "customer_email_verification_code_sent", email, "Sent a one-time support verification code to the registered customer email.", { code_id: id, recipient: maskEmail(email), expires_at: expiresAt });
  return { codeId: id, sentTo: maskEmail(email), expiresAt };
}

async function verifyCustomerEmailCode(DB, env, admin, customerEmail, submittedCode) {
  const email = cleanEmail(customerEmail);
  const code = clean(submittedCode, 6);
  if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit code sent to the customer.");
  const record = await DB.prepare(`SELECT * FROM customer_support_email_codes
    WHERE lower(customer_email)=lower(?) AND lower(admin_email)=lower(?) AND status='Active'
    ORDER BY created_at DESC LIMIT 1`).bind(email, admin.email).first();
  if (!record) throw new Error("No active email verification code was found. Send a new code.");
  if (Date.parse(record.expires_at) <= Date.now()) {
    await DB.prepare("UPDATE customer_support_email_codes SET status='Expired',revoked_at=CURRENT_TIMESTAMP WHERE id=?").bind(record.id).run();
    throw new Error("The email verification code has expired.");
  }
  if (Number(record.attempts || 0) >= Number(record.max_attempts || 5)) throw new Error("That code has been locked after too many attempts. Send a new code.");
  const valid = timingSafeEqual(await emailCodeHash(env, record.code_salt, code), record.code_hash);
  if (!valid) {
    const attempts = Number(record.attempts || 0) + 1;
    const exhausted = attempts >= Number(record.max_attempts || 5);
    await DB.prepare("UPDATE customer_support_email_codes SET attempts=?,status=?,revoked_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE revoked_at END WHERE id=?")
      .bind(attempts, exhausted ? "Locked" : "Active", exhausted ? 1 : 0, record.id).run();
    await audit(DB, admin, "customer_email_verification_code_failed", email, "Registered-email support verification failed.", { code_id: record.id, attempts, locked: exhausted });
    throw new Error(exhausted ? "Too many incorrect attempts. Send a new code." : "The email verification code is incorrect.");
  }
  await DB.prepare("UPDATE customer_support_email_codes SET status='Verified',verified_at=CURRENT_TIMESTAMP WHERE id=?").bind(record.id).run();
  const expiresAt = await createSession(DB, admin, email, { method: "Registered email support code", assuranceLevel: "support-standard", supportChannel: "phone_support" });
  await audit(DB, admin, "customer_identity_verified_email_code", email, "Verified customer control of the registered email during a support interaction.", { code_id: record.id, expires_at: expiresAt, assurance: "support-standard" });
  return expiresAt;
}

async function verifySupportPin(DB, admin, customerEmail, submittedPin) {
  const email = cleanEmail(customerEmail);
  const pin = clean(submittedPin, 6);
  if (!/^\d{6}$/.test(pin)) throw new Error("Enter the customer’s six-digit Support PIN.");
  const record = await DB.prepare(`SELECT * FROM customer_support_pins_v2
    WHERE lower(email)=lower(?) ORDER BY created_at DESC LIMIT 1`).bind(email).first();
  if (!record) throw new Error("No active Support PIN was found for this customer.");
  if (record.revoked_at || ["Revoked", "Verified", "Used"].includes(record.status) || record.used_at) throw new Error("The Support PIN is no longer available.");
  if (record.expires_at && Date.parse(record.expires_at) <= Date.now()) {
    await DB.prepare("UPDATE customer_support_pins_v2 SET status='Expired',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(record.id).run();
    throw new Error("The Support PIN has expired.");
  }
  const valid = await verifySecretHash(pin, record.pin_hash);
  if (!valid) {
    await audit(DB, admin, "customer_support_pin_failed", email, "Customer Support PIN verification failed.", { pin_id: record.id });
    throw new Error("The Support PIN could not be verified.");
  }
  const now = new Date().toISOString();
  await DB.prepare("UPDATE customer_support_pins_v2 SET status='Verified',used_at=?,last_used_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(now, now, record.id).run();
  const expiresAt = await createSession(DB, admin, email, { method: "Support PIN", assuranceLevel: "support-standard" });
  await audit(DB, admin, "customer_identity_verified_support_pin", email, "Verified customer identity using the single-use Support PIN.", { pin_id: record.id, expires_at: expiresAt });
  return expiresAt;
}

async function notifyApprovers(DB, env, request, profile) {
  const result = await DB.prepare(`SELECT email FROM admin_users
    WHERE lower(COALESCE(status,'Active'))='active'
      AND role IN ('Platform Owner','System Administrator','Supervisor','Senior Administrator')
    ORDER BY email LIMIT 12`).all().catch(() => ({ results: [] }));
  let sent = 0;
  for (const row of result.results || []) {
    const to = cleanEmail(row.email);
    if (!to || to === request.requested_by) continue;
    try {
      await sendEmail(DB, env, {
        to,
        subject: "Planyx CRM override approval required",
        text: `${request.requested_by} has requested supervised access to ${request.customer_email}. Reason: ${request.reason_code}. Request ${request.id} expires at ${request.expires_at}. Review it in Customer CRM.`,
        html: `<div style="font-family:Arial,sans-serif;color:#0b172d"><h2>CRM override approval required</h2><p><strong>Requested by:</strong> ${request.requested_by}</p><p><strong>Customer:</strong> ${request.customer_email}</p><p><strong>Reason:</strong> ${request.reason_code}</p><p><strong>Request:</strong> ${request.id}</p><p>Open the customer’s CRM Security tab to approve or reject it.</p></div>`,
      });
      sent += 1;
    } catch { /* the request remains available in the approval queue */ }
  }
  return sent;
}

async function requestOverride(DB, env, admin, customerEmail, body) {
  if (admin.canApprove) throw new Error("Your role can authorise a customer-specific override directly after re-entering your PIN.");
  const governance = validateGovernance(body);
  const email = cleanEmail(customerEmail);
  await DB.prepare(`UPDATE customer_identity_override_requests SET status='Expired'
    WHERE lower(customer_email)=lower(?) AND lower(requested_by)=lower(?) AND status='Pending'
      AND datetime(expires_at)<=datetime('now')`).bind(email, admin.email).run();
  const existing = await DB.prepare(`SELECT * FROM customer_identity_override_requests
    WHERE lower(customer_email)=lower(?) AND lower(requested_by)=lower(?) AND status IN ('Pending','Approved')
      AND datetime(expires_at)>datetime('now') ORDER BY requested_at DESC LIMIT 1`).bind(email, admin.email).first();
  if (existing) return existing;
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REQUEST_MINUTES * 60 * 1000).toISOString();
  await DB.prepare(`INSERT INTO customer_identity_override_requests
    (id,customer_email,requested_by,requester_role,reason_code,reason_detail,support_channel,case_reference,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(
      id, email, admin.email, admin.role, governance.reasonCode, governance.reasonDetail,
      governance.supportChannel, governance.caseReference || null, expiresAt
    ).run();
  const request = await DB.prepare("SELECT * FROM customer_identity_override_requests WHERE id=?").bind(id).first();
  const notificationsSent = await notifyApprovers(DB, env, request, await customerExists(DB, email));
  await audit(DB, admin, "customer_identity_override_requested", email, "Requested supervisor approval for a customer-specific CRM identity override.", { request_id: id, ...governance, expires_at: expiresAt, supervisor_notifications_sent: notificationsSent });
  return { ...request, notifications_sent: notificationsSent };
}

async function reviewOverride(DB, env, admin, body) {
  if (!admin.canApprove) throw new Error("Supervisor or platform-level approval is required.");
  const requestId = clean(body.requestId || body.request_id, 120);
  const decision = clean(body.decision, 20).toLowerCase();
  if (!["approve", "reject"].includes(decision)) throw new Error("Choose approve or reject.");
  const reviewNote = clean(body.reviewNote || body.review_note, 1000);
  if (reviewNote.length < 10) throw new Error("Enter a review note of at least 10 characters.");
  const request = await DB.prepare("SELECT * FROM customer_identity_override_requests WHERE id=?").bind(requestId).first();
  if (!request || request.status !== "Pending") throw new Error("That override request is no longer pending.");
  if (Date.parse(request.expires_at) <= Date.now()) throw new Error("That override request has expired.");
  if (cleanEmail(request.requested_by) === admin.email) throw new Error("You cannot approve your own override request.");
  await verifyScopedAdminPin(DB, env, admin, body.adminPin || body.admin_pin, request.customer_email, `override_${decision}`);
  const approvedUntil = decision === "approve" ? new Date(Date.now() + APPROVAL_MINUTES * 60 * 1000).toISOString() : null;
  await DB.prepare(`UPDATE customer_identity_override_requests SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,
    review_note=?,approved_until=? WHERE id=?`).bind(decision === "approve" ? "Approved" : "Rejected", admin.email, reviewNote, approvedUntil, requestId).run();
  await audit(DB, admin, `customer_identity_override_${decision}d`, request.customer_email, `${decision === "approve" ? "Approved" : "Rejected"} a supervised CRM identity override request.`, { request_id: requestId, requested_by: request.requested_by, review_note: reviewNote, approved_until: approvedUntil });
  try {
    await sendEmail(DB, env, {
      to: request.requested_by,
      subject: `Planyx CRM override ${decision === "approve" ? "approved" : "rejected"}`,
      text: `Your CRM override request ${requestId} for ${request.customer_email} was ${decision === "approve" ? "approved" : "rejected"} by ${admin.email}. ${decision === "approve" ? "Re-enter your own administrator PIN before the approval expires." : "Review the supervisor note in Customer CRM."}`,
      html: `<div style="font-family:Arial,sans-serif;color:#0b172d"><h2>CRM override ${decision === "approve" ? "approved" : "rejected"}</h2><p>Request ${requestId} was reviewed by ${admin.email}.</p><p>${decision === "approve" ? "Return to Customer CRM and re-enter your own administrator PIN before the approval expires." : "Review the supervisor note in Customer CRM."}</p></div>`,
    });
  } catch { /* on-screen queue remains authoritative */ }
  return DB.prepare("SELECT * FROM customer_identity_override_requests WHERE id=?").bind(requestId).first();
}

async function authoriseOverride(DB, env, admin, customerEmail, body) {
  const governance = validateGovernance(body);
  const email = cleanEmail(customerEmail);
  await verifyScopedAdminPin(DB, env, admin, body.adminPin || body.admin_pin, email, "customer_crm_override");
  let approvedBy = admin.email;
  let sourceRequestId = "";
  if (!admin.canApprove) {
    const requestId = clean(body.requestId || body.request_id, 120);
    const request = await DB.prepare(`SELECT * FROM customer_identity_override_requests WHERE id=?
      AND lower(customer_email)=lower(?) AND lower(requested_by)=lower(?)`).bind(requestId, email, admin.email).first();
    if (!request || request.status !== "Approved" || !request.approved_until || Date.parse(request.approved_until) <= Date.now()) {
      throw new Error("An active supervisor approval is required before this override can be completed.");
    }
    approvedBy = cleanEmail(request.reviewed_by);
    sourceRequestId = request.id;
    await DB.prepare("UPDATE customer_identity_override_requests SET status='Consumed',consumed_at=CURRENT_TIMESTAMP WHERE id=?").bind(request.id).run();
  }
  const expiresAt = await createSession(DB, admin, email, {
    method: admin.canApprove ? "Privileged administrator override" : "Supervisor-approved administrator override",
    assuranceLevel: "privileged-override",
    reasonCode: governance.reasonCode,
    reasonDetail: governance.reasonDetail,
    supportChannel: governance.supportChannel,
    caseReference: governance.caseReference,
    approvedBy,
    sourceRequestId,
  });
  await audit(DB, admin, "customer_identity_override_authorised", email, "Opened customer-specific CRM access using a governed administrator override.", { ...governance, approved_by: approvedBy, request_id: sourceRequestId || null, expires_at: expiresAt });
  return expiresAt;
}

async function getPayload(DB, admin, customerEmail) {
  const email = cleanEmail(customerEmail);
  const ownRequest = await DB.prepare(`SELECT * FROM customer_identity_override_requests
    WHERE lower(customer_email)=lower(?) AND lower(requested_by)=lower(?)
      AND status IN ('Pending','Approved') ORDER BY requested_at DESC LIMIT 1`).bind(email, admin.email).first().catch(() => null);
  const pending = admin.canApprove
    ? await DB.prepare(`SELECT * FROM customer_identity_override_requests
        WHERE lower(customer_email)=lower(?) AND status='Pending' AND datetime(expires_at)>datetime('now')
        ORDER BY requested_at ASC LIMIT 20`).bind(email).all().catch(() => ({ results: [] }))
    : { results: [] };
  return {
    success: true,
    customerEmail: email,
    admin: { email: admin.email, name: admin.name, role: admin.role, canApproveOverride: admin.canApprove },
    verification: await verificationState(DB, admin, email),
    override: { ownRequest: ownRequest || null, pendingForReview: pending.results || [] },
    reasons: REASONS,
    channels: CHANNELS,
    policy: {
      sessionMinutes: SESSION_MINUTES,
      emailCodeMinutes: EMAIL_CODE_MINUTES,
      requiresPinPerCustomer: true,
      emailCodeAssurance: "Registered-email support verification; not account MFA",
    },
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const correlationId = clean(request.headers.get("cf-ray") || request.headers.get("x-request-id") || crypto.randomUUID(), 120);
  if (!env.DB) return json({ success: false, error: "The Customer CRM verification database is unavailable.", correlationId }, 500);
  try {
    const identity = await getNativeSession(request, env, "admin");
    const admin = await adminContext(env.DB, identity, env);
    if (!admin.authenticated) return json({ success: false, error: "Your administrator session has expired.", code: "SESSION_EXPIRED", correlationId }, 401);
    if (!admin.authorised) return json({ success: false, error: "You do not have permission to verify customer identity or access Customer CRM.", code: "FORBIDDEN", correlationId }, 403);
    await ensureTables(env.DB);

    const url = new URL(request.url);
    const customerEmail = cleanEmail(url.searchParams.get("customer_email") || (request.method === "GET" ? "" : undefined));
    if (request.method === "GET") {
      if (!customerEmail || !(await customerExists(env.DB, customerEmail))) return json({ success: false, error: "Customer profile not found.", correlationId }, 404);
      return json({ ...(await getPayload(env.DB, admin, customerEmail)), correlationId });
    }
    if (request.method !== "POST") return json({ success: false, error: "Method not allowed.", correlationId }, 405);
    if (!isSameOriginRequest(request)) return json({ success: false, error: "This request could not be verified.", correlationId }, 403);
    const body = await request.json().catch(() => ({}));
    const email = cleanEmail(body.customerEmail || body.customer_email);
    if (!email || !(await customerExists(env.DB, email))) return json({ success: false, error: "Customer profile not found.", correlationId }, 404);
    const action = clean(body.action, 80);

    if (action === "verify_support_pin") await verifySupportPin(env.DB, admin, email, body.pin);
    else if (action === "send_email_code") await sendCustomerEmailCode(env.DB, env, admin, email);
    else if (action === "verify_email_code") await verifyCustomerEmailCode(env.DB, env, admin, email, body.code);
    else if (action === "request_override") await requestOverride(env.DB, env, admin, email, body);
    else if (action === "review_override") await reviewOverride(env.DB, env, admin, body);
    else if (action === "authorise_override") await authoriseOverride(env.DB, env, admin, email, body);
    else if (action === "end_verification") {
      await env.DB.prepare(`UPDATE customer_identity_verification_sessions SET ended_at=CURRENT_TIMESTAMP
        WHERE lower(customer_email)=lower(?) AND lower(admin_email)=lower(?) AND ended_at IS NULL`).bind(email, admin.email).run();
      await audit(env.DB, admin, "customer_identity_verification_ended", email, "Ended the administrator’s customer-specific verification session.", {});
    } else return json({ success: false, error: "Unknown Customer CRM verification action.", correlationId }, 400);

    return json({ ...(await getPayload(env.DB, admin, email)), saved: true, correlationId });
  } catch (error) {
    console.error(JSON.stringify({ event: "customer_crm_verification_failed", correlation_id: correlationId, error: error instanceof Error ? error.message : "Unknown error" }));
    return json({ success: false, error: error instanceof Error ? error.message : "Customer verification could not be completed.", correlationId }, 400);
  }
}
