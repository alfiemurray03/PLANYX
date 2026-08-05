function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 120);
}

async function safeAlter(DB, sql) {
  try {
    await DB.prepare(sql).run();
  } catch {
    // Existing live D1 databases may already have the column.
  }
}

async function ensurePolicyTable(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS policy_pages (
      slug TEXT PRIMARY KEY,
      title TEXT,
      content TEXT,
      content_type TEXT DEFAULT 'markdown',
      version TEXT DEFAULT '1.0',
      effective_date TEXT,
      status TEXT DEFAULT 'draft',
      is_published INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await safeAlter(DB, `ALTER TABLE policy_pages ADD COLUMN version TEXT DEFAULT '1.0'`);
  await safeAlter(DB, `ALTER TABLE policy_pages ADD COLUMN effective_date TEXT`);
  await safeAlter(DB, `ALTER TABLE policy_pages ADD COLUMN status TEXT DEFAULT 'draft'`);
  await safeAlter(DB, `ALTER TABLE policy_pages ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP`);
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
}

function renderMarkdown(content) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      const level = heading[1].length + 1;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`);
      continue;
    }

    if (inList) {
      html.push("</ul>");
      inList = false;
    }

    html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  }

  if (inList) html.push("</ul>");
  return html.join("\n");
}

function renderText(content) {
  return String(content || "")
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function renderSafeHtml(content) {
  return String(content || "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, "");
}

function renderContent(policy) {
  const type = String(policy.content_type || "markdown").toLowerCase();
  if (type === "html") return renderSafeHtml(policy.content);
  if (type === "text") return renderText(policy.content);
  return renderMarkdown(policy.content);
}

function notFound() {
  return new Response("Policy not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function page(policy) {
  const title = policy.title || "Policy";
  const meta = [
    policy.version ? `Version ${policy.version}` : "",
    policy.effective_date ? `Effective ${policy.effective_date}` : "",
    policy.updated_at ? `Updated ${policy.updated_at}` : ""
  ].filter(Boolean).join(" | ");

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} | Sousa Murray Planeia</title>
  <meta name="robots" content="index,follow">
  <style>
    :root {
      --bg: #f6f8fb;
      --panel: #ffffff;
      --navy: #071f36;
      --ink: #102238;
      --muted: #5d6d82;
      --line: #dbe5f0;
      --blue: #2563eb;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      line-height: 1.65;
    }

    .topbar {
      background: var(--navy);
      color: #fff;
      border-bottom: 1px solid rgba(255,255,255,0.12);
    }

    .topbar-inner,
    main {
      width: min(980px, calc(100% - 2rem));
      margin: 0 auto;
    }

    .topbar-inner {
      min-height: 76px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 850;
      text-decoration: none;
      color: #fff;
    }

    .logo {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: var(--blue);
      font-weight: 950;
    }

    .back {
      color: #bfdbfe;
      text-decoration: none;
      font-weight: 750;
    }

    main {
      padding: clamp(2rem, 6vw, 4.5rem) 0;
    }

    .policy-shell {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: clamp(1.4rem, 5vw, 3.2rem);
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
    }

    .kicker {
      margin: 0 0 0.7rem;
      color: var(--blue);
      font-size: 0.78rem;
      font-weight: 900;
      letter-spacing: 0.11em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      color: var(--navy);
      font-size: clamp(2rem, 5vw, 3.35rem);
      line-height: 1;
      letter-spacing: -0.045em;
    }

    .meta {
      margin: 1rem 0 2rem;
      color: var(--muted);
      font-weight: 700;
    }

    .content h2,
    .content h3,
    .content h4 {
      color: var(--navy);
      margin: 2rem 0 0.65rem;
      line-height: 1.2;
    }

    .content p,
    .content li {
      color: #26384f;
      font-size: 1rem;
    }

    .content a {
      color: var(--blue);
      font-weight: 750;
    }

    footer {
      width: min(980px, calc(100% - 2rem));
      margin: 0 auto;
      padding: 0 0 2rem;
      color: var(--muted);
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/">
        <span class="logo">JA</span>
        <span>Sousa Murray Planeia</span>
      </a>
      <a class="back" href="/">Back to website</a>
    </div>
  </header>
  <main>
    <article class="policy-shell">
      <p class="kicker">Legal Policy</p>
      <h1>${escapeHtml(title)}</h1>
      ${meta ? `<p class="meta">${escapeHtml(meta)}</p>` : ""}
      <div class="content">
        ${renderContent(policy)}
      </div>
    </article>
  </main>
  <footer>
    Sousa Murray Planeia is a service line of JA Group Services Ltd.
  </footer>
</body>
</html>`;
}

export async function onRequestGet(context) {
  const { env, params } = context;
  if (!env.DB) return notFound();

  const slug = cleanSlug(params.slug);
  if (!slug) return notFound();

  await ensurePolicyTable(env.DB);

  const policy = await env.DB.prepare(`
    SELECT slug, title, content, content_type, version, effective_date, is_published, status, updated_at
    FROM policy_pages
    WHERE slug = ?
      AND is_published = 1
      AND lower(COALESCE(status, 'published')) = 'published'
  `).bind(slug).first();

  if (!policy) return notFound();

  return new Response(page(policy), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
