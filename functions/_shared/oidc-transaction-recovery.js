const CUSTOMER_TRANSACTION_COOKIE = "ja_customer_oidc_tx";
const TABLE = "oidc_transaction_cookie_backups";

function clean(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

async function sha256(value) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")))
  );
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function ensureTable(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      state_hash TEXT PRIMARY KEY,
      realm TEXT NOT NULL,
      encrypted_cookie TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      used_at TEXT
    )
  `).run();

  await DB.prepare(`
    DELETE FROM ${TABLE}
    WHERE datetime(expires_at) <= datetime('now')
       OR (used_at IS NOT NULL AND datetime(used_at) <= datetime('now', '-1 day'))
  `).run();
}

function setCookieValues(response) {
  const headers = response.headers;
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const value = headers.get("Set-Cookie");
  return value ? [value] : [];
}

function cookieValue(response, name) {
  for (const value of setCookieValues(response)) {
    const match = new RegExp(`(?:^|,\\s*)${name}=([^;]+)`).exec(value);
    if (match?.[1]) return clean(match[1], 8000);
  }
  return "";
}

function mergeCookie(existing, name, value) {
  const prefix = `${name}=`;
  const entries = String(existing || "")
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => !part.startsWith(prefix));
  entries.push(`${name}=${value}`);
  return entries.join("; ");
}

export async function backupCustomerOidcTransaction(env, response) {
  if (!env?.DB || !(response instanceof Response)) return false;
  const location = response.headers.get("Location");
  if (!location) return false;

  const state = clean(new URL(location).searchParams.get("state"), 1000);
  const encryptedCookie = cookieValue(response, CUSTOMER_TRANSACTION_COOKIE);
  if (!state || !encryptedCookie) return false;

  await ensureTable(env.DB);
  await env.DB.prepare(`
    INSERT INTO ${TABLE} (
      state_hash, realm, encrypted_cookie, expires_at, used_at
    ) VALUES (?, 'customer', ?, datetime('now', '+10 minutes'), NULL)
    ON CONFLICT(state_hash) DO UPDATE SET
      encrypted_cookie = excluded.encrypted_cookie,
      created_at = CURRENT_TIMESTAMP,
      expires_at = excluded.expires_at,
      used_at = NULL
  `).bind(await sha256(state), encryptedCookie).run();
  return true;
}

export async function recoverCustomerOidcTransactionRequest(context) {
  const DB = context?.env?.DB;
  if (!DB) return null;

  const state = clean(new URL(context.request.url).searchParams.get("state"), 1000);
  if (!state) return null;

  await ensureTable(DB);
  const stateHash = await sha256(state);
  const row = await DB.prepare(`
    SELECT encrypted_cookie
    FROM ${TABLE}
    WHERE state_hash = ?
      AND realm = 'customer'
      AND used_at IS NULL
      AND datetime(expires_at) > datetime('now')
    LIMIT 1
  `).bind(stateHash).first();
  if (!row?.encrypted_cookie) return null;

  const claimed = await DB.prepare(`
    UPDATE ${TABLE}
    SET used_at = CURRENT_TIMESTAMP
    WHERE state_hash = ?
      AND realm = 'customer'
      AND used_at IS NULL
      AND datetime(expires_at) > datetime('now')
  `).bind(stateHash).run();
  if (Number(claimed?.meta?.changes || 0) !== 1) return null;

  const headers = new Headers(context.request.headers);
  headers.set(
    "Cookie",
    mergeCookie(headers.get("Cookie"), CUSTOMER_TRANSACTION_COOKIE, clean(row.encrypted_cookie, 8000))
  );
  return new Request(context.request.url, {
    method: "GET",
    headers
  });
}
