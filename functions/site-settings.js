function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=600",
      "X-Planyx-Settings-Cache": "edge"
    }
  });
}

async function all(DB, sql, bindings = []) {
  const statement = DB.prepare(sql);
  const result = bindings.length ? await statement.bind(...bindings).all() : await statement.all();
  return result.results || [];
}

async function settingMap(DB, keys, defaults = {}) {
  const placeholders = keys.map(() => "?").join(", ");
  const rows = await all(DB, `SELECT key, value FROM site_settings WHERE key IN (${placeholders})`, keys);
  const settings = { ...defaults };
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

const browserDefaults = {
  browser_tab_name: "Planyx",
  admin_tab_name: "Planyx Admin Portal",
  favicon_url: "/favicon.svg?v=20260718-4",
  admin_theme_mode: "light"
};

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ theme: "dark", branding: {}, affiliate: [], browser: browserDefaults });

  const [theme, branding, affiliate, browser] = await Promise.all([
    settingMap(env.DB, ["site_theme_mode", "turnstile_site_key"], { site_theme_mode: "dark", turnstile_site_key: "" }).catch(() => ({ site_theme_mode: "dark", turnstile_site_key: "" })),
    env.DB.prepare(`SELECT * FROM company_branding WHERE id = 'main'`).first().catch(() => null),
    all(env.DB, `
      SELECT id, block_type, title, body, widget_code, cta_label, cta_url, legal_notice, sort_order
      FROM affiliate_content_blocks
      WHERE is_enabled = 1 AND is_published = 1
      ORDER BY sort_order ASC, updated_at DESC
      LIMIT 100
    `).catch(() => []),
    settingMap(env.DB, Object.keys(browserDefaults), browserDefaults).catch(() => browserDefaults)
  ]);

  return json({
    theme: theme.site_theme_mode || "dark",
    branding: branding || {},
    affiliate,
    browser: {
      tab_name: browser.browser_tab_name || browserDefaults.browser_tab_name,
      admin_tab_name: browser.admin_tab_name || browserDefaults.admin_tab_name,
      favicon_url: browser.favicon_url || browserDefaults.favicon_url,
      admin_theme_mode: ["light", "dark", "system"].includes(browser.admin_theme_mode) ? browser.admin_theme_mode : browserDefaults.admin_theme_mode
    },
    turnstile_site_key: theme.turnstile_site_key || ""
  });
}
