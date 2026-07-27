import { getNativeSession } from "./_shared/oidc.js";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "Pragma": "no-cache",
      "Vary": "Cookie",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders
    }
  });
}

export async function onRequestGet(context) {
  if (!context.env.DB) {
    return json({ authenticated: false, error: "Customer authentication is temporarily unavailable." }, 503);
  }

  try {
    const identity = await getNativeSession(context.request, context.env, "customer");
    const authenticated = Boolean(
      identity
      && identity.realm === "customer"
      && String(identity.email || "").trim()
    );

    // Deliberately return no customer identity or personal data. The browser only
    // needs to know which Atlassian widget mode to initialise.
    return json({ authenticated });
  } catch (error) {
    console.error(JSON.stringify({
      event: "atlassian_csm_session_check_failed",
      message: error instanceof Error ? error.message : "Unknown customer session error"
    }));
    return json({ authenticated: false, error: "Customer authentication is temporarily unavailable." }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return json({ authenticated: false, error: "Method not allowed." }, 405, { Allow: "GET" });
  }
  return onRequestGet(context);
}
