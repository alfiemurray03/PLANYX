import { getNativeSession } from "../../_shared/oidc.js";

const DEFAULT_ADMIN_EMAIL = "alfieholywoodmurray@jagroupservices.co.uk";
const GOV_LOCAL_AUTHORITY_API = "https://www.gov.uk/api/local-authority";
const POSTCODE_API = "https://api.postcodes.io/postcodes";
const POLICE_API = "https://data.police.uk/api";

const AUTHORITIES = [
  { id: "police-999", name: "Police and emergency services — 999", category: "Police and emergencies", reportTypes: ["police-emergency", "child-safeguarding", "adult-safeguarding"], channel: "Call 999 immediately where there is immediate danger, a serious offence in progress or an urgent threat to life or property.", officialUrl: "https://www.police.uk/pu/contact-us/what-and-how-to-report/how-to-report/", priority: 100 },
  { id: "police-101", name: "Police — 101 and online reporting", category: "Police and emergencies", reportTypes: ["police-non-emergency", "child-safeguarding", "adult-safeguarding", "data-breach-ico", "other-authority"], channel: "Call 101 or use the responsible police force's official online reporting service for non-emergency crime or information.", officialUrl: "https://www.police.uk/pu/contact-us/what-and-how-to-report/how-to-report/", priority: 95 },
  { id: "report-fraud", name: "Report Fraud", category: "Police and emergencies", reportTypes: ["police-non-emergency", "data-breach-ico", "other-authority"], channel: "Use the national Report Fraud service for fraud and cybercrime reports in England, Wales and Northern Ireland, subject to its published scope.", officialUrl: "https://www.reportfraud.police.uk/", priority: 90 },
  { id: "nca-ceop", name: "National Crime Agency — CEOP Safety Centre", category: "Child safeguarding", reportTypes: ["child-safeguarding", "other-authority"], channel: "Use the CEOP Safety Centre for concerns about online sexual abuse, grooming or exploitation of a child or young person.", officialUrl: "https://www.ceop.police.uk/Safety-Centre/", priority: 90 },
  { id: "nspcc", name: "NSPCC Helpline", category: "Child safeguarding", reportTypes: ["child-safeguarding"], channel: "Adults can seek safeguarding advice from the NSPCC on 0808 800 5000 or through its official contact routes. This does not replace 999 or a council referral.", officialUrl: "https://www.nspcc.org.uk/keeping-children-safe/reporting-abuse/nspcc-helpline/", priority: 75 },
  { id: "childline", name: "Childline", category: "Child safeguarding", reportTypes: ["child-safeguarding"], channel: "Children and young people can contact Childline free on 0800 1111 or through its official online services.", officialUrl: "https://www.childline.org.uk/get-support/", priority: 70 },
  { id: "cqc-safeguarding", name: "Care Quality Commission", category: "Adult safeguarding and health", reportTypes: ["adult-safeguarding", "other-authority"], channel: "Give feedback about regulated health or social care. Continue to notify the local authority safeguarding team and police where required.", officialUrl: "https://www.cqc.org.uk/give-feedback-on-care", priority: 65 },

  { id: "ico-breach", name: "Information Commissioner's Office — personal data breach", category: "Data protection and cyber", reportTypes: ["data-breach-ico"], channel: "Use the ICO personal data breach assessment and reporting service. Record when Sousa Murray Planeia became aware of the breach and the notification decision.", officialUrl: "https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/", priority: 100 },
  { id: "ico-complaint", name: "Information Commissioner's Office — data protection complaint", category: "Data protection and cyber", reportTypes: ["data-breach-ico", "other-authority"], channel: "Use the ICO complaint route after the individual has raised the matter with the organisation and the applicable complaint requirements are met.", officialUrl: "https://ico.org.uk/make-a-complaint/data-protection-complaints/", priority: 85 },
  { id: "ncsc", name: "National Cyber Security Centre — report a cyber incident", category: "Data protection and cyber", reportTypes: ["data-breach-ico", "other-authority"], channel: "Use the NCSC incident reporting service for significant cyber incidents and follow its instructions. Also assess ICO and police reporting separately.", officialUrl: "https://report.ncsc.gov.uk/", priority: 90 },
  { id: "ofcom-online-safety", name: "Ofcom — online safety", category: "Communications and online safety", reportTypes: ["child-safeguarding", "data-breach-ico", "other-authority"], channel: "Use Ofcom's published online-safety or complaint routes for regulated online-service matters. Ofcom does not replace emergency or individual police reporting.", officialUrl: "https://www.ofcom.org.uk/online-safety/", priority: 60 },

  { id: "hm-government", name: "HM Government — department and agency directory", category: "Government and public administration", reportTypes: ["other-authority"], channel: "Identify the department or agency responsible and use its published official contact, complaint or reporting route.", officialUrl: "https://www.gov.uk/government/organisations", priority: 70 },
  { id: "cabinet-office", name: "Cabinet Office", category: "Government and public administration", reportTypes: ["other-authority"], channel: "Use the Cabinet Office's official contact or complaints information for matters within its remit.", officialUrl: "https://www.gov.uk/government/organisations/cabinet-office", priority: 40 },
  { id: "hm-treasury", name: "HM Treasury", category: "Government and public administration", reportTypes: ["other-authority"], channel: "Use HM Treasury's official contact or correspondence route for Treasury policy and administration matters.", officialUrl: "https://www.gov.uk/government/organisations/hm-treasury", priority: 40 },
  { id: "home-office", name: "Home Office", category: "Government and public administration", reportTypes: ["other-authority"], channel: "Use the Home Office's official contact or complaint route. Use the separate immigration-crime reporting service where relevant.", officialUrl: "https://www.gov.uk/government/organisations/home-office", priority: 50 },
  { id: "hmrc-tax-fraud", name: "HM Revenue & Customs — report tax fraud", category: "Government, tax and benefits", reportTypes: ["other-authority"], channel: "Use HMRC's official tax-fraud reporting service. Do not investigate the person yourself or alert them to the report.", officialUrl: "https://www.gov.uk/report-tax-fraud", priority: 90 },
  { id: "hmrc-phishing", name: "HM Revenue & Customs — phishing and suspicious contact", category: "Government, tax and benefits", reportTypes: ["data-breach-ico", "other-authority"], channel: "Forward or report suspicious HMRC emails, texts, calls and websites using HMRC's published reporting routes.", officialUrl: "https://www.gov.uk/government/organisations/hm-revenue-customs/contact/reporting-fraudulent-emails", priority: 75 },
  { id: "dwp-benefit-fraud", name: "Department for Work and Pensions — benefit fraud", category: "Government, tax and benefits", reportTypes: ["other-authority"], channel: "Use GOV.UK's benefit-fraud reporting service. Reports can be made anonymously; do not put staff or others at risk by investigating.", officialUrl: "https://www.gov.uk/report-benefit-fraud", priority: 85 },
  { id: "immigration-crime", name: "Home Office — immigration or border crime", category: "Government, tax and benefits", reportTypes: ["other-authority"], channel: "Use the official immigration or border crime reporting service. Call 999 where there is immediate danger.", officialUrl: "https://www.gov.uk/report-immigration-crime", priority: 70 },
  { id: "companies-house", name: "Companies House", category: "Companies, charities and insolvency", reportTypes: ["other-authority"], channel: "Use Companies House's official contact, complaint or suspicious-filing route for company-register matters.", officialUrl: "https://www.gov.uk/government/organisations/companies-house", priority: 60 },
  { id: "insolvency-service", name: "The Insolvency Service", category: "Companies, charities and insolvency", reportTypes: ["other-authority"], channel: "Use the Insolvency Service's published complaint or misconduct reporting route for insolvency and director-conduct matters.", officialUrl: "https://www.gov.uk/government/organisations/insolvency-service", priority: 60 },
  { id: "charity-commission", name: "Charity Commission for England and Wales", category: "Companies, charities and insolvency", reportTypes: ["other-authority"], channel: "Use the serious-incident or concern route applicable to the charity and the reporter's role.", officialUrl: "https://www.gov.uk/guidance/how-to-report-a-serious-incident-in-your-charity", priority: 60 },
  { id: "ministry-of-justice", name: "Ministry of Justice", category: "Government and public administration", reportTypes: ["other-authority"], channel: "Use the Ministry of Justice or relevant executive agency's published route for justice-system matters.", officialUrl: "https://www.gov.uk/government/organisations/ministry-of-justice", priority: 35 },
  { id: "department-education", name: "Department for Education", category: "Education", reportTypes: ["child-safeguarding", "other-authority"], channel: "Use the relevant school, local authority, DfE or safeguarding route. Immediate child protection concerns go to children's social care or 999.", officialUrl: "https://www.gov.uk/government/organisations/department-for-education", priority: 45 },
  { id: "department-health", name: "Department of Health and Social Care", category: "Health and care", reportTypes: ["adult-safeguarding", "other-authority"], channel: "Use the relevant provider, NHS, regulator, ombudsman or DHSC route according to the matter.", officialUrl: "https://www.gov.uk/government/organisations/department-of-health-and-social-care", priority: 35 },
  { id: "department-transport", name: "Department for Transport", category: "Transport and travel", reportTypes: ["other-authority"], channel: "Use the responsible transport operator, regulator or DfT contact route.", officialUrl: "https://www.gov.uk/government/organisations/department-for-transport", priority: 35 },
  { id: "defra", name: "Department for Environment, Food & Rural Affairs", category: "Environment, food and animals", reportTypes: ["other-authority"], channel: "Use the appropriate agency, local authority or Defra route for the matter.", officialUrl: "https://www.gov.uk/government/organisations/department-for-environment-food-rural-affairs", priority: 35 },
  { id: "dsit", name: "Department for Science, Innovation and Technology", category: "Government and public administration", reportTypes: ["data-breach-ico", "other-authority"], channel: "Use DSIT's official contact route for matters within its policy remit; operational cyber incidents should normally use NCSC and relevant regulators.", officialUrl: "https://www.gov.uk/government/organisations/department-for-science-innovation-and-technology", priority: 30 },
  { id: "dbt", name: "Department for Business and Trade", category: "Government and public administration", reportTypes: ["other-authority"], channel: "Use DBT's official contact route for business and trade policy matters. Consumer enforcement may belong to Trading Standards or the CMA.", officialUrl: "https://www.gov.uk/government/organisations/department-for-business-and-trade", priority: 30 },
  { id: "foreign-office", name: "Foreign, Commonwealth & Development Office", category: "Government and public administration", reportTypes: ["other-authority"], channel: "Use FCDO or consular assistance routes for overseas and diplomatic matters.", officialUrl: "https://www.gov.uk/government/organisations/foreign-commonwealth-development-office", priority: 30 },
  { id: "ministry-defence", name: "Ministry of Defence", category: "Government and public administration", reportTypes: ["other-authority"], channel: "Use MOD's official contact, complaints or reporting route according to the matter.", officialUrl: "https://www.gov.uk/government/organisations/ministry-of-defence", priority: 30 },
  { id: "mhclg", name: "Ministry of Housing, Communities and Local Government", category: "Government and public administration", reportTypes: ["local-authority", "other-authority"], channel: "Use the local council first for operational council services, or the department's official route for national policy and administration matters.", officialUrl: "https://www.gov.uk/government/organisations/ministry-of-housing-communities-local-government", priority: 30 },

  { id: "trading-standards", name: "Trading Standards through Citizens Advice consumer service", category: "Consumer and markets", reportTypes: ["local-authority", "other-authority"], channel: "In England and Wales, report consumer issues through the Citizens Advice consumer service, which can refer information to Trading Standards.", officialUrl: "https://www.citizensadvice.org.uk/consumer/get-more-help/report-to-trading-standards/", priority: 85 },
  { id: "cma", name: "Competition and Markets Authority", category: "Consumer and markets", reportTypes: ["other-authority"], channel: "Tell the CMA about competition or market problems using its official information route. The CMA does not resolve individual consumer disputes.", officialUrl: "https://www.gov.uk/guidance/tell-the-cma-about-a-competition-or-market-problem", priority: 65 },
  { id: "fca", name: "Financial Conduct Authority", category: "Financial services", reportTypes: ["other-authority"], channel: "Use the FCA's official scam or firm-reporting route. Consumers should also contact their bank and police or Report Fraud where appropriate.", officialUrl: "https://www.fca.org.uk/consumers/report-scam-us", priority: 85 },
  { id: "financial-ombudsman", name: "Financial Ombudsman Service", category: "Financial services", reportTypes: ["other-authority"], channel: "Complain to the financial business first, then use the Financial Ombudsman Service where the complaint is eligible.", officialUrl: "https://www.financial-ombudsman.org.uk/consumers/how-to-complain", priority: 75 },
  { id: "payment-systems-regulator", name: "Payment Systems Regulator", category: "Financial services", reportTypes: ["other-authority"], channel: "Use the PSR contact route for payment-system regulatory matters; individual disputes normally belong with the provider or Financial Ombudsman.", officialUrl: "https://www.psr.org.uk/contact-us/", priority: 45 },
  { id: "asa", name: "Advertising Standards Authority", category: "Consumer and markets", reportTypes: ["other-authority"], channel: "Use the ASA complaint route for advertising, marketing and promotional-content concerns within its remit.", officialUrl: "https://www.asa.org.uk/make-a-complaint.html", priority: 55 },

  { id: "cqc", name: "Care Quality Commission", category: "Health and care", reportTypes: ["adult-safeguarding", "other-authority"], channel: "Give feedback on regulated health or social care. Use local safeguarding and police routes as well where risk or crime is involved.", officialUrl: "https://www.cqc.org.uk/give-feedback-on-care", priority: 80 },
  { id: "nhs-complaints", name: "NHS complaints", category: "Health and care", reportTypes: ["other-authority"], channel: "Use the NHS complaints route for the relevant provider or commissioner before escalation where applicable.", officialUrl: "https://www.nhs.uk/using-the-nhs/about-the-nhs/how-to-complain-to-the-nhs/", priority: 65 },
  { id: "phso", name: "Parliamentary and Health Service Ombudsman", category: "Health and care", reportTypes: ["other-authority"], channel: "Use the Ombudsman after completing the relevant organisation's complaint process and where the complaint is within jurisdiction.", officialUrl: "https://www.ombudsman.org.uk/making-complaint", priority: 55 },
  { id: "mhra-yellow-card", name: "Medicines and Healthcare products Regulatory Agency — Yellow Card", category: "Health and care", reportTypes: ["other-authority"], channel: "Use Yellow Card to report suspected medicine side effects and medical-device incidents according to MHRA guidance.", officialUrl: "https://yellowcard.mhra.gov.uk/", priority: 55 },

  { id: "ofsted", name: "Ofsted", category: "Education", reportTypes: ["child-safeguarding", "other-authority"], channel: "Use Ofsted's complaint or concerns route where applicable. Child protection concerns still go to children's social care or police.", officialUrl: "https://www.gov.uk/government/organisations/ofsted/about/complaints-procedure", priority: 60 },
  { id: "ofqual", name: "Ofqual", category: "Education", reportTypes: ["other-authority"], channel: "Use Ofqual's complaint route for regulated qualifications within its remit, normally after the awarding organisation's process.", officialUrl: "https://www.gov.uk/government/organisations/ofqual/about/complaints-procedure", priority: 55 },
  { id: "office-students", name: "Office for Students", category: "Education", reportTypes: ["other-authority"], channel: "Use the provider complaint process and the appropriate higher-education complaints route; report regulatory information to OfS where applicable.", officialUrl: "https://www.officeforstudents.org.uk/for-students/ofs-and-students/complaints/", priority: 45 },

  { id: "acas", name: "Acas", category: "Employment and workplace", reportTypes: ["other-authority"], channel: "Use Acas guidance, helpline or early conciliation for workplace rights and employment disputes.", officialUrl: "https://www.acas.org.uk/contact", priority: 75 },
  { id: "hse", name: "Health and Safety Executive", category: "Employment and workplace", reportTypes: ["other-authority"], channel: "Use HSE's concern or incident reporting route where HSE is the enforcing authority. Some workplaces are enforced by local authorities.", officialUrl: "https://www.hse.gov.uk/contact/concerns.htm", priority: 70 },
  { id: "glaa", name: "Gangmasters and Labour Abuse Authority", category: "Employment and workplace", reportTypes: ["adult-safeguarding", "other-authority"], channel: "Report labour exploitation, forced labour and worker abuse through the GLAA route. Use 999 for immediate danger.", officialUrl: "https://www.gla.gov.uk/report-issues/", priority: 70 },
  { id: "minimum-wage", name: "HMRC — minimum wage and pay and work rights complaints", category: "Employment and workplace", reportTypes: ["other-authority"], channel: "Use the official pay and work rights complaint route for minimum-wage and related enforcement matters.", officialUrl: "https://www.gov.uk/government/publications/pay-and-work-rights-complaints", priority: 60 },

  { id: "caa", name: "Civil Aviation Authority", category: "Transport and travel", reportTypes: ["other-authority"], channel: "Complain to the airline or airport first, then use the approved dispute or CAA route where applicable.", officialUrl: "https://www.caa.co.uk/passengers-and-public/resolving-travel-problems/how-the-caa-can-help/", priority: 60 },
  { id: "orr", name: "Office of Rail and Road", category: "Transport and travel", reportTypes: ["other-authority"], channel: "Use the rail operator complaints process and the relevant passenger body; provide regulatory information to ORR where applicable.", officialUrl: "https://www.orr.gov.uk/monitoring-regulation/rail/complaints", priority: 55 },
  { id: "tfl", name: "Transport for London", category: "Transport and travel", reportTypes: ["other-authority"], channel: "Use TfL's help, complaint, safety or enforcement routes according to the service and incident.", officialUrl: "https://tfl.gov.uk/help-and-contact/", priority: 55 },
  { id: "dvsa", name: "Driver and Vehicle Standards Agency", category: "Transport and travel", reportTypes: ["other-authority"], channel: "Use the DVSA contact or report route for vehicle, driving-test, operator and roadworthiness matters within its remit.", officialUrl: "https://www.gov.uk/contact-dvsa", priority: 45 },

  { id: "environment-agency", name: "Environment Agency incident hotline", category: "Environment, food and animals", reportTypes: ["local-authority", "other-authority"], channel: "Report serious environmental incidents through the official incident hotline or online route. Use 999 for immediate danger.", officialUrl: "https://www.gov.uk/report-an-environmental-incident", priority: 75 },
  { id: "food-standards-agency", name: "Food Standards Agency", category: "Environment, food and animals", reportTypes: ["local-authority", "other-authority"], channel: "Report food safety, hygiene or authenticity concerns through the appropriate local authority or FSA route.", officialUrl: "https://www.food.gov.uk/contact/consumers/report-problem", priority: 65 },

  { id: "ehrc", name: "Equality and Human Rights Commission / Equality Advisory and Support Service", category: "Equality and human rights", reportTypes: ["other-authority"], channel: "Use EASS for discrimination and human-rights information and support. EHRC generally does not act as an individual complaint-resolution service.", officialUrl: "https://www.equalityhumanrights.com/equality/equality-advisory-and-support-service", priority: 60 },
  { id: "ofcom-complaints", name: "Ofcom — communications complaints", category: "Communications and online safety", reportTypes: ["other-authority"], channel: "Use the provider complaint process and Ofcom's appropriate complaint or information route for telecoms, postal, broadcasting or online-safety matters.", officialUrl: "https://www.ofcom.org.uk/make-a-complaint", priority: 65 }
];

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function configuredAdmins(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL)
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
}

