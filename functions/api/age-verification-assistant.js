import { clean, configFrom, loadAssistantSettings } from "../_shared/support-assistant-core.js";
import { getAgeVerificationSettings, recordAgeVerificationEvent } from "../_shared/age-verification-settings.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

function bool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

async function loadAgeAiSettings(DB) {
  if (!DB) return {};
  const result = await DB.prepare("SELECT key,value FROM site_settings WHERE key LIKE 'age_ai_%'").all().catch(() => ({ results: [] }));
  return Object.fromEntries((result.results || []).map((row) => [row.key, row.value]));
}

function ageAiConfig(record) {
  return {
    enabled: bool(record.age_ai_enabled, true),
    guidanceEnabled: bool(record.age_ai_guidance_enabled, true),
    privacyExplanationsEnabled: bool(record.age_ai_privacy_explanations_enabled, true),
    safeguardingTriageEnabled: bool(record.age_ai_safeguarding_triage_enabled, true),
    failureSupportEnabled: bool(record.age_ai_failure_support_enabled, true),
    contactHandoverEnabled: bool(record.age_ai_contact_handover_enabled, false),
    debugEnabled: bool(record.age_ai_debug_enabled, false),
    welcomeMessage: clean(record.age_ai_welcome_message || "Hello. I can explain Planyx’s 16+ age check, privacy safeguards and what to do if verification is not working. I cannot guess or approve anyone’s age.", 600),
    inputPlaceholder: clean(record.age_ai_input_placeholder || "Ask about the 16+ age check…", 120),
    guardrailMessage: clean(record.age_ai_guardrail_message || "Only the secure Planyx age check or an approved independent provider can decide account eligibility. The AI assistant cannot estimate, approve or override age verification.", 700),
    maxTurns: integer(record.age_ai_max_turns, 6, 1, 12),
  };
}

function containsPersonalBirthDate(message) {
  return /\b(?:date of birth|dob|birthday|born)\b.{0,24}\b(?:19|20)\d{2}\b|\b\d{1,2}[\/.-]\d{1,2}[\/.-](?:19|20)\d{2}\b/i.test(message);
}

function asksAiToDecideAge(message) {
  return /\b(?:guess|estimate|work out|decide|verify|approve|confirm)\b.{0,30}\bage\b|\bhow old do (?:i|they) look\b/i.test(message);
}

