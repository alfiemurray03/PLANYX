import { clean, configFrom, loadAssistantSettings } from "../_shared/support-assistant-core.js";
import { getAgeVerificationSettings, recordAgeVerificationEvent } from "../_shared/age-verification-settings.js";

const KNOWLEDGE_VERSION = "2026-07-25";
const CUSTOMER_SUGGESTIONS = [
  "Why is Sousa Murray Planeia 16+?",
  "What happens to my date of birth?",
  "Is this independent age verification?",
  "What safeguards apply at 16–17?",
  "Which stronger age-check methods may be used?",
  "What if the check does not work?",
];

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
    welcomeMessage: clean(record.age_ai_welcome_message || "Hello. I can explain Sousa Murray Planeia’s 16+ account check, privacy safeguards, stronger verification methods and what to do if the process is not working. Do not send me your date of birth or identity documents.", 600),
    inputPlaceholder: clean(record.age_ai_input_placeholder || "Ask about the 16+ age check…", 120),
    guardrailMessage: clean(record.age_ai_guardrail_message || "I cannot guess, estimate, approve, reject or override anyone’s age. Enter personal information only in the secure age-check field or an approved provider journey.", 700),
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

function asksToBypass(message) {
  return /\b(?:bypass|skip|evade|fake|false|lie|inspect element|clear cookies|change cookies|vpn)\b.{0,40}\b(?:age|check|gate|verification|date of birth|dob)\b/i.test(message);
}

function offersSensitiveMaterial(message) {
  return /\b(?:upload|send|share|attach)\b.{0,40}\b(?:passport|driving licen[cs]e|identity document|id card|selfie|bank statement|card details)\b/i.test(message);
}

const KNOWLEDGE = [
  {
    terms: ["why", "16", "minimum", "age", "need"],
    answer: "Sousa Murray Planeia accounts are restricted to people aged 16 or over. The age journey enforces that account rule and applies enhanced privacy and safeguarding defaults to customers aged 16–17. Public information can still be viewed without creating an account.",
  },
  {
    terms: ["self declaration", "independent", "highly effective", "heaa", "ofcom", "compliant"],
    answer: "The current Sousa Murray Planeia date-of-birth form is a signed self-declaration used to decide account eligibility. It is not independent proof of age and must not be described as Ofcom ‘highly effective age assurance’. Under the Online Safety Act, self-declaration on its own does not count as age verification or age estimation where the Act requires those measures. The ICO also says self-declaration should not be relied on alone for higher-risk services. Whether a stronger check is required depends on the service’s legal scope and documented risk assessment.",
  },
  {
    terms: ["method", "stronger", "provider", "open banking", "mobile", "mno", "facial", "photo id", "digital identity", "credit card", "email estimation"],
    answer: "Methods Ofcom identifies as capable of being highly effective, when properly implemented, include open-banking age checks, photo-ID matching, facial age estimation, mobile-network-operator age checks, credit-card checks, email-based age estimation and digital identity services. A method is not automatically effective just because it is on that list: the whole process must be technically accurate, robust, reliable and fair.",
  },
  {
    terms: ["open banking", "bank", "bank account"],
    answer: "An approved open-banking age-check service can use verified banking information to return an age-threshold result. Sousa Murray Planeia should receive only the minimum result needed, such as whether the person meets the required age, rather than bank balances, transaction history or a full date of birth.",
  },
  {
    terms: ["mobile network", "mno", "phone", "adult content block"],
    answer: "A mobile-network-operator age check may confirm that the network has completed an adult-status check for the mobile account, for example where an adult-content restriction has been removed. It is a provider result, not permission for Sousa Murray Planeia to access calls, messages or ordinary mobile-account data.",
  },
  {
    terms: ["face", "facial", "selfie", "photo", "passport", "licence", "document", "digital id"],
    answer: "A stronger provider may offer facial age estimation, photo-ID matching or a reusable digital identity. Use only the provider’s secure journey. Never send a selfie, passport, driving licence or identity-document image to the Sousa Murray Planeia AI guide or ordinary Contact Us form. Sousa Murray Planeia should receive a minimal result, reference and expiry rather than retaining provider images.",
  },
  {
    terms: ["card", "payment", "debit", "credit"],
    answer: "Making a payment, holding a debit card or ticking a box is not independent proof of age. Ofcom does not treat payment methods that do not require the user to be over 18, such as ordinary debit-card payments, as highly effective age assurance. A regulated credit-card age check may be suitable for confirming 18+, but it cannot fairly cover eligible Sousa Murray Planeia customers aged 16–17.",
  },
  {
    terms: ["privacy", "store", "data", "birth", "dob", "encrypted", "crm", "retention"],
    answer: "Enter your date of birth only in the secure field. In the current Sousa Murray Planeia process it is encrypted in a restricted age-verification record, masked by default and subject to audited administrator access. The ordinary customer profile uses only the eligibility result, age band and safeguarding status. Provider documents, selfies and secrets should not be stored by Sousa Murray Planeia unless strictly necessary and lawfully justified.",
  },
  {
    terms: ["16", "17", "young", "safeguards", "privacy defaults"],
    answer: "Customers aged 16–17 receive enhanced safeguards: a private profile, public discovery off, non-essential profiling and marketing off, precise location sharing off by default, and a safeguarding-review flag. These safeguards cannot be switched off through the ordinary customer journey.",
  },
  {
    terms: ["under 16", "15", "14", "child", "too young"],
    answer: "Nobody under 16 may register for or use a Sousa Murray Planeia customer account. The account journey is stopped and any temporary age token is cleared. Do not enter a false date of birth or use another person’s details. Public pages and safety information remain available without an account.",
  },
  {
    terms: ["failed", "not working", "error", "maintenance", "paused", "retry"],
    answer: "Read the message shown on the secure age-check page. During maintenance or a registration pause, Sousa Murray Planeia blocks new registrations rather than allowing an unverified account through. Refresh once, check that the date is complete and accurate, and try again later. Do not repeatedly submit different dates. If support is available, contact Sousa Murray Planeia without attaching identity documents.",
  },
  {
    terms: ["wrong", "mistake", "correct", "change", "appeal", "review"],
    answer: "If you entered the wrong date, stop and use the secure process again only with accurate information. Where an eligibility decision appears wrong or an independent provider fails, request a review through the published support route. Do not send identity documents through ordinary email or AI chat; Sousa Murray Planeia should provide a secure verification route if evidence is genuinely required.",
  },
  {
    terms: ["microsoft", "sign in", "signup", "account", "email"],
    answer: "The age check normally happens before Microsoft customer sign-in. Microsoft verifies the customer account identity and email address. The Sousa Murray Planeia eligibility declaration or an approved independent provider supplies the separate age result. Microsoft sign-in by itself does not prove age.",
  },
  {
    terms: ["bypass", "circumvention", "cookies", "inspect", "fake", "false date"],
    answer: "Do not attempt to bypass the age gate, alter browser data, submit changing dates or use somebody else’s details. Sousa Murray Planeia uses server-side signed results and may require a fresh or stronger check where information is inconsistent. False information may lead to registration being refused, access being suspended or an account being closed under the applicable terms.",
  },
  {
    terms: ["ai", "chatbot", "guide", "decide", "guess"],
    answer: "The Age Verification Guide provides explanations only. It cannot view you, estimate your age, approve an account, inspect an identity document or override a failed result. Do not place personal dates, documents, payment data or authentication secrets into the chat.",
  },
  {
    terms: ["law", "legal", "ico", "children's code", "risk assessment", "dpia"],
    answer: "Age assurance must be risk-based and privacy-preserving. The ICO expects services to assess the risks to children, choose a proportionate and sufficiently robust method, minimise personal data, consider circumvention and document the decision through appropriate governance such as a DPIA or Children’s Code assessment. Regulatory requirements depend on the service and content, so this guide provides general information rather than legal advice.",
  },
];