async function tableExists(DB, table) {
  const row = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .bind(table).first().catch(() => null);
  return Boolean(row?.name);
}

async function authorised(context) {
  const identity = await getNativeSession(context.request, context.env, "admin").catch(() => null);
  if (!identity?.email) return null;
  const email = clean(identity.email, 254).toLowerCase();
  if (configuredAdmins(context.env).includes(email)) return identity;
  if (!context.env.DB || !(await tableExists(context.env.DB, "admin_users"))) return null;
  const row = await context.env.DB.prepare("SELECT status FROM admin_users WHERE lower(email)=lower(?)")
    .bind(email).first().catch(() => null);
  const status = clean(row?.status || "Active", 80).toLowerCase();
  return row && !["blocked", "closed", "disabled", "inactive", "suspended"].includes(status) ? identity : null;
}

async function fetchJson(url, timeout = 12_000) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Sousa Murray Planeia-Authority-Reporting/1.0" },
    redirect: "follow",
    cf: { cacheTtl: 3600, cacheEverything: true },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`Official authority service returned HTTP ${response.status}.`);
  return response.json();
}

function authorityRecord(entry, extra = {}) {
  return {
    id: entry.id,
    name: entry.name,
    category: entry.category,
    channel: entry.channel,
    officialUrl: entry.officialUrl,
    source: "Official authority website",
    checkedAt: new Date().toISOString(),
    ...extra,
  };
}

