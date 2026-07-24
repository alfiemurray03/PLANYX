import {
  builtInAnswer,
  clean,
  configFrom,
  knowledgeFrom,
  loadAssistantSettings,
  workersAiAnswer
} from "../_shared/support-assistant-core.js";
import { guidedEscalation } from "../_shared/support-assistant-triage.js";
import {
  recordAssistantEvent,
  recordAssistantExchange
} from "../_shared/support-assistant-monitor.js";
import {
  createCustomerVerificationSession,
  verifySupportPinRecord
} from "../admin/api.js";
import { getNativeSession, withIdentity } from "../_shared/oidc.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

function issueOnlyHistory(rawHistory) {
  const history = Array.isArray(rawHistory) ? rawHistory : [];
  const boundary = history.findLastIndex((item) => item?.role === "assistant" && /now, please tell me what you need help with/i.test(String(item?.content || item?.text || "")));
  return (boundary >= 0 ? history.slice(boundary + 1) : history).slice(-20);
}

function acknowledgementOnly(message) {
  return /^(?:ok(?:ay)?|yes|no|sure|continue|go ahead|thanks?|thank you|hi|hello|hey|help)[.! ]*$/i.test(message);
}

function contactStatusFrom(settings) {
  return ["online", "maintenance", "offline"].includes(settings.contact_page_status)
    ? settings.contact_page_status
    : "online";
}

