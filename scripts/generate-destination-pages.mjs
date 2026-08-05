import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderSeoHead } from "./site-seo.mjs";

const root = process.cwd();
const source = await readFile(path.join(root, "public/assets/js/destinations-data.js"), "utf8");
const destinations = JSON.parse(source.match(/\[(.*)\]/s)[0]);

for (const destination of destinations) {
  const route = `/destinations/${destination.slug}/`;
  const title = `${destination.name} Travel Planning Guide | Sousa Murray Planeia`;
  const description = `Practical ${destination.name} travel planning guidance and personalised research support from Sousa Murray Planeia.`;
  const seo = renderSeoHead({
    route,
    name: title,
    description,
    breadcrumbs: [
      { name: "Home", route: "/" },
      { name: "Destinations", route: "/destinations/" },
      { name: destination.name, route }
    ]
  });
  const html = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  ${seo}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@600;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/tailwind.css?v=20260711-launch-1">

</head>
<body data-page="destinations">
  <div id="siteShellHeader"></div>
  <main id="destinationGuide" class="destination-guide-page" data-slug="${destination.slug}" data-name="${destination.name.replaceAll('"', "&quot;")}"></main>
  <div id="siteShellFooter"></div>
  <script data-cookieconsent="ignore" src="/assets/js/site-shell.js?v=20260710-wordmark-unified-1"></script>
  <script src="/assets/js/destination-page.js?v=20260620-3"></script>
</body>
</html>
`;
  await writeFile(path.join(root, "public/destinations", destination.slug, "index.html"), html);
}

console.log(`Generated ${destinations.length} destination guides.`);
