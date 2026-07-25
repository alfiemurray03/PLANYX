import { isSameOriginRequest } from "../../_shared/enquiries.js";
import { getNativeSession } from "../../_shared/oidc.js";

const RESERVED_PREFIXES = ["/admin", "/api", "/auth", "/sign/"];
const OPERATION_TYPES = new Set([
  "create_page", "update_page", "delete_page", "set_global_css", "set_page_css",
  "replace_text", "replace_html", "append_html", "hide", "set_attribute", "add_class",
]);

const DEFAULT_SETTINGS = {
  enabled: true,
  maintenanceEnabled: false,
  maintenanceMessage: "The AI Website Builder is temporarily unavailable while maintenance is completed.",
  maintenanceStart: "",
  maintenanceEnd: "",
  readOnly: false,
  acknowledgementSound: true,
  previewEnabled: true,
  publishConfirmation: true,
  allowHtml: true,
  allowCss: true,
  allowCreatePages: true,
  allowDeletePages: true,
  allowExistingPageRules: true,
  maxHistory: 20,
  maxOperations: 30,
  model: "@cf/meta/llama-3.1-8b-instruct-fast",
  systemInstructions: "Use accessible, responsive British English website design. Preserve Planyx legal, privacy, age, safeguarding, security and authentication controls.",
};

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

function clean(value, max = 10000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function parseJson(value, fallback = null) {
  try { return JSON.parse(String(value || "")); } catch { return fallback; }
}

function extractJson(value) {
  const text = clean(value, 80000).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  return first >= 0 && last > first ? parseJson(text.slice(first, last + 1)) : null;
}

function configuredAdmins(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || "alfieholywoodmurray@jagroupservices.co.uk")
    .split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
}

