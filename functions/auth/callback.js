import { completeLogin } from "../_shared/oidc.js";
import { recordAuthenticationFailure } from "../_shared/auth-attempt-audit.js";

export async function onRequestGet(context) {
  try {
    return await completeLogin(context, "admin");
  } catch (error) {
    console.error(JSON.stringify({ event: "admin_oidc_callback_failed", message: error instanceof Error ? error.message : "Unknown error" }));
    await recordAuthenticationFailure(context.env.DB, context.request, "admin", error).catch(() => null);
    const stage = String(error?.authStage?.stage || (error instanceof Error && error.message.includes("state validation") ? "state_validation" : "callback"));
    return new Response("Administrator sign-in could not be completed. Please return to the login page and try again.", {
      status: 401,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-JA-Admin-Auth-Stage": stage
      }
    });
  }
}
