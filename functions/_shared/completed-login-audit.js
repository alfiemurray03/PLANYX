import { getNativeSession } from "./oidc.js";
import { recordSessionHeartbeat } from "./session-tracking.js";

const COOKIE_NAMES = {
  admin: "ja_admin_session",
  customer: "ja_customer_oidc_session"
};

function sessionCookieFromResponse(response, realm) {
  const cookieName = COOKIE_NAMES[realm];
  const raw = response?.headers?.get("Set-Cookie") || response?.headers?.get("set-cookie") || "";
  if (!cookieName || !raw) return "";
  const match = raw.match(new RegExp(`(?:^|[,;]\\s*)${cookieName}=([^;,\\s]+)`, "i"));
  return match ? decodeURIComponent(match[1]) : "";
}

export async function recordCompletedLogin(context, response, realm) {
  if (!context?.env?.DB || !response) return;
  const cookieName = COOKIE_NAMES[realm];
  const cookieValue = sessionCookieFromResponse(response, realm);
  if (!cookieName || !cookieValue) return;

  const headers = new Headers(context.request.headers);
  const existing = headers.get("Cookie") || "";
  headers.set("Cookie", `${existing ? `${existing}; ` : ""}${cookieName}=${encodeURIComponent(cookieValue)}`);
  const auditRequest = new Request(context.request.url, { method: "GET", headers });
  const identity = await getNativeSession(auditRequest, context.env, realm).catch(() => null);
  if (!identity) return;
  await recordSessionHeartbeat(context.env.DB, auditRequest, identity, realm);
}
