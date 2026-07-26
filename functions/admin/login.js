import { beginLogin } from "../_shared/oidc.js";

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const returnTo = String(url.searchParams.get("return_to") || "").trim();

    // The old profile-admin release query opened a retired standalone shell.
    // Administrators now return only to the canonical React Admin Centre route.
    if (!returnTo || returnTo === "/admin" || returnTo === "/admin/" || returnTo.startsWith("/admin/dashboard")) {
      url.searchParams.set("return_to", "/admin/dashboard/");
    }

    const request = new Request(url.toString(), context.request);
    return await beginLogin({ ...context, request }, "admin");
  } catch (error) {
    console.error(JSON.stringify({
      event: "admin_oidc_login_start_failed",
      message: error instanceof Error ? error.message : "Unknown error"
    }));
    const stage = String(error?.authStage?.stage || (error instanceof Error && error.message.includes("configured") ? "configuration" : "login_start"));
    return new Response("Administrator authentication is temporarily unavailable.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-JA-Admin-Auth-Stage": stage
      }
    });
  }
}