function builtInAnswer(message, settings, ageAi) {
  const lower = message.toLowerCase();
  const best = KNOWLEDGE
    .map((item) => ({ item, score: item.terms.reduce((sum, term) => sum + (lower.includes(term) ? 2 : 0), 0) }))
    .sort((a, b) => b.score - a.score)[0];
  const state = settings.serviceStatus === "live"
    ? `The Sousa Murray Planeia age-check service is currently live. The configured method is ${settings.verificationMethod === "independent_provider" ? "an independent provider" : "a signed self-declaration"}.`
    : `The age-check service is currently ${settings.serviceStatus}; new registration remains safely blocked.`;
  const defaultAnswer = "I can explain the Sousa Murray Planeia 16+ rule, the current self-declaration, stronger provider methods, privacy, safeguards, maintenance and review routes. I cannot determine or guess anyone’s age.";
  return `${best?.score ? best.item.answer : defaultAnswer}\n\n${state}\n\n${ageAi.guardrailMessage}`;
}

function systemKnowledge(settings, ageAi) {
  return `You are the Sousa Murray Planeia Age Verification Guide, part of the shared Sousa Murray Planeia AI systems. Use clear British English and concise paragraphs.

Sousa Murray Planeia facts:
- Sousa Murray Planeia customer accounts are 16+.
- Under-16 registration and account use are prohibited.
- Ages 16-17 receive mandatory high-privacy and safeguarding defaults.
- The current signed date-of-birth form is a self-declaration used for Sousa Murray Planeia account eligibility. It is not independent proof of age and must not be called Ofcom highly effective age assurance.
- If a stronger check is required, approved methods may include open banking, photo-ID matching, facial age estimation, mobile-network-operator checks, credit-card checks for 18+, email-based age estimation or digital identity services. Explain that effectiveness depends on accurate, robust, reliable and fair implementation.
- A debit-card payment, ordinary online payment or tick-box is not independent proof of age.
- Sousa Murray Planeia should receive and retain the minimum result needed. Never invite uploads of passports, driving licences, selfies, bank data or payment details into AI chat or Contact Us.
- The current secure field encrypts the date of birth in a restricted verification record; the ordinary profile uses eligibility, age band and safeguard status.
- Microsoft sign-in verifies account identity and email, not age.
- Do not help users bypass, evade or falsify the age check.
- Explain that regulatory requirements depend on service risk and scope; provide general information, not legal advice.

Safety rules:
Never guess, estimate, approve, fail or override a person's age. Never ask for or repeat a full date of birth, identity document, selfie, bank information, payment details, cookie, token or authentication secret. Direct personal information to the secure age-check or approved-provider journey only. Service state: ${settings.serviceStatus}. Configured method: ${settings.verificationMethod}. Guardrail: ${ageAi.guardrailMessage}`;
}

