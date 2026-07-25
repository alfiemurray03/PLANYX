import { isSameOriginRequest } from "../../_shared/enquiries.js";
import { getNativeSession } from "../../_shared/oidc.js";

const RESERVED_PREFIXES = ["/admin", "/api", "/auth", "/sign/"];
const OPERATIONS = new Set([
  "create_page", "update_page", "delete_page", "set_global_css", "set_page_css",
  "replace_text", "replace_html", "append_html", "hide", "set_attribute", "add_class",
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value, max = 10000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
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
  const explicit = parsePermissions(admin.permissions);
  if (explicit.includes("*") || explicit.includes("manage_content") || explicit.includes("manage_pages") || explicit.includes("manage_system_settings")) {
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
  if (candidate.includes("?") || candidate.includes("#")) throw new Error("Page paths cannot contain a query string or fragment.");
  if (RESERVED_PREFIXES.some((prefix) => candidate === prefix || candidate.startsWith(prefix))) {
    throw new Error("Admin, API, authentication and secure signing routes cannot be edited by the website builder.");
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
  let html = clean(value, 120000);
  html = html.replace(/<\/?(?:script|iframe|object|embed|meta|base|link)[^>]*>/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/javascript\s*:/gi, "");
  html = html.replace(/data\s*:\s*text\/html/gi, "");
  return html;
}

function sanitiseCss(value) {
  let css = clean(value, 120000);
  css = css.replace(/@import[^;]+;?/gi, "");
  css = css.replace(/expression\s*\(/gi, "");
  css = css.replace(/javascript\s*:/gi, "");
  css = css.replace(/url\(\s*(['"]?)(?!\/|data:image\/)[^)]*\)/gi, "none");
  return css;
}

function sanitiseAttributeName(value) {
  const name = clean(value, 80).toLowerCase();
  if (!/^(?:aria-[a-z0-9_-]+|data-[a-z0-9_-]+|title|alt|href|target|rel|class|id)$/.test(name)) {
    throw new Error("That HTML attribute cannot be changed through the website builder.");
  }
  return name;
}

function normaliseStatus(value, fallback = "draft") {
  const status = clean(value, 30).toLowerCase();
  return ["draft", "published", "archived"].includes(status) ? status : fallback;
}

async function ensureTables(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS website_builder_settings (
    id INTEGER PRIMARY KEY,
    global_css TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT DEFAULT ''
  )`).run();
  await DB.prepare("INSERT OR IGNORE INTO website_builder_settings (id,global_css,updated_by) VALUES (1,'','system-default')").run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS website_builder_pages (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    html TEXT NOT NULL DEFAULT '',
    css TEXT NOT NULL DEFAULT '',
    seo_title TEXT DEFAULT '',
    seo_description TEXT DEFAULT '',
    noindex INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT DEFAULT ''
  )`).run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS website_builder_rules (
    id TEXT PRIMARY KEY,
    path_pattern TEXT NOT NULL,
    operation TEXT NOT NULL,
    selector TEXT DEFAULT '',
    value TEXT DEFAULT '',
    attribute_name TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'published',
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT DEFAULT ''
  )`).run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS website_builder_plans (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    target_path TEXT DEFAULT '/',
    plan_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_by TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT DEFAULT ''
  )`).run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY, actor_email TEXT, action TEXT, entity_type TEXT,
    entity_id TEXT, summary TEXT, metadata TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function audit(DB, identity, action, entityId, summary, metadata = {}) {
  await DB.prepare(`INSERT INTO admin_audit_log
    (id,actor_email,action,entity_type,entity_id,summary,metadata)
    VALUES (?,?,?,?,?,?,?)`).bind(
    crypto.randomUUID(), clean(identity.email, 254), action, "website_builder", clean(entityId, 240), clean(summary, 1000), JSON.stringify(metadata)
  ).run();
}

async function inventory(DB) {
  const [settings, pages, rules, plans] = await Promise.all([
    DB.prepare("SELECT global_css,updated_at,updated_by FROM website_builder_settings WHERE id=1").first(),
    DB.prepare("SELECT * FROM website_builder_pages ORDER BY updated_at DESC").all(),
    DB.prepare("SELECT * FROM website_builder_rules ORDER BY sort_order ASC,updated_at DESC").all(),
    DB.prepare("SELECT * FROM website_builder_plans ORDER BY created_at DESC LIMIT 50").all(),
  ]);
  return {
    settings: settings || { global_css: "", updated_at: "", updated_by: "" },
    pages: pages.results || [],
    rules: rules.results || [],
    plans: (plans.results || []).map((row) => ({ ...row, plan: parseJson(row.plan_json, { summary: "", operations: [] }) })),
  };
}

function parseJson(value, fallback = null) {
  try { return JSON.parse(String(value || "")); } catch { return fallback; }
}

function extractJson(value) {
  const text = clean(value, 50000).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  return parseJson(text.slice(first, last + 1));
}

function validateOperation(raw, targetPath = "/") {
  const type = clean(raw?.type, 50).toLowerCase();
  if (!OPERATIONS.has(type)) throw new Error(`Unsupported website-builder operation: ${type || "blank"}.`);
  const operation = { type };

  if (type === "set_global_css") {
    operation.css = sanitiseCss(raw.css ?? raw.value);
    return operation;
  }

  const path = safePath(raw.path || targetPath || "/", { allowRoot: type !== "create_page" });
  operation.path = path;

  if (["create_page", "update_page"].includes(type)) {
    operation.title = clean(raw.title || "Untitled page", 180);
    operation.html = sanitiseHtml(raw.html);
    operation.css = sanitiseCss(raw.css);
    operation.seoTitle = clean(raw.seoTitle || operation.title, 180);
    operation.seoDescription = clean(raw.seoDescription, 500);
    operation.noindex = Boolean(raw.noindex);
    operation.status = normaliseStatus(raw.status, "published");
    if (!operation.title) throw new Error("Every managed page needs a title.");
    return operation;
  }

  if (type === "delete_page") return operation;
  if (type === "set_page_css") {
    operation.css = sanitiseCss(raw.css ?? raw.value);
    return operation;
  }

  operation.selector = safeSelector(raw.selector);
  if (type === "set_attribute") {
    operation.attributeName = sanitiseAttributeName(raw.attributeName);
    operation.value = clean(raw.value, 10000).replace(/javascript\s*:/gi, "");
  } else if (["replace_html", "append_html"].includes(type)) {
    operation.value = sanitiseHtml(raw.value ?? raw.html);
  } else {
    operation.value = clean(raw.value, 30000);
  }
  return operation;
}

function normalisePlan(raw, prompt, targetPath) {
  const operations = Array.isArray(raw?.operations) ? raw.operations.slice(0, 30).map((operation) => validateOperation(operation, targetPath)) : [];
  if (!operations.length) throw new Error("The AI did not produce a usable website change plan.");
  return {
    summary: clean(raw?.summary || `Website changes requested: ${prompt}`, 1000),
    warnings: Array.isArray(raw?.warnings) ? raw.warnings.map((item) => clean(item, 500)).filter(Boolean).slice(0, 10) : [],
    operations,
  };
}

function fallbackPlan(prompt, targetPath) {
  const lower = prompt.toLowerCase();
  const pageMatch = prompt.match(/(?:page|path)\s+(?:at\s+)?["']?(\/[a-z0-9/_-]+)/i);
  const path = safePath(pageMatch?.[1] || targetPath || "/");
  if (/create|add|new page/.test(lower)) {
    const title = clean(prompt.match(/(?:called|named|title(?:d)?)\s+["']?([^"'.]+)["']?/i)?.[1] || "New page", 180);
    return {
      summary: `Create ${title} at ${path}.`,
      warnings: ["Workers AI was unavailable, so a safe starter page was prepared. Review the HTML and CSS before publishing."],
      operations: [{
        type: "create_page", path, title, status: "published", noindex: false,
        seoTitle: `${title} — Planyx`, seoDescription: "",
        html: `<main class="managed-page"><section class="managed-page__hero"><p class="managed-page__eyebrow">Planyx</p><h1>${title.replace(/[<>&]/g, "")}</h1><p>Edit this page in the AI Website Builder.</p></section></main>`,
        css: ".managed-page{max-width:72rem;margin:0 auto;padding:4rem 1.5rem}.managed-page__hero{padding:3rem;border-radius:1.5rem;background:#eff6ff}.managed-page__eyebrow{font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#2563eb}",
      }],
    };
  }
  throw new Error("Workers AI is not available for this request. Use the manual HTML/CSS editor or ask to create a clearly named page and path.");
}

async function generateWithAi(env, prompt, targetPath, currentInventory) {
  if (!env.AI?.run) return fallbackPlan(prompt, targetPath);
  const model = clean(env.WEBSITE_BUILDER_MODEL || "@cf/meta/llama-3.1-8b-instruct-fast", 180);
  const pages = currentInventory.pages.map((page) => ({ path: page.path, title: page.title, status: page.status }));
  const system = `You are the Planyx AI Website Builder for JA Group Services Ltd. Convert an administrator request into a precise JSON change plan. British English. Output JSON only.

Allowed operations: create_page, update_page, delete_page, set_global_css, set_page_css, replace_text, replace_html, append_html, hide, set_attribute, add_class.

Schema: {"summary":"...","warnings":["..."],"operations":[...]}. Every operation must include type. Page-specific operations include path. DOM operations include selector and value where relevant. set_attribute includes attributeName. create_page/update_page may include title, html, css, seoTitle, seoDescription, noindex and status.

Rules:
- Never target /admin, /api, /auth or secure signing routes.
- Never include scripts, inline event handlers, javascript URLs, iframes, external CSS imports or executable code.
- Prefer semantic accessible HTML and responsive CSS.
- Do not remove mandatory legal, privacy, safeguarding, age, security or authentication controls.
- For an existing React page use conservative stable selectors such as main h1, header, footer, section[data-*], or explicit ids/classes mentioned by the administrator.
- Use replace_text for wording-only changes, replace_html for an entire selected block, append_html to add a new block, hide to remove a visible block without destroying application logic, and set_page_css for page styling.
- The administrator will review before publishing.

Known managed pages: ${JSON.stringify(pages).slice(0, 6000)}. Target path: ${targetPath}.`;
  const result = await env.AI.run(model, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: clean(prompt, 6000) },
    ],
    temperature: 0.2,
    max_tokens: 2600,
  });
  const output = clean(result?.response || result?.result?.response || result?.text, 50000);
  const parsed = extractJson(output);
  if (!parsed) throw new Error("The AI returned an invalid change plan. Reword the request and try again.");
  return normalisePlan(parsed, prompt, targetPath);
}

async function savePage(DB, input, identity) {
  const path = safePath(input.path, { allowRoot: false });
  const id = clean(input.id, 80) || crypto.randomUUID();
  const title = clean(input.title || "Untitled page", 180);
  const status = normaliseStatus(input.status, "draft");
  const html = sanitiseHtml(input.html);
  const css = sanitiseCss(input.css);
  const seoTitle = clean(input.seoTitle || title, 180);
  const seoDescription = clean(input.seoDescription, 500);
  const noindex = input.noindex ? 1 : 0;
  await DB.prepare(`INSERT INTO website_builder_pages
    (id,path,title,status,html,css,seo_title,seo_description,noindex,updated_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(path) DO UPDATE SET title=excluded.title,status=excluded.status,html=excluded.html,
      css=excluded.css,seo_title=excluded.seo_title,seo_description=excluded.seo_description,
      noindex=excluded.noindex,updated_at=CURRENT_TIMESTAMP,updated_by=excluded.updated_by`)
    .bind(id, path, title, status, html, css, seoTitle, seoDescription, noindex, clean(identity.email, 254)).run();
  return path;
}

async function addRule(DB, operation, identity, order) {
  const id = crypto.randomUUID();
  const value = operation.type === "set_page_css" ? operation.css : operation.value || "";
  await DB.prepare(`INSERT INTO website_builder_rules
    (id,path_pattern,operation,selector,value,attribute_name,status,sort_order,updated_by)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(
    id, operation.path, operation.type, operation.selector || "", value,
    operation.attributeName || "", "published", order, clean(identity.email, 254)
  ).run();
  return id;
}

async function publishPlan(DB, planRow, identity) {
  const plan = normalisePlan(parseJson(planRow.plan_json, {}), planRow.prompt, planRow.target_path);
  const applied = [];
  let order = 100;
  for (const operation of plan.operations) {
    if (operation.type === "set_global_css") {
      await DB.prepare("UPDATE website_builder_settings SET global_css=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=1")
        .bind(operation.css, clean(identity.email, 254)).run();
      applied.push({ type: operation.type });
      continue;
    }
    if (["create_page", "update_page"].includes(operation.type)) {
      await savePage(DB, operation, identity);
      applied.push({ type: operation.type, path: operation.path });
      continue;
    }
    if (operation.type === "delete_page") {
      await DB.prepare("DELETE FROM website_builder_pages WHERE path=?").bind(operation.path).run();
      await DB.prepare("DELETE FROM website_builder_rules WHERE path_pattern=?").bind(operation.path).run();
      applied.push({ type: operation.type, path: operation.path });
      continue;
    }
    const ruleId = await addRule(DB, operation, identity, order++);
    applied.push({ type: operation.type, path: operation.path, ruleId });
  }
  await DB.prepare("UPDATE website_builder_plans SET status='published',published_at=CURRENT_TIMESTAMP WHERE id=?").bind(planRow.id).run();
  return { plan, applied };
}

export async function onRequest(context) {
  const { request, env } = context;
  const correlationId = clean(request.headers.get("cf-ray") || request.headers.get("x-request-id") || crypto.randomUUID(), 120);
  if (!env.DB) return json({ success: false, error: "The AI Website Builder is unavailable because the database binding is missing.", correlationId }, 500);

  try {
    const identity = await getNativeSession(request, env, "admin");
    const access = await authorise(env.DB, identity, env);
    if (!access.authenticated) return json({ success: false, error: "Your administrator session has expired. Please sign in again.", code: "SESSION_EXPIRED", correlationId }, 401);
    if (!access.authorised) return json({ success: false, error: "You do not have permission to manage website content.", code: "FORBIDDEN", correlationId }, 403);
    await ensureTables(env.DB);

    if (request.method === "GET") {
      return json({ success: true, ...(await inventory(env.DB)), aiAvailable: Boolean(env.AI?.run), correlationId });
    }

    if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
    if (!isSameOriginRequest(request)) return json({ success: false, error: "This request could not be verified." }, 403);
    const body = await request.json().catch(() => ({}));
    const action = clean(body.action, 80);

    if (action === "generate_plan") {
      const prompt = clean(body.prompt, 6000);
      if (prompt.length < 8) return json({ success: false, error: "Describe the website change you want in a little more detail." }, 400);
      const targetPath = safePath(body.targetPath || "/");
      const current = await inventory(env.DB);
      const plan = await generateWithAi(env, prompt, targetPath, current);
      const id = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO website_builder_plans
        (id,prompt,target_path,plan_json,status,created_by) VALUES (?,?,?,?,?,?)`)
        .bind(id, prompt, targetPath, JSON.stringify(plan), "draft", clean(identity.email, 254)).run();
      await audit(env.DB, identity, "website_builder_plan_generate", id, plan.summary, { target_path: targetPath, operation_count: plan.operations.length, correlation_id: correlationId });
      return json({ success: true, plan: { id, prompt, target_path: targetPath, status: "draft", plan }, correlationId });
    }

    if (action === "save_plan_json") {
      const id = clean(body.id, 80);
      const row = await env.DB.prepare("SELECT * FROM website_builder_plans WHERE id=?").bind(id).first();
      if (!row) return json({ success: false, error: "That draft change plan could not be found." }, 404);
      const rawPlan = typeof body.plan === "string" ? parseJson(body.plan) : body.plan;
      const plan = normalisePlan(rawPlan, row.prompt, row.target_path);
      await env.DB.prepare("UPDATE website_builder_plans SET plan_json=? WHERE id=? AND status='draft'").bind(JSON.stringify(plan), id).run();
      await audit(env.DB, identity, "website_builder_plan_edit", id, "Website change plan edited before publication.", { operation_count: plan.operations.length, correlation_id: correlationId });
      return json({ success: true, plan: { ...row, plan }, correlationId });
    }

    if (action === "publish_plan") {
      const id = clean(body.id, 80);
      const row = await env.DB.prepare("SELECT * FROM website_builder_plans WHERE id=?").bind(id).first();
      if (!row) return json({ success: false, error: "That website change plan could not be found." }, 404);
      if (row.status === "published") return json({ success: false, error: "That change plan has already been published." }, 409);
      const result = await publishPlan(env.DB, row, identity);
      await audit(env.DB, identity, "website_builder_plan_publish", id, result.plan.summary, { applied: result.applied, correlation_id: correlationId });
      return json({ success: true, result, inventory: await inventory(env.DB), correlationId });
    }

    if (action === "save_page") {
      const path = await savePage(env.DB, body.page || {}, identity);
      await audit(env.DB, identity, "website_builder_page_save", path, `Managed website page saved: ${path}.`, { correlation_id: correlationId });
      return json({ success: true, path, inventory: await inventory(env.DB), correlationId });
    }

    if (action === "delete_page") {
      const path = safePath(body.path, { allowRoot: false });
      await env.DB.prepare("DELETE FROM website_builder_pages WHERE path=?").bind(path).run();
      await env.DB.prepare("DELETE FROM website_builder_rules WHERE path_pattern=?").bind(path).run();
      await audit(env.DB, identity, "website_builder_page_delete", path, `Managed website page deleted: ${path}.`, { correlation_id: correlationId });
      return json({ success: true, inventory: await inventory(env.DB), correlationId });
    }

    if (action === "save_global_css") {
      const css = sanitiseCss(body.css);
      await env.DB.prepare("UPDATE website_builder_settings SET global_css=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=1")
        .bind(css, clean(identity.email, 254)).run();
      await audit(env.DB, identity, "website_builder_global_css_save", "global", "Global customer-site CSS updated.", { characters: css.length, correlation_id: correlationId });
      return json({ success: true, inventory: await inventory(env.DB), correlationId });
    }

    if (action === "save_rule") {
      const operation = validateOperation(body.rule || {}, body.rule?.path || "/");
      if (["create_page", "update_page", "delete_page", "set_global_css"].includes(operation.type)) {
        return json({ success: false, error: "Use the page or global CSS editor for that type of change." }, 400);
      }
      const ruleId = await addRule(env.DB, operation, identity, Number(body.rule?.sortOrder || 100));
      await audit(env.DB, identity, "website_builder_rule_save", ruleId, `Website presentation rule added for ${operation.path}.`, { operation: operation.type, selector: operation.selector || "", correlation_id: correlationId });
      return json({ success: true, ruleId, inventory: await inventory(env.DB), correlationId });
    }

    if (action === "delete_rule") {
      const id = clean(body.id, 80);
      await env.DB.prepare("DELETE FROM website_builder_rules WHERE id=?").bind(id).run();
      await audit(env.DB, identity, "website_builder_rule_delete", id, "Website presentation rule removed.", { correlation_id: correlationId });
      return json({ success: true, inventory: await inventory(env.DB), correlationId });
    }

    if (action === "discard_plan") {
      const id = clean(body.id, 80);
      await env.DB.prepare("UPDATE website_builder_plans SET status='discarded' WHERE id=? AND status='draft'").bind(id).run();
      await audit(env.DB, identity, "website_builder_plan_discard", id, "Draft website change plan discarded.", { correlation_id: correlationId });
      return json({ success: true, inventory: await inventory(env.DB), correlationId });
    }

    return json({ success: false, error: "Unknown website-builder action." }, 400);
  } catch (error) {
    console.error(JSON.stringify({ event: "website_builder_admin_request_failed", correlation_id: correlationId, error: error instanceof Error ? error.message : "Unknown error" }));
    return json({ success: false, error: error instanceof Error ? error.message : "The AI Website Builder could not complete the request.", correlationId }, 500);
  }
}
