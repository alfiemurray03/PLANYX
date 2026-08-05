import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderSeoHead } from "./site-seo.mjs";

const publicDir = path.join(process.cwd(), "public");
const descriptionFallbacks = {
  "/accessibility-support/": "Accessibility support and inclusive planning information for people using Sousa Murray Planeia.",
  "/legal/cookies/": "Read the Sousa Murray Planeia Cookie Notice and learn how cookies and similar technologies are used.",
  "/legal/privacy/": "Read the Sousa Murray Planeia Privacy Notice for information about how personal data is handled.",
  "/legal/provider-disclaimer/": "Read important information about independent providers referenced by Sousa Murray Planeia.",
  "/legal/travel-insurance/": "Read important travel insurance information for people using Sousa Murray Planeia planning resources."
};
const routes = [
  "/", "/about/", "/accessibility-support/", "/accommodation/", "/affiliate-disclosure/",
  "/activities/", "/booking-partners/", "/budget-experiences/", "/complaints/", "/contact/",
  "/couples-experiences/", "/destinations/", "/enquiry/", "/experiences/", "/family-experiences/",
  "/faqs/", "/getyourguide/", "/headout/", "/how-it-works/", "/important-information/",
  "/legal/cookies/", "/legal/privacy/", "/legal/provider-disclaimer/", "/legal/terms/",
  "/legal/travel-insurance/", "/local-transport/", "/plan-your-trip/", "/planning-services/",
  "/pricing/", "/social-tariff/", "/sitemap/", "/transfers/", "/coming-soon/"
];

for (const route of routes) {
  const file = path.join(publicDir, route === "/" ? "index.html" : route.slice(1), route === "/" ? "" : "index.html");
  let html = await readFile(file, "utf8");
  const title = matchContent(html, /<title>(.*?)<\/title>/is);
  const description = matchContent(html, /<meta\s+name=["']description["']\s+content=["'](.*?)["']\s*\/?\s*>/is) || descriptionFallbacks[route];
  if (!title || !description) throw new Error(`Missing title or description in ${file}`);

  if (!/<meta\s+name=["']description["']/i.test(html)) {
    html = html.replace(/(<title>.*?<\/title>)/is, `$1\n  <meta name="description" content="${description}">`);
  }

  const canonicalRoute = route === "/coming-soon/" ? "/" : route;
  const pageName = title.replace(/\s*[|—-]\s*Sousa Murray Planeia\s*$/i, "").trim() || "Sousa Murray Planeia";
  const type = route === "/about/" ? "AboutPage" : route === "/contact/" ? "ContactPage" : "WebPage";
  const breadcrumbs = buildBreadcrumbs(canonicalRoute, pageName);
  const seo = renderSeoHead({
    route: canonicalRoute,
    name: title,
    description,
    type,
    includeIdentity: canonicalRoute === "/",
    breadcrumbs
  });

  html = html
    .replace(/\s*<link\s+rel=["']canonical["'][^>]*>/gi, "")
    .replace(/\s*<meta\s+(?:name|property)=["'](?:application-name|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, "")
    .replace(/\s*<script\s+type=["']application\/ld\+json["'][^>]*>.*?<\/script>/gis, "")
    .replace(/\s*<\/head>/i, `\n  ${seo}\n</head>`);
  await writeFile(file, html, "utf8");
}

console.log(`Generated shared SEO metadata for ${routes.length} public pages.`);

function matchContent(html, pattern) {
  return html.match(pattern)?.[1]?.trim().replaceAll("&amp;", "&") ?? "";
}

function buildBreadcrumbs(route, pageName) {
  if (route === "/") return [];
  const crumbs = [{ name: "Home", route: "/" }];
  crumbs.push({ name: pageName, route });
  return crumbs;
}
