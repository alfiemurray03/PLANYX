import { getNativeSession } from "../../_shared/oidc.js";

const DEFAULT_ADMIN_EMAIL = "alfieholywoodmurray@jagroupservices.co.uk";
const SESSION_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const DB_TIMEOUT_MS = 5000;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

function clean(value, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function cleanEmail(value) {
  return clean(value, 254).toLowerCase();
}

function configuredAdmins(env) {
  const raw = env.ADMIN_EMAILS || env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
  return String(raw).split(",").map((value) => cleanEmail(value)).filter(Boolean);
}

function readCookie(request, name) {
  const prefix = `${name}=`;
  const entry = (request.headers.get("Cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : "";
}

function isSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function withTimeout(promise, label = "Database operation") {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out.`)), DB_TIMEOUT_MS);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ""));
  const b = new TextEncoder().encode(String(right || ""));
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) diff |= (a[index] || 0) ^ (b[index] || 0);
  return diff === 0;
}

async function adminPinMac(env, pin, salt) {
  const pepper = clean(env.ADMIN_PIN_PEPPER || env.ADMIN_OIDC_CLIENT_SECRET, 1000);
  if (!pepper) throw new Error("Administrator PIN security is not configured.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${salt}:${pin}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseAdminPinHash(storedHash) {
  const value = clean(storedHash, 500);
  const [scheme, salt, expected] = value.split("$");
  if (scheme === "hmac_sha256" && salt && expected) return { scheme, salt, expected, legacy: false };
  const legacyPrefix = "hmac_sha256";
  if (value.startsWith(legacyPrefix) && value.length === legacyPrefix.length + 36 + 64) {
    return {
      scheme: legacyPrefix,
      salt: value.slice(legacyPrefix.length, legacyPrefix.length + 36),
      expected: value.slice(legacyPrefix.length + 36),
      legacy: true
    };
  }
  return null;
}

async function verifyPin(env, pin, storedHash) {
  const parsed = parseAdminPinHash(storedHash);
  if (parsed) return timingSafeEqual(await adminPinMac(env, pin, parsed.salt), parsed.expected);
  return timingSafeEqual(await sha256Hex(pin), storedHash);
}

async function ensureTables(DB) {
  await withTimeout(DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS admin_security_pins (
      admin_email TEXT PRIMARY KEY,
      pin_hash TEXT NOT NULL,
      failed_attempts INTEGER DEFAULT 0,
      locked_until TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS admin_pin_sessions (
      token_hash TEXT PRIMARY KEY,
      admin_email TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    )`)
  ]), "Administrator PIN table check");
}

async function getAuthorisedIdentity(request, env) {
  const identity = await getNativeSession(request, env, "admin");
  if (!identity) return { error: json({ success: false, error: "Admin session expired. Please sign in again." }, 401) };

  const email = cleanEmail(identity.email);
  const configured = configuredAdmins(env).includes(email);
  let admin = null;
  if (env.DB) {
    admin = await withTimeout(
      env.DB.prepare(`SELECT role, status FROM admin_users WHERE lower(email) = lower(?)`).bind(email).first().catch(() => null),
      "Administrator authorisation check"
    );
  }

  const status = clean(admin?.status || "Active", 40).toLowerCase();
  const disabled = ["blocked", "closed", "disabled", "inactive", "suspended"].includes(status);
  if (disabled || (!configured && !admin)) {
    return { error: json({ success: false, error: "This account is not authorised for the Admin Centre." }, 403) };
  }
  return { identity: { email, name: identity.name || email } };
}

async function audit(DB, identity, action, detail = {}) {
  try {
    await withTimeout(DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY,
      admin_email TEXT,
      admin_name TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      detail TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run(), "Audit table check");
    await withTimeout(DB.prepare(`INSERT INTO admin_audit_log
      (id, admin_email, admin_name, action, target_type, target_id, detail, metadata)
      VALUES (?, ?, ?, ?, 'admin_security_pin', ?, ?, ?)`)
      .bind(crypto.randomUUID(), identity.email, identity.name, action, identity.email, action.replaceAll("_", " "), JSON.stringify(detail)).run(), "Audit write");
  } catch (error) {
    console.warn("admin_pin_audit_failed", error instanceof Error ? error.message : String(error));
  }
}

