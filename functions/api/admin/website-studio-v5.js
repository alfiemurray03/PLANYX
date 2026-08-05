import { onRequest as runStudioV4 } from "./website-studio-v4.js";
import { onRequest as runStudioV2 } from "./website-studio-v2.js";

const COMPLEX_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const ALLOWED_TYPES = new Set([
  "create_page", "update_page", "delete_page", "set_global_css", "set_page_css",
  "replace_text", "replace_html", "append_html", "hide", "set_attribute", "add_class",
]);

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

function tidy(value) {
  return clean(value, 160000)
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^```(?:json|js|javascript)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function candidates(text) {
  const results = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{" && text[start] !== "[") continue;
    const opener = text[start];
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let quote = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quote = false;
        continue;
      }
      if (character === '"') { quote = true; continue; }
      if (character === opener) depth += 1;
      else if (character === closer) depth -= 1;
      if (depth === 0) { results.push(text.slice(start, index + 1)); break; }
    }
  }
  return results.sort((a, b) => b.length - a.length).slice(0, 16);
}

function findStructured(value, seen = new Set(), depth = 0) {
  if (value === null || value === undefined || depth > 10) return null;
  if (typeof value === "string") {
    const text = tidy(value);
    const direct = parseJson(text);
    if (direct) return direct;
    for (const candidate of candidates(text)) {
      const parsed = parseJson(tidy(candidate));
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

function normalisePath(value, fallback = "/") {
  let path = clean(value || fallback, 240);
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.includes("?") || path.includes("#")) return fallback;
  if (["/admin", "/api", "/auth", "/sign/"].some(prefix => path === prefix || path.startsWith(prefix))) return fallback;
  return path;
}

function typeName(value) {
  const source = clean(value, 80)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
  const aliases = {
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
  return aliases[source] || aliases[source.replace(/_/g, "")] || source;
}

function normaliseOperation(raw, targetPath) {
  if (!raw || typeof raw !== "object") return null;
  const type = typeName(raw.type || raw.operation || raw.action || raw.kind || raw.command);
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
    operation.html = clean(raw.html || raw.content || raw.body, 180000);
    operation.css = clean(raw.css || raw.styles, 180000);
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

function normalisePlan(candidate, message, targetPath, maxOperations = 60) {
  if (!candidate || typeof candidate !== "object") return null;
  const source = candidate.operations || candidate.changes || candidate.actions || candidate.edits || [];
  const operations = (Array.isArray(source) ? source : [])
    .map(item => normaliseOperation(item, targetPath))
    .filter(Boolean)
    .slice(0, Math.max(1, Math.min(80, Number(maxOperations) || 60)));
  if (!operations.length) return null;
  return {
    reply: clean(candidate.reply || candidate.message || candidate.acknowledgement || "I have completed the requested draft changes for your review.", 2200),
    summary: clean(candidate.summary || candidate.planSummary || candidate.plan_summary || `Website changes requested: ${message}`, 1000),
    warnings: Array.isArray(candidate.warnings) ? candidate.warnings.map(item => clean(item, 500)).filter(Boolean).slice(0, 12) : [],
    operations,
  };
}

function needsCapabilityRecovery(payload) {
  if (!payload?.success) return false;
  if (payload.designQualityRejected) return true;
  const operations = payload?.plan?.operations;
  if (!Array.isArray(operations) || operations.length === 0) return true;
  return /rejected|could not create|could not complete|try again/i.test(clean(payload.reply, 2000));
}

function sourceLevelIntent(message) {
  return /\b(source code|react|tsx|typescript|javascript|cloudflare function|backend|api endpoint|route|routing|database schema|migration|authentication logic|worker|github file|repository file)\b/i.test(message);
}

function likelyFaqSelector(snapshot) {
  const text = clean(snapshot, 30000);
  if (/id=["']faq["']/i.test(text)) return "#faq";
  const id = text.match(/id=["']([^"']*faq[^"']*)["']/i)?.[1];
  if (id) return `#${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const classValue = text.match(/class=["'][^"']*\b([a-zA-Z0-9_-]*faq[a-zA-Z0-9_-]*)\b[^"']*["']/i)?.[1];
  if (classValue) return `.${classValue}`;
  if (/data-(?:section|component)=["']faq["']/i.test(text)) return '[data-section="faq"], [data-component="faq"]';
  return "main section:last-of-type";
}

function deterministicFaqPlan(body) {
  const targetPath = normalisePath(body.targetPath || "/");
  const selector = likelyFaqSelector(body.pageSnapshot);
  const css = `.planyx-ai-faq{position:relative;max-width:76rem;margin-inline:auto;padding:clamp(2rem,5vw,4.5rem) clamp(1rem,3vw,2rem);color:#0b172d}.planyx-ai-faq>h2,.planyx-ai-faq>header,.planyx-ai-faq>[class*="heading"]{grid-column:1/-1}.planyx-ai-faq>div:last-child,.planyx-ai-faq [class*="faq-list"],.planyx-ai-faq [class*="faq-grid"]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;align-items:start}.planyx-ai-faq details{overflow:hidden;border:1px solid #dbe5f3;border-radius:1.125rem;background:#fff;box-shadow:0 10px 30px rgba(11,23,45,.06);transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease}.planyx-ai-faq details:hover{border-color:#9dbcf8;box-shadow:0 16px 38px rgba(40,100,232,.10);transform:translateY(-1px)}.planyx-ai-faq summary{position:relative;display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:4.5rem;padding:1.15rem 3.4rem 1.15rem 1.25rem;cursor:pointer;list-style:none;font-weight:750;line-height:1.35;color:#0b172d}.planyx-ai-faq summary::-webkit-details-marker{display:none}.planyx-ai-faq summary::after{content:"+";position:absolute;right:1.2rem;top:50%;display:grid;width:1.8rem;height:1.8rem;translate:0 -50%;place-items:center;border-radius:999px;background:#eef4ff;color:#2864e8;font-size:1.25rem;font-weight:500;transition:rotate .2s ease,background .2s ease}.planyx-ai-faq details[open] summary::after{content:"−";background:#2864e8;color:#fff}.planyx-ai-faq details[open] summary{border-bottom:1px solid #e7edf6}.planyx-ai-faq details>:not(summary){margin:0;padding:1rem 1.25rem 1.3rem;color:#475569;line-height:1.75}.planyx-ai-faq summary:focus-visible{outline:3px solid rgba(34,199,217,.45);outline-offset:-3px}.planyx-ai-faq a{color:#2864e8;text-underline-offset:3px}@media(max-width:760px){.planyx-ai-faq{padding-block:2.5rem}.planyx-ai-faq>div:last-child,.planyx-ai-faq [class*="faq-list"],.planyx-ai-faq [class*="faq-grid"]{grid-template-columns:1fr}.planyx-ai-faq summary{min-height:4rem;padding:1rem 3.1rem 1rem 1rem}.planyx-ai-faq details>:not(summary){padding:1rem}}`;
  return {
    reply: "I have applied a polished Sousa Murray Planeia FAQ treatment to the existing questions without replacing their content. The draft now uses responsive boxed accordion cards, a two-column desktop layout and a single-column mobile layout.",
    summary: "Restyle the existing FAQ as polished responsive Sousa Murray Planeia accordion cards.",
    warnings: ["The selector was chosen from the available preview structure. Check the desktop and mobile preview before publishing."],
    operations: [
      { type: "add_class", path: targetPath, selector, value: "planyx-ai-faq" },
      { type: "set_page_css", path: targetPath, css },
    ],
  };
}

function simpleQuality(plan, message) {
  const operations = Array.isArray(plan?.operations) ? plan.operations : [];
  if (!operations.length) return false;
  const visual = /\b(design|redesign|style|layout|professional|modern|polish|boxes|cards?|marketing|visual|colour|spacing|responsive|mobile|faq|hero|banner|grid)\b/i.test(message);
  if (!visual) return true;
  const css = operations.filter(item => ["set_page_css", "set_global_css"].includes(item.type)).map(item => item.css || item.value || "").join("\n");
  const html = operations.filter(item => ["replace_html", "append_html", "create_page", "update_page"].includes(item.type)).map(item => item.value || item.html || "").join("\n");
  const classOnly = operations.some(item => item.type === "add_class");
  if (!css || css.length < 220) return false;
  if (!/(padding|margin|gap)\s*:/i.test(css)) return false;
  if (!/(border|border-radius)\s*:/i.test(css)) return false;
  if (!/@media\b/i.test(css)) return false;
  if (html && !/class\s*=\s*["'][^"']+["']/i.test(html)) return false;
  return Boolean(html || classOnly || css);
}

async function requestFullCapabilityPlan(env, body, payload, attempt = 1) {
  const settings = payload.settings || {};
  const message = clean(body.message, 6000);
  const targetPath = normalisePath(body.targetPath || "/");
  const currentPlan = body.currentPlan && typeof body.currentPlan === "object" ? body.currentPlan : (payload.plan || { summary: "No draft", operations: [] });
  const snapshot = clean(body.pageSnapshot, 22000) || "No preview snapshot supplied.";
  const model = COMPLEX_MODEL;
  const sourceRequest = sourceLevelIntent(message);
  const system = `You are the senior AI website engineer and product designer for Sousa Murray Planeia, operated by JA Group Services Ltd. Carry out the administrator's website request as completely as possible.

Return exactly one JSON object and nothing else.
Schema: {"reply":"Natural concise acknowledgement","summary":"Complete draft summary","warnings":[],"operations":[...]}
Allowed operations: create_page, update_page, delete_page, set_global_css, set_page_css, replace_text, replace_html, append_html, hide, set_attribute, add_class.

CAPABILITY RULES:
- You can rewrite content, redesign sections, add/remove/move visible content by replacing the relevant parent block, create and delete managed pages, change responsive styling, navigation presentation, calls to action, forms' presentation, metadata on managed pages and customer-portal presentation.
- Preserve valid earlier draft operations unless the administrator asks to replace or remove them.
- Use selectors evidenced by the snapshot. If moving an element, replace the smallest stable parent container with the complete reordered accessible markup.
- For visual work, return substantial route CSS with a mobile @media rule. Use semantic HTML, reusable planyx-/px- classes, clear spacing, restrained borders/shadows and the Sousa Murray Planeia palette (#0b172d, #2864e8, #22c7d9, #7c3aed, white and slate).
- FAQ work must preserve existing factual content where possible and use accessible details/summary cards or an equivalently accessible pattern.
- Never produce loose text as a finished visual component.
- Do not alter unrelated sections.
- Never target /admin, /api, /auth or /sign. Never expose or edit secrets, credentials, passwords or tokens. Preserve mandatory legal, privacy, age, safeguarding, authentication and security controls.
- ${sourceRequest ? "This request appears to require source-code work. Use managed operations only for the parts that can be represented safely in the preview, and explain in warnings which deeper source files may still need editing in the Source Code workspace." : "Complete the request using the managed preview operations."}
- If one essential detail is truly missing, do not invent it. Return an operations array preserving the current draft and ask one focused question in reply.

Target path: ${targetPath}
Current draft: ${JSON.stringify(currentPlan).slice(0, 30000)}
Visible page structure: ${snapshot}`;
  const request = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: attempt === 1 ? message : `The previous attempt was incomplete or visually weak. Complete this request with a production-quality responsive plan: ${message}` },
    ],
    temperature: attempt === 1 ? 0.15 : 0,
    max_tokens: 6200,
  };
  let result;
  try {
    result = await env.AI.run(model, { ...request, response_format: { type: "json_object" } });
  } catch {
    result = await env.AI.run(model, request);
  }
  return normalisePlan(findStructured(result), message, targetPath, settings.maxOperations || 60);
}

