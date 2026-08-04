import { enforceCustomerAge } from "../_shared/age-gate-middleware.js";

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  if (
    path === "/api/status" || path.startsWith("/api/status/") ||
    path === "/api/site-status" ||
    path === "/api/session-heartbeat" ||
    path.startsWith("/api/admin/") ||
    path.startsWith("/api/reseller/") ||
    path.startsWith("/api/stripe-webhook")
  ) return context.next();
  return enforceCustomerAge(context);
}
