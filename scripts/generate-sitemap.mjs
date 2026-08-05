import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const baseUrl = "https://sousamurrayplaneia.jagroupservices.co.uk";
const publicDir = join(process.cwd(), "public");
const destinationDir = join(publicDir, "destinations");
const fixedRoutes = [
  "/", "/about/", "/accessibility-support/", "/accommodation/", "/affiliate-disclosure/",
  "/activities/", "/booking-partners/", "/budget-experiences/", "/complaints/", "/contact/",
  "/couples-experiences/", "/destinations/", "/enquiry/", "/experiences/", "/family-experiences/",
  "/faqs/", "/getyourguide/", "/headout/", "/how-it-works/", "/important-information/",
  "/legal/cookies/", "/legal/privacy/",
  "/legal/provider-disclaimer/", "/legal/terms/", "/legal/travel-insurance/",
  "/local-transport/", "/plan-your-trip/", "/planning-services/", "/pricing/",
  "/social-tariff/", "/sitemap/", "/transfers/"
];

const destinationEntries = await readdir(destinationDir, { withFileTypes: true });
const routes = [
  ...fixedRoutes,
  ...destinationEntries.filter(entry => entry.isDirectory()).map(entry => `/destinations/${entry.name}/`)
].sort();

const body = routes.map(route => `  <url><loc>${baseUrl}${route}</loc></url>`).join("\n");
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
await writeFile(join(publicDir, "sitemap.xml"), xml, "utf8");
console.log(`Generated sitemap.xml with ${routes.length} URLs.`);
