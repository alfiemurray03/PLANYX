const ADMIN_SHELL_VERSION = "2026-07-26-v10";
const ADMIN_SHELL_COOKIE = "planyx_admin_shell";

function readCookie(request, name) {
  const prefix = `${name}=`;
  const entry = (request.headers.get("Cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : "";
}

function noStoreHeaders(source) {
  const headers = new Headers(source || {});
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Planyx-Admin-Shell", ADMIN_SHELL_VERSION);
  headers.delete("Content-Length");
  return headers;
}

function isDocumentRequest(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const accept = (request.headers.get("Accept") || "").toLowerCase();
  const destination = (request.headers.get("Sec-Fetch-Dest") || "").toLowerCase();
  return destination === "document" || accept.includes("text/html");
}

function resetDocument(returnUrl) {
  const safeReturn = JSON.stringify(returnUrl);
  const version = JSON.stringify(ADMIN_SHELL_VERSION);
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Resetting Planyx Admin Centre</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#0f172a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{width:min(440px,calc(100% - 2rem));padding:2rem;border:1px solid #dbe4f0;border-radius:20px;background:#fff;box-shadow:0 24px 70px rgba(15,23,42,.12);text-align:center}.spinner{width:38px;height:38px;margin:0 auto 1.25rem;border:3px solid #dbeafe;border-top-color:#2563eb;border-radius:999px;animation:spin .8s linear infinite}h1{margin:0;font-size:1.35rem}p{margin:.75rem 0 0;color:#64748b;font-size:.92rem;line-height:1.6}.fallback{display:none;margin-top:1.25rem;color:#1d4ed8;font-weight:700;text-decoration:none}@keyframes spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <main class="card" role="status" aria-live="polite">
    <div class="spinner" aria-hidden="true"></div>
    <h1>Resetting Admin Centre</h1>
    <p>Removing the outdated portal shell and loading the current secure version.</p>
    <a class="fallback" id="fallback" href=${safeReturn}>Continue to Admin Centre</a>
  </main>
  <script>
    (async function () {
      var destination = ${safeReturn};
      var version = ${version};
      try {
        document.cookie = '${ADMIN_SHELL_COOKIE}=' + encodeURIComponent(version) + '; Path=/admin; Max-Age=31536000; SameSite=Lax; Secure';
        if ('serviceWorker' in navigator) {
          var registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(function (registration) { return registration.unregister(); }));
        }
        if ('caches' in window) {
          var keys = await caches.keys();
          await Promise.all(keys.map(function (key) { return caches.delete(key); }));
        }
        try {
          localStorage.removeItem('planyx_admin_asset_version');
          sessionStorage.setItem('planyx_admin_shell_version', version);
        } catch (e) {}
      } catch (e) {
        console.warn('Admin shell reset completed with a recoverable warning.', e);
      }
      var url = new URL(destination, location.origin);
      url.searchParams.set('__admin_shell', version);
      location.replace(url.pathname + url.search + url.hash);
    })();
    setTimeout(function () { document.getElementById('fallback').style.display = 'inline-block'; }, 8000);
  </script>
</body>
</html>`;
}

function injectAdminBootstrap(html) {
  const bootstrap = `<script>
    window.__PLANYX_ADMIN_SHELL_VERSION__=${JSON.stringify(ADMIN_SHELL_VERSION)};
    try {
      if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister();}));});
      if ('caches' in window) caches.keys().then(function(keys){return Promise.all(keys.map(function(key){return caches.delete(key);}));});
    } catch (e) {}
  </script>`;
  const meta = `<meta name="planyx-admin-shell" content="${ADMIN_SHELL_VERSION}">`;
  if (html.includes("</head>")) return html.replace("</head>", `${meta}${bootstrap}</head>`);
  return `${meta}${bootstrap}${html}`;
}

export async function onRequest(context) {
  const { request } = context;
  if (!isDocumentRequest(request)) return context.next();

  const url = new URL(request.url);
  const currentCookie = readCookie(request, ADMIN_SHELL_COOKIE);
  const requestedVersion = url.searchParams.get("__admin_shell") || "";

  if (currentCookie !== ADMIN_SHELL_VERSION && requestedVersion !== ADMIN_SHELL_VERSION) {
    const headers = noStoreHeaders({
      "Content-Type": "text/html; charset=utf-8",
      "Clear-Site-Data": '"cache"',
      "Set-Cookie": `${ADMIN_SHELL_COOKIE}=${encodeURIComponent(ADMIN_SHELL_VERSION)}; Path=/admin; Max-Age=31536000; Secure; SameSite=Lax`
    });
    return new Response(resetDocument(url.pathname + url.search + url.hash), { status: 200, headers });
  }

  const shellUrl = new URL("/index.html", url.origin);
  shellUrl.searchParams.set("admin_shell_asset", ADMIN_SHELL_VERSION);
  const shellRequest = new Request(shellUrl, {
    method: "GET",
    headers: request.headers,
    redirect: "follow"
  });
  const response = await context.next(shellRequest);
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("text/html")) {
    return new Response("Admin application document is unavailable.", {
      status: 503,
      headers: noStoreHeaders({ "Content-Type": "text/plain; charset=utf-8" })
    });
  }

  const html = injectAdminBootstrap(await response.text());
  const headers = noStoreHeaders(response.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Set-Cookie", `${ADMIN_SHELL_COOKIE}=${encodeURIComponent(ADMIN_SHELL_VERSION)}; Path=/admin; Max-Age=31536000; Secure; SameSite=Lax`);
  return new Response(request.method === "HEAD" ? null : html, {
    status: 200,
    headers
  });
}
