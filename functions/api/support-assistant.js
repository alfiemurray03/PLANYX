import {
  builtInAnswer,
  clean,
  configFrom,
  knowledgeFrom,
  loadAssistantSettings,
  workersAiAnswer
} from "../_shared/support-assistant-core.js";
import { contactServiceStatusFromSettings } from "../_shared/contact-service-status.js";
import { guidedEscalation } from "../_shared/support-assistant-triage.js";
import { recordAssistantEvent, recordAssistantExchange } from "../_shared/support-assistant-monitor.js";
import { createCustomerVerificationSession, verifySupportPinRecord } from "../admin/api.js";
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

function enquirySuggestion(value) {
  return /(?:create|send|submit).*(?:enquir|contact)|contact (?:the )?team|human support/i.test(String(value || ""));
}

function safeguardingIntent(message) {
  return /\b(?:safeguard(?:ing)?|abuse[ds]?|neglect(?:ed)?|groom(?:ing|ed)?|exploit(?:ation|ed)?|sexual(?:ly)?|rape[ds]?|assault(?:ed)?|domestic violence|coercive control|traffick(?:ing|ed)?|forced labour|child protection|social services|children'?s services|young person at risk|self[- ]?harm|suicid(?:e|al)|immediate danger|not safe|unsafe at home)\b/i.test(message);
}

function immediateDangerIntent(message) {
  return /\b(?:right now|happening now|currently happening|immediate danger|life[- ]threatening|weapon|seriously injured|about to hurt|going to kill|cannot stay safe|not safe now|emergency)\b/i.test(message);
}

function underSixteenIntent(message) {
  return /\b(?:i am|i'm|im)\s+(?:under\s+16|1[0-5](?:\s+years?\s+old)?)\b|\bunder[- ]?16\b|\b(?:age|aged)\s+1[0-5]\b/i.test(message);
}

function safeguardingReply(message) {
  if (immediateDangerIntent(message)) {
    return {
      reply: "If anyone is in immediate danger or a serious offence is happening, stop using this chat and call 999 now. Planyx support is not an emergency service. If it is safe to do so, move away from danger and follow the emergency operator’s instructions.",
      suggestions: [],
      escalate: false,
      resolved: false,
      category: "Safeguarding",
      priority: "Emergency",
      article: {
        id: "planyx-16-plus-safety",
        title: "16+ safety and safeguarding",
        category: "Safeguarding",
        summary: "Emergency, child-protection and young-person support routes.",
        href: "/safety"
      },
      source: "safeguarding_emergency_guard"
    };
  }
  return {
    reply: "Thank you for telling me. Planyx support cannot investigate abuse or replace the authorities. If a child or young person may be at risk, contact the children’s social care team at their local council. Call 999 for immediate danger; otherwise a suspected crime can be reported through 101 or the responsible police force online. You do not need proof before reporting a genuine child-safeguarding concern. Adults can also contact the NSPCC on 0808 800 5000, and children or young people can contact Childline on 0800 1111.",
    suggestions: [],
    escalate: false,
    resolved: false,
    category: "Safeguarding",
    priority: "Urgent",
    article: {
      id: "planyx-16-plus-safety",
      title: "16+ safety and safeguarding",
      category: "Safeguarding",
      summary: "Emergency, child-protection and young-person support routes.",
      href: "/safety"
    },
    source: "safeguarding_guard"
  };
}

function underSixteenReply() {
  return {
    reply: "Planyx customer accounts are strictly for people aged 16 or over. Nobody under 16 is permitted to register or use a customer account. Please do not enter a false date of birth. You can still view public information and the safety page without registering.",
    suggestions: [],
    escalate: false,
    resolved: true,
    category: "Account eligibility",
    priority: "Normal",
    article: {
      id: "planyx-16-plus-safety",
      title: "16+ safety and safeguarding",
      category: "Safeguarding",
      summary: "Planyx account eligibility and young-person safeguards.",
      href: "/safety"
    },
    source: "minimum_age_guard"
  };
}

export async function onRequest(context) {
  const { env } = context;
  let request = withIdentity(context.request, null);
  const settings = await loadAssistantSettings(env.DB);
  const config = configFrom(settings);
  const contact = contactServiceStatusFromSettings(settings);
  const effectiveConfig = {
    ...config,
    escalationEnabled: config.escalationEnabled && contact.available,
    escalationPrompt: contact.available ? config.escalationPrompt : `${contact.message} I can still help with available self-service information.`
  };
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
        escalationEnabled: effectiveConfig.escalationEnabled,
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
        minimumAccountAge: 16,
        youngPersonSafeguards: true,
        safetyPage: "/safety",
        contactPageEnabled: contact.enabled,
        contactEnquiriesAvailable: contact.available,
        contactEyebrow: config.contactEyebrow,
        contactTitle: config.contactTitle,
        contactIntroduction: config.contactIntroduction,
        contactAiTitle: config.contactAiTitle,
        contactAiDescription: config.contactAiDescription,
        contactSupportEmail: contact.supportEmail,
        contactGeneralEmail: config.contactGeneralEmail,
        contactDpoEmail: config.contactDpoEmail,
        contactPhoneDisplay: contact.phoneDisplay,
        contactPhoneHref: contact.phoneHref,
        contactRegisteredOffice: config.contactRegisteredOffice,
        contactCompanyDetails: config.contactCompanyDetails,
        contactResponseStandard: config.contactResponseStandard,
        contactResponseTechnical: config.contactResponseTechnical,
        contactResponseData: config.contactResponseData,
        contactResponseNote: config.contactResponseNote,
        contactEmailEnabled: contact.emailEnabled,
        contactTelephoneEnabled: contact.telephoneEnabled,
        contactPageStatus: contact.status,
        contactMaintenanceTitle: clean(settings.contact_maintenance_title || "Contact support is temporarily unavailable", 160),
        contactMaintenanceReason: clean(settings.contact_maintenance_reason || "Contact service maintenance", 160),
        contactMaintenanceMessage: contact.maintenanceMessage,
        contactMaintenanceStart: clean(settings.contact_maintenance_start, 40),
        contactMaintenanceExpectedReturn: clean(settings.contact_maintenance_expected_return, 40),
        contactOfflineMessage: contact.offlineMessage
      },
      categories: Array.from(new Set(articles.map((article) => article.category))).filter(Boolean),
      articleCount: articles.length,
      authenticated: Boolean(identityEmail),
      customer: identityEmail ? { email: identityEmail, name: clean(identity?.name, 180) } : null,
      articles: articles.map((article) => ({
        id: article.id, category: article.category, title: article.title, summary: article.summary,
        answer: article.answer, steps: article.steps, keywords: article.keywords, href: article.href || "/help-centre"
      }))
    });
  }

  if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  if (!sameOrigin(request)) return json({ success: false, error: "Request origin was rejected." }, 403);

  const body = await request.json().catch(() => ({}));
  if (!config.enabled) return json({ success: false, error: "The support assistant is currently unavailable." }, 503);
  if (maintenanceActive) return json({ success: false, error: config.maintenanceMessage, maintenance: true }, 503);

  const event = clean(body.event, 40).toLowerCase();
  if (["open", "heartbeat", "close"].includes(event)) {
    await recordAssistantEvent(env.DB, request, body, event);
    return json({ success: true, event });
  }

  if (!identityEmail && !config.allowAnonymous) return json({ success: false, error: "Please sign in to use the support assistant." }, 401);

  if (event === "verify_support_pin") {
    if (!contact.available) return json({ success: false, contactUnavailable: true, contactPageStatus: contact.status, error: contact.message }, 503);
    if (!identityEmail) return json({ success: false, error: "Please sign in before verifying your identity." }, 401);
    if (!/^\d{6}$/.test(String(body.pin || "").trim())) return json({ success: false, error: "Enter the six-digit Planyx Support PIN." }, 400);
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
  if (underSixteenIntent(message)) {
    result = underSixteenReply();
  } else if (safeguardingIntent(message)) {
    result = safeguardingReply(message);
  } else if (issueTurns <= 1 && acknowledgementOnly(message)) {
    result = {
      reply: "I’m ready to help, but I still need a description of the issue. Please tell me what happened, which page or feature is affected, and what you expected to happen.",
      suggestions: [], escalate: false, resolved: false, source: "issue_intake_guard"
    };
  } else {
    result = guidedEscalation(effectiveConfig, message, history);
    if (!result) result = await workersAiAnswer(env, effectiveConfig, articles, message, history);
    if (!result) result = builtInAnswer(effectiveConfig, articles, message, history);
  }

  const attemptedHandover = Boolean(result?.escalate) || (result?.suggestions || []).some(enquirySuggestion);
  if (!contact.available && attemptedHandover) {
    result = {
      ...result,
      reply: [result.reply, contact.message, "Online enquiries are unavailable in this mode. I can continue helping with self-service information or you can use the published email or telephone details."].filter(Boolean).join("\n\n"),
      suggestions: ["Try another question", "Open the Help Centre"],
      escalate: false, resolved: false, source: `${result.source || "assistant"}_contact_unavailable`
    };
  }

  await recordAssistantExchange(env.DB, request, { ...body, history }, result, config.provider === "workers_ai" ? config.model : "");

  return json({
    success: true,
    assistantName: config.assistantName,
    responseTime: config.responseTime,
    contactPageStatus: contact.status,
    contactEnquiriesAvailable: contact.available,
    ...result
  });
}
