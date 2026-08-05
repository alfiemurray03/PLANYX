export const SITE_URL = "https://sousamurrayplaneia.jagroupservices.co.uk";
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

export const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: "Sousa Murray Planeia",
  legalName: "JA Group Services Ltd",
  url: `${SITE_URL}/`,
  description: "Sousa Murray Planeia is the experience planning platform operated by JA Group Services Ltd.",
  email: "contact@jagroupservices.co.uk",
  identifier: {
    "@type": "PropertyValue",
    propertyID: "Companies House company number",
    value: "16314179"
  },
  address: {
    "@type": "PostalAddress",
    streetAddress: "167-169 Great Portland Street, 5th Floor",
    addressLocality: "London",
    addressRegion: "Westminster",
    postalCode: "W1W 5PF",
    addressCountry: "GB"
  }
};

export const website = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  url: `${SITE_URL}/`,
  name: "Sousa Murray Planeia",
  alternateName: "Sousa Murray Planeia by JA Group Services Ltd",
  description: "A self-service platform for building, saving and managing personalised experience plans.",
  publisher: { "@id": ORGANIZATION_ID }
};

const absoluteUrl = route => `${SITE_URL}${route}`;
const jsonLd = value => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;

export function renderSeoHead({ route, name, description, type = "WebPage", includeIdentity = false, breadcrumbs = [] }) {
  const url = absoluteUrl(route);
  const page = {
    "@context": "https://schema.org",
    "@type": type,
    "@id": `${url}#webpage`,
    url,
    name,
    description,
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORGANIZATION_ID }
  };
  const entities = includeIdentity ? [website, organization, page] : [page];

  if (breadcrumbs.length > 1) {
    entities.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: breadcrumbs.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: absoluteUrl(item.route)
      }))
    });
  }

  return [
    `<link rel="canonical" href="${url}">`,
    `<meta name="application-name" content="Sousa Murray Planeia">`,
    `<meta property="og:site_name" content="Sousa Murray Planeia">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeAttribute(name)}">`,
    `<meta property="og:description" content="${escapeAttribute(description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${escapeAttribute(name)}">`,
    `<meta name="twitter:description" content="${escapeAttribute(description)}">`,
    ...entities.map(jsonLd)
  ].join("\n  ");
}

function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}
