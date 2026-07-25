import { beginLogin } from "../_shared/oidc.js";
import { readAgeAssurance } from "../_shared/age-assurance.js";
import { getAgeVerificationSettings, recordAgeVerificationEvent } from "../_shared/age-verification-settings.js";

function safeReturnPath(value) {
  try {
    const raw = String(value || "/dashboard");
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
    const url = new URL(raw, "https://planyx.local");
    return `${url.pathname}${url.search}`;
  } catch {
    return "/dashboard";
  }
}

export async function onRequestGet(context) {
  try {
    const requestUrl = new URL(context.request.url);
    const returnTo = safeReturnPath(requestUrl.searchParams.get("return_to"));
    const settings = await getAgeVerificationSettings(context.env.DB, context.env);
    if (settings.serviceStatus !== "live") {
      await recordAgeVerificationEvent(context.env.DB, context.request, {
        eventType: "microsoft_login_start_blocked", outcome: "failed",
        method: settings.verificationMethod, provider: settings.providerName,
        detail: `Microsoft customer login start blocked while age-verification status was ${settings.serviceStatus}.`,
      }).catch(() => null);
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/age-check?return_to=${encodeURIComponent(returnTo)}`,
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    if (settings.verificationMethod === "independent_provider") {
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/age-check?return_to=${encodeURIComponent(returnTo)}`,
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    const assurance = await readAgeAssurance(context.request, context.env);
    if (!assurance?.eligible) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/age-check?return_to=${encodeURIComponent(returnTo)}`,
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    return await beginLogin(context, "customer");
  } catch (error) {
    console.error(JSON.stringify({ event: "customer_oidc_login_start_failed", message: error instanceof Error ? error.message : "Unknown error" }));
    return new Response("Customer authentication is temporarily unavailable.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}
