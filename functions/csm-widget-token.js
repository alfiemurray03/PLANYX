import { assertSameOrigin, getNativeSession } from "./_shared/oidc.js";

const ATLASSIAN_TOKEN_ENDPOINT = "https://auth.atlassian.com/oauth/token";
const ATLASSIAN_CSM_SCOPE = "csm:atlassian-internal";
const JWT_LIFETIME_SECONDS = 60;

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

function cleanEmail(value) {
  const email = String(value || "").trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function base64Url(value) {
  const bytes = value instanceof Uint8Array
    ? value
    : new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createEmailAssertion(email, clientId, clientSecret) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url({ alg: "HS256", typ: "JWT" });
  const payload = base64Url({
    sub: email,
    iss: clientId,
    iat: issuedAt,
    exp: issuedAt + JWT_LIFETIME_SECONDS
  });
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clientSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput)
  ));
  return `${signingInput}.${base64Url(signature)}`;
}

function widgetCredentials(env) {
  return {
    clientId: String(env.CSM_WIDGET_CLIENT_ID || env.ATLASSIAN_CSM_WIDGET_CLIENT_ID || "").trim(),
    clientSecret: String(env.CSM_WIDGET_CLIENT_SECRET || env.ATLASSIAN_CSM_WIDGET_CLIENT_SECRET || "").trim()
  };
}

async function exchangeAssertion(assertion, clientId, clientSecret) {
  const response = await fetch(ATLASSIAN_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: ATLASSIAN_CSM_SCOPE,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString()
  });

  const responseText = await response.text().catch(() => "");
  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    console.error(JSON.stringify({
      event: "atlassian_csm_widget_token_exchange_failed",
      http_status: response.status,
      response_preview: responseText.slice(0, 500)
    }));
    return { ok: false, status: response.status };
  }

  const accessToken = String(payload?.access_token || "").trim();
  if (!accessToken) {
    console.error(JSON.stringify({
      event: "atlassian_csm_widget_token_missing",
      http_status: response.status
    }));
    return { ok: false, status: response.status };
  }

  return { ok: true, accessToken };
}

export async function onRequestPost(context) {
  if (!assertSameOrigin(context.request)) {
    return json({ error: "Request origin was rejected." }, 403);
  }

  if (!context.env.DB) {
    return json({ error: "Customer authentication is temporarily unavailable." }, 503);
  }

  let identity = null;
  try {
    identity = await getNativeSession(context.request, context.env, "customer");
  } catch (error) {
    console.error(JSON.stringify({
      event: "atlassian_csm_customer_session_validation_failed",
      message: error instanceof Error ? error.message : "Unknown customer session error"
    }));
    return json({ error: "Customer authentication is temporarily unavailable." }, 503);
  }

  const email = cleanEmail(identity?.email);
  if (!identity || identity.realm !== "customer" || !email) {
    return json({ error: "You must be signed in to use personalised support." }, 401);
  }

  const { clientId, clientSecret } = widgetCredentials(context.env);
  if (!clientId || !clientSecret) {
    console.error(JSON.stringify({
      event: "atlassian_csm_widget_credentials_missing",
      customer_email: email
    }));
    return json({ error: "Personalised support is not configured." }, 501);
  }

  try {
    const assertion = await createEmailAssertion(email, clientId, clientSecret);
    const token = await exchangeAssertion(assertion, clientId, clientSecret);
    if (!token.ok) {
      return json({ error: "Personalised support authentication failed." }, 502);
    }
    return json({ access_token: token.accessToken });
  } catch (error) {
    console.error(JSON.stringify({
      event: "atlassian_csm_widget_token_error",
      customer_email: email,
      message: error instanceof Error ? error.message : "Unknown token error"
    }));
    return json({ error: "Personalised support authentication failed." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }
  return onRequestPost(context);
}
