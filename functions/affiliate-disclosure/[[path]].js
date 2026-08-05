function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeWidget(code) {
  const value = String(code || "");
  const lowered = value.toLowerCase();
  if (lowered.includes("<script") || lowered.includes("javascript:") || lowered.includes("onerror=") || lowered.includes("onload=")) return "";
  return value;
}

async function all(DB, sql) {
  const result = await DB.prepare(sql).all();
  return result.results || [];
}

function fallbackBlocks() {
  return [
    { block_type: "Page heading", title: "Affiliate links and independent providers", body: "Some activity links, partner content or referral links may earn JA Group Services Ltd a commission after a qualifying booking.", sort_order: 10 },
    { block_type: "Legal notice", title: "Affiliate content", body: "This website may include affiliate links, partner links, referral links or embedded partner content.", sort_order: 20 },
    { block_type: "Referral notice", title: "Commission and referral payments", body: "JA Group Services Ltd may receive a commission or referral payment where customers use certain links or complete eligible bookings.", sort_order: 30 },
    { block_type: "Disclaimer", title: "Who supplies the booking?", body: "Affiliate bookings are made with the relevant third-party provider. The third-party provider is responsible for its own service, booking terms, pricing, refunds, cancellations and service delivery.", sort_order: 40 }
  ];
}

function blockHtml(block) {
  const widget = safeWidget(block.widget_code);
  return `<article class="info-card">
    <span class="eyebrow">${escapeHtml(block.block_type || "Affiliate content")}</span>
    <h2>${escapeHtml(block.title)}</h2>
    ${block.body ? `<p>${escapeHtml(block.body)}</p>` : ""}
    ${widget ? `<div class="affiliate-widget">${widget}</div>` : ""}
    ${block.cta_label && block.cta_url ? `<p><a class="button" href="${escapeHtml(block.cta_url)}">${escapeHtml(block.cta_label)}</a></p>` : ""}
    ${block.legal_notice ? `<p><small>${escapeHtml(block.legal_notice)}</small></p>` : ""}
  </article>`;
}

export async function onRequestGet({ env }) {
  const blocks = env.DB
    ? await all(env.DB, `
        SELECT block_type, title, body, widget_code, cta_label, cta_url, legal_notice, sort_order
        FROM affiliate_content_blocks
        WHERE is_enabled = 1 AND is_published = 1
        ORDER BY sort_order ASC, updated_at DESC
        LIMIT 100
      `).catch(() => fallbackBlocks())
    : fallbackBlocks();

  const contentBlocks = blocks.length ? blocks : fallbackBlocks();
  const hero = contentBlocks.find((block) => String(block.block_type || "").toLowerCase().includes("heading")) || contentBlocks[0];
  const cards = contentBlocks.filter((block) => block !== hero).map(blockHtml).join("");

  return new Response(`<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Affiliate Disclosure | Sousa Murray Planeia</title>
  <meta name="description" content="How affiliate links and third-party activity bookings work on Sousa Murray Planeia.">
  <link rel="stylesheet" href="/assets/css/tailwind.css?v=20260711-launch-1">
</head>
<body><div id="siteShellHeader"></div><main id="main">
  <section class="page-hero"><div class="container"><span class="eyebrow">Clear commercial disclosure</span><h1>${escapeHtml(hero.title || "Affiliate links and independent providers")}</h1><p>${escapeHtml(hero.body || "")}</p></div></section>
  <section class="section"><div class="container content-grid">${cards}</div></section>
</main><div id="siteShellFooter"></div><script src="/assets/js/site-shell.js?v=20260621-2"></script></body></html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
