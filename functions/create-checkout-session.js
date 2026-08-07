import { readFeatureFlag } from "./_shared/feature-flags.js";
import { expireOidcCookie, getNativeSession, loginRedirect } from "./_shared/oidc.js";
import { issueCustomerAgeChallenge } from "./_shared/customerops-age-assurance.js";
import {
  blocksAccess,
  checkHeadOfficeAccess,
  isHeadOfficeAgeStepUp,
  revokeLocalCustomerSession,
} from "./_shared/customerops-central.js";
import {
  createPlaneiaCentralCheckout,
  PLANEIA_CENTRAL_PLANS,
} from "./_shared/central-payments.js";

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const planCode = String(url.searchParams.get("plan") || "").trim();
    const accountType = String(url.searchParams.get("accountType") || "").trim();
    if (!planCode) return redirectTo(`${siteUrl(context.env)}/pricing/`);
    return startCheckout(context, planCode, accountType);
  } catch (error) {
    console.error(JSON.stringify({ event: "central_checkout_get_failed", message: errorMessage(error) }));
    return redirectTo(`${siteUrl(context.env)}/pricing/?checkout=unavailable`);
  }
}

export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    return startCheckout(
      context,
      String(formData.get("plan") || "").trim(),
      String(formData.get("accountType") || "").trim(),
    );
  } catch (error) {
    console.error(JSON.stringify({ event: "central_checkout_post_failed", message: errorMessage(error) }));
    return redirectTo(`${siteUrl(context.env)}/pricing/?checkout=unavailable`);
  }
}

async function startCheckout(context, planCode, requestedAccountType) {
  if (!context.env?.DB) return redirectTo(`${siteUrl(context.env)}/pricing/?checkout=unavailable`);
  const identity = await customerIdentity(context);
  if (!identity?.email) return loginRedirect(context.request, "customer");

  const authority = await requireCheckoutAccess(context, identity);
  if (authority.response) return authority.response;

  const paymentsEnabled = await readFeatureFlag(context.env.DB, "payments", false);
  if (!paymentsEnabled) return redirectTo(`${siteUrl(context.env)}/pricing/?payments=disabled`);

  const plan = PLANEIA_CENTRAL_PLANS[planCode];
  if (!plan) return redirectTo(`${siteUrl(context.env)}/pricing/?plan=coming-soon`);

  const businessPlan = planCode.startsWith("business_");
  const accountType = businessPlan ? "organisation" : "individual";
  if (requestedAccountType && ![accountType, businessPlan ? "business" : "personal"].includes(requestedAccountType.toLowerCase())) {
    return redirectTo(`${siteUrl(context.env)}/pricing/?plan=account-type-mismatch`);
  }

  try {
    const checkout = await createPlaneiaCentralCheckout(
      context.env,
      context.env.DB,
      identity,
      planCode,
      accountType,
      siteUrl(context.env),
    );
    return redirectTo(checkout.url);
  } catch (error) {
    console.error(JSON.stringify({
      event: "head_office_central_checkout_failed",
      planCode,
      code: error?.code || "CENTRAL_CHECKOUT_FAILED",
      message: errorMessage(error),
    }));
    return redirectTo(`${siteUrl(context.env)}/pricing/?checkout=unavailable`);
  }
}

async function customerIdentity(context) {
  try {
    return await getNativeSession(context.request, context.env, "customer");
  } catch (error) {
    console.error(JSON.stringify({ event: "checkout_customer_session_unavailable", message: errorMessage(error) }));
    return null;
  }
}

function protectedCheckoutRedirect(path, challengeCookie = "") {
  const headers = new Headers({ Location: path, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  headers.append("Set-Cookie", expireOidcCookie("customer"));
  if (challengeCookie) headers.append("Set-Cookie", challengeCookie);
  return new Response(null, { status: 303, headers });
}

async function requireCheckoutAccess(context, identity) {
  if (!context.env?.DB || !identity?.email) {
    return { response: protectedCheckoutRedirect("/account/access-restricted/") };
  }
  try {
    const result = await checkHeadOfficeAccess(context.env, context.env.DB, identity);
    const access = result.access || { decision: "review", revokeSessions: true };
    if (!blocksAccess(access)) return { access };

    let challengeCookie = "";
    if (isHeadOfficeAgeStepUp(access)) {
      const challenge = await issueCustomerAgeChallenge(context.env.DB, identity, result.reference, access.ageAssurance);
      challengeCookie = challenge.cookie;
    }
    await revokeLocalCustomerSession(context.env.DB, identity, access.reason || "Head Office checkout protection");
    return {
      response: protectedCheckoutRedirect(
        isHeadOfficeAgeStepUp(access) ? "/account/verification-required/" : "/account/access-restricted/",
        challengeCookie,
      ),
    };
  } catch (error) {
    await revokeLocalCustomerSession(context.env.DB, identity, errorMessage(error)).catch(() => null);
    return { response: protectedCheckoutRedirect("/account/access-restricted/") };
  }
}

function siteUrl(env) {
  const configured = String(env?.SITE_URL || "https://sousamurrayplaneia.jagroupservices.co.uk").trim().replace(/\/$/, "");
  try {
    const parsed = new URL(configured);
    return parsed.protocol === "https:" ? parsed.origin : "https://sousamurrayplaneia.jagroupservices.co.uk";
  } catch {
    return "https://sousamurrayplaneia.jagroupservices.co.uk";
  }
}

function redirectTo(location) {
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Unknown checkout error");
}
