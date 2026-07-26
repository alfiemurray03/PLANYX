import { getNativeSession } from "../_shared/oidc.js";

const DEFAULT_ADMIN_EMAIL = "alfieholywoodmurray@jagroupservices.co.uk";
const LEGACY_QUERY_KEYS = ["portal", "release", "__reset_admin", "__admin_shell"];

function noStoreHeaders(source) {
  const headers = new Headers(source || {});
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Planyx-Admin-Shell", "server-bootstrap-v1");
  headers.delete("Content-Length");
  return headers;
}

function isDocumentRequest(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const accept = (request.headers.get("Accept") || "").toLowerCase();
  const destination = (request.headers.get("Sec-Fetch-Dest") || "").toLowerCase();
  return destination === "document" || accept.includes("text/html");
}

function configuredAdmins(env) {
  const raw = env.ADMIN_EMAILS || env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
  return String(raw)
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function appRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "platform owner") return "PlatformOwner";
  if (normalized === "system administrator") return "SystemAdministrator";
  if (normalized === "administrator" || normalized === "admin") return "Admin";
  if (normalized === "support admin") return "SupportAdmin";
  return "";
}

function escapeAttribute(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolveAdminBootstrap(request, env) {
  try {
    const identity = await withTimeout(getNativeSession(request, env, "admin"), 3000);
    if (!identity) return null;

    const email = String(identity.email || "").trim().toLowerCase();
    const configured = configuredAdmins(env).includes(email);
    let adminRecord = null;

    if (env.DB) {
      adminRecord = await withTimeout(
        env.DB.prepare(`SELECT role, status FROM admin_users WHERE lower(email) = lower(?)`)
          .bind(email)
          .first()
          .catch(() => null),
        1500
      );
    }

    const status = String(adminRecord?.status || "Active").trim().toLowerCase();
    const disabled = ["blocked", "closed", "disabled", "inactive", "suspended"].includes(status);
    if (disabled || (!configured && !adminRecord)) return null;

    const role = appRole(adminRecord?.role);
    const roles = role ? [role] : [];

    return {
      email,
      name: identity.name || email,
      roles,
      tid: identity.tenantId || "",
      isSystemAdministrator: configured || roles.includes("PlatformOwner") || roles.includes("SystemAdministrator"),
      authMethod: "oidc",
      operator: "JA Group Services Ltd"
    };
  } catch (error) {
    console.error(JSON.stringify({
      event: "admin_document_bootstrap_failed",
      message: error instanceof Error ? error.message : "Unknown error"
    }));
    return null;
  }
}

function injectBootstrap(html, admin) {
  const adminMeta = admin
    ? `<meta name="planyx-admin-bootstrap" content="${escapeAttribute(JSON.stringify(admin))}">`
    : "";

  const cleanupScript = `<script>
    (function(){
      try {
        var url = new URL(location.href);
        ['portal','release','__reset_admin','__admin_shell'].forEach(function(key){url.searchParams.delete(key);});
        if (url.href !== location.href) history.replaceState(null,'',url.pathname + url.search + url.hash);
        if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(function(items){return Promise.all(items.map(function(item){return item.unregister();}));}).catch(function(){});
        if ('caches' in window) caches.keys().then(function(keys){return Promise.all(keys.filter(function(key){return key.indexOf('planyx-shell-')===0;}).map(function(key){return caches.delete(key);}));}).catch(function(){});
      } catch (e) {}
    })();
  </script>`;

  const injection = `${adminMeta}<meta name="planyx-admin-shell" content="server-bootstrap-v1">${cleanupScript}`;
  if (html.includes("</head>")) return html.replace("</head>", `${injection}</head>`);
  return `${injection}${html}`;
}

export async function onRequest(context) {
  const { request } = context;
  if (!isDocumentRequest(request)) return context.next();

  const url = new URL(request.url);
  const hasLegacyQuery = LEGACY_QUERY_KEYS.some((key) => url.searchParams.has(key));
  if (hasLegacyQuery) {
    for (const key of LEGACY_QUERY_KEYS) url.searchParams.delete(key);
    const destination = `${url.pathname}${url.search}${url.hash}` || "/admin/dashboard/";
    return new Response(null, {
      status: 302,
      headers: noStoreHeaders({ Location: destination })
    });
  }

  const admin = await resolveAdminBootstrap(request, context.env);
  const shellUrl = new URL("/index.html", url.origin);
  shellUrl.searchParams.set("admin_document", "server-bootstrap-v1");
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

  const html = injectBootstrap(await response.text(), admin);
  const headers = noStoreHeaders(response.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(request.method === "HEAD" ? null : html, {
    status: 200,
    headers
  });
}