function filterRegistry(query, reportType, category) {
  const words = clean(query, 200).toLowerCase().split(/\s+/).filter(Boolean);
  return AUTHORITIES
    .filter((item) => !reportType || item.reportTypes.includes(reportType) || item.reportTypes.includes("other-authority"))
    .filter((item) => !category || item.category === category)
    .filter((item) => !words.length || words.every((word) => [item.name, item.category, item.channel].some((field) => field.toLowerCase().includes(word))))
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || a.name.localeCompare(b.name, "en-GB"))
    .map((item) => authorityRecord(item));
}

function normaliseCouncil(authority, service, sourcePostcode) {
  if (!authority) return null;
  const serviceAuthority = ["child-safeguarding", "adult-safeguarding"].includes(service) && authority.parent
    ? authority.parent
    : authority;
  const serviceName = service === "child-safeguarding"
    ? "children's social care / safeguarding team"
    : service === "adult-safeguarding"
      ? "adult safeguarding team"
      : "relevant council service";
  return {
    id: `council-${clean(serviceAuthority.slug || serviceAuthority.name, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: `${clean(serviceAuthority.name, 180)} — ${serviceName}`,
    category: service === "child-safeguarding" ? "Child safeguarding" : service === "adult-safeguarding" ? "Adult safeguarding and health" : "Local authority",
    channel: `Use ${clean(serviceAuthority.name, 180)}'s official ${serviceName} referral, duty-team or published contact route. Verify the service and current contact details before sharing personal information.`,
    officialUrl: clean(serviceAuthority.homepage_url || "https://www.gov.uk/find-local-council", 1000),
    source: "GOV.UK Local Authorities API",
    checkedAt: new Date().toISOString(),
    postcode: sourcePostcode,
    tier: clean(serviceAuthority.tier, 80),
    district: authority.parent ? { name: clean(authority.name, 180), officialUrl: clean(authority.homepage_url, 1000), tier: clean(authority.tier, 80) } : null,
    parent: authority.parent ? { name: clean(authority.parent.name, 180), officialUrl: clean(authority.parent.homepage_url, 1000), tier: clean(authority.parent.tier, 80) } : null,
  };
}

