function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function realmFromParams(params = {}) {
  const value = Array.isArray(params.realm) ? params.realm.join("/") : String(params.realm || "");
  const first = value.replace(/^\/+|\/+$/g, "").split("/")[0].toLowerCase();
  return first === "admin" || first === "customer" ? first : "";
}

function pageForRealm(realm) {
  const admin = realm === "admin";
  return {
    title: admin ? "Admin session ended" : "Customer session ended",
    eyebrow: admin ? "Sousa Murray Planeia Admin Portal" : "Sousa Murray Planeia",
    message: admin
      ? "Your staff Microsoft session and Sousa Murray Planeia Admin session have been ended securely."
      : "Your JA Group Services ID session and Sousa Murray Planeia customer session have been ended securely.",
    isolation: admin
      ? "Any customer portal session in this browser has not been changed."
      : "Any Admin Portal session in this browser has not been changed.",
    actionHref: admin ? "/admin" : "/sign-in",
    actionLabel: admin ? "Return to Admin sign in" : "Return to customer sign in"
  };
}

function html(realm) {
  const page = pageForRealm(realm);
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(page.title)} — Sousa Murray Planeia</title><style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: linear-gradient(145deg, #071a3f 0%, #0b2a66 48%, #071a3f 100%);
      color: #0f172a;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(620px, 100%);
      border: 1px solid rgba(255,255,255,.22);
      border-radius: 28px;
      background: #fff;
      padding: clamp(28px, 6vw, 52px);
      box-shadow: 0 30px 90px rgba(2, 8, 23, .38);
    }
    .mark {
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      border-radius: 16px;
      background: #0b2a66;
      color: #fff;
      font-weight: 900;
      letter-spacing: -.03em;
    }
    .eyebrow {
      margin: 22px 0 8px;
      color: #1d4ed8;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      color: #0f172a;
      font-size: clamp(30px, 7vw, 46px);
      line-height: 1.08;
      letter-spacing: -.04em;
    }
    p { margin: 16px 0 0; color: #475569; font-size: 17px; line-height: 1.65; }
    .isolation {
      margin-top: 22px;
      padding: 16px 18px;
      border: 1px solid #bfdbfe;
      border-radius: 16px;
      background: #eff6ff;
      color: #1e3a8a;
      font-size: 15px;
      font-weight: 650;
    }
    a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      margin-top: 28px;
      border-radius: 14px;
      background: #0b2a66;
      padding: 12px 20px;
      color: #fff;
      font-weight: 800;
      text-decoration: none;
    }
    a:hover { background: #123b86; }
    a:focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }
  </style>
</head>
<body>
  <main>
    <div class="mark" aria-hidden="true">JA</div>
    <p class="eyebrow">${escapeHtml(page.eyebrow)}</p>
    <h1>${escapeHtml(page.title)}</h1>
    <p>${escapeHtml(page.message)}</p>
    <p class="isolation">${escapeHtml(page.isolation)}</p>
    <a href="${escapeHtml(page.actionHref)}">${escapeHtml(page.actionLabel)}</a>
  </main>
</body>
</html>`;
}

export async function onRequestGet(context) {
  const realm = realmFromParams(context.params);
  if (!realm) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  if (realm === "admin") {
    return new Response(null, {
      status: 302,
      headers: {
        Location: new URL("/admin", context.request.url).toString(),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Referrer-Policy": "no-referrer"
      }
    });
  }

  return new Response(html(realm), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
