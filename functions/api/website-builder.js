function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "same-origin",
    },
  });
}

function clean(value, max = 10000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function safePath(value) {
  try {
    const raw = clean(value || "/", 240);
    const url = new URL(raw.startsWith("/") ? raw : `/${raw}`, "https://planyx.local");
    return url.pathname.replace(/\/{2,}/g, "/");
  } catch {
    return "/";
  }
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
}

function matches(pattern, path) {
  if (pattern === "*" || pattern === "/*") return true;
  if (pattern.endsWith("*")) return path.startsWith(pattern.slice(0, -1));
  return pattern === path;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return json({ success: false, error: "Website content service unavailable." }, 503);
  try {
    await ensureTables(env.DB);
    const url = new URL(request.url);
    const mode = clean(url.searchParams.get("mode"), 30) || "runtime";
    const path = safePath(url.searchParams.get("path") || "/");

    if (mode === "page") {
      const page = await env.DB.prepare(`SELECT id,path,title,html,css,seo_title,seo_description,noindex,updated_at
        FROM website_builder_pages WHERE path=? AND status='published' LIMIT 1`).bind(path).first();
      if (!page) return json({ success: false, found: false }, 404);
      return json({ success: true, found: true, page });
    }

    const settings = await env.DB.prepare("SELECT global_css,updated_at FROM website_builder_settings WHERE id=1").first();
    const result = await env.DB.prepare(`SELECT id,path_pattern,operation,selector,value,attribute_name,sort_order
      FROM website_builder_rules WHERE status='published' ORDER BY sort_order ASC,created_at ASC`).all();
    const rules = (result.results || []).filter((rule) => matches(clean(rule.path_pattern, 240), path));
    return json({ success: true, path, globalCss: settings?.global_css || "", rules, version: settings?.updated_at || "" });
  } catch (error) {
    console.error("website_builder_public_error", error);
    return json({ success: false, error: "Website content service unavailable." }, 503);
  }
}
