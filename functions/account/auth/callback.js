import { completeLogin, getNativeSession } from "../../_shared/oidc.js";
import { readAgeAssurance, persistAgeAssurance } from "../../_shared/age-assurance.js";
import { recordAuthenticationFailure } from "../../_shared/auth-attempt-audit.js";
import { recordCompletedLogin } from "../../_shared/completed-login-audit.js";

function customerSessionCookie(response) {
  const headers = response.headers;
  const values = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("Set-Cookie") || ""];
  for (const value of values) {
    const match = /(?:^|,\s*)ja_customer_oidc_session=([^;]+)/.exec(value);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return "";
}

export async function onRequestGet(context) {
  try {
    const assurance = await readAgeAssurance(context.request, context.env);
    if (!assurance?.eligible) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/age-check?return_to=%2Fdashboard",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }

    const response = await completeLogin(context, "customer");
    const sessionToken = customerSessionCookie(response);
    if (!sessionToken) throw new Error("The customer session could not be linked to the age assurance result.");

    const headers = new Headers(context.request.headers);
    headers.set("Cookie", `ja_customer_oidc_session=${encodeURIComponent(sessionToken)}`);
    const identityRequest = new Request(context.request.url, { method: "GET", headers });
    const identity = await getNativeSession(identityRequest, context.env, "customer");
    if (!identity?.email) throw new Error("The verified customer identity could not be resolved.");

    await persistAgeAssurance(context.env.DB, identity.email, assurance);
    await recordCompletedLogin(context, response, "customer").catch(() => null);
    return response;
  } catch (error) {
    console.error(JSON.stringify({
      event: "customer_oidc_callback_failed",
      message: error instanceof Error ? error.message : "Unknown error",
      details: error instanceof Error ? (error.details || null) : null,
      auth_stage: error instanceof Error ? (error.authStage || null) : null
    }));
    await recordAuthenticationFailure(context.env.DB, context.request, "customer", error).catch(() => null);
    return new Response("Customer sign-in could not be completed. Complete the 16+ age check and try again.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}