async function savePlan(context, body, payload, plan) {
  const headers = new Headers(context.request.headers);
  headers.set("Content-Type", "application/json");
  const request = new Request(context.request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "save_plan",
      id: payload.conversationId,
      targetPath: body.targetPath || "/",
      plan,
    }),
  });
  const response = await runStudioV2({ ...context, request });
  const result = await response.clone().json().catch(() => ({}));
  return response.ok && result?.success !== false;
}

async function replaceLatestMessage(env, conversationId, reply) {
  if (!env.DB || !conversationId) return;
  try {
    await env.DB.prepare(`UPDATE website_builder_messages SET content=? WHERE id=(
      SELECT id FROM website_builder_messages WHERE conversation_id=? AND role='assistant'
      ORDER BY created_at DESC LIMIT 1
    )`).bind(reply, conversationId).run();
  } catch {
    // Conversation repair must never block a valid draft.
  }
}

function withReplyMessages(payload, reply) {
  const messages = Array.isArray(payload.messages) ? [...payload.messages] : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") {
      messages[index] = { ...messages[index], content: reply };
      return messages;
    }
  }
  messages.push({ id: crypto.randomUUID(), role: "assistant", content: reply, created_at: new Date().toISOString() });
  return messages;
}

export async function onRequest(context) {
  const request = context.request;
  if (request.method !== "POST") return runStudioV4(context);
  const body = await request.clone().json().catch(() => ({}));
  if (clean(body.action, 80) !== "chat") return runStudioV4(context);

  const originalResponse = await runStudioV4(context);
  const payload = await originalResponse.clone().json().catch(() => null);
  if (!payload?.success || !needsCapabilityRecovery(payload) || !context.env.AI?.run) return originalResponse;

  const message = clean(body.message, 6000);
  let improved = null;
  try {
    improved = await requestFullCapabilityPlan(context.env, body, payload, 1);
    if (!improved || !simpleQuality(improved, message)) improved = await requestFullCapabilityPlan(context.env, body, payload, 2);
  } catch (error) {
    console.warn(JSON.stringify({
      event: "website_studio_full_capability_retry_failed",
      correlation_id: payload.correlationId || "",
      error: error instanceof Error ? error.message : "Unknown capability error",
    }));
  }

  if ((!improved || !simpleQuality(improved, message)) && /\bfaq|frequently asked\b/i.test(message)) {
    improved = deterministicFaqPlan(body);
  }

  if (!improved) {
    const current = body.currentPlan && typeof body.currentPlan === "object" ? body.currentPlan : (payload.plan || { summary: "No draft changes", warnings: [], operations: [] });
    const reply = sourceLevelIntent(message)
      ? "I can handle the visible website part of this request, but the deeper behaviour requires a specific source file or component. Tell me the page or feature name, or open Source Code and select the file, and I will continue without discarding your current draft."
      : "I need one precise detail before I change this safely: which visible section or page should I target? Your current draft has been kept unchanged.";
    return json({
      ...payload,
      reply,
      plan: current,
      messages: withReplyMessages(payload, reply),
      needsClarification: true,
      capabilityMode: "full",
    });
  }

  const saved = await savePlan(context, body, payload, improved);
  if (!saved) return originalResponse;
  await replaceLatestMessage(context.env, payload.conversationId, improved.reply);
  return json({
    ...payload,
    reply: improved.reply,
    plan: { summary: improved.summary, warnings: improved.warnings, operations: improved.operations },
    messages: withReplyMessages(payload, improved.reply),
    designQualityRejected: false,
    designQualityImproved: true,
    capabilityMode: "full",
    modelUsed: COMPLEX_MODEL,
  });
}
