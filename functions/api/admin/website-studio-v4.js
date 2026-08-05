import { onRequest as runStudioV3 } from "./website-studio-v3.js";
import { onRequest as runStudioV2 } from "./website-studio-v2.js";

const ALLOWED_TYPES = new Set([
  "create_page", "update_page", "delete_page", "set_global_css", "set_page_css",
  "replace_text", "replace_html", "append_html", "hide", "set_attribute", "add_class",
]);

const TYPE_ALIASES = {
  create: "create_page", createpage: "create_page", new_page: "create_page",
  update: "update_page", updatepage: "update_page", edit_page: "update_page",
  delete: "delete_page", deletepage: "delete_page", remove_page: "delete_page",
  global_css: "set_global_css", setglobalcss: "set_global_css",
  page_css: "set_page_css", setpagecss: "set_page_css",
  replace: "replace_text", replacetext: "replace_text",
  replace_content: "replace_html", replacehtml: "replace_html",
  append: "append_html", add_html: "append_html", appendhtml: "append_html",
  remove: "hide", remove_element: "hide", hide_element: "hide",
  setattribute: "set_attribute", addclass: "add_class",
};

function clean(value, max = 10000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Cookie",
    },
  });
}

function parseJson(value) {
  try { return JSON.parse(String(value || "")); } catch { return null; }
}

function normaliseType(value) {
  const source = clean(value, 80)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
  return TYPE_ALIASES[source] || TYPE_ALIASES[source.replace(/_/g, "")] || source;
}

function normalisePath(value, fallback = "/") {
  let path = clean(value || fallback, 240);
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.includes("?") || path.includes("#")) return fallback;
  if (["/admin", "/api", "/auth", "/sign/"].some(prefix => path === prefix || path.startsWith(prefix))) return fallback;
  return path;
}

