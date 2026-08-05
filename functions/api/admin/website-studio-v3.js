import { onRequest as runStudioV2 } from "./website-studio-v2.js";

const ALLOWED_TYPES = new Set([
  "create_page", "update_page", "delete_page", "set_global_css", "set_page_css",
  "replace_text", "replace_html", "append_html", "hide", "set_attribute", "add_class",
]);

const TYPE_ALIASES = {
  create: "create_page",
  createpage: "create_page",
  new_page: "create_page",
  update: "update_page",
  updatepage: "update_page",
  edit_page: "update_page",
  delete: "delete_page",
  deletepage: "delete_page",
  remove_page: "delete_page",
  global_css: "set_global_css",
  setglobalcss: "set_global_css",
  page_css: "set_page_css",
  setpagecss: "set_page_css",
  replace: "replace_text",
  replacetext: "replace_text",
  replace_content: "replace_html",
  replacehtml: "replace_html",
  append: "append_html",
  add_html: "append_html",
  appendhtml: "append_html",
  remove: "hide",
  remove_element: "hide",
  hide_element: "hide",
  setattribute: "set_attribute",
  addclass: "add_class",
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

function normaliseType(value) {
  const source = clean(value, 80)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
  const compact = source.replace(/_/g, "");
  return TYPE_ALIASES[source] || TYPE_ALIASES[compact] || source;
}

function normalisePath(value, fallback = "/") {
  let path = clean(value || fallback, 240);
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.includes("?") || path.includes("#")) return fallback;
  if (["/admin", "/api", "/auth", "/sign/"].some(prefix => path === prefix || path.startsWith(prefix))) return fallback;
  return path;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function tidyJsonText(value) {
  return clean(value, 120000)
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^```(?:json|javascript|js)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function balancedJsonCandidates(text) {
  const candidates = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{" && text[start] !== "[") continue;
    const opener = text[start];
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') {
        quoted = true;
        continue;
      }
      if (character === opener) depth += 1;
      else if (character === closer) depth -= 1;
      if (depth === 0) {
        candidates.push(text.slice(start, index + 1));
        break;
      }
    }
  }
  return candidates.sort((a, b) => b.length - a.length).slice(0, 12);
}

function parseTextCandidate(value) {
  const text = tidyJsonText(value);
  if (!text) return null;
  const direct = parseJson(text);
  if (direct) return direct;

  const fenced = [...text.matchAll(/```(?:json|javascript|js)?\s*([\s\S]*?)```/gi)]
    .map(match => tidyJsonText(match[1]));
  for (const candidate of [...fenced, ...balancedJsonCandidates(text)]) {
    const parsed = parseJson(tidyJsonText(candidate));
    if (parsed) return parsed;
  }
  return null;
}

function findStructuredCandidate(value, seen = new Set(), depth = 0) {
  if (value === null || value === undefined || depth > 8) return null;
  if (typeof value === "string") return parseTextCandidate(value);
  if (typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    if (value.length && value.every(item => item && typeof item === "object")) return { operations: value };
    for (const item of value) {
      const candidate = findStructuredCandidate(item, seen, depth + 1);
      if (candidate) return candidate;
    }
    return null;
  }

  if (Array.isArray(value.operations) || Array.isArray(value.changes) || Array.isArray(value.actions) || Array.isArray(value.edits)) {
    return value;
  }
  if (value.plan && typeof value.plan === "object") {
    return { ...value.plan, reply: value.reply || value.message || value.plan.reply };
  }

  const preferredKeys = ["response", "result", "output", "content", "text", "message", "data", "answer", "generated_text"];
  for (const key of preferredKeys) {
    if (!(key in value)) continue;
    const candidate = findStructuredCandidate(value[key], seen, depth + 1);
    if (candidate) return candidate;
  }
  for (const nested of Object.values(value)) {
    const candidate = findStructuredCandidate(nested, seen, depth + 1);
    if (candidate) return candidate;
  }
  return null;
}

function operationList(candidate) {
  if (!candidate || typeof candidate !== "object") return [];
  const source = candidate.operations || candidate.changes || candidate.actions || candidate.edits || [];
  return Array.isArray(source) ? source : [];
}

function normaliseOperation(raw, targetPath) {
  if (!raw || typeof raw !== "object") return null;
  const type = normaliseType(raw.type || raw.operation || raw.action || raw.kind || raw.command);
  if (!ALLOWED_TYPES.has(type)) return null;

  const path = normalisePath(raw.path || raw.route || raw.targetPath || raw.target_path, targetPath);
  const selector = clean(raw.selector || raw.target || raw.cssSelector || raw.css_selector, 500);
  const value = raw.value ?? raw.content ?? raw.text ?? raw.html ?? raw.className ?? raw.class_name ?? "";
  const css = raw.css ?? raw.styles ?? raw.value ?? "";
  const operation = { type };

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
  operation.value = clean(value, 80000);
  return operation.value ? operation : null;
}

function normalisePlan(candidate, message, targetPath, maxOperations = 30) {
  const operations = operationList(candidate)
    .map(operation => normaliseOperation(operation, targetPath))
    .filter(Boolean)
    .slice(0, Math.max(1, Math.min(60, Number(maxOperations) || 30)));
  if (!operations.length) return null;
  return {
    reply: clean(candidate.reply || candidate.message || candidate.acknowledgement || "I have prepared those website changes for your review.", 2200),
    summary: clean(candidate.summary || candidate.planSummary || candidate.plan_summary || `Website changes requested: ${message}`, 1000),
    warnings: Array.isArray(candidate.warnings) ? candidate.warnings.map(item => clean(item, 500)).filter(Boolean).slice(0, 12) : [],
    operations,
  };
}

async function askForStructuredPlan(env, body, settings, attempt = 1) {
  const targetPath = normalisePath(body.targetPath || "/");
  const currentPlan = body.currentPlan && typeof body.currentPlan === "object" ? body.currentPlan : { summary: "No draft yet", operations: [] };
  const snapshot = clean(body.pageSnapshot, 14000) || "No page snapshot was supplied.";
  const message = clean(body.message, 6000);
  const model = clean(settings?.model || "@cf/meta/llama-3.1-8b-instruct-fast", 180);

  const system = `You are Sousa Murray Planeia AI Website Studio. Convert the administrator request into a complete safe website edit plan.
Return exactly one JSON object. Do not use Markdown, code fences, commentary before the JSON, or commentary after it.
The first character must be { and the final character must be }.

Required schema:
{"reply":"Brief friendly acknowledgement","summary":"What the complete draft changes","warnings":[],"operations":[{"type":"replace_text","path":"/","selector":"#faq h2","value":"New text"}]}

Allowed type values only: create_page, update_page, delete_page, set_global_css, set_page_css, replace_text, replace_html, append_html, hide, set_attribute, add_class.
Every operation except set_global_css requires path. Existing-page operations require a stable CSS selector. replace_text, replace_html, append_html and add_class require value. set_page_css and set_global_css require css. set_attribute requires attributeName and value. create_page and update_page require title and html.
The operations array must be the complete revised draft and must contain at least one operation.
Never target /admin, /api, /auth or /sign. Never add scripts, event handlers, javascript URLs, iframes or external CSS imports. Preserve legal, privacy, safeguarding, age, authentication and security controls.
Use accessible responsive British English. For an FAQ improvement, edit or replace the FAQ heading/content using selectors evidenced by the snapshot; do not change pricing cards unless asked.

Target path: ${targetPath}
Current draft: ${JSON.stringify(currentPlan).slice(0, 24000)}
Visible page snapshot: ${snapshot}`;

  const request = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: attempt === 1 ? message : `Your previous response was not valid JSON. Try again with strict JSON only for this request: ${message}` },
    ],
    temperature: attempt === 1 ? 0.1 : 0,
    max_tokens: 4200,
  };

  let result;
  try {
    result = await env.AI.run(model, { ...request, response_format: { type: "json_object" } });
  } catch {
    result = await env.AI.run(model, request);
  }
  const candidate = findStructuredCandidate(result);
  return normalisePlan(candidate, message, targetPath, settings?.maxOperations);
}

function hasStructuredFallback(payload) {
  const warnings = payload?.plan?.warnings;
  return Array.isArray(warnings) && warnings.some(warning => /invalid structured response/i.test(String(warning)));
}

async function saveRepairedPlan(context, body, payload, repaired) {
  const headers = new Headers(context.request.headers);
  headers.set("Content-Type", "application/json");
  const request = new Request(context.request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "save_plan",
      id: payload.conversationId,
      targetPath: body.targetPath || "/",
      plan: repaired,
    }),
  });
  const response = await runStudioV2({ ...context, request });
  const result = await response.clone().json().catch(() => ({}));
  return response.ok && result?.success !== false;
}

async function replacePersistedFallback(env, conversationId, reply) {
  if (!env.DB || !conversationId) return;
  try {
    await env.DB.prepare(`UPDATE website_builder_messages SET content=? WHERE id=(
      SELECT id FROM website_builder_messages WHERE conversation_id=? AND role='assistant'
      ORDER BY created_at DESC LIMIT 1
    )`).bind(reply, conversationId).run();
  } catch {
    // Message repair is useful but must never block the website draft.
  }
}

export async function onRequest(context) {
  const request = context.request;
  if (request.method !== "POST") return runStudioV2(context);

  const body = await request.clone().json().catch(() => ({}));
  if (clean(body.action, 80) !== "chat") return runStudioV2(context);

  const originalResponse = await runStudioV2(context);
  const payload = await originalResponse.clone().json().catch(() => null);
  if (!payload?.success || !hasStructuredFallback(payload) || !context.env.AI?.run) return originalResponse;

  let repaired = null;
  try {
    repaired = await askForStructuredPlan(context.env, body, payload.settings, 1);
    if (!repaired) repaired = await askForStructuredPlan(context.env, body, payload.settings, 2);
  } catch (error) {
    console.warn(JSON.stringify({
      event: "website_studio_structured_retry_failed",
      correlation_id: payload.correlationId || "",
      error: error instanceof Error ? error.message : "Unknown retry error",
    }));
  }
  if (!repaired) return originalResponse;

  const saved = await saveRepairedPlan(context, body, payload, repaired);
  if (!saved) return originalResponse;

  await replacePersistedFallback(context.env, payload.conversationId, repaired.reply);
  const messages = Array.isArray(payload.messages) ? [...payload.messages] : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") {
      messages[index] = { ...messages[index], content: repaired.reply };
      break;
    }
  }

  return json({
    ...payload,
    reply: repaired.reply,
    plan: { summary: repaired.summary, warnings: repaired.warnings, operations: repaired.operations },
    messages,
    structuredResponseRecovered: true,
  });
}
