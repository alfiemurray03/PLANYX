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
import {
  centralAiMessage,
  centralBranchConfig,
  centralConversationEvent,
  centralConversationMessages,
  centralCustomerMessage,
  centralCustomerServiceEnabled,
  ensureCentralConversation
} from "../_shared/customer-service-centre.js";

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

function privacyIntent(message) {
  return /\b(?:subject access request|data subject|delete my data|erase my data|privacy request|personal data|data protection|uk gdpr|gdpr|rectif(?:y|ication)|data portability)\b/i.test(message);
}

function securityIntent(message) {
  return /\b(?:account hacked|account compromised|unauthorised access|unauthorized access|fraud|stolen account|suspicious login|security breach|password stolen|someone accessed my account)\b/i.test(message);
}

function safeguardingReply(message) {
  if (immediateDangerIntent(message)) {
    return {
      reply: "If anyone is in immediate danger or a serious offence is happening, stop using this chat and call 999 now. Sousa Murray Planeia support is not an emergency service. If it is safe to do so, move away from danger and follow the emergency operator’s instructions.",
      suggestions: [],
      escalate: true,
      resolved: false,
      category: "Safeguarding",
      priority: "Critical",
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
    reply: "Thank you for telling me. I have placed the AI into standby so this can be handled through the restricted safeguarding route. Sousa Murray Planeia support cannot replace emergency services or investigate abuse. Call 999 where there is immediate danger. A genuine concern about a child or young person can also be reported to the relevant local authority children’s social care team or police without waiting for proof.",
    suggestions: [],
    escalate: true,
    resolved: false,
    category: "Safeguarding",
    priority: "High",
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
    reply: "Sousa Murray Planeia customer accounts are strictly for people aged 16 or over. Nobody under 16 is permitted to register or use a customer account. Please do not enter a false date of birth. You can still view public information and the safety page without registering.",
    suggestions: [],
    escalate: false,
    resolved: true,
    category: "Account eligibility",
    priority: "Normal",
    article: {
      id: "planyx-16-plus-safety",
      title: "16+ safety and safeguarding",
      category: "Safeguarding",
      summary: "Sousa Murray Planeia account eligibility and young-person safeguards.",
      href: "/safety"
    },
    source: "minimum_age_guard"
  };
}

function privacyReply() {
  return {
    reply: "I have placed the AI into standby and routed this through the restricted data-protection process. Please do not add unnecessary identification documents or sensitive information in the chat. An authorised data-protection handler can review the request and explain any verification that is genuinely required.",
    suggestions: [],
    escalate: true,
    resolved: false,
    category: "Data Protection",
    priority: "High",
    source: "data_protection_guard"
  };
}

function securityReply() {
  return {
    reply: "I have placed the AI into standby and flagged this for security review. Do not send your password, one-time codes or full payment-card details. If you can still access your account, use the security settings to change your password and review active sessions while the authorised team investigates.",
    suggestions: [],
    escalate: true,
    resolved: false,
    category: "Security",
    priority: "Critical",
    source: "account_security_guard"
  };
}

async function readCentralConfiguration(env) {
  if (!centralCustomerServiceEnabled(env)) return null;
  try {
    const result = await centralBranchConfig(env);
    return result?.branch || null;
  } catch (error) {
    console.error(JSON.stringify({
      event: "central_support_config_unavailable",
      code: clean(error?.code, 120),
      message: clean(error?.message, 1000)
    }));
    return null;
  }
}

function mergeCentralConfig(localConfig, branch) {
  if (!branch) return localConfig;
  return {
    ...localConfig,
    enabled: branch.enabled === true,
    maintenanceEnabled: branch.maintenanceEnabled === true,
    maintenanceMessage: branch.maintenanceMessage || localConfig.maintenanceMessage,
    allowAnonymous: branch.anonymousEnabled !== false,
    escalationEnabled: branch.humanTakeoverEnabled !== false,
    assistantName: branch.assistantName || localConfig.assistantName,
    welcomeMessage: branch.greeting || localConfig.welcomeMessage
  };
}

function schedule(context, task, event) {
  const safe = Promise.resolve(task).catch(error => {
    console.error(JSON.stringify({
      event: event || "central_support_task_failed",
      code: clean(error?.code, 120),
      message: clean(error?.message, 1000)
    }));
  });
  if (typeof context.waitUntil === "function") context.waitUntil(safe);
  return safe;
}

async function centralEvent(context, identity, body, event) {
  if (!centralCustomerServiceEnabled(context.env) || !clean(body.sessionId, 180)) return;
  const conversation = await ensureCentralConversation(context.env, context.env.DB, identity, {
    sessionId: body.sessionId,
    pagePath: body.pagePath,
    pageTitle: body.pageTitle,
    category: body.category || "general",
    priority: body.priority || "normal",
    serviceContext: body.serviceContext
  });
  await centralConversationEvent(context.env, body.sessionId, event, {
    pagePath: body.pagePath,
    metadata: { source: "planyx_support_assistant", conversationReference: conversation?.conversation?.reference }
  });
}

async function centralPreflight(context, identity, body, message) {
  if (!centralCustomerServiceEnabled(context.env) || !clean(body.sessionId, 180)) return { enabled: false, humanHandling: false };
  const conversation = await ensureCentralConversation(context.env, context.env.DB, identity, {
    sessionId: body.sessionId,
    pagePath: body.pagePath,
    pageTitle: body.pageTitle,
    category: body.category || "general",
    priority: body.priority || "normal",
    serviceContext: body.serviceContext
  });
  const state = await centralConversationMessages(context.env, body.sessionId).catch(() => ({ conversation: conversation.conversation, messages: [] }));
  const handlingMode = state?.conversation?.handlingMode || conversation?.conversation?.handlingMode || "ai";
  const externalMessageId = clean(body.messageId, 160) || `customer-${clean(body.sessionId, 100)}-${Number(body.turn || 0)}`;
  await centralCustomerMessage(context.env, body.sessionId, {
    externalMessageId,
    senderName: clean(identity?.name, 120) || "Customer",
    body: message,
    metadata: { pagePath: body.pagePath, source: "planyx_support_assistant" }
  });
  return {
    enabled: true,
    humanHandling: !["ai", "hybrid"].includes(handlingMode),
    conversation: state?.conversation || conversation?.conversation,
    externalMessageId
  };
}

async function centralRecordAnswer(context, identity, body, result, preflight) {
  if (!preflight?.enabled || preflight.humanHandling || !clean(body.sessionId, 180)) return;
  const category = result.category || "general";
  const priority = result.priority || "normal";
  await ensureCentralConversation(context.env, context.env.DB, identity, {
    sessionId: body.sessionId,
    pagePath: body.pagePath,
    pageTitle: body.pageTitle,
    category,
    priority,
    serviceContext: body.serviceContext
  });
  if (result.reply) {
    await centralAiMessage(context.env, body.sessionId, {
      externalMessageId: `assistant-${preflight.externalMessageId}`,
      senderName: result.assistantName || "Sousa Murray Planeia Support Assistant",
      body: result.reply,
      metadata: {
        category,
        priority,
        source: result.source,
        articleId: result.article?.id
      }
    });
  }
  if (result.escalate || ["safeguarding", "data protection", "security"].includes(String(category).toLowerCase())) {
    await centralConversationEvent(context.env, body.sessionId, "request_human", {
      pagePath: body.pagePath,
      metadata: { category, priority, reason: result.source || "assistant_escalation" }
    });
  }
}

export async function onRequest(context) {
  const { env } = context;
  let request = withIdentity(context.request, null);
  const settings = await loadAssistantSettings(env.DB);
  const localConfig = configFrom(settings);
  const centralBranch = await readCentralConfiguration(env);
  const config = mergeCentralConfig(localConfig, centralBranch);
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
      centralEnabled: Boolean(centralBranch?.enabled),
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
        humanTakeoverEnabled: centralBranch?.humanTakeoverEnabled !== false,
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
        emergencyNotice: centralBranch?.emergencyNotice || "",
        contactPageEnabled: contact.enabled,
        contactEnquiriesAvailable: contact.available,
        contactEyebrow: config.contactEyebrow,
        contactTitle: config.contactTitle,
        contactIntroduction: config.contactIntroduction,
        contactAiTitle: config.contactAiTitle,
        contactAiDescription: config.contactAiDescription,
        contactSupportEmail: centralBranch?.contactOptions?.email || contact.supportEmail,
        contactGeneralEmail: config.contactGeneralEmail,
        contactDpoEmail: config.contactDpoEmail,
        contactPhoneDisplay: centralBranch?.contactOptions?.phone || contact.phoneDisplay,
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
    if (centralCustomerServiceEnabled(env)) {
      const centralEventName = event === "open" ? "heartbeat" : event;
      schedule(context, centralEvent(context, identity, body, centralEventName), `central_support_${event}_failed`);
    }
    return json({ success: true, event, centralEnabled: centralCustomerServiceEnabled(env) });
  }

  if (!identityEmail && !config.allowAnonymous) return json({ success: false, error: "Please sign in to use the support assistant." }, 401);

  if (event === "verify_support_pin") {
    if (!contact.available) return json({ success: false, contactUnavailable: true, contactPageStatus: contact.status, error: contact.message }, 503);
    if (!identityEmail) return json({ success: false, error: "Please sign in before verifying your identity." }, 401);
    if (!/^\d{6}$/.test(String(body.pin || "").trim())) return json({ success: false, error: "Enter the six-digit Sousa Murray Planeia Support PIN." }, 400);
    const result = await verifySupportPinRecord(env.DB, env, identityEmail, String(body.pin).trim(), "support-assistant");
    if (!result.ok) return json({ success: false, error: result.error || "The Support PIN could not be verified." }, 400);
    const expiresAt = await createCustomerVerificationSession(env.DB, { email: "support-assistant" }, identityEmail, "Support PIN · chatbot human handover");
    return json({ success: true, verified: true, expiresAt });
  }

  const message = clean(body.message, 2000);
  if (message.length < 2) return json({ success: false, error: "Please enter a question." }, 400);
  const history = issueOnlyHistory(body.history);
  const issueTurns = history.filter((item) => item?.role === "user").length;

  let central = { enabled: false, humanHandling: false };
  if (centralCustomerServiceEnabled(env)) {
    try {
      central = await centralPreflight(context, identity, body, message);
    } catch (error) {
      console.error(JSON.stringify({
        event: "central_support_preflight_failed",
        code: clean(error?.code, 120),
        message: clean(error?.message, 1000)
      }));
    }
  }

  if (central.humanHandling) {
    const handoverResult = {
      reply: "Your message has been added to the same conversation for the authorised support team. The AI is in standby, so you will not need to repeat the issue when a staff member responds here.",
      suggestions: [],
      escalate: true,
      resolved: false,
      category: "Human support",
      priority: "Normal",
      source: "head_office_human_takeover",
      humanHandling: true
    };
    await recordAssistantExchange(env.DB, request, { ...body, history }, handoverResult, "");
    return json({
      success: true,
      assistantName: config.assistantName,
      responseTime: config.responseTime,
      centralEnabled: true,
      ...handoverResult
    });
  }

  let result;
  if (underSixteenIntent(message)) {
    result = underSixteenReply();
  } else if (safeguardingIntent(message)) {
    result = safeguardingReply(message);
  } else if (privacyIntent(message)) {
    result = privacyReply();
  } else if (securityIntent(message)) {
    result = securityReply();
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

  if (central.enabled) {
    try {
      await centralRecordAnswer(context, identity, body, { ...result, assistantName: config.assistantName }, central);
    } catch (error) {
      console.error(JSON.stringify({
        event: "central_support_exchange_failed",
        code: clean(error?.code, 120),
        message: clean(error?.message, 1000)
      }));
    }
  }

  return json({
    success: true,
    centralEnabled: central.enabled,
    assistantName: config.assistantName,
    responseTime: config.responseTime,
    contactPageStatus: contact.status,
    contactEnquiriesAvailable: contact.available,
    ...result
  });
}