function tidyJson(value) {
  return clean(value, 150000)
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^```(?:json|javascript|js)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function balancedCandidates(text) {
  const candidates = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      if (depth === 0) {
        candidates.push(text.slice(start, index + 1));
        break;
      }
    }
  }
  return candidates.sort((a, b) => b.length - a.length).slice(0, 10);
}

function findStructured(value, seen = new Set(), depth = 0) {
  if (value === null || value === undefined || depth > 8) return null;
  if (typeof value === "string") {
    const text = tidyJson(value);
    const direct = parseJson(text);
    if (direct) return direct;
    for (const candidate of balancedCandidates(text)) {
      const parsed = parseJson(tidyJson(candidate));
      if (parsed) return parsed;
    }
    return null;
  }
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length && value.every(item => item && typeof item === "object")) return { operations: value };
    for (const item of value) {
      const found = findStructured(item, seen, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (Array.isArray(value.operations) || Array.isArray(value.changes) || Array.isArray(value.actions) || Array.isArray(value.edits)) return value;
  if (value.plan && typeof value.plan === "object") return { ...value.plan, reply: value.reply || value.message || value.plan.reply };
  for (const key of ["response", "result", "output", "content", "text", "message", "data", "answer", "generated_text"]) {
    if (!(key in value)) continue;
    const found = findStructured(value[key], seen, depth + 1);
    if (found) return found;
  }
  for (const nested of Object.values(value)) {
    const found = findStructured(nested, seen, depth + 1);
    if (found) return found;
  }
  return null;
}

function normaliseOperation(raw, targetPath) {
  if (!raw || typeof raw !== "object") return null;
  const type = normaliseType(raw.type || raw.operation || raw.action || raw.kind || raw.command);
  if (!ALLOWED_TYPES.has(type)) return null;
  const operation = { type };
  const path = normalisePath(raw.path || raw.route || raw.targetPath || raw.target_path, targetPath);
  const selector = clean(raw.selector || raw.target || raw.cssSelector || raw.css_selector, 500);
  const value = raw.value ?? raw.content ?? raw.text ?? raw.html ?? raw.className ?? raw.class_name ?? "";
  const css = raw.css ?? raw.styles ?? raw.value ?? "";

  if (type === "set_global_css") {
    operation.css = clean(css, 180000);
    return operation.css ? operation : null;
  }
  operation.path = path;
  if (["create_page", "update_page"].includes(type)) {
    operation.title = clean(raw.title || raw.name || "Untitled page", 180);
    operation.html = clean(raw.html || raw.content || raw.body || "", 180000);
    operation.css = clean(raw.css || raw.styles || "", 180000);
    operation.seoTitle = clean(raw.seoTitle || raw.seo_title || operation.title, 180);
    operation.seoDescription = clean(raw.seoDescription || raw.seo_description || raw.description, 500);
    operation.noindex = Boolean(raw.noindex);
    operation.status = ["draft", "published", "archived"].includes(raw.status) ? raw.status : "published";
    return operation.html ? operation : null;
  }
  if (type === "delete_page") return operation;
  if (type === "set_page_css") {
    operation.css = clean(css, 180000);
    return operation.css ? operation : null;
  }
  if (!selector) return null;
  operation.selector = selector;
  if (type === "set_attribute") {
    operation.attributeName = clean(raw.attributeName || raw.attribute_name || raw.attribute, 80);
    operation.value = clean(value, 10000);
    return operation.attributeName ? operation : null;
  }
  if (type === "hide") return operation;
  operation.value = clean(value, 100000);
  return operation.value ? operation : null;
}

function normalisePlan(candidate, message, targetPath, maxOperations = 30) {
  if (!candidate || typeof candidate !== "object") return null;
  const source = candidate.operations || candidate.changes || candidate.actions || candidate.edits || [];
  const operations = (Array.isArray(source) ? source : [])
    .map(operation => normaliseOperation(operation, targetPath))
    .filter(Boolean)
    .slice(0, Math.max(1, Math.min(60, Number(maxOperations) || 30)));
  if (!operations.length) return null;
  return {
    reply: clean(candidate.reply || candidate.message || candidate.acknowledgement || "I have professionally redesigned those website changes for your review.", 2200),
    summary: clean(candidate.summary || candidate.planSummary || candidate.plan_summary || `Professional website redesign requested: ${message}`, 1000),
    warnings: Array.isArray(candidate.warnings) ? candidate.warnings.map(item => clean(item, 500)).filter(Boolean).slice(0, 12) : [],
    operations,
  };
}

function designIntent(message) {
  return /\b(design|redesign|style|styling|layout|professional|modern|polish|boxes|cards?|marketing|beautiful|attractive|visual|colour|spacing|responsive|mobile|section|faq|hero|banner|grid)\b/i.test(message);
}

function significantHtml(operation) {
  if (!["replace_html", "append_html", "create_page", "update_page"].includes(operation?.type)) return "";
  return clean(operation.value || operation.html, 180000);
}

function operationCss(operation) {
  if (["set_page_css", "set_global_css"].includes(operation?.type)) return clean(operation.css || operation.value, 180000);
  if (["create_page", "update_page"].includes(operation?.type)) return clean(operation.css, 180000);
  return "";
}

function designQuality(plan, message) {
  const reasons = [];
  const operations = Array.isArray(plan?.operations) ? plan.operations : [];
  const html = operations.map(significantHtml).filter(Boolean).join("\n");
  const css = operations.map(operationCss).filter(Boolean).join("\n");
  const visualRequest = designIntent(message);

  if (!visualRequest) return { acceptable: true, reasons };
  if (!html && !css && !operations.some(operation => operation.type === "add_class")) reasons.push("No visual HTML, CSS or component-class change was produced.");
  if (html && !/class\s*=\s*["'][^"']+["']/i.test(html)) reasons.push("The generated component has no reusable class structure.");
  if (html && !/<(?:section|article|details|div|ul|ol)\b/i.test(html)) reasons.push("The generated markup is unstructured body text rather than a component.");
  if (/\bfaq|frequently asked\b/i.test(message)) {
    if (html && !/<(?:details|button)\b/i.test(html) && !/faq[-_ ]?(?:card|item|grid|list)/i.test(html)) reasons.push("FAQ content is not structured as accessible FAQ cards or disclosure items.");
    if (html && !/<h[2-4]\b/i.test(html)) reasons.push("FAQ component has no meaningful section heading.");
  }
  if (!css || css.length < 160) reasons.push("The visual request has no substantial route-specific CSS.");
  if (css && !/(padding|margin|gap)\s*:/i.test(css)) reasons.push("The CSS does not define a spacing system.");
  if (css && !/(border-radius|border)\s*:/i.test(css)) reasons.push("The CSS does not define card or surface treatment.");
  if (css && !/(display\s*:\s*(?:grid|flex)|grid-template-columns)/i.test(css)) reasons.push("The CSS does not define a responsive component layout.");
  if (css && !/@media\b/i.test(css) && /(grid-template-columns|min-width|max-width)/i.test(css)) reasons.push("The component has no explicit mobile adaptation.");
  if (html && /<br\s*\/?>\s*<br/i.test(html)) reasons.push("The layout relies on repeated line breaks instead of proper spacing.");
  if (html && /style\s*=\s*["']/i.test(html)) reasons.push("The generated component uses inline styling instead of maintainable page CSS.");

  return { acceptable: reasons.length === 0, reasons };
}

function planyxDesignContract() {
  return `SOUSA MURRAY PLANEIA DESIGN CONTRACT:
- The result must look like a premium modern British SaaS product, not a document pasted into a webpage.
- Preserve the existing page's visual language and do not redesign unrelated sections.
- Use a restrained Sousa Murray Planeia palette: deep navy #0b172d/#101b35, primary blue #2864e8, cyan #22c7d9, violet #7c3aed, white surfaces, slate text and subtle blue-grey borders.
- Use semantic component HTML with clear reusable class names prefixed planyx- or px-.
- Use a centred max-width container, consistent 8px spacing rhythm, comfortable white space, 16-24px radii, subtle 1px borders and restrained shadows.
- Create clear hierarchy: eyebrow where appropriate, strong heading, concise supporting copy, then the component content.
- Never return loose question/answer text. FAQ designs must use accessible <details><summary> cards or properly labelled buttons, with each item in its own bordered card.
- Every visual HTML operation must be paired with set_page_css for the same path unless the operation is a full managed page with its own css field.
- CSS must include responsive layout and a mobile @media rule. Avoid giant text, cramped blocks, excessive gradients and decorative clutter.
- Use hover/focus-visible states where interactive elements are introduced. Keep contrast WCAG-friendly.
- Do not use inline styles, repeated <br> tags, scripts, iframes, external assets or invented framework classes.
- Return the COMPLETE revised draft, preserving valid earlier changes but replacing low-quality earlier design operations when necessary.`;
}

async function requestPolishedPlan(env, body, payload, qualityReasons, attempt = 1) {
  const settings = payload.settings || {};
  const targetPath = normalisePath(body.targetPath || "/");
  const userMessage = clean(body.message, 6000);
  const currentPlan = payload.plan && typeof payload.plan === "object" ? payload.plan : (body.currentPlan || { summary: "No draft", operations: [] });
  const snapshot = clean(body.pageSnapshot, 18000) || "No page snapshot supplied.";
  const model = clean(settings.model || "@cf/meta/llama-3.1-8b-instruct-fast", 180);
  const system = `You are the senior product designer and frontend engineer for Sousa Murray Planeia, operated by JA Group Services Ltd.
The first generated draft failed visual quality review. Rebuild it as a polished production-quality website edit plan.
Return exactly one JSON object with no Markdown and no text outside the JSON.

Schema:
{"reply":"Brief acknowledgement","summary":"Complete revised draft summary","warnings":[],"operations":[{"type":"replace_html","path":"/","selector":"#faq","value":"<section class=\\"planyx-faq\\">...</section>"},{"type":"set_page_css","path":"/","css":".planyx-faq{...}"}]}

Allowed operation types only: create_page, update_page, delete_page, set_global_css, set_page_css, replace_text, replace_html, append_html, hide, set_attribute, add_class.
Every operation except set_global_css requires path. Existing-page operations require a stable selector evidenced by the snapshot. Do not target pricing or unrelated page sections unless asked.
Never target /admin, /api, /auth or /sign. Preserve legal, privacy, age, safeguarding, authentication and security controls.

${planyxDesignContract()}

Quality failures to correct:
${qualityReasons.map(reason => `- ${reason}`).join("\n")}

Administrator request: ${userMessage}
Target path: ${targetPath}
Current generated draft to replace or improve: ${JSON.stringify(currentPlan).slice(0, 30000)}
Visible page structure: ${snapshot}`;

  const request = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: attempt === 1 ? "Produce the complete professionally redesigned JSON plan now." : "Your previous redesign still failed quality review. Produce a cleaner, more structured and fully styled JSON plan now." },
    ],
    temperature: attempt === 1 ? 0.15 : 0,
    max_tokens: 5200,
  };

  let result;
  try {
    result = await env.AI.run(model, { ...request, response_format: { type: "json_object" } });
  } catch {
    result = await env.AI.run(model, request);
  }
  return normalisePlan(findStructured(result), userMessage, targetPath, settings.maxOperations);
}

async function savePolishedPlan(context, body, payload, polished) {
  const headers = new Headers(context.request.headers);
  headers.set("Content-Type", "application/json");
  const request = new Request(context.request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "save_plan",
      id: payload.conversationId,
      targetPath: body.targetPath || "/",
      plan: polished,
    }),
  });
  const response = await runStudioV2({ ...context, request });
  const result = await response.clone().json().catch(() => ({}));
  return response.ok && result?.success !== false;
}

async function replaceLatestAssistantMessage(env, conversationId, reply) {
  if (!env.DB || !conversationId) return;
  try {
    await env.DB.prepare(`UPDATE website_builder_messages SET content=? WHERE id=(
      SELECT id FROM website_builder_messages WHERE conversation_id=? AND role='assistant'
      ORDER BY created_at DESC LIMIT 1
    )`).bind(reply, conversationId).run();
  } catch {
    // Design-message repair is optional and must never block the draft.
  }
}

export async function onRequest(context) {
  const request = context.request;
  if (request.method !== "POST") return runStudioV3(context);
  const body = await request.clone().json().catch(() => ({}));
  if (clean(body.action, 80) !== "chat") return runStudioV3(context);

  const response = await runStudioV3(context);
  const payload = await response.clone().json().catch(() => null);
  if (!payload?.success || !designIntent(clean(body.message, 6000)) || !context.env.AI?.run) return response;

  let quality = designQuality(payload.plan, body.message);
  if (quality.acceptable) return response;

  let polished = null;
  try {
    polished = await requestPolishedPlan(context.env, body, payload, quality.reasons, 1);
    if (polished) quality = designQuality(polished, body.message);
    if (!polished || !quality.acceptable) {
      const retryReasons = quality.reasons.length ? quality.reasons : ["The redesign did not meet the Sousa Murray Planeia component quality standard."];
      polished = await requestPolishedPlan(context.env, body, payload, retryReasons, 2);
      if (polished) quality = designQuality(polished, body.message);
    }
  } catch (error) {
    console.warn(JSON.stringify({
      event: "website_studio_design_quality_retry_failed",
      correlation_id: payload.correlationId || "",
      error: error instanceof Error ? error.message : "Unknown design retry error",
    }));
  }

  if (!polished || !quality.acceptable) {
    const preservedPlan = body.currentPlan && typeof body.currentPlan === "object"
      ? body.currentPlan
      : { summary: "Design request needs a higher-quality revision.", warnings: [], operations: [] };
    const reply = "I understood the design request, but I rejected the generated result because it did not meet the Sousa Murray Planeia design-quality standard. Nothing new has been applied to the draft. Please try the request again with the section name or selector you want redesigned.";
    return json({
      ...payload,
      reply,
      plan: preservedPlan,
      designQualityRejected: true,
      designQualityReasons: quality.reasons,
      messages: Array.isArray(payload.messages)
        ? payload.messages.map((item, index, array) => index === array.length - 1 && item?.role === "assistant" ? { ...item, content: reply } : item)
        : payload.messages,
    });
  }

  const saved = await savePolishedPlan(context, body, payload, polished);
  if (!saved) return response;
  await replaceLatestAssistantMessage(context.env, payload.conversationId, polished.reply);
  const messages = Array.isArray(payload.messages) ? [...payload.messages] : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") {
      messages[index] = { ...messages[index], content: polished.reply };
      break;
    }
  }
  return json({
    ...payload,
    reply: polished.reply,
    plan: { summary: polished.summary, warnings: polished.warnings, operations: polished.operations },
    messages,
    designQualityImproved: true,
  });
}
