import { isSameOriginRequest } from "../../_shared/enquiries.js";
import { getNativeSession } from "../../_shared/oidc.js";

const RESERVED_PREFIXES = ["/admin", "/api", "/auth", "/sign/"];
const OPERATION_TYPES = new Set([
  "create_page", "update_page", "delete_page", "set_global_css", "set_page_css",
  "replace_text", "replace_html", "append_html", "hide", "set_attribute", "add_class",
]);

const DEFAULT_CONFIG = {
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
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function configuredAdmins(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || "alfieholywoodmurray@jagroupservices.co.uk")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
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
  if (permissions.includes("*") || permissions.includes("manage_content") || permissions.includes("manage_pages") || permissions.includes("manage_system_settings")) {
    return { authenticated: true, authorised: true };
  }
  const permission = await DB.prepare(`SELECT permission_code FROM role_permissions
    WHERE role_name=? AND permission_code IN ('manage_content','manage_pages','manage_system_settings') LIMIT 1`)
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
    throw new Error("Admin, API, authentication and secure signing routes are protected from website-builder changes.");
  }
  return candidate;
}

function safeSelector(value) {
  const selector = clean(value, 500);
  if (!selector) throw new Error("A CSS selector is required for this change.");
  if (/script|iframe|object|embed|meta|base/i.test(selector)) throw new Error("That selector targets a protected element.");
  return selector;
}

function sanitiseHtml(value) {
  let html = clean(value, 160000);
  html = html.replace(/<\/?(?:script|iframe|object|embed|meta|base|link)[^>]*>/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/javascript\s*:/gi, "");
  html = html.replace(/data\s*:\s*text\/html/gi, "");
  return html;
}

