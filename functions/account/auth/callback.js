import { completeLogin, expireOidcCookie, getNativeSession } from "../../_shared/oidc.js";
import { readAgeAssurance, persistAgeAssurance } from "../../_shared/age-assurance.js";
import { getAgeVerificationSettings, recordAgeVerificationEvent } from "../../_shared/age-verification-settings.js";
import { recordAuthenticationFailure } from "../../_shared/auth-attempt-audit.js";
import { recordCompletedLogin } from "../../_shared/completed-login-audit.js";
import { syncCustomerWithHeadOffice } from "../../_shared/customerops.js";
import {
  blocksAccess,
  flushCustomerOpsOutbox,
  reportCustomerEvent,
  reportCustomerSnapshot,
  reportPlatformHeartbeat,
  revokeLocalCustomerSession
} from "../../_shared/customerops-central.js";

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

function restrictedRedirect(_reason, decision = "deny", status = 303) {
  const normalized = String(decision || "deny").trim().toLowerCase();
  const location = normalized === "step_up"
    ? "/account/verification-required/"
    : "/account/access-restricted/";
  return new Response(null, {
    status,
    headers: {
      Location: location,
      "Set-Cookie": expireOidcCookie("customer"),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function scheduleAllowedTelemetry(context, identity, syncResult) {
  const task = (async () => {
    await reportCustomerEvent(context.env, context.env.DB, identity, {
      eventType: "auth.succeeded",
      title: "Customer signed in to Planyx",
      category: "authentication",
      outcome: "allowed",
      severity: "information",
      session: {
        id: identity.tokenHash,
        status: "active",
        startedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        deviceSummary: String(context.request.headers.get("User-Agent") || "").slice(0, 500),
        ipCountry: String(context.request.headers.get("CF-IPCountry") || "").slice(0, 8)
      },
      metadata: { matchedBy: syncResult.matchedBy || null }
    });
    await reportCustomerSnapshot(context.env, context.env.DB, identity, {
      metadata: { signInSource: "JA Group Services ID" }
    }).catch(() => null);
    await reportPlatformHeartbeat(context.env, context.env.DB, { trigger: "customer_sign_in" }).catch(() => null);
    await flushCustomerOpsOutbox(context.env, context.env.DB).catch(() => null);
  })().catch(error => {
    console.error(JSON.stringify({
      event: "customerops_allowed_telemetry_failed",
      email: identity.email,
      message: error instanceof Error ? error.message : "Unknown CustomerOps telemetry error"
    }));
  });
  if (typeof context.waitUntil === "function") context.waitUntil(task);
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

    // Head Office is the authoritative access controller. A customer session is
    // not released to Planyx until the UCN is synchronised and CustomerOps has
    // returned an allow decision.
    const syncResult = await syncCustomerWithHeadOffice(context, identity);
    if (!syncResult?.ok) {
      const reason = syncResult?.error || "Head Office customer protection is temporarily unavailable.";
      await revokeLocalCustomerSession(context.env.DB, identity, reason);
      await reportCustomerEvent(context.env, context.env.DB, identity, {
        eventType: "auth.failed",
        title: "Planyx sign-in stopped because CustomerOps was unavailable",
        category: "authentication",
        outcome: "blocked",
        severity: "high",
        reason,
        metadata: { customerOpsStatus: syncResult?.status || "error" }
      }).catch(() => null);
      return restrictedRedirect(reason, "review", 303);
    }

    const access = syncResult.enforcement || { decision: "review", action: "review", revokeSessions: true, reason: "Head Office did not return an access decision." };
    if (blocksAccess(access)) {
      const reason = access.reason || "Head Office has restricted access to this customer account.";
      await revokeLocalCustomerSession(context.env.DB, identity, reason);
      await reportCustomerEvent(context.env, context.env.DB, identity, {
        eventType: "auth.denied",
        title: "Customer sign-in denied by Head Office",
        category: "security",
        outcome: "denied",
        severity: "high",
        reason,
        metadata: { decision: access.decision || access.action, restrictions: access.restrictions || [] }
      }).catch(() => null);
      return restrictedRedirect(reason, access.decision || access.action || "deny", 303);
    }

    await recordCompletedLogin(context, response, "customer").catch(() => null);
    scheduleAllowedTelemetry(context, identity, syncResult);
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