async function councilRecords(postcode, reportType) {
  const compact = clean(postcode, 20).replace(/\s+/g, "").toUpperCase();
  if (!compact) return [];
  const first = await fetchJson(`${GOV_LOCAL_AUTHORITY_API}?postcode=${encodeURIComponent(compact)}`);
  const authorities = [];
  if (first?.local_authority) {
    authorities.push(first.local_authority);
  } else if (Array.isArray(first?.addresses)) {
    const uniqueSlugs = [...new Set(first.addresses.map((item) => clean(item?.slug, 120)).filter(Boolean))].slice(0, 10);
    const details = await Promise.all(uniqueSlugs.map(async (slug) => {
      try {
        const value = await fetchJson(`${GOV_LOCAL_AUTHORITY_API}/${encodeURIComponent(slug)}`);
        return value?.local_authority || null;
      } catch {
        return null;
      }
    }));
    authorities.push(...details.filter(Boolean));
  }
  const deduped = new Map();
  for (const authority of authorities) {
    const record = normaliseCouncil(authority, reportType, compact);
    if (record) deduped.set(record.id, record);
  }
  return [...deduped.values()];
}

async function policeForceFor(postcode) {
  const compact = clean(postcode, 20).replace(/\s+/g, "").toUpperCase();
  if (!compact) return null;
  const postcodeResult = await fetchJson(`${POSTCODE_API}/${encodeURIComponent(compact)}`);
  const latitude = Number(postcodeResult?.result?.latitude);
  const longitude = Number(postcodeResult?.result?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const located = await fetchJson(`${POLICE_API}/locate-neighbourhood?q=${encodeURIComponent(`${latitude},${longitude}`)}`).catch(() => null);
  if (!located?.force) return null;
  const details = await fetchJson(`${POLICE_API}/forces/${encodeURIComponent(located.force)}`).catch(() => ({ name: located.force, url: "https://www.police.uk/" }));
  return {
    id: `police-force-${clean(located.force, 120)}`,
    name: clean(details?.name || located.force, 180),
    category: "Police and emergencies",
    channel: "Use the force's official 101 or online reporting route for non-emergency crime. Call 999 for immediate danger.",
    officialUrl: clean(details?.url || "https://www.police.uk/", 1000),
    source: "Police.uk locate-neighbourhood service",
    checkedAt: new Date().toISOString(),
    postcode: compact,
    forceId: clean(located.force, 120),
    neighbourhood: clean(located.neighbourhood, 180),
  };
}

function defaultRecommendations(reportType) {
  return filterRegistry("", reportType, "").slice(0, 12);
}

async function resolveAuthorities(body) {
  const reportType = clean(body.report_type || "other-authority", 80);
  const postcode = clean(body.postcode, 20).toUpperCase();
  const recommendations = [];
  const errors = [];

  if (["child-safeguarding", "adult-safeguarding", "local-authority"].includes(reportType) && postcode) {
    try {
      recommendations.push(...await councilRecords(postcode, reportType));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "The responsible local authority could not be resolved.");
    }
  }

  if (["police-emergency", "police-non-emergency", "child-safeguarding", "adult-safeguarding", "data-breach-ico"].includes(reportType) && postcode) {
    try {
      const force = await policeForceFor(postcode);
      if (force) recommendations.push(force);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "The responsible police force could not be resolved.");
    }
  }

  recommendations.push(...defaultRecommendations(reportType));
  const unique = new Map();
  for (const authority of recommendations) unique.set(authority.id, authority);
  return {
    reportType,
    postcode,
    recommendations: [...unique.values()].slice(0, 30),
    errors,
    guidance: reportType === "child-safeguarding"
      ? "Use the child or young person's home postcode where lawfully known. The linked user's billing postcode is only a fallback and may identify the wrong council. Call 999 for immediate danger."
      : reportType === "adult-safeguarding"
        ? "Use the adult's home or ordinary-residence postcode where lawfully known. Call 999 for immediate danger."
        : reportType === "data-breach-ico"
          ? "Assess ICO notification separately from police, NCSC and fraud reporting. One incident may require more than one authority."
          : "Verify the authority's remit and current official submission route before sharing personal information.",
    checkedAt: new Date().toISOString(),
  };
}

