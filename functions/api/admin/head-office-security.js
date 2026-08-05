import { getNativeSession } from "../../_shared/oidc.js";
import { HEAD_OFFICE_SECURITY_CONTRACT, readHeadOfficeSecurityForEmail } from "../../_shared/customerops-central.js";

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

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function configuredAdmins(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || "alfieholywoodmurray@jagroupservices.co.uk")
    .split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
}

function parsePermissions(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function permissionSet(DB, identity, env) {
  const email = clean(identity?.email, 254).toLowerCase();
  if (!email) return new Set();
  if (configuredAdmins(env).includes(email)) return new Set(["*"]);
  const admin = await DB.prepare(`SELECT role,status,permissions FROM admin_users WHERE lower(email)=lower(?) LIMIT 1`)
    .bind(email).first().catch(() => null);
  if (!admin || ["blocked", "closed", "disabled", "inactive", "suspended"].includes(clean(admin.status || "Active", 80).toLowerCase())) return new Set();
  if (admin.role === "Platform Owner") return new Set(["*"]);
  const explicit = parsePermissions(admin.permissions);
  const rows = await DB.prepare(`SELECT permission_code FROM role_permissions WHERE role_name=?`)
    .bind(clean(admin.role || "Auditor", 100)).all().catch(() => ({ results: [] }));
  return new Set([...explicit, ...(rows.results || []).map(row => row.permission_code).filter(Boolean)]);
}

function hasAny(permissions, values) {
  return permissions.has("*") || values.some(value => permissions.has(value));
}

async function ensureCache(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS customerops_security_state_cache (
    customer_email TEXT PRIMARY KEY,
    customer_number TEXT,
    contract_version TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    last_error TEXT,
    updated_at TEXT NOT NULL
  )`).run();
}

async function readCache(DB, email) {
  const row = await DB.prepare(`SELECT * FROM customerops_security_state_cache WHERE lower(customer_email)=lower(?) LIMIT 1`)
    .bind(email).first().catch(() => null);
  if (!row) return null;
  try {
    return {
      state: JSON.parse(row.payload_json || "{}"),
      customerNumber: row.customer_number || null,
      fetchedAt: row.fetched_at,
      lastError: row.last_error || null
    };
  } catch { return null; }
}

async function saveCache(DB, email, customerNumber, state, errorMessage = null) {
  const now = new Date().toISOString();
  await DB.prepare(`INSERT INTO customerops_security_state_cache
    (customer_email,customer_number,contract_version,payload_json,fetched_at,last_error,updated_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(customer_email) DO UPDATE SET customer_number=excluded.customer_number,
      contract_version=excluded.contract_version,payload_json=excluded.payload_json,
      fetched_at=excluded.fetched_at,last_error=excluded.last_error,updated_at=excluded.updated_at`)
    .bind(email, customerNumber || null, HEAD_OFFICE_SECURITY_CONTRACT, JSON.stringify(state || {}), now, errorMessage, now).run();
  return now;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return json({ success: false, error: "The Sousa Murray Planeia customer database is unavailable." }, 500);
  const identity = await getNativeSession(request, env, "admin").catch(() => null);
  if (!identity?.email) return json({ success: false, code: "SESSION_EXPIRED", error: "Your administrator session has expired. Please sign in again." }, 401);
  const permissions = await permissionSet(env.DB, identity, env);
  if (!hasAny(permissions, ["manage_crm", "manage_users", "manage_audit", "manage_api"])) {
    return json({ success: false, error: "You do not have permission to view Head Office customer-security instructions." }, 403);
  }

  const email = clean(new URL(request.url).searchParams.get("email"), 254).toLowerCase();
  if (!email || !email.includes("@")) return json({ success: false, error: "A valid customer email is required." }, 400);
  await ensureCache(env.DB);
  try {
    const result = await readHeadOfficeSecurityForEmail(env, env.DB, email);
    const fetchedAt = await saveCache(env.DB, email, result.reference.customerNumber, result.state);
    return json({
      success: true,
      available: true,
      cached: false,
      contractVersion: HEAD_OFFICE_SECURITY_CONTRACT,
      customerNumber: result.reference.customerNumber,
      fetchedAt,
      state: result.state,
      notice: "Only branch-safe marker labels, references and instructions are shown. Confidential Head Office reasoning is withheld."
    });
  } catch (error) {
    const cache = await readCache(env.DB, email);
    if (cache) {
      await saveCache(env.DB, email, cache.customerNumber, cache.state, clean(error?.message || String(error), 1000));
      return json({
        success: true,
        available: false,
        cached: true,
        contractVersion: HEAD_OFFICE_SECURITY_CONTRACT,
        customerNumber: cache.customerNumber,
        fetchedAt: cache.fetchedAt,
        state: cache.state,
        warning: "Live Head Office security state is temporarily unavailable. This is the last safely cached branch instruction.",
        error: clean(error?.message || String(error), 1000)
      });
    }
    return json({
      success: false,
      available: false,
      cached: false,
      contractVersion: HEAD_OFFICE_SECURITY_CONTRACT,
      error: clean(error?.message || "Head Office customer-security state is unavailable.", 1000)
    }, Number(error?.status || 503));
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return json({ success: false, error: "Method not allowed." }, 405);
}