async function status(DB, request, email) {
  await ensureTables(DB);
  const [record, token] = await Promise.all([
    withTimeout(DB.prepare(`SELECT failed_attempts, locked_until FROM admin_security_pins WHERE lower(admin_email) = lower(?)`).bind(email).first(), "PIN record check"),
    Promise.resolve(readCookie(request, "ja_admin_pin_session"))
  ]);
  const session = token
    ? await withTimeout(DB.prepare(`SELECT expires_at FROM admin_pin_sessions
        WHERE token_hash = ? AND lower(admin_email) = lower(?)
          AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')`)
        .bind(await sha256Hex(token), email).first(), "PIN session check")
    : null;
  const locked = Boolean(record?.locked_until && Date.parse(record.locked_until) > Date.now());
  return {
    success: true,
    configured: Boolean(record),
    unlocked: Boolean(session),
    expiresAt: session?.expires_at || null,
    locked,
    lockedUntil: locked ? record.locked_until : null,
    attemptsRemaining: Math.max(0, MAX_ATTEMPTS - Number(record?.failed_attempts || 0))
  };
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return json({ success: false, error: "Admin security database is unavailable." }, 503);
    const authorised = await getAuthorisedIdentity(request, env);
    if (authorised.error) return authorised.error;
    return json(await status(env.DB, request, authorised.identity.email));
  } catch (error) {
    console.error("admin_pin_status_failed", error instanceof Error ? error.message : String(error));
    return json({
      success: false,
      configured: true,
      unlocked: false,
      error: "Administrator PIN verification is temporarily unavailable. The Admin Centre remains locked."
    }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!isSameOrigin(request)) return json({ success: false, error: "Cross-origin security request rejected." }, 403);
    if (!env.DB) return json({ success: false, error: "Admin security database is unavailable." }, 503);

    const authorised = await getAuthorisedIdentity(request, env);
    if (authorised.error) return authorised.error;
    const identity = authorised.identity;
    const DB = env.DB;
    await ensureTables(DB);

    const body = await request.json().catch(() => ({}));
    const action = clean(body.action, 20) || "verify";
    const pin = clean(body.pin, 4);

    if (action === "lock") {
      const token = readCookie(request, "ja_admin_pin_session");
      if (token) {
        await withTimeout(DB.prepare(`UPDATE admin_pin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?`).bind(await sha256Hex(token)).run(), "PIN session lock");
      }
      await audit(DB, identity, "admin_pin_session_locked");
      return json({ success: true, configured: true, unlocked: false }, 200, {
        "Set-Cookie": "ja_admin_pin_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"
      });
    }

    if (!/^\d{4}$/.test(pin)) return json({ success: false, error: "Enter exactly four numbers." }, 400);

    const existing = await withTimeout(DB.prepare(`SELECT * FROM admin_security_pins WHERE lower(admin_email) = lower(?)`).bind(identity.email).first(), "PIN record load");

    if (action === "setup" || action === "reset") {
      if (action === "setup" && existing) return json({ success: false, error: "A PIN already exists. Use Replace PIN instead." }, 409);
      const salt = crypto.randomUUID();
      const pinHash = ["hmac_sha256", salt, await adminPinMac(env, pin, salt)].join("$");
      if (existing) {
        await withTimeout(DB.batch([
          DB.prepare(`UPDATE admin_security_pins SET pin_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE lower(admin_email) = lower(?)`).bind(pinHash, identity.email),
          DB.prepare(`UPDATE admin_pin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE lower(admin_email) = lower(?) AND revoked_at IS NULL`).bind(identity.email)
        ]), "PIN replacement");
      } else {
        await withTimeout(DB.prepare(`INSERT INTO admin_security_pins (admin_email, pin_hash) VALUES (?, ?)`).bind(identity.email, pinHash).run(), "PIN creation");
      }
      await audit(DB, identity, action === "reset" ? "admin_pin_reset" : "admin_pin_created");
    } else {
      if (!existing) return json({ success: false, error: "Create your administrator PIN first." }, 409);
      if (existing.locked_until && Date.parse(existing.locked_until) > Date.now()) {
        return json({ success: false, error: "PIN access is temporarily locked.", lockedUntil: existing.locked_until }, 423);
      }

      if (!(await verifyPin(env, pin, existing.pin_hash))) {
        const attempts = Number(existing.failed_attempts || 0) + 1;
        const lockedUntil = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : null;
        await withTimeout(DB.prepare(`UPDATE admin_security_pins SET failed_attempts = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE lower(admin_email) = lower(?)`)
          .bind(lockedUntil ? 0 : attempts, lockedUntil, identity.email).run(), "PIN failure update");
        await audit(DB, identity, "admin_pin_verification_failed", { attempts, locked: Boolean(lockedUntil) });
        return json({
          success: false,
          error: lockedUntil ? `Too many attempts. PIN access is locked for ${LOCK_MINUTES} minutes.` : "The administrator PIN is incorrect.",
          attemptsRemaining: lockedUntil ? 0 : MAX_ATTEMPTS - attempts,
          lockedUntil
        }, lockedUntil ? 423 : 401);
      }
    }

    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
    await withTimeout(DB.batch([
      DB.prepare(`UPDATE admin_security_pins SET failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE lower(admin_email) = lower(?)`).bind(identity.email),
      DB.prepare(`INSERT INTO admin_pin_sessions (token_hash, admin_email, expires_at) VALUES (?, ?, ?)`).bind(await sha256Hex(token), identity.email, expiresAt)
    ]), "PIN session creation");
    await audit(DB, identity, "admin_pin_verified", { expires_at: expiresAt });

    return json({ success: true, configured: true, unlocked: true, expiresAt }, 200, {
      "Set-Cookie": `ja_admin_pin_session=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`
    });
  } catch (error) {
    console.error("admin_pin_action_failed", error instanceof Error ? error.message : String(error));
    return json({ success: false, error: "Administrator PIN verification is temporarily unavailable. The Admin Centre remains locked." }, 503);
  }
}