export async function onRequestGet(context) {
  if (!(await authorised(context))) return json({ success: false, error: "Administrator session required." }, 401);
  const url = new URL(context.request.url);
  const query = clean(url.searchParams.get("q"), 200);
  const reportType = clean(url.searchParams.get("report_type"), 80);
  const category = clean(url.searchParams.get("category"), 120);
  const authorities = filterRegistry(query, reportType, category);
  const categories = [...new Set(AUTHORITIES.map((item) => item.category))].sort((a, b) => a.localeCompare(b, "en-GB"));
  return json({ success: true, data: { authorities, categories, total: authorities.length, checkedAt: new Date().toISOString() } });
}

export async function onRequestPost(context) {
  if (!(await authorised(context))) return json({ success: false, error: "Administrator session required." }, 401);
  const origin = context.request.headers.get("Origin");
  if (origin && origin !== new URL(context.request.url).origin) return json({ success: false, error: "Request origin was rejected." }, 403);
  const body = await context.request.json().catch(() => ({}));
  if (body.action !== "resolve") return json({ success: false, error: "Unknown authority-directory action." }, 400);
  try {
    return json({ success: true, data: await resolveAuthorities(body) });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "Authorities could not be resolved." }, 502);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ success: false, error: "Method not allowed." }, 405);
}