function saysUnderSixteen(message) {
  return /\b(?:under[- ]?16|aged?\s+1[0-5]|i am\s+1[0-5]|i'm\s+1[0-5])\b/i.test(message);
}

const KNOWLEDGE = [
  { terms: ["why", "16", "minimum", "age"], answer: "Planyx is restricted to people aged 16 or over. The check enforces that account rule and lets the platform apply enhanced privacy and safeguarding defaults to users aged 16–17." },
  { terms: ["privacy", "store", "data", "birth"], answer: "Use the secure date-of-birth field, not this chat. Planyx converts the result into eligibility and an age band. The normal customer profile does not retain the full date of birth." },
  { terms: ["16", "17", "young", "safeguards"], answer: "Customers aged 16–17 receive enhanced safeguards: private profile, public discovery off, non-essential profiling and marketing off, and precise location sharing off by default." },
  { terms: ["failed", "not working", "error", "maintenance", "paused"], answer: "Check the message shown by the secure age-check page. During maintenance or a registration pause, Planyx blocks new registrations rather than allowing an unverified account through." },
  { terms: ["microsoft", "sign in", "signup", "account"], answer: "The age check happens before Microsoft customer sign-in. Microsoft verifies the account identity and email address; the Planyx age gate or an approved independent provider supplies the age-eligibility result." },
  { terms: ["provider", "passport", "selfie", "document"], answer: "Independent-provider mode is only used after onboarding, technical validation and governance approval. Planyx should receive the minimum result needed rather than retaining identity-document images or selfies." },
];

function builtInAnswer(message, settings, ageAi) {
  const lower = message.toLowerCase();
  const best = KNOWLEDGE.map((item) => ({ item, score: item.terms.reduce((sum, term) => sum + (lower.includes(term) ? 2 : 0), 0) })).sort((a, b) => b.score - a.score)[0];
  const state = settings.serviceStatus === "live" ? "The age-verification service is currently live." : `The age-verification service is currently ${settings.serviceStatus}; new registration remains safely blocked.`;
  return `${best?.score ? best.item.answer : "I can explain the 16+ rule, privacy, safeguards, maintenance and provider checks. I cannot determine or guess anyone’s age."}\n\n${state}\n\n${ageAi.guardrailMessage}`;
}

async function workersAnswer(env, shared, message, history, settings, ageAi) {
  if (shared.provider !== "workers_ai" || !shared.model || !env.AI?.run) return "";
  try {
    const result = await env.AI.run(shared.model, {
      messages: [
        { role: "system", content: `You are the Planyx Age Verification Guide, part of the shared Planyx AI systems. Explain the 16+ rule, privacy, safeguards for ages 16–17, maintenance and provider checks. Never guess, estimate, approve, fail or override a person's age. Never ask for or repeat a full date of birth, identity document, selfie, payment detail or authentication secret. Tell the person to use the secure age-check form. Under 16 cannot register. Only the signed Planyx check or an approved independent provider can decide eligibility. Service state: ${settings.serviceStatus}. Method: ${settings.verificationMethod}. Guardrail: ${ageAi.guardrailMessage}` },
        ...(Array.isArray(history) ? history.slice(-Math.min(ageAi.maxTurns * 2, 12)).map((item) => ({ role: item?.role === "assistant" ? "assistant" : "user", content: clean(item?.content || item?.text, 800) })) : []),
        { role: "user", content: clean(message, 1200) },
      ],
    });
    const response = clean(result?.response || result?.result?.response || result?.text, 1800);
    if (!response || /\b(?:you are|you're|appears? to be|looks? like)\s+(?:under|over|aged?|\d{1,2})/i.test(response)) return "";
    return response;
  } catch (error) {
    if (ageAi.debugEnabled || shared.debugEnabled) console.error(JSON.stringify({ event: "age_verification_ai_failed", message: clean(error?.message || error, 240) }));
    return "";
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const sharedRecord = await loadAssistantSettings(env.DB);
  const shared = configFrom(sharedRecord);
  const ageAi = ageAiConfig(await loadAgeAiSettings(env.DB));
  const settings = await getAgeVerificationSettings(env.DB, env);

  if (request.method === "GET") {
    return json({ success: true, enabled: ageAi.enabled && shared.enabled, maintenance: shared.maintenanceEnabled, welcomeMessage: ageAi.welcomeMessage, inputPlaceholder: ageAi.inputPlaceholder, provider: shared.provider, model: shared.model, serviceStatus: settings.serviceStatus, guardrails: { aiCannotDecideAge: true, secureFormOnly: true, fullDobInChatProhibited: true, documentsInChatProhibited: true } });
  }
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  if (!sameOrigin(request)) return json({ success: false, error: "Request origin was rejected." }, 403);
  if (!shared.enabled || !ageAi.enabled || !ageAi.guidanceEnabled) return json({ success: false, error: "Age-verification AI guidance is currently unavailable." }, 503);
  if (shared.maintenanceEnabled) return json({ success: false, error: shared.maintenanceMessage, maintenance: true }, 503);

  const body = await request.json().catch(() => ({}));
  const message = clean(body.message, 1200);
  const history = Array.isArray(body.history) ? body.history : [];
  if (message.length < 2) return json({ success: false, error: "Enter a question about the age check." }, 400);

  let reply = "";
  let source = "age_guard";
  if (containsPersonalBirthDate(message)) reply = "Please do not send a full date of birth in this chat. Enter it only in the secure Planyx age-check field. The AI does not need and cannot verify that personal information.";
  else if (asksAiToDecideAge(message)) reply = ageAi.guardrailMessage;
  else if (saysUnderSixteen(message)) reply = "Planyx accounts are strictly for people aged 16 or over. Nobody under 16 may register or use a customer account. Do not enter a false date of birth. Public information and the 16+ safety page remain available without an account.";
  else {
    reply = await workersAnswer(env, shared, message, history, settings, ageAi);
    source = reply ? "shared_workers_ai" : "age_built_in";
    if (!reply) reply = builtInAnswer(message, settings, ageAi);
  }

  await recordAgeVerificationEvent(env.DB, request, { eventType: "age_ai_guidance", outcome: "success", method: source, provider: shared.provider, detail: "Age-verification AI guidance supplied. The visitor's message content was not stored in the age-verification event record." }).catch(() => null);
  return json({ success: true, reply, source, suggestions: ["Why is Planyx 16+?", "What is stored?", "Safeguards for ages 16–17", "The check is not working"], guardrails: { aiCannotDecideAge: true, secureFormOnly: true } });
}