async function workersAnswer(env, shared, message, history, settings, ageAi) {
  if (shared.provider !== "workers_ai" || !shared.model || !env.AI?.run) return "";
  try {
    const result = await env.AI.run(shared.model, {
      messages: [
        { role: "system", content: systemKnowledge(settings, ageAi) },
        ...(Array.isArray(history) ? history.slice(-Math.min(ageAi.maxTurns * 2, 12)).map((item) => ({ role: item?.role === "assistant" ? "assistant" : "user", content: clean(item?.content || item?.text, 800) })) : []),
        { role: "user", content: clean(message, 1200) },
      ],
    });
    const response = clean(result?.response || result?.result?.response || result?.text, 2200);
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
    return json({
      success: true,
      enabled: ageAi.enabled && shared.enabled,
      maintenance: shared.maintenanceEnabled,
      welcomeMessage: ageAi.welcomeMessage,
      inputPlaceholder: ageAi.inputPlaceholder,
      suggestions: CUSTOMER_SUGGESTIONS,
      provider: shared.provider,
      model: shared.model,
      serviceStatus: settings.serviceStatus,
      verificationMethod: settings.verificationMethod,
      knowledgeVersion: KNOWLEDGE_VERSION,
      knowledgeCoverage: ["16+ account rule", "self-declaration limitations", "Ofcom-capable methods", "ICO risk and privacy principles", "16–17 safeguards", "data handling", "maintenance and review", "anti-circumvention"],
      guardrails: { aiCannotDecideAge: true, secureFormOnly: true, fullDobInChatProhibited: true, documentsInChatProhibited: true, bypassAdviceProhibited: true },
    });
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
  if (containsPersonalBirthDate(message)) {
    reply = "Please do not send a full date of birth in this guide. Enter it only in the secure Sousa Murray Planeia age-check field. The guide does not need and cannot verify that personal information.";
  } else if (offersSensitiveMaterial(message)) {
    reply = "Do not upload or send identity documents, selfies, bank information or payment details through this guide or the ordinary Contact Us service. Use only a secure approved-provider journey if Sousa Murray Planeia specifically requires stronger evidence.";
  } else if (asksToBypass(message)) {
    reply = "I cannot help bypass or falsify the Sousa Murray Planeia age check. Enter accurate information through the secure journey. Attempts to evade the gate may result in registration being refused, a fresh independent check or account action under the applicable terms.";
  } else if (asksAiToDecideAge(message)) {
    reply = ageAi.guardrailMessage;
  } else if (saysUnderSixteen(message)) {
    reply = "Sousa Murray Planeia accounts are strictly for people aged 16 or over. Nobody under 16 may register or use a customer account. Do not enter a false date of birth. Public information and the 16+ safety page remain available without an account.";
  } else {
    reply = await workersAnswer(env, shared, message, history, settings, ageAi);
    source = reply ? "shared_workers_ai" : "age_built_in";
    if (!reply) reply = builtInAnswer(message, settings, ageAi);
  }

  await recordAgeVerificationEvent(env.DB, request, {
    eventType: "age_ai_guidance",
    outcome: "success",
    method: source,
    provider: shared.provider,
    detail: `Age-verification AI guidance supplied using knowledge version ${KNOWLEDGE_VERSION}. The visitor's message content was not stored in the age-verification event record.`,
  }).catch(() => null);
  return json({
    success: true,
    reply,
    source,
    suggestions: CUSTOMER_SUGGESTIONS,
    knowledgeVersion: KNOWLEDGE_VERSION,
    guardrails: { aiCannotDecideAge: true, secureFormOnly: true, fullDobInChatProhibited: true, documentsInChatProhibited: true, bypassAdviceProhibited: true },
  });
}