export async function onRequest(context) {
  const { env } = context;
  let request = withIdentity(context.request, null);
  const settings = await loadAssistantSettings(env.DB);
  const config = configFrom(settings);
  const articles = knowledgeFrom(settings);
  let identity = null;
  try {
    identity = await getNativeSession(request, env, "customer");
  } catch (error) {
    console.error(JSON.stringify({ event: "support_assistant_session_error", message: error instanceof Error ? error.message : String(error) }));
  }
  request = withIdentity(request, identity);
  const identityEmail = clean(identity?.email || request.headers.get("x-ja-auth-email"), 254).toLowerCase();
  const now = Date.now();
  const scheduledStart = config.maintenanceStart ? Date.parse(config.maintenanceStart) : 0;
  const scheduledEnd = config.maintenanceEnd ? Date.parse(config.maintenanceEnd) : 0;
  const scheduledMaintenance = Boolean(scheduledStart && now >= scheduledStart && (!scheduledEnd || now <= scheduledEnd));
  const maintenanceActive = config.maintenanceEnabled || scheduledMaintenance;

  if (request.method === "GET") {
    return json({
      success: true,
      config: {
        enabled: config.enabled,
        maintenanceEnabled: maintenanceActive,
        maintenanceMessage: config.maintenanceMessage,
        maintenanceStart: config.maintenanceStart,
        maintenanceEnd: config.maintenanceEnd,
        maintenanceAllowEnquiries: false,
        allowAnonymous: config.allowAnonymous,
        selfHelpEnabled: config.selfHelpEnabled,
        escalationEnabled: config.escalationEnabled,
        assistantName: config.assistantName,
        logoUrl: config.logoUrl,
        avatarUrl: config.avatarUrl,
        fontFamily: config.fontFamily,
        welcomeMessage: config.welcomeMessage,
        responseTime: config.responseTime,
        maxSelfHelpTurns: config.maxSelfHelpTurns,
        position: config.position,
        primaryColor: config.primaryColor,
        accentColor: config.accentColor,
        panelWidth: config.panelWidth,
        panelHeight: config.panelHeight,
        borderRadius: config.borderRadius,
        launcherSize: config.launcherSize,
        launcherLabel: config.launcherLabel,
        inputPlaceholder: config.inputPlaceholder,
        showPoweredBy: config.showPoweredBy,
        autoOpenDelaySeconds: config.autoOpenDelaySeconds,
        contactPageEnabled: config.contactPageEnabled,
        contactEyebrow: config.contactEyebrow,
        contactTitle: config.contactTitle,
        contactIntroduction: config.contactIntroduction,
        contactAiTitle: config.contactAiTitle,
        contactAiDescription: config.contactAiDescription,
        contactSupportEmail: config.contactSupportEmail,
        contactGeneralEmail: config.contactGeneralEmail,
        contactDpoEmail: config.contactDpoEmail,
        contactPhoneDisplay: config.contactPhoneDisplay,
        contactPhoneHref: config.contactPhoneHref,
        contactRegisteredOffice: config.contactRegisteredOffice,
        contactCompanyDetails: config.contactCompanyDetails,
        contactResponseStandard: config.contactResponseStandard,
        contactResponseTechnical: config.contactResponseTechnical,
        contactResponseData: config.contactResponseData,
        contactResponseNote: config.contactResponseNote,
        contactEmailEnabled: config.contactEmailEnabled,
        contactTelephoneEnabled: config.contactTelephoneEnabled,
        contactPageStatus: contactStatusFrom(settings),
        contactMaintenanceTitle: clean(settings.contact_maintenance_title || "Contact support is temporarily unavailable", 160),
        contactMaintenanceReason: clean(settings.contact_maintenance_reason || "Contact service maintenance", 160),
        contactMaintenanceMessage: clean(settings.contact_maintenance_message || "We are carrying out essential work on the Planyx contact service. Please check back shortly.", 800),
        contactMaintenanceStart: clean(settings.contact_maintenance_start, 40),
        contactMaintenanceExpectedReturn: clean(settings.contact_maintenance_expected_return, 40),
        contactOfflineMessage: clean(settings.contact_offline_message || "The Contact Us page is currently offline.", 800)
      },
      categories: Array.from(new Set(articles.map((article) => article.category))).filter(Boolean),
      articleCount: articles.length,
      authenticated: Boolean(identityEmail),
      customer: identityEmail ? { email: identityEmail, name: clean(identity?.name, 180) } : null,
      articles: articles.map((article) => ({
        id: article.id,
        category: article.category,
        title: article.title,
        summary: article.summary,
        answer: article.answer,
        steps: article.steps,
        keywords: article.keywords,
        href: article.href || "/help-centre"
      }))
    });
  }

  if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  if (!sameOrigin(request)) return json({ success: false, error: "Request origin was rejected." }, 403);

  const body = await request.json().catch(() => ({}));
  if (!config.enabled) return json({ success: false, error: "The support assistant is currently unavailable." }, 503);
  if (maintenanceActive) {
    return json({ success: false, error: config.maintenanceMessage, maintenance: true }, 503);
  }

  const event = clean(body.event, 40).toLowerCase();
  if (["open", "heartbeat", "close"].includes(event)) {
    await recordAssistantEvent(env.DB, request, body, event);
    return json({ success: true, event });
  }

  if (!identityEmail && !config.allowAnonymous) {
    return json({ success: false, error: "Please sign in to use the support assistant." }, 401);
  }

  if (event === "verify_support_pin") {
    if (!identityEmail) return json({ success: false, error: "Please sign in before verifying your identity." }, 401);
    if (!/^\d{6}$/.test(String(body.pin || "").trim())) {
      return json({ success: false, error: "Enter the six-digit Planyx Support PIN." }, 400);
    }
    const result = await verifySupportPinRecord(env.DB, env, identityEmail, String(body.pin).trim(), "support-assistant");
    if (!result.ok) return json({ success: false, error: result.error || "The Support PIN could not be verified." }, 400);
    const expiresAt = await createCustomerVerificationSession(env.DB, { email: "support-assistant" }, identityEmail, "Support PIN · chatbot human handover");
    return json({ success: true, verified: true, expiresAt });
  }

  const message = clean(body.message, 2000);
  if (message.length < 2) return json({ success: false, error: "Please enter a question." }, 400);
  const history = issueOnlyHistory(body.history);
  const issueTurns = history.filter((item) => item?.role === "user").length;

  let result;
  if (issueTurns <= 1 && acknowledgementOnly(message)) {
    result = {
      reply: "I’m ready to help, but I still need a description of the issue. Please tell me what happened, which page or feature is affected, and what you expected to happen.",
      suggestions: [],
      escalate: false,
      resolved: false,
      source: "issue_intake_guard"
    };
  } else {
    result = guidedEscalation(config, message, history);
    if (!result) result = await workersAiAnswer(env, config, articles, message, history);
    if (!result) result = builtInAnswer(config, articles, message, history);
  }
  await recordAssistantExchange(env.DB, request, { ...body, history }, result, config.provider === "workers_ai" ? config.model : "");

  return json({
    success: true,
    assistantName: config.assistantName,
    responseTime: config.responseTime,
    ...result
  });
}
