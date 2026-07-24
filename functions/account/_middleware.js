import { enforceCustomerAge } from "../_shared/age-gate-middleware.js";

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname.replace(/\/+$/, "") || "/";
  if (["/account/login", "/account/auth/callback", "/account/logout"].includes(path)) return context.next();
  return enforceCustomerAge(context);
}