function sanitiseCss(value) {
  let css = clean(value, 160000);
  css = css.replace(/@import[^;]+;?/gi, "");
  css = css.replace(/expression\s*\(/gi, "");
  css = css.replace(/javascript\s*:/gi, "");
  css = css.replace(/url\(\s*(['"]?)(?!\/|data:image\/)[^)]*\)/gi, "none");
  return css;
}

function safeAttribute(value) {
  const name = clean(value, 80).toLowerCase();
  if (!/^(?:aria-[a-z0-9_-]+|data-[a-z0-9_-]+|title|alt|href|target|rel|class|id)$/.test(name)) {
    throw new Error("That HTML attribute cannot be changed through the builder.");
  }
  return name;
}

function parseJson(value, fallback = null) {
  try { return JSON.parse(String(value || "")); } catch { return fallback; }
}

function extractJson(value) {
  const text = clean(value, 70000).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  return first >= 0 && last > first ? parseJson(text.slice(first, last + 1)) : null;
}

async function addColumn(DB, statement) {
  await DB.prepare(statement).run().catch(() => null);
}

async function ensureTables(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS website_builder_settings (
    id INTEGER PRIMARY KEY,
    global_css TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT DEFAULT ''
  )`).run();
  await DB.prepare("INSERT OR IGNORE INTO website_builder_settings (id,global_css,updated_by) VALUES (1,'','system-default')").run();
  const columns = [
    "enabled INTEGER NOT NULL DEFAULT 1",
    "maintenance_enabled INTEGER NOT NULL DEFAULT 0",
    "maintenance_message TEXT NOT NULL DEFAULT ''",
    "maintenance_start TEXT NOT NULL DEFAULT ''",
    "maintenance_end TEXT NOT NULL DEFAULT ''",
    "read_only INTEGER NOT NULL DEFAULT 0",
    "acknowledgement_sound INTEGER NOT NULL DEFAULT 1",
    "preview_enabled INTEGER NOT NULL DEFAULT 1",
    "publish_confirmation INTEGER NOT NULL DEFAULT 1",
    "allow_html INTEGER NOT NULL DEFAULT 1",
    "allow_css INTEGER NOT NULL DEFAULT 1",
    "allow_create_pages INTEGER NOT NULL DEFAULT 1",
    "allow_delete_pages INTEGER NOT NULL DEFAULT 1",
    "allow_existing_page_rules INTEGER NOT NULL DEFAULT 1",
    "max_history INTEGER NOT NULL DEFAULT 20",
    "max_operations INTEGER NOT NULL DEFAULT 30",
    "model TEXT NOT NULL DEFAULT ''",
    "system_instructions TEXT NOT NULL DEFAULT ''",
  ];
  for (const column of columns) await addColumn(DB, `ALTER TABLE website_builder_settings ADD COLUMN ${column}`);

  await DB.prepare(`CREATE TABLE IF NOT EXISTS website_builder_pages (
    id TEXT PRIMARY KEY,path TEXT NOT NULL UNIQUE,title TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',
    html TEXT NOT NULL DEFAULT '',css TEXT NOT NULL DEFAULT '',seo_title TEXT DEFAULT '',seo_description TEXT DEFAULT '',
    noindex INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_by TEXT DEFAULT ''
  )`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS website_builder_rules (
    id TEXT PRIMARY KEY,path_pattern TEXT NOT NULL,operation TEXT NOT NULL,selector TEXT DEFAULT '',value TEXT DEFAULT '',
    attribute_name TEXT DEFAULT '',status TEXT NOT NULL DEFAULT 'published',sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_by TEXT DEFAULT ''
  )`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS website_builder_plans (
    id TEXT PRIMARY KEY,prompt TEXT NOT NULL,target_path TEXT DEFAULT '/',plan_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',
    created_by TEXT DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,published_at TEXT DEFAULT ''
  )`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS website_builder_messages (
    id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,actor_email TEXT DEFAULT ''
  )`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY,actor_email TEXT,action TEXT,entity_type TEXT,entity_id TEXT,summary TEXT,metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

function configFrom(row = {}) {
  return {
    enabled: bool(row.enabled, DEFAULT_CONFIG.enabled),
    maintenanceEnabled: bool(row.maintenance_enabled, DEFAULT_CONFIG.maintenanceEnabled),
    maintenanceMessage: clean(row.maintenance_message || DEFAULT_CONFIG.maintenanceMessage, 600),
    maintenanceStart: clean(row.maintenance_start, 60),
    maintenanceEnd: clean(row.maintenance_end, 60),
    readOnly: bool(row.read_only, DEFAULT_CONFIG.readOnly),
    acknowledgementSound: bool(row.acknowledgement_sound, DEFAULT_CONFIG.acknowledgementSound),
    previewEnabled: bool(row.preview_enabled, DEFAULT_CONFIG.previewEnabled),
    publishConfirmation: bool(row.publish_confirmation, DEFAULT_CONFIG.publishConfirmation),
    allowHtml: bool(row.allow_html, DEFAULT_CONFIG.allowHtml),
    allowCss: bool(row.allow_css, DEFAULT_CONFIG.allowCss),
    allowCreatePages: bool(row.allow_create_pages, DEFAULT_CONFIG.allowCreatePages),
    allowDeletePages: bool(row.allow_delete_pages, DEFAULT_CONFIG.allowDeletePages),
    allowExistingPageRules: bool(row.allow_existing_page_rules, DEFAULT_CONFIG.allowExistingPageRules),
    maxHistory: integer(row.max_history, DEFAULT_CONFIG.maxHistory, 4, 80),
    maxOperations: integer(row.max_operations, DEFAULT_CONFIG.maxOperations, 1, 60),
    model: clean(row.model || DEFAULT_CONFIG.model, 180),
    systemInstructions: clean(row.system_instructions || DEFAULT_CONFIG.systemInstructions, 3000),
  };
}

async function loadSettings(DB) {
  const row = await DB.prepare("SELECT * FROM website_builder_settings WHERE id=1").first();
  return { globalCss: row?.global_css || "", updatedAt: row?.updated_at || "", updatedBy: row?.updated_by || "", ...configFrom(row) };
}

async function saveSettings(DB, input, identity) {
  const config = {
    enabled: bool(input.enabled, true),
    maintenanceEnabled: bool(input.maintenanceEnabled, false),
    maintenanceMessage: clean(input.maintenanceMessage || DEFAULT_CONFIG.maintenanceMessage, 600),
    maintenanceStart: clean(input.maintenanceStart, 60),
    maintenanceEnd: clean(input.maintenanceEnd, 60),
    readOnly: bool(input.readOnly, false),
    acknowledgementSound: bool(input.acknowledgementSound, true),
    previewEnabled: bool(input.previewEnabled, true),
    publishConfirmation: bool(input.publishConfirmation, true),
    allowHtml: bool(input.allowHtml, true),
    allowCss: bool(input.allowCss, true),
    allowCreatePages: bool(input.allowCreatePages, true),
    allowDeletePages: bool(input.allowDeletePages, true),
    allowExistingPageRules: bool(input.allowExistingPageRules, true),
    maxHistory: integer(input.maxHistory, 20, 4, 80),
    maxOperations: integer(input.maxOperations, 30, 1, 60),
    model: clean(input.model || DEFAULT_CONFIG.model, 180),
    systemInstructions: clean(input.systemInstructions || DEFAULT_CONFIG.systemInstructions, 3000),
  };
  await DB.prepare(`UPDATE website_builder_settings SET
    enabled=?,maintenance_enabled=?,maintenance_message=?,maintenance_start=?,maintenance_end=?,read_only=?,
    acknowledgement_sound=?,preview_enabled=?,publish_confirmation=?,allow_html=?,allow_css=?,allow_create_pages=?,
    allow_delete_pages=?,allow_existing_page_rules=?,max_history=?,max_operations=?,model=?,system_instructions=?,
    updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=1`).bind(
      config.enabled ? 1 : 0, config.maintenanceEnabled ? 1 : 0, config.maintenanceMessage,
      config.maintenanceStart, config.maintenanceEnd, config.readOnly ? 1 : 0,
      config.acknowledgementSound ? 1 : 0, config.previewEnabled ? 1 : 0, config.publishConfirmation ? 1 : 0,
      config.allowHtml ? 1 : 0, config.allowCss ? 1 : 0, config.allowCreatePages ? 1 : 0,
      config.allowDeletePages ? 1 : 0, config.allowExistingPageRules ? 1 : 0,
      config.maxHistory, config.maxOperations, config.model, config.systemInstructions, clean(identity.email, 254)
    ).run();
  return loadSettings(DB);
}

async function audit(DB, identity, action, entityId, summary, metadata = {}) {
  await DB.prepare(`INSERT INTO admin_audit_log
    (id,actor_email,action,entity_type,entity_id,summary,metadata) VALUES (?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), clean(identity.email, 254), action, "website_builder", clean(entityId, 240),
      clean(summary, 1000), JSON.stringify(metadata)
    ).run();
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
    operation.seoTitle = clean(raw.seoTitle || operation.title, 180);
    operation.seoDescription = clean(raw.seoDescription, 500);
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
    operation.attributeName = safeAttribute(raw.attributeName);
    operation.value = clean(raw.value, 10000).replace(/javascript\s*:/gi, "");
  } else if (["replace_html", "append_html"].includes(type)) {
    if (!settings.allowHtml) throw new Error("HTML editing is disabled in Website Builder Settings.");
    operation.value = sanitiseHtml(raw.value ?? raw.html);
  } else operation.value = clean(raw.value, 40000);
  return operation;
}

function normalisePlan(raw, prompt, targetPath, settings) {
  const source = Array.isArray(raw?.operations) ? raw.operations : [];
  const operations = source.slice(0, settings.maxOperations).map(operation => validateOperation(operation, targetPath, settings));
  if (!operations.length) throw new Error("The builder did not produce a usable website change.");
  return {
    summary: clean(raw?.summary || `Website changes requested: ${prompt}`, 1000),
    warnings: Array.isArray(raw?.warnings) ? raw.warnings.map(item => clean(item, 500)).filter(Boolean).slice(0, 12) : [],
    operations,
  };
}

async function inventory(DB, env) {
  const [settings, pages, rules, plans] = await Promise.all([
    loadSettings(DB),
    DB.prepare("SELECT * FROM website_builder_pages ORDER BY updated_at DESC").all(),
    DB.prepare("SELECT * FROM website_builder_rules ORDER BY sort_order ASC,updated_at DESC").all(),
    DB.prepare("SELECT * FROM website_builder_plans ORDER BY created_at DESC LIMIT 100").all(),
  ]);
  return {
    settings,
    pages: pages.results || [],
    rules: rules.results || [],
    plans: (plans.results || []).map(row => ({ ...row, plan: parseJson(row.plan_json, { summary: "", operations: [] }) })),
    diagnostics: {
      database: true,
      workersAi: Boolean(env.AI?.run),
      model: settings.model,
      serviceState: !settings.enabled ? "offline" : settings.maintenanceEnabled ? "maintenance" : settings.readOnly ? "read-only" : "live",
    },
  };
}

async function getMessages(DB, conversationId, maxHistory) {
  const result = await DB.prepare(`SELECT id,role,content,created_at FROM website_builder_messages
    WHERE conversation_id=? ORDER BY created_at ASC LIMIT ?`).bind(conversationId, maxHistory * 2).all();
  return result.results || [];
}

function fallbackResponse(message, targetPath, currentPlan, settings) {
  const lower = message.toLowerCase();
  const operations = Array.isArray(currentPlan?.operations) ? currentPlan.operations : [];
  if (/create|add|new page/.test(lower) && settings.allowCreatePages) {
    const title = clean(message.match(/(?:called|named|title(?:d)?)\s+["']?([^"'.]+)["']?/i)?.[1] || "New page", 180);
    const pathMatch = message.match(/\/[a-z0-9/_-]+/i);
    const path = safePath(pathMatch?.[0] || targetPath || "/new-page", { allowRoot: false });
    return {
      reply: `I have prepared a new ${title} page at ${path}. You can see it in the preview and edit the HTML or CSS before publishing.`,
      plan: normalisePlan({ summary: `Create ${title} at ${path}.`, warnings: ["Workers AI is unavailable, so a safe starter page was prepared."], operations: [{ type: "create_page", path, title, status: "published", html: `<main class="managed-page"><section class="managed-page__hero"><p class="managed-page__eyebrow">Planyx</p><h1>${title.replace(/[<>&]/g, "")}</h1><p>Add your page content here.</p></section></main>`, css: ".managed-page{max-width:72rem;margin:0 auto;padding:4rem 1.5rem}.managed-page__hero{padding:3rem;border-radius:1.5rem;background:#eff6ff}.managed-page__eyebrow{font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:.12em}" }] }, message, path, settings),
    };
  }
  if (operations.length) return { reply: "I understood the follow-up, but the configured AI model is unavailable. Your current draft has been kept unchanged.", plan: currentPlan };
  throw new Error("The configured AI model is unavailable. Check Website Builder Settings or use the Files and Code editors.");
}

async function generateChat(env, message, targetPath, currentPlan, history, snapshot, settings) {
  if (!env.AI?.run) return fallbackResponse(message, targetPath, currentPlan, settings);
  const system = `You are the conversational Planyx AI Website Builder operated by JA Group Services Ltd. Talk naturally to the administrator in concise British English while editing a website draft.

Return JSON only with this schema:
{"reply":"Friendly acknowledgement and concise explanation","summary":"Complete revised draft summary","warnings":["..."],"operations":[...]}

Allowed operation types: create_page, update_page, delete_page, set_global_css, set_page_css, replace_text, replace_html, append_html, hide, set_attribute, add_class.
The operations array MUST contain the complete current revised draft, not only the latest delta. Preserve useful existing draft operations unless the administrator asks to remove or replace them.

Rules:
- Never target /admin, /api, /auth or secure signing routes.
- No scripts, inline event handlers, javascript URLs, iframes, external CSS imports or executable code.
- Use responsive, accessible semantic HTML and stable conservative selectors.
- Never remove mandatory legal, privacy, age, safeguarding, security or authentication controls.
- For wording use replace_text. For a selected block use replace_html. To add a block use append_html. To remove a visible block without breaking logic use hide. Use set_page_css for route-specific design.
- Clearly acknowledge what you changed and invite a natural follow-up.
- Settings: HTML ${settings.allowHtml ? "allowed" : "disabled"}; CSS ${settings.allowCss ? "allowed" : "disabled"}; create pages ${settings.allowCreatePages ? "allowed" : "disabled"}; delete pages ${settings.allowDeletePages ? "allowed" : "disabled"}; existing-page rules ${settings.allowExistingPageRules ? "allowed" : "disabled"}.
- Additional operator instructions: ${settings.systemInstructions}

Target path: ${targetPath}
Current draft: ${JSON.stringify(currentPlan || { summary: "No draft yet", operations: [] }).slice(0, 30000)}
Visible page structure from the live preview: ${clean(snapshot, 12000) || "No preview snapshot available."}`;
  const result = await env.AI.run(settings.model, {
    messages: [
      { role: "system", content: system },
      ...history.slice(-settings.maxHistory).map(item => ({ role: item.role === "assistant" ? "assistant" : "user", content: clean(item.content, 1800) })),
      { role: "user", content: clean(message, 6000) },
    ],
    temperature: 0.2,
    max_tokens: 4200,
  });
  const raw = clean(result?.response || result?.result?.response || result?.text, 70000);
  const parsed = extractJson(raw);
  if (!parsed) throw new Error("The AI returned an invalid builder response. Reword the request and try again.");
  return {
    reply: clean(parsed.reply || "I have prepared the requested website changes for your review.", 2200),
    plan: normalisePlan(parsed, message, targetPath, settings),
  };
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
      clean(input.seoDescription || input.seo_description, 500), input.noindex ? 1 : 0, clean(identity.email, 254)
    ).run();
  return path;
}

async function addRule(DB, operation, identity, order = 100) {
  const id = crypto.randomUUID();
  await DB.prepare(`INSERT INTO website_builder_rules
    (id,path_pattern,operation,selector,value,attribute_name,status,sort_order,updated_by) VALUES (?,?,?,?,?,?,?,?,?)`).bind(
      id, operation.path, operation.type, operation.selector || "",
      operation.type === "set_page_css" ? operation.css : operation.value || "",
      operation.attributeName || "", "published", order, clean(identity.email, 254)
    ).run();
  return id;
}

async function publishPlan(DB, row, identity, settings) {
  if (settings.readOnly) throw new Error("The Website Builder is currently read-only.");
  if (!settings.enabled || settings.maintenanceEnabled) throw new Error(settings.maintenanceMessage || "The Website Builder is not available for publication.");
  const plan = normalisePlan(parseJson(row.plan_json, {}), row.prompt, row.target_path, settings);
  const applied = [];
  let order = 100;
  for (const operation of plan.operations) {
    if (operation.type === "set_global_css") {
      await DB.prepare("UPDATE website_builder_settings SET global_css=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=1")
        .bind(operation.css, clean(identity.email, 254)).run();
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
  await DB.prepare("UPDATE website_builder_plans SET status='published',published_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run();
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

    if (request.method === "GET") return json({ success: true, ...(await inventory(env.DB, env)), correlationId });
    if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
    if (!isSameOriginRequest(request)) return json({ success: false, error: "This request could not be verified." }, 403);
    const body = await request.json().catch(() => ({}));
    const action = clean(body.action, 80);
    const settings = await loadSettings(env.DB);

    if (action === "save_settings") {
      const saved = await saveSettings(env.DB, body.settings || {}, identity);
      await audit(env.DB, identity, "website_builder_settings_update", "settings", "Website Builder settings updated.", { service_state: !saved.enabled ? "offline" : saved.maintenanceEnabled ? "maintenance" : saved.readOnly ? "read-only" : "live", correlation_id: correlationId });
      return json({ success: true, settings: saved, inventory: await inventory(env.DB, env), correlationId });
    }

    if (action === "diagnostics") {
      const data = await inventory(env.DB, env);
      await audit(env.DB, identity, "website_builder_diagnostics", "diagnostics", "Website Builder diagnostics completed.", { diagnostics: data.diagnostics, correlation_id: correlationId });
      return json({ success: true, diagnostics: data.diagnostics, counts: { pages: data.pages.length, rules: data.rules.length, plans: data.plans.length }, correlationId });
    }

    if (action === "chat") {
      if (!settings.enabled) return json({ success: false, error: "The AI Website Builder is offline." }, 503);
      if (settings.maintenanceEnabled) return json({ success: false, error: settings.maintenanceMessage }, 503);
      const message = clean(body.message, 6000);
      if (message.length < 2) return json({ success: false, error: "Type a message for the website builder." }, 400);
      const targetPath = safePath(body.targetPath || "/");
      let conversationId = clean(body.conversationId, 80);
      let row = conversationId ? await env.DB.prepare("SELECT * FROM website_builder_plans WHERE id=?").bind(conversationId).first() : null;
      const currentPlan = row ? parseJson(row.plan_json, null) : (body.currentPlan || null);
      const history = row ? await getMessages(env.DB, conversationId, settings.maxHistory) : [];
      const generated = await generateChat(env, message, targetPath, currentPlan, history, body.pageSnapshot, settings);
      if (!conversationId) conversationId = crypto.randomUUID();
      if (row) {
        await env.DB.prepare("UPDATE website_builder_plans SET plan_json=?,target_path=?,status='draft' WHERE id=?")
          .bind(JSON.stringify(generated.plan), targetPath, conversationId).run();
      } else {
        await env.DB.prepare(`INSERT INTO website_builder_plans
          (id,prompt,target_path,plan_json,status,created_by) VALUES (?,?,?,?,?,?)`).bind(
            conversationId, message, targetPath, JSON.stringify(generated.plan), "draft", clean(identity.email, 254)
          ).run();
      }
      await env.DB.prepare(`INSERT INTO website_builder_messages
        (id,conversation_id,role,content,actor_email) VALUES (?,?,?,?,?)`).bind(
          crypto.randomUUID(), conversationId, "user", message, clean(identity.email, 254)
        ).run();
      await env.DB.prepare(`INSERT INTO website_builder_messages
        (id,conversation_id,role,content,actor_email) VALUES (?,?,?,?,?)`).bind(
          crypto.randomUUID(), conversationId, "assistant", generated.reply, "Planyx AI Website Builder"
        ).run();
      await audit(env.DB, identity, "website_builder_chat", conversationId, generated.plan.summary, { target_path: targetPath, operation_count: generated.plan.operations.length, correlation_id: correlationId });
      return json({ success: true, conversationId, reply: generated.reply, plan: generated.plan, messages: await getMessages(env.DB, conversationId, settings.maxHistory), settings, correlationId });
    }

    if (action === "get_conversation") {
      const id = clean(body.id, 80);
      const row = await env.DB.prepare("SELECT * FROM website_builder_plans WHERE id=?").bind(id).first();
      if (!row) return json({ success: false, error: "That builder conversation could not be found." }, 404);
      return json({ success: true, conversation: { ...row, plan: parseJson(row.plan_json, { summary: "", operations: [] }) }, messages: await getMessages(env.DB, id, settings.maxHistory), correlationId });
    }

    if (action === "save_plan") {
      const id = clean(body.id, 80);
      const row = await env.DB.prepare("SELECT * FROM website_builder_plans WHERE id=?").bind(id).first();
      if (!row) return json({ success: false, error: "That draft could not be found." }, 404);
      const plan = normalisePlan(typeof body.plan === "string" ? parseJson(body.plan) : body.plan, row.prompt, row.target_path, settings);
      await env.DB.prepare("UPDATE website_builder_plans SET plan_json=? WHERE id=? AND status='draft'").bind(JSON.stringify(plan), id).run();
      await audit(env.DB, identity, "website_builder_plan_edit", id, "Website Builder draft edited in the code workspace.", { operation_count: plan.operations.length, correlation_id: correlationId });
      return json({ success: true, plan, correlationId });
    }

    if (action === "publish_plan") {
      const id = clean(body.id, 80);
      const row = await env.DB.prepare("SELECT * FROM website_builder_plans WHERE id=?").bind(id).first();
      if (!row) return json({ success: false, error: "That draft could not be found." }, 404);
      if (row.status === "published") return json({ success: false, error: "That draft has already been published." }, 409);
      const result = await publishPlan(env.DB, row, identity, settings);
      await audit(env.DB, identity, "website_builder_plan_publish", id, result.plan.summary, { applied: result.applied, correlation_id: correlationId });
      return json({ success: true, result, inventory: await inventory(env.DB, env), correlationId });
    }

    if (action === "discard_plan") {
      const id = clean(body.id, 80);
      await env.DB.prepare("UPDATE website_builder_plans SET status='discarded' WHERE id=? AND status='draft'").bind(id).run();
      await audit(env.DB, identity, "website_builder_plan_discard", id, "Website Builder draft discarded.", { correlation_id: correlationId });
      return json({ success: true, inventory: await inventory(env.DB, env), correlationId });
    }

    if (action === "save_page") {
      const path = await savePage(env.DB, body.page || {}, identity, settings);
      await audit(env.DB, identity, "website_builder_page_save", path, `Managed website page saved: ${path}.`, { correlation_id: correlationId });
      return json({ success: true, path, inventory: await inventory(env.DB, env), correlationId });
    }

    if (action === "delete_page") {
      if (settings.readOnly) throw new Error("The Website Builder is currently read-only.");
      if (!settings.allowDeletePages) throw new Error("Deleting pages is disabled in Website Builder Settings.");
      const path = safePath(body.path, { allowRoot: false });
      await env.DB.prepare("DELETE FROM website_builder_pages WHERE path=?").bind(path).run();
      await env.DB.prepare("DELETE FROM website_builder_rules WHERE path_pattern=?").bind(path).run();
      await audit(env.DB, identity, "website_builder_page_delete", path, `Managed website page deleted: ${path}.`, { correlation_id: correlationId });
      return json({ success: true, inventory: await inventory(env.DB, env), correlationId });
    }

    if (action === "save_global_css") {
      if (settings.readOnly) throw new Error("The Website Builder is currently read-only.");
      if (!settings.allowCss) throw new Error("CSS editing is disabled in Website Builder Settings.");
      const css = sanitiseCss(body.css);
      await env.DB.prepare("UPDATE website_builder_settings SET global_css=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=1")
        .bind(css, clean(identity.email, 254)).run();
      await audit(env.DB, identity, "website_builder_global_css_save", "global", "Global customer-site CSS updated.", { characters: css.length, correlation_id: correlationId });
      return json({ success: true, inventory: await inventory(env.DB, env), correlationId });
    }

    if (action === "save_rule") {
      if (settings.readOnly) throw new Error("The Website Builder is currently read-only.");
      const operation = validateOperation(body.rule || {}, body.rule?.path || "/", settings);
      if (["create_page", "update_page", "delete_page", "set_global_css"].includes(operation.type)) return json({ success: false, error: "Use the page or global CSS file editor for that change." }, 400);
      const id = await addRule(env.DB, operation, identity, Number(body.rule?.sortOrder || 100));
      await audit(env.DB, identity, "website_builder_rule_save", id, `Website rule published for ${operation.path}.`, { operation: operation.type, correlation_id: correlationId });
      return json({ success: true, ruleId: id, inventory: await inventory(env.DB, env), correlationId });
    }

    if (action === "delete_rule") {
      if (settings.readOnly) throw new Error("The Website Builder is currently read-only.");
      const id = clean(body.id, 80);
      await env.DB.prepare("DELETE FROM website_builder_rules WHERE id=?").bind(id).run();
      await audit(env.DB, identity, "website_builder_rule_delete", id, "Website rule removed.", { correlation_id: correlationId });
      return json({ success: true, inventory: await inventory(env.DB, env), correlationId });
    }

    return json({ success: false, error: "Unknown Website Studio action." }, 400);
  } catch (error) {
    console.error(JSON.stringify({ event: "website_studio_request_failed", correlation_id: correlationId, error: error instanceof Error ? error.message : "Unknown error" }));
    return json({ success: false, error: error instanceof Error ? error.message : "The Website Studio could not complete the request.", correlationId }, 500);
  }
}