function parsePermissions(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function authorise(DB, identity, env) {
  const email = clean(identity?.email, 254).toLowerCase();
  if (!email) return { authenticated: false, authorised: false };
  if (configuredAdmins(env).includes(email)) return { authenticated: true, authorised: true };
  const admin = await DB.prepare("SELECT role,status,permissions FROM admin_users WHERE lower(email)=lower(?)")
    .bind(email).first().catch(() => null);
  if (!admin || ["blocked", "closed", "disabled", "inactive", "suspended"].includes(clean(admin.status || "Active", 80).toLowerCase())) {
    return { authenticated: true, authorised: false };
  }
  if (admin.role === "Platform Owner") return { authenticated: true, authorised: true };
  const permissions = parsePermissions(admin.permissions);
  if (permissions.includes("*") || permissions.includes("manage_content") || permissions.includes("manage_pages") || permissions.includes("manage_system_settings") || permissions.includes("manage_settings")) {
    return { authenticated: true, authorised: true };
  }
  const permission = await DB.prepare(`SELECT permission_code FROM role_permissions
    WHERE role_name=? AND permission_code IN ('manage_content','manage_pages','manage_system_settings','manage_settings') LIMIT 1`)
    .bind(clean(admin.role || "Auditor", 100)).first().catch(() => null);
  return { authenticated: true, authorised: Boolean(permission) };
}

function safePath(value, { allowRoot = true } = {}) {
  let candidate = clean(value || "/", 240);
  if (!candidate.startsWith("/")) candidate = `/${candidate}`;
  candidate = candidate.replace(/\/{2,}/g, "/");
  if (!allowRoot && candidate === "/") throw new Error("Choose a page path other than the homepage.");
  if (candidate.includes("?") || candidate.includes("#")) throw new Error("Page paths cannot contain query strings or fragments.");
  if (RESERVED_PREFIXES.some(prefix => candidate === prefix || candidate.startsWith(prefix))) {
    throw new Error("Admin, API, authentication and secure signing routes are protected from Website Builder changes.");
  }
  return candidate;
}

function safeSelector(value) {
  const selector = clean(value, 500);
  if (!selector) throw new Error("A CSS selector is required for this change.");
  if (/script|iframe|object|embed|meta|base/i.test(selector)) throw new Error("That selector targets a protected element.");
  return selector;
}

function safeAttribute(value) {
  const name = clean(value, 80).toLowerCase();
  if (!/^(?:aria-[a-z0-9_-]+|data-[a-z0-9_-]+|title|alt|href|target|rel|class|id)$/.test(name)) {
    throw new Error("That HTML attribute cannot be changed through the builder.");
  }
  return name;
}

function sanitiseHtml(value) {
  let html = clean(value, 180000);
  html = html.replace(/<\/?(?:script|iframe|object|embed|meta|base|link)[^>]*>/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/javascript\s*:/gi, "");
  html = html.replace(/data\s*:\s*text\/html/gi, "");
  return html;
}

function sanitiseCss(value) {
  let css = clean(value, 180000);
  css = css.replace(/@import[^;]+;?/gi, "");
  css = css.replace(/expression\s*\(/gi, "");
  css = css.replace(/javascript\s*:/gi, "");
  css = css.replace(/url\(\s*(['"]?)(?!\/|data:image\/)[^)]*\)/gi, "none");
  return css;
}

function normaliseSettings(raw = {}) {
  const legacyStatus = clean(raw.status, 30).toLowerCase();
  return {
    enabled: bool(raw.enabled, raw.aiEnabled === undefined ? legacyStatus !== "offline" : bool(raw.aiEnabled, true)),
    maintenanceEnabled: bool(raw.maintenanceEnabled, legacyStatus === "maintenance"),
    maintenanceMessage: clean(raw.maintenanceMessage || DEFAULT_SETTINGS.maintenanceMessage, 800),
    maintenanceStart: clean(raw.maintenanceStart, 60),
    maintenanceEnd: clean(raw.maintenanceEnd, 60),
    readOnly: bool(raw.readOnly, DEFAULT_SETTINGS.readOnly),
    acknowledgementSound: bool(raw.acknowledgementSound, DEFAULT_SETTINGS.acknowledgementSound),
    previewEnabled: bool(raw.previewEnabled, raw.livePreview === undefined ? DEFAULT_SETTINGS.previewEnabled : bool(raw.livePreview, true)),
    publishConfirmation: bool(raw.publishConfirmation, raw.requirePublishConfirmation === undefined ? DEFAULT_SETTINGS.publishConfirmation : bool(raw.requirePublishConfirmation, true)),
    allowHtml: bool(raw.allowHtml, DEFAULT_SETTINGS.allowHtml),
    allowCss: bool(raw.allowCss, DEFAULT_SETTINGS.allowCss),
    allowCreatePages: bool(raw.allowCreatePages, raw.allowPageCreate === undefined ? DEFAULT_SETTINGS.allowCreatePages : bool(raw.allowPageCreate, true)),
    allowDeletePages: bool(raw.allowDeletePages, raw.allowPageDelete === undefined ? DEFAULT_SETTINGS.allowDeletePages : bool(raw.allowPageDelete, true)),
    allowExistingPageRules: bool(raw.allowExistingPageRules, DEFAULT_SETTINGS.allowExistingPageRules),
    maxHistory: integer(raw.maxHistory ?? raw.maxContextMessages, DEFAULT_SETTINGS.maxHistory, 4, 80),
    maxOperations: integer(raw.maxOperations, DEFAULT_SETTINGS.maxOperations, 1, 60),
    model: clean(raw.model || raw.aiModel || DEFAULT_SETTINGS.model, 180),
    systemInstructions: clean(raw.systemInstructions || DEFAULT_SETTINGS.systemInstructions, 4000),
  };
}

async function ensureTables(DB) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS website_builder_config (
      id INTEGER PRIMARY KEY, config_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_by TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS website_builder_settings (
      id INTEGER PRIMARY KEY, global_css TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_by TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS website_builder_pages (
      id TEXT PRIMARY KEY,path TEXT NOT NULL UNIQUE,title TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',
      html TEXT NOT NULL DEFAULT '',css TEXT NOT NULL DEFAULT '',seo_title TEXT DEFAULT '',seo_description TEXT DEFAULT '',
      noindex INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_by TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS website_builder_rules (
      id TEXT PRIMARY KEY,path_pattern TEXT NOT NULL,operation TEXT NOT NULL,selector TEXT DEFAULT '',value TEXT DEFAULT '',
      attribute_name TEXT DEFAULT '',status TEXT NOT NULL DEFAULT 'published',sort_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_by TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS website_builder_plans (
      id TEXT PRIMARY KEY,prompt TEXT NOT NULL,target_path TEXT DEFAULT '/',plan_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',
      created_by TEXT DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,published_at TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS website_builder_messages (
      id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,actor_email TEXT DEFAULT ''
    )`,
  ];
  for (const statement of statements) await DB.prepare(statement).run();
  await DB.prepare("INSERT OR IGNORE INTO website_builder_config (id,config_json,updated_by) VALUES (1,'{}','system-default')").run();
  await DB.prepare("INSERT OR IGNORE INTO website_builder_settings (id,global_css,updated_by) VALUES (1,'','system-default')").run();
}

async function safeAudit(DB, identity, action, entityId, summary, metadata = {}) {
  try {
    await DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY,actor_email TEXT,action TEXT,entity_type TEXT,entity_id TEXT,summary TEXT,metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();
    await DB.prepare(`INSERT INTO admin_audit_log
      (id,actor_email,action,entity_type,entity_id,summary,metadata) VALUES (?,?,?,?,?,?,?)`).bind(
        crypto.randomUUID(), clean(identity?.email, 254), action, "website_builder", clean(entityId, 240),
        clean(summary, 1000), JSON.stringify(metadata || {})
      ).run();
  } catch (error) {
    console.warn(JSON.stringify({ event: "website_studio_audit_skipped", action, entity_id: entityId, error: error instanceof Error ? error.message : "Unknown error" }));
  }
}

async function loadSettings(DB) {
  const configRow = await DB.prepare("SELECT config_json,updated_at,updated_by FROM website_builder_config WHERE id=1").first().catch(() => null);
  const cssRow = await DB.prepare("SELECT global_css,updated_at,updated_by FROM website_builder_settings WHERE id=1").first().catch(() => null);
  const parsed = parseJson(configRow?.config_json, {}) || {};
  return {
    ...normaliseSettings(parsed),
    globalCss: cssRow?.global_css || "",
    updatedAt: configRow?.updated_at || cssRow?.updated_at || "",
    updatedBy: configRow?.updated_by || cssRow?.updated_by || "",
  };
}

async function saveSettings(DB, input, identity) {
  const settings = normaliseSettings(input || {});
  await DB.prepare(`UPDATE website_builder_config
    SET config_json=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=1`).bind(
      JSON.stringify(settings), clean(identity?.email, 254)
    ).run();
  return { ...settings, globalCss: (await loadSettings(DB)).globalCss, updatedBy: clean(identity?.email, 254) };
}

async function inventory(DB, env) {
  const settings = await loadSettings(DB);
  const [pages, rules, plans] = await Promise.all([
    DB.prepare("SELECT * FROM website_builder_pages ORDER BY updated_at DESC").all().catch(() => ({ results: [] })),
    DB.prepare("SELECT * FROM website_builder_rules ORDER BY sort_order ASC,updated_at DESC").all().catch(() => ({ results: [] })),
    DB.prepare("SELECT * FROM website_builder_plans ORDER BY created_at DESC LIMIT 100").all().catch(() => ({ results: [] })),
  ]);
  return {
    settings,
    pages: pages.results || [],
    rules: rules.results || [],
    plans: (plans.results || []).map(row => ({ ...row, plan: parseJson(row.plan_json, { summary: "", warnings: [], operations: [] }) })),
    diagnostics: {
      database: true,
      workersAi: Boolean(env.AI?.run),
      model: settings.model,
      serviceState: !settings.enabled ? "offline" : settings.maintenanceEnabled ? "maintenance" : settings.readOnly ? "read-only" : "live",
      endpoint: "v2",
    },
  };
}

async function getMessages(DB, conversationId, maxHistory) {
  const result = await DB.prepare(`SELECT id,role,content,created_at FROM website_builder_messages
    WHERE conversation_id=? ORDER BY created_at ASC LIMIT ?`).bind(conversationId, maxHistory * 2).all().catch(() => ({ results: [] }));
  return result.results || [];
}

function validateOperation(raw, targetPath, settings) {
  const type = clean(raw?.type, 50).toLowerCase();
  if (!OPERATION_TYPES.has(type)) throw new Error(`Unsupported website change: ${type || "blank"}.`);
  if (["create_page", "update_page"].includes(type) && !settings.allowHtml) throw new Error("HTML page editing is disabled in Website Builder Settings.");
  if (["set_global_css", "set_page_css"].includes(type) && !settings.allowCss) throw new Error("CSS editing is disabled in Website Builder Settings.");
  if (type === "create_page" && !settings.allowCreatePages) throw new Error("Creating pages is disabled in Website Builder Settings.");
  if (type === "delete_page" && !settings.allowDeletePages) throw new Error("Deleting pages is disabled in Website Builder Settings.");
  if (["replace_text", "replace_html", "append_html", "hide", "set_attribute", "add_class"].includes(type) && !settings.allowExistingPageRules) {
    throw new Error("Editing existing application pages is disabled in Website Builder Settings.");
  }

  const operation = { type };
  if (type === "set_global_css") {
    operation.css = sanitiseCss(raw.css ?? raw.value);
    return operation;
  }
  operation.path = safePath(raw.path || targetPath || "/", { allowRoot: type !== "create_page" });
  if (["create_page", "update_page"].includes(type)) {
    operation.title = clean(raw.title || "Untitled page", 180);
    operation.html = sanitiseHtml(raw.html);
    operation.css = settings.allowCss ? sanitiseCss(raw.css) : "";
    operation.seoTitle = clean(raw.seoTitle || raw.seo_title || operation.title, 180);
    operation.seoDescription = clean(raw.seoDescription || raw.seo_description, 500);
    operation.noindex = Boolean(raw.noindex);
    operation.status = ["draft", "published", "archived"].includes(raw.status) ? raw.status : "published";
    return operation;
  }
  if (type === "delete_page") return operation;
  if (type === "set_page_css") {
    operation.css = sanitiseCss(raw.css ?? raw.value);
    return operation;
  }
  operation.selector = safeSelector(raw.selector);
  if (type === "set_attribute") {
    operation.attributeName = safeAttribute(raw.attributeName || raw.attribute_name);
    operation.value = clean(raw.value, 10000).replace(/javascript\s*:/gi, "");
  } else if (["replace_html", "append_html"].includes(type)) {
    if (!settings.allowHtml) throw new Error("HTML editing is disabled in Website Builder Settings.");
    operation.value = sanitiseHtml(raw.value ?? raw.html);
  } else {
    operation.value = clean(raw.value, 40000);
  }
  return operation;
}

function normalisePlan(raw, prompt, targetPath, settings, { allowEmpty = false } = {}) {
  const source = Array.isArray(raw?.operations) ? raw.operations : [];
  const operations = source.slice(0, settings.maxOperations).map(operation => validateOperation(operation, targetPath, settings));
  if (!operations.length && !allowEmpty) throw new Error("The builder did not produce a usable website change.");
  return {
    summary: clean(raw?.summary || `Website changes requested: ${prompt}`, 1000),
    warnings: Array.isArray(raw?.warnings) ? raw.warnings.map(item => clean(item, 500)).filter(Boolean).slice(0, 12) : [],
    operations,
  };
}

function fallbackChat(message, targetPath, currentPlan, settings, reason = "") {
  const lower = message.toLowerCase();
  const existing = currentPlan && Array.isArray(currentPlan.operations) ? normalisePlan(currentPlan, message, targetPath, settings, { allowEmpty: true }) : null;
  if (existing?.operations.length) {
    return {
      reply: "I acknowledged your message, but the AI service could not safely generate a revised change set. I have kept your current draft unchanged so nothing is lost.",
      plan: { ...existing, warnings: [...(existing.warnings || []), `AI service fallback used${reason ? `: ${clean(reason, 180)}` : "."}`] },
    };
  }
  if (/create|add|new page/.test(lower) && settings.allowCreatePages) {
    const title = clean(message.match(/(?:called|named|title(?:d)?)\s+["']?([^"'.]+)["']?/i)?.[1] || "New page", 180);
    const pathMatch = message.match(/\/[a-z0-9/_-]+/i);
    const path = safePath(pathMatch?.[0] || (targetPath === "/" ? "/new-page" : targetPath), { allowRoot: false });
    const plan = normalisePlan({
      summary: `Create ${title} at ${path}.`,
      warnings: [`AI service fallback used${reason ? `: ${clean(reason, 180)}` : "."}`],
      operations: [{
        type: "create_page", path, title, status: "published", noindex: false,
        seoTitle: `${title} — Planyx`, seoDescription: "",
        html: `<main class="managed-page"><section class="managed-page__hero"><p class="managed-page__eyebrow">Planyx</p><h1>${title.replace(/[<>&]/g, "")}</h1><p>Edit this content in the Website Studio.</p></section></main>`,
        css: ".managed-page{max-width:72rem;margin:0 auto;padding:4rem 1.5rem}.managed-page__hero{padding:3rem;border-radius:1.5rem;background:#eff6ff}.managed-page__eyebrow{font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:.12em}",
      }],
    }, message, path, settings);
    return { reply: `I have prepared a safe starter page at ${path}. The AI service was unavailable, but you can edit the HTML and CSS before publishing.`, plan };
  }
  return {
    reply: "I received your request, but the AI service could not create a safe website change just now. Your message has not altered the live site. Try again, or use Managed Code and Source Code for a manual change.",
    plan: {
      summary: `Website request awaiting a generated change for ${targetPath}.`,
      warnings: [`AI service fallback used${reason ? `: ${clean(reason, 180)}` : "."}`],
      operations: [],
    },
  };
}

async function generateChat(env, message, targetPath, currentPlan, history, snapshot, settings) {
  if (!env.AI?.run) return fallbackChat(message, targetPath, currentPlan, settings, "Workers AI binding unavailable");
  const system = `You are the conversational Planyx AI Website Builder operated by JA Group Services Ltd. Talk naturally to the administrator in concise British English while editing a website draft.

Return JSON only with this schema:
{"reply":"Friendly acknowledgement and concise explanation","summary":"Complete revised draft summary","warnings":["..."],"operations":[...]}

Allowed operation types: create_page, update_page, delete_page, set_global_css, set_page_css, replace_text, replace_html, append_html, hide, set_attribute, add_class.
The operations array must contain the complete revised draft, not only the latest delta. Preserve useful current operations unless the administrator asks to remove or replace them.

Rules:
- Never target /admin, /api, /auth or secure signing routes.
- No scripts, inline event handlers, javascript URLs, iframes, external CSS imports or executable code.
- Use responsive, accessible semantic HTML and stable conservative selectors.
- Never remove mandatory legal, privacy, age, safeguarding, security or authentication controls.
- For wording use replace_text. For a block use replace_html. To add a block use append_html. To remove a visible block use hide. Use set_page_css for route-specific design.
- HTML ${settings.allowHtml ? "allowed" : "disabled"}; CSS ${settings.allowCss ? "allowed" : "disabled"}; create pages ${settings.allowCreatePages ? "allowed" : "disabled"}; delete pages ${settings.allowDeletePages ? "allowed" : "disabled"}; existing-page rules ${settings.allowExistingPageRules ? "allowed" : "disabled"}.
- Additional operator instructions: ${settings.systemInstructions}

Target path: ${targetPath}
Current draft: ${JSON.stringify(currentPlan || { summary: "No draft yet", operations: [] }).slice(0, 30000)}
Visible page structure: ${clean(snapshot, 12000) || "No preview snapshot available."}`;
  try {
    const result = await env.AI.run(settings.model, {
      messages: [
        { role: "system", content: system },
        ...history.slice(-settings.maxHistory).map(item => ({ role: item.role === "assistant" ? "assistant" : "user", content: clean(item.content, 1800) })),
        { role: "user", content: clean(message, 6000) },
      ],
      temperature: 0.2,
      max_tokens: 4200,
    });
    const raw = clean(result?.response || result?.result?.response || result?.text, 80000);
    const parsed = extractJson(raw);
    if (!parsed) throw new Error("AI returned an invalid structured response");
    return {
      reply: clean(parsed.reply || "I have prepared the requested website changes for your review.", 2200),
      plan: normalisePlan(parsed, message, targetPath, settings, { allowEmpty: true }),
    };
  } catch (error) {
    return fallbackChat(message, targetPath, currentPlan, settings, error instanceof Error ? error.message : "Unknown AI error");
  }
}

async function persistConversation(DB, { conversationId, message, targetPath, plan, reply, identity }) {
  try {
    const existing = await DB.prepare("SELECT id FROM website_builder_plans WHERE id=?").bind(conversationId).first();
    if (existing) {
      await DB.prepare("UPDATE website_builder_plans SET plan_json=?,target_path=?,status='draft' WHERE id=?")
        .bind(JSON.stringify(plan), targetPath, conversationId).run();
    } else {
      await DB.prepare(`INSERT INTO website_builder_plans
        (id,prompt,target_path,plan_json,status,created_by) VALUES (?,?,?,?,?,?)`).bind(
          conversationId, message, targetPath, JSON.stringify(plan), "draft", clean(identity?.email, 254)
        ).run();
    }
    await DB.prepare(`INSERT INTO website_builder_messages
      (id,conversation_id,role,content,actor_email) VALUES (?,?,?,?,?)`).bind(
        crypto.randomUUID(), conversationId, "user", message, clean(identity?.email, 254)
      ).run();
    await DB.prepare(`INSERT INTO website_builder_messages
      (id,conversation_id,role,content,actor_email) VALUES (?,?,?,?,?)`).bind(
        crypto.randomUUID(), conversationId, "assistant", reply, "Planyx AI Website Builder"
      ).run();
    return true;
  } catch (error) {
    console.warn(JSON.stringify({ event: "website_studio_persistence_skipped", conversation_id: conversationId, error: error instanceof Error ? error.message : "Unknown error" }));
    return false;
  }
}

async function savePage(DB, input, identity, settings) {
  if (settings.readOnly) throw new Error("The Website Builder is currently read-only.");
  if (!settings.allowHtml) throw new Error("HTML page editing is disabled in Website Builder Settings.");
  const path = safePath(input.path, { allowRoot: false });
  const id = clean(input.id, 80) || crypto.randomUUID();
  const title = clean(input.title || "Untitled page", 180);
  const status = ["draft", "published", "archived"].includes(input.status) ? input.status : "draft";
  const html = sanitiseHtml(input.html);
  const css = settings.allowCss ? sanitiseCss(input.css) : "";
  await DB.prepare(`INSERT INTO website_builder_pages
    (id,path,title,status,html,css,seo_title,seo_description,noindex,updated_by)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET title=excluded.title,status=excluded.status,
    html=excluded.html,css=excluded.css,seo_title=excluded.seo_title,seo_description=excluded.seo_description,
    noindex=excluded.noindex,updated_at=CURRENT_TIMESTAMP,updated_by=excluded.updated_by`).bind(
      id, path, title, status, html, css, clean(input.seoTitle || input.seo_title || title, 180),
      clean(input.seoDescription || input.seo_description, 500), input.noindex ? 1 : 0, clean(identity?.email, 254)
    ).run();
  return path;
}

async function addRule(DB, operation, identity, order = 100) {
  const id = crypto.randomUUID();
  await DB.prepare(`INSERT INTO website_builder_rules
    (id,path_pattern,operation,selector,value,attribute_name,status,sort_order,updated_by) VALUES (?,?,?,?,?,?,?,?,?)`).bind(
      id, operation.path, operation.type, operation.selector || "",
      operation.type === "set_page_css" ? operation.css : operation.value || "",
      operation.attributeName || "", "published", order, clean(identity?.email, 254)
    ).run();
  return id;
}

async function publishPlan(DB, rawPlan, targetPath, identity, settings) {
  if (settings.readOnly) throw new Error("The Website Builder is currently read-only.");
  if (!settings.enabled || settings.maintenanceEnabled) throw new Error(settings.maintenanceMessage || "The Website Builder is not available for publication.");
  const plan = normalisePlan(rawPlan, "Publish Website Studio draft", targetPath || "/", settings);
  const applied = [];
  let order = 100;
  for (const operation of plan.operations) {
    if (operation.type === "set_global_css") {
      await DB.prepare("UPDATE website_builder_settings SET global_css=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=1")
        .bind(operation.css, clean(identity?.email, 254)).run();
      applied.push({ type: operation.type });
    } else if (["create_page", "update_page"].includes(operation.type)) {
      await savePage(DB, operation, identity, settings);
      applied.push({ type: operation.type, path: operation.path });
    } else if (operation.type === "delete_page") {
      await DB.prepare("DELETE FROM website_builder_pages WHERE path=?").bind(operation.path).run();
      await DB.prepare("DELETE FROM website_builder_rules WHERE path_pattern=?").bind(operation.path).run();
      applied.push({ type: operation.type, path: operation.path });
    } else {
      const ruleId = await addRule(DB, operation, identity, order++);
      applied.push({ type: operation.type, path: operation.path, ruleId });
    }
  }
  return { plan, applied };
}

export async function onRequest(context) {
  const { request, env } = context;
  const correlationId = clean(request.headers.get("cf-ray") || request.headers.get("x-request-id") || crypto.randomUUID(), 120);
  if (!env.DB) return json({ success: false, error: "The Website Builder database binding is missing.", correlationId }, 500);

  try {
    const identity = await getNativeSession(request, env, "admin");
    const access = await authorise(env.DB, identity, env);
    if (!access.authenticated) return json({ success: false, error: "Your administrator session has expired. Please sign in again.", code: "SESSION_EXPIRED", correlationId }, 401);
    if (!access.authorised) return json({ success: false, error: "You do not have permission to manage website content.", code: "FORBIDDEN", correlationId }, 403);

    await ensureTables(env.DB);

    if (request.method === "GET") {
      return json({ success: true, ...(await inventory(env.DB, env)), correlationId });
    }
    if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
    if (!isSameOriginRequest(request)) return json({ success: false, error: "This request could not be verified." }, 403);

    const body = await request.json().catch(() => ({}));
    const action = clean(body.action, 80);
    const settings = await loadSettings(env.DB);

    if (action === "save_settings") {
      const saved = await saveSettings(env.DB, body.settings || {}, identity);
      await safeAudit(env.DB, identity, "website_builder_settings_update", "settings", "Website Builder settings updated.", { service_state: !saved.enabled ? "offline" : saved.maintenanceEnabled ? "maintenance" : saved.readOnly ? "read-only" : "live", correlation_id: correlationId });
      return json({ success: true, settings: saved, inventory: await inventory(env.DB, env), correlationId });
    }

    if (action === "diagnostics") {
      const data = await inventory(env.DB, env);
      await safeAudit(env.DB, identity, "website_builder_diagnostics", "diagnostics", "Website Builder diagnostics completed.", { diagnostics: data.diagnostics, correlation_id: correlationId });
      return json({ success: true, diagnostics: data.diagnostics, counts: { pages: data.pages.length, rules: data.rules.length, plans: data.plans.length }, correlationId });
    }

    if (action === "chat") {
      if (!settings.enabled) return json({ success: false, error: "The AI Website Builder is offline." }, 503);
      if (settings.maintenanceEnabled) return json({ success: false, error: settings.maintenanceMessage }, 503);
      const message = clean(body.message, 6000);
      if (message.length < 2) return json({ success: false, error: "Type a message for the Website Builder." }, 400);
      const targetPath = safePath(body.targetPath || "/");
      const conversationId = clean(body.conversationId, 80) || crypto.randomUUID();
      const row = await env.DB.prepare("SELECT plan_json FROM website_builder_plans WHERE id=?").bind(conversationId).first().catch(() => null);
      const currentPlan = row ? parseJson(row.plan_json, null) : (body.currentPlan || null);
      const history = await getMessages(env.DB, conversationId, settings.maxHistory);
      const generated = await generateChat(env, message, targetPath, currentPlan, history, body.pageSnapshot, settings);
      const persisted = await persistConversation(env.DB, { conversationId, message, targetPath, plan: generated.plan, reply: generated.reply, identity });
      await safeAudit(env.DB, identity, "website_builder_chat", conversationId, generated.plan.summary, { target_path: targetPath, operation_count: generated.plan.operations.length, persisted, correlation_id: correlationId });
      const messages = persisted ? await getMessages(env.DB, conversationId, settings.maxHistory) : [
        ...history,
        { id: crypto.randomUUID(), role: "user", content: message, created_at: new Date().toISOString() },
        { id: crypto.randomUUID(), role: "assistant", content: generated.reply, created_at: new Date().toISOString() },
      ];
      return json({ success: true, conversationId, reply: generated.reply, plan: generated.plan, messages, settings, persisted, correlationId });
    }

    if (action === "get_conversation") {
      const id = clean(body.id, 80);
      const row = await env.DB.prepare("SELECT * FROM website_builder_plans WHERE id=?").bind(id).first().catch(() => null);
      if (!row) return json({ success: false, error: "That builder conversation could not be found." }, 404);
      return json({ success: true, conversation: { ...row, plan: parseJson(row.plan_json, { summary: "", warnings: [], operations: [] }) }, messages: await getMessages(env.DB, id, settings.maxHistory), correlationId });
    }

    if (action === "save_plan") {
      const id = clean(body.id, 80) || crypto.randomUUID();
      const targetPath = safePath(body.targetPath || "/");
      const plan = normalisePlan(typeof body.plan === "string" ? parseJson(body.plan) : body.plan, "Edit Website Studio draft", targetPath, settings, { allowEmpty: true });
      const existing = await env.DB.prepare("SELECT id FROM website_builder_plans WHERE id=?").bind(id).first().catch(() => null);
      if (existing) {
        await env.DB.prepare("UPDATE website_builder_plans SET plan_json=?,target_path=?,status='draft' WHERE id=?").bind(JSON.stringify(plan), targetPath, id).run();
      } else {
        await env.DB.prepare(`INSERT INTO website_builder_plans
          (id,prompt,target_path,plan_json,status,created_by) VALUES (?,?,?,?,?,?)`).bind(id, "Manual Website Studio draft", targetPath, JSON.stringify(plan), "draft", clean(identity?.email, 254)).run();
      }
      await safeAudit(env.DB, identity, "website_builder_plan_edit", id, "Website Builder draft edited in the code workspace.", { operation_count: plan.operations.length, correlation_id: correlationId });
      return json({ success: true, id, plan, correlationId });
    }

    if (action === "publish_plan") {
      const id = clean(body.id, 80);
      const row = id ? await env.DB.prepare("SELECT * FROM website_builder_plans WHERE id=?").bind(id).first().catch(() => null) : null;
      const rawPlan = body.plan || (row ? parseJson(row.plan_json, null) : null);
      if (!rawPlan) return json({ success: false, error: "That draft could not be found. Send the current draft again and retry." }, 404);
      const targetPath = safePath(body.targetPath || row?.target_path || "/");
      const result = await publishPlan(env.DB, rawPlan, targetPath, identity, settings);
      if (row) await env.DB.prepare("UPDATE website_builder_plans SET status='published',published_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run().catch(() => null);
      await safeAudit(env.DB, identity, "website_builder_plan_publish", id || "browser-draft", result.plan.summary, { applied: result.applied, correlation_id: correlationId });
      return json({ success: true, result, inventory: await inventory(env.DB, env), correlationId });
    }

    if (action === "discard_plan") {
      const id = clean(body.id, 80);
      if (id) await env.DB.prepare("UPDATE website_builder_plans SET status='discarded' WHERE id=? AND status='draft'").bind(id).run().catch(() => null);
      await safeAudit(env.DB, identity, "website_builder_plan_discard", id || "browser-draft", "Website Builder draft discarded.", { correlation_id: correlationId });
      return json({ success: true, inventory: await inventory(env.DB, env), correlationId });
    }

    if (action === "save_page") {
      const path = await savePage(env.DB, body.page || {}, identity, settings);
      await safeAudit(env.DB, identity, "website_builder_page_save", path, `Managed website page saved: ${path}.`, { correlation_id: correlationId });
      return json({ success: true, path, inventory: await inventory(env.DB, env), correlationId });
    }

    if (action === "delete_page") {
      if (settings.readOnly) throw new Error("The Website Builder is currently read-only.");
      if (!settings.allowDeletePages) throw new Error("Deleting pages is disabled in Website Builder Settings.");
      const path = safePath(body.path, { allowRoot: false });
      await env.DB.prepare("DELETE FROM website_builder_pages WHERE path=?").bind(path).run();
      await env.DB.prepare("DELETE FROM website_builder_rules WHERE path_pattern=?").bind(path).run();
      await safeAudit(env.DB, identity, "website_builder_page_delete", path, `Managed website page deleted: ${path}.`, { correlation_id: correlationId });
      return json({ success: true, inventory: await inventory(env.DB, env), correlationId });
    }

    if (action === "save_global_css") {
      if (settings.readOnly) throw new Error("The Website Builder is currently read-only.");
      if (!settings.allowCss) throw new Error("CSS editing is disabled in Website Builder Settings.");
      const css = sanitiseCss(body.css);
      await env.DB.prepare("UPDATE website_builder_settings SET global_css=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=1")
        .bind(css, clean(identity?.email, 254)).run();
      await safeAudit(env.DB, identity, "website_builder_global_css_save", "global", "Global customer-site CSS updated.", { characters: css.length, correlation_id: correlationId });
      return json({ success: true, inventory: await inventory(env.DB, env), correlationId });
    }

    if (action === "save_rule") {
      if (settings.readOnly) throw new Error("The Website Builder is currently read-only.");
      const operation = validateOperation(body.rule || {}, body.rule?.path || "/", settings);
      if (["create_page", "update_page", "delete_page", "set_global_css"].includes(operation.type)) return json({ success: false, error: "Use the page or global CSS editor for that change." }, 400);
      const id = await addRule(env.DB, operation, identity, Number(body.rule?.sortOrder || 100));
      await safeAudit(env.DB, identity, "website_builder_rule_save", id, `Website rule published for ${operation.path}.`, { operation: operation.type, correlation_id: correlationId });
      return json({ success: true, ruleId: id, inventory: await inventory(env.DB, env), correlationId });
    }

    if (action === "delete_rule") {
      if (settings.readOnly) throw new Error("The Website Builder is currently read-only.");
      const id = clean(body.id, 80);
      await env.DB.prepare("DELETE FROM website_builder_rules WHERE id=?").bind(id).run();
      await safeAudit(env.DB, identity, "website_builder_rule_delete", id, "Website rule removed.", { correlation_id: correlationId });
      return json({ success: true, inventory: await inventory(env.DB, env), correlationId });
    }

    return json({ success: false, error: "Unknown Website Studio action." }, 400);
  } catch (error) {
    console.error(JSON.stringify({ event: "website_studio_v2_request_failed", correlation_id: correlationId, error: error instanceof Error ? error.message : "Unknown error" }));
    return json({ success: false, error: error instanceof Error ? error.message : "The Website Studio could not complete the request.", correlationId }, 500);
  }
}
