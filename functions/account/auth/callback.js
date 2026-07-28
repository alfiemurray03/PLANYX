import { completeLogin, getNativeSession } from "../../_shared/oidc.js";
import { readAgeAssurance, persistAgeAssurance } from "../../_shared/age-assurance.js";
import { getAgeVerificationSettings, recordAgeVerificationEvent } from "../../_shared/age-verification-settings.js";
import { recordAuthenticationFailure } from "../../_shared/auth-attempt-audit.js";
import { recordCompletedLogin } from "../../_shared/completed-login-audit.js";
import { syncCustomerWithHeadOffice } from "../../_shared/customerops.js";

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

function scheduleCustomerOpsSync(context, identity) {
  const task = syncCustomerWithHeadOffice(context, identity).then((result) => {
    if (!result?.ok) {
      console.warn(JSON.stringify({
        event: "customerops_background_sync_incomplete",
        email: identity.email,
        status: result?.status || "unknown"
      }));
    }
  }).catch((error) => {
    console.error(JSON.stringify({
      event: "customerops_background_sync_failed",
      email: identity.email,
      message: error instanceof Error ? error.message : "Unknown CustomerOps error"
    }));
  });

  if (typeof context.waitUntil === "function") context.waitUntil(task);
  else return task;
  return Promise.resolve();
}

export async function onRequestGet(context) {
  try {
    const settings = await getAgeVerificationSettings(context.env.DB, context.env);
    if (settings.serviceStatus !== "live") {
      await recordAgeVerificationEvent(context.env.DB, context.request, {
        eventType: "microsoft_callback_during_unavailable_service", outcome: "failed",
        method: settings.verificationMethod, provider: settings.providerName,
        detail: `Microsoft callback blocked while age-verification status was ${settings.serviceStatus}.`,
      }).catch(() => null);
      return new Response("New customer registration is temporarily paused while age verification is maintained.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "900" },
      });
    }
    if (settings.verificationMethod === "independent_provider") {
      await recordAgeVerificationEvent(context.env.DB, context.request, {
        eventType: "provider_result_missing", outcome: "failed", method: settings.verificationMethod,
        provider: settings.providerName, detail: "Microsoft callback did not contain a supported independent-provider result.",
      }).catch(() => null);
      return new Response("Independent age verification must be completed before Microsoft sign-in can finish.", {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    const assurance = await readAgeAssurance(context.request, context.env);
    if (!assurance?.eligible) {
      await recordAgeVerificationEvent(context.env.DB, context.request, {
        eventType: "microsoft_callback_without_age_result", outcome: "failed",
        method: settings.verificationMethod, detail: "No valid signed 16+ age result was present at the Microsoft callback.",
      }).catch(() => null);
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

    assurance.policyVersion = settings.policyVersion;
    await persistAgeAssurance(context.env.DB, identity.email, assurance);
    await recordAgeVerificationEvent(context.env.DB, context.request, {
      eventType: "microsoft_account_linked", outcome: "passed", ageBand: assurance.ageBand,
      subjectEmail: identity.email, method: assurance.method || settings.verificationMethod,
      provider: settings.providerName, detail: "The signed age result was linked to the verified Microsoft customer identity.",
    }).catch(() => null);
    await recordCompletedLogin(context, response, "customer").catch(() => null);

    // CustomerOps is deliberately non-blocking. Planyx sign-in succeeds even if
    // Head Office is temporarily unavailable; the next sign-in retries automatically.
    await scheduleCustomerOpsSync(context, identity);
    return response;
  } catch (error) {
    console.error(JSON.stringify({
      event: "customer_oidc_callback_failed",
      message: error instanceof Error ? error.message : "Unknown error",
      details: error instanceof Error ? (error.details || null) : null,
      auth_stage: error instanceof Error ? (error.authStage || null) : null
    }));
    await recordAuthenticationFailure(context.env.DB, context.request, "customer", error).catch(() => null);
    await recordAgeVerificationEvent(context.env.DB, context.request, {
      eventType: "microsoft_callback_failure", outcome: "failed",
      detail: error instanceof Error ? error.message : "Customer sign-in could not be completed.",
    }).catch(() => null);
    return new Response("Customer sign-in could not be completed. Complete the 16+ age check and try again.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}
