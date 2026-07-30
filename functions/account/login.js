import { beginLogin } from "../_shared/oidc.js";

export async function onRequestGet(context) {
  try {
    // Customer age assurance is now governed centrally by Head Office after
    // Microsoft has resolved the customer identity and UCN. Do not put the
    // retired Planyx self-declaration page in front of customer sign-in.
    return await beginLogin(context, "customer");
  } catch (error) {
    console.error(JSON.stringify({
      event: "customer_oidc_login_start_failed",
      message: error instanceof Error ? error.message : "Unknown error"
    }));
    return new Response("Customer authentication is temporarily unavailable.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}
