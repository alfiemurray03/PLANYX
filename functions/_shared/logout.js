const SESSION_TABLES = new Set([
  "customer_sessions"
]);

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function expireSessionCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function readCookie(request, name) {
  const prefix = `${name}=`;
  const cookie = (request.headers.get("Cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie ? cookie.slice(prefix.length) : "";
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function revokeHashedSession(context, { cookieName, table }) {
  if (!SESSION_TABLES.has(table)) throw new Error("Unsupported session store.");

  const token = readCookie(context.request, cookieName);
  if (!token || !context.env.DB) return;

  try {
    await context.env.DB.prepare(`
      UPDATE ${table}
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE token_hash = ? AND revoked_at IS NULL
    `).bind(await sha256(token)).run();
  } catch {
    // Cookie removal must still proceed if an optional session store is unavailable.
  }
}

function logoutPage(title, message) {
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)} | Sousa Murray Planeia</title>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <p id="logout-status" role="status" aria-live="polite">Ending your secure access session.</p>
    <button id="logout-retry" type="button" hidden>Try again</button>
  </main>
  <script src="/assets/js/auth-logout.js" defer></script>
</body>
</html>`;
}

export function createLogoutHandler({
  title = "Signing you out securely…",
  message = "Please wait while we end your authenticated sessions.",
  clearCookies = [],
  revokeSession
} = {}) {
  return async function onRequestGet(context) {
    if (revokeSession) await revokeSession(context);

    const headers = new Headers({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Content-Security-Policy": "default-src 'none'; connect-src 'self'; script-src 'self'; style-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    });

    for (const cookie of clearCookies) headers.append("Set-Cookie", cookie);

    return new Response(logoutPage(title, message), {
      status: 200,
      headers
    });
  };
}
