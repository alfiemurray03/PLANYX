import { normalisePlanCode, planEntitlements } from "../_shared/subscription-entitlements.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function wantsPortalHtml(request, pathname) {
  return request.method === "GET" && !pathname.startsWith("/account/api/");
}

function portalAssetRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  return new Request(url.toString(), request);
}

function clean(value, max = 1000) { return String(value || "").trim().slice(0, max); }
function cleanEmail(value) { return clean(value, 254).toLowerCase(); }

function getAccessIdentity(request) {
  const nativeEmail = request.headers.get("x-ja-auth-email") || "";
  return { email: cleanEmail(nativeEmail), name: clean(request.headers.get("x-ja-auth-name") || nativeEmail, 160) };
}

export const DEFAULT_BUILDERS = [
  ["day-trip", "Day Trip Builder", "Everyday", "Days out & occasions", 10, "trial,personal,standard,professional,org-starter", "trial", "Build a practical day trip with timings, activities, budget and a weather backup."],
  ["family-day-out", "Family Day Out Builder", "Everyday", "Days out & occasions", 15, "trial,personal,standard,professional,org-starter", "trial", "Plan a family day out around ages, pace, facilities and accessibility."],
  ["school-holiday", "School Holiday Planner", "Everyday", "Days out & occasions", 15, "personal,standard,professional,org-starter", "paid", "Turn school holiday dates and interests into an organised experience plan."],
  ["occasion", "Occasion Planner", "Everyday", "Days out & occasions", 15, "personal,standard,professional,org-starter", "paid", "Plan a celebration or special occasion with activities, timings and booking checks."],
  ["local-discovery", "Local Discovery Builder", "Everyday", "Days out & occasions", 10, "trial,personal,standard,professional,org-starter", "trial", "Create a shortlist of experiences near you and compare what suits your group."],
  ["budget-experience", "Budget Experience Builder", "Everyday", "Days out & occasions", 10, "personal,standard,professional,org-starter", "paid", "Build an enjoyable experience plan around a clear total budget."],
  ["rainy-day", "Rainy Day Plan Builder", "Everyday", "Days out & occasions", 10, "personal,standard,professional,org-starter", "paid", "Create an indoor or weather-resilient experience plan."],
  ["date-night", "Date Night Builder", "Everyday", "Days out & occasions", 10, "personal,standard,professional,org-starter", "paid", "Plan a date night with activities, food, timings and budget."],
  ["birthday-plan", "Birthday Experience Builder", "Everyday", "Days out & occasions", 15, "personal,standard,professional,org-starter", "paid", "Build a birthday experience around the guest list, interests and venue needs."],
  ["travel-itinerary", "Travel Itinerary Builder", "Travel", "Trips & holidays", 25, "standard,professional,org-starter", "paid", "Create a flexible day-by-day travel itinerary with practical checks."],
  ["travel-checklist", "Travel Experience Checklist", "Travel", "Trips & holidays", 15, "personal,standard,professional,org-starter", "paid", "Organise the bookings, packing and experience checks for a trip."],
  ["destination-board", "Destination Ideas Board", "Travel", "Trips & holidays", 15, "personal,standard,professional,org-starter", "paid", "Compare destinations, activities and provider options in one plan."],
  ["holiday-planner", "Holiday Planner", "Travel", "Trips & holidays", 25, "trial,personal,standard,professional,org-starter", "trial", "Organise your destination, itinerary, activities, budget and practical needs."],
  ["accessible-travel-checklist", "Accessible Experience Planner", "Accessible", "Accessible experiences", 15, "standard,professional,org-starter", "paid", "Plan an experience around access requirements and provider confirmations."],
  ["accessible-destination", "Accessible Destination Planner", "Accessible", "Accessible experiences", 20, "standard,professional,org-starter", "paid", "Compare destination access, transport, venues and facilities."],
  ["accessible-venue-questions", "Venue Accessibility Questions", "Accessible", "Accessible experiences", 10, "standard,professional,org-starter", "paid", "Prepare the right access questions to confirm directly with a venue."]
];

// A broad professional catalogue. Templates share the proven guided experience
// schema, while their audience/category/title/brief make discovery specific and
// useful. Keeping these definitions deterministic also makes admin controls and
// customer entitlements operate against stable IDs.
const CATALOGUE_AUDIENCES = [
  ["public", "General public", "Individuals & families", "👤"],
  ["family", "Families", "Individuals & families", "👨‍👩‍👧‍👦"],
  ["business", "Businesses", "Business travel & events", "💼"],
  ["school", "Schools", "Education & youth travel", "🏫"],
  ["college", "Colleges & universities", "Education & youth travel", "🎓"],
  ["government", "Government teams", "Government & public service", "🏛️"],
  ["police", "Police services", "Government & public service", "🛡️"],
  ["charity", "Charities & community groups", "Groups & community", "🤝"],
  ["accessible", "Accessible travel", "Accessible & inclusive", "♿"],
  ["senior", "Older travellers", "Accessible & inclusive", "🌿"]
];
const CATALOGUE_EXPERIENCES = [
  ["day-visit", "Day visit", 10], ["multi-day-trip", "Multi-day trip", 25],
  ["transport-plan", "Transport plan", 15], ["accommodation-plan", "Accommodation plan", 15],
  ["budget-plan", "Budget and cost plan", 15], ["itinerary", "Detailed itinerary", 25],
  ["risk-plan", "Risk-aware experience plan", 20], ["access-plan", "Accessibility plan", 15],
  ["group-visit", "Group visit", 20], ["event-trip", "Event travel plan", 20],
  ["international", "International trip", 30], ["local-experience", "Local experience", 10],
  ["wellbeing-break", "Wellbeing break", 15], ["culture-visit", "Culture and heritage visit", 15],
  ["outdoor-visit", "Outdoor experience", 15], ["food-experience", "Food and dining experience", 10],
  ["emergency-backup", "Disruption and backup plan", 15], ["sustainable-trip", "Lower-impact travel plan", 15],
  ["seasonal-trip", "Seasonal experience", 15], ["bespoke-journey", "Bespoke journey", 25]
];
for (const [audienceId, audience, category, icon] of CATALOGUE_AUDIENCES) {
  for (const [typeId, typeName, cost] of CATALOGUE_EXPERIENCES) {
    const id = `${audienceId}-${typeId}`;
    if (!DEFAULT_BUILDERS.some(builder => builder[0] === id)) DEFAULT_BUILDERS.push([
      id, `${audience} — ${typeName}`, audience, category, cost,
      "personal,standard,professional,org-starter", "paid",
      `Create a professional ${typeName.toLowerCase()} for ${audience.toLowerCase()}, covering priorities, timings, budget, access needs and practical contingencies.`, icon
    ]);
  }
}

const ADDONS = [
  ["extra-10-tokens", "Extra 10 Builder Usage Tokens", 500, 10, "tokens"],
  ["extra-25-tokens", "Extra 25 Builder Usage Tokens", 1000, 25, "tokens"],
  ["extra-50-tokens", "Extra 50 Builder Usage Tokens", 1800, 50, "tokens"],
  ["extra-100-tokens", "Extra 100 Builder Usage Tokens", 3000, 100, "tokens"],
  ["quick-human-help", "Quick Human Help", 2500, 0, "human_support"],
  ["human-plan-review", "Human Plan Review", 5000, 0, "human_support"],
  ["human-made-plan", "Human-Made Experience Plan", 10000, 0, "human_support"]
];

const HOLIDAY_PLANNER_SCHEMA = [
  { "id": "destination", "type": "short_text", "label": "Destination", "required": true, "help": "Where are you planning to go?" },
  { "id": "departure_point", "type": "short_text", "label": "Departure point", "required": false, "help": "Where are you starting your journey from?" },
  { "id": "travel_dates", "type": "date", "label": "Travel date", "required": true, "help": "When do you plan to leave?" },
  { "id": "trip_duration", "type": "number", "label": "Trip duration (nights)", "required": true, "min": 1, "max": 90, "help": "How many nights will you be staying?" },
  { "id": "num_adults", "type": "number", "label": "Number of adults", "required": true, "min": 1, "max": 20, "help": "How many adult travellers?" },
  { "id": "has_children", "type": "yes_no", "label": "Are children travelling with you?", "required": true },
  { "id": "children_ages", "type": "multiple_choice", "label": "Children's age groups", "required": false, "options": [
      { "label": "Infants (0-2 years)", "value": "infant" },
      { "label": "Toddlers (3-5 years)", "value": "toddler" },
      { "label": "Kids (6-12 years)", "value": "kids" },
      { "label": "Teens (13-17 years)", "value": "teens" }
    ], "conditional": { "field": "has_children", "value": true }, "help": "Select all children age groups that apply." },
  { "id": "budget", "type": "single_choice", "label": "Approximate budget per person", "required": true, "options": [
      { "label": "Budget (£0 - £500)", "value": "budget" },
      { "label": "Moderate (£500 - £1500)", "value": "moderate" },
      { "label": "Luxury (£1500+)", "value": "luxury" }
    ] },
  { "id": "accommodation", "type": "selectable_cards", "label": "Accommodation arrangements", "required": true, "options": [
      { "label": "Hotel", "value": "hotel", "icon": "🏨" },
      { "label": "Apartment/Rental", "value": "rental", "icon": "🏠" },
      { "label": "Hostel", "value": "hostel", "icon": "🏢" },
      { "label": "Camping/Other", "value": "camping", "icon": "🏕️" }
    ] },
  { "id": "transport", "type": "multiple_choice", "label": "Transport preferences", "required": true, "options": [
      { "label": "Flight", "value": "flight" },
      { "label": "Train", "value": "train" },
      { "label": "Car rental / Driving", "value": "driving" },
      { "label": "Public transit / Coach", "value": "transit" }
    ] },
  { "id": "interests", "type": "multiple_choice", "label": "Interests & Activities", "required": false, "options": [
      { "label": "Sightseeing & Culture", "value": "culture" },
      { "label": "Food & Dining", "value": "food" },
      { "label": "Nature & Outdoors", "value": "nature" },
      { "label": "Relaxation & Wellness", "value": "relax" },
      { "label": "Shopping", "value": "shopping" },
      { "label": "Theme parks & Adventure", "value": "adventure" }
    ] },
  { "id": "preferred_pace", "type": "single_choice", "label": "Preferred pace", "required": true, "options": [
      { "label": "Relaxed / Easy-going", "value": "relaxed" },
      { "label": "Moderate / Balanced", "value": "moderate" },
      { "label": "Fast / Packed schedule", "value": "fast" }
    ] },
  { "id": "has_accessibility", "type": "yes_no", "label": "Do you have accessibility requirements?", "required": true },
  { "id": "accessibility_details", "type": "long_text", "label": "Accessibility requirements", "required": true, "conditional": { "field": "has_accessibility", "value": true }, "help": "Please detail any mobility, visual, hearing, or general accessibility needs." },
  { "id": "has_dietary", "type": "yes_no", "label": "Do you have dietary requirements?", "required": true },
  { "id": "dietary_details", "type": "long_text", "label": "Dietary requirements", "required": true, "conditional": { "field": "has_dietary", "value": true }, "help": "Please list any allergies, preferences, or dietary requirements." },
  { "id": "must_do", "type": "long_text", "label": "Must-do activities", "required": false, "placeholder": "E.g., Visit Eiffel Tower, eat local cuisines..." },
  { "id": "to_avoid", "type": "long_text", "label": "Activities to avoid", "required": false, "placeholder": "E.g., Long queues, strenuous hiking..." },
  { "id": "is_special_occasion", "type": "yes_no", "label": "Is this travel for a special occasion?", "required": true },
  { "id": "special_occasion_details", "type": "long_text", "label": "Special occasion details", "required": true, "conditional": { "field": "is_special_occasion", "value": true }, "placeholder": "E.g., 40th Birthday, Wedding Anniversary..." },
  { "id": "additional_notes", "type": "long_text", "label": "Additional notes", "required": false, "placeholder": "Any other details..." }
];

const EXPERIENCE_PLANNER_SCHEMA = [
  { id: "plan_title", type: "short_text", label: "Plan name", required: true, placeholder: "e.g. Saturday in Manchester" },
  { id: "location", type: "short_text", label: "Location or destination", required: true },
  { id: "experience_date", type: "date", label: "Date", required: false },
  { id: "participants", type: "short_text", label: "Who is this for?", required: true, help: "Include group size and ages where useful." },
  { id: "budget", type: "short_text", label: "Total budget", required: false },
  { id: "interests", type: "multiple_choice", label: "Interests", required: true, options: [
    { label: "Food & drink", value: "food and drink" }, { label: "Culture & history", value: "culture and history" },
    { label: "Shows & entertainment", value: "shows and entertainment" }, { label: "Outdoors & nature", value: "outdoors and nature" },
    { label: "Family activities", value: "family activities" }, { label: "Adventure", value: "adventure" }
  ] },
  { id: "preferred_pace", type: "single_choice", label: "Preferred pace", required: true, options: [
    { label: "Relaxed", value: "relaxed" }, { label: "Balanced", value: "balanced" }, { label: "Full day", value: "full" }
  ] },
  { id: "must_do", type: "long_text", label: "Must-do activities or ideas", required: false },
  { id: "accessibility_details", type: "long_text", label: "Accessibility requirements", required: false, help: "Add mobility, sensory, seating or other access needs to confirm with providers." },
  { id: "dietary_details", type: "long_text", label: "Dietary requirements", required: false },
  { id: "booking_notes", type: "long_text", label: "Bookings or provider notes", required: false },
  { id: "backup_plan", type: "long_text", label: "Weather or backup option", required: false },
  { id: "additional_notes", type: "long_text", label: "Anything else?", required: false }
];

async function ensureTables(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS experience_builders (id TEXT PRIMARY KEY, name TEXT NOT NULL, builder_type TEXT NOT NULL, category TEXT NOT NULL, token_cost INTEGER NOT NULL DEFAULT 15, plan_inclusion TEXT NOT NULL DEFAULT 'trial,membership,plus,family', status TEXT NOT NULL DEFAULT 'Active', visibility TEXT NOT NULL DEFAULT 'paid', description TEXT, form_schema TEXT NOT NULL DEFAULT '[]', usage_count INTEGER NOT NULL DEFAULT 0, blocked_attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();

  // Safe dynamic alters to add extended columns if they are not already present
  const tableInfo = await DB.prepare(`PRAGMA table_info(experience_builders)`).all().then(r => r.results || []);
  const columns = new Set(tableInfo.map(c => c.name));

  if (!columns.has('slug')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN slug TEXT`).run().catch(() => {});
  if (!columns.has('icon')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN icon TEXT DEFAULT '📋'`).run().catch(() => {});
  if (!columns.has('creates_description')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN creates_description TEXT`).run().catch(() => {});
  if (!columns.has('estimated_minutes')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN estimated_minutes INTEGER DEFAULT 10`).run().catch(() => {});
  if (!columns.has('trial_eligible')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN trial_eligible INTEGER DEFAULT 1`).run().catch(() => {});
  if (!columns.has('featured')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN featured INTEGER DEFAULT 0`).run().catch(() => {});
  if (!columns.has('display_order')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN display_order INTEGER DEFAULT 0`).run().catch(() => {});
  if (!columns.has('output_instructions')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN output_instructions TEXT DEFAULT ''`).run().catch(() => {});
  if (!columns.has('version')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN version INTEGER DEFAULT 1`).run().catch(() => {});

  // Create builder_runs table to support draft persistence/resume
  await DB.prepare(`CREATE TABLE IF NOT EXISTS builder_runs (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    builder_id TEXT NOT NULL REFERENCES experience_builders(id) ON DELETE CASCADE,
    builder_version INTEGER NOT NULL DEFAULT 1,
    answers TEXT NOT NULL DEFAULT '{}',
    current_step INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  )`).run();
  await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_builder_runs_email ON builder_runs(email, status)`).run().catch(() => {});

  await DB.prepare(`CREATE TABLE IF NOT EXISTS builder_outputs (id TEXT PRIMARY KEY, email TEXT NOT NULL, builder_id TEXT NOT NULL, builder_name TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Completed', token_cost INTEGER NOT NULL DEFAULT 0, input_payload TEXT NOT NULL DEFAULT '{}', output_payload TEXT NOT NULL DEFAULT '{}', request_id TEXT, archived_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(email, request_id))`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS builder_token_ledger (id TEXT PRIMARY KEY, email TEXT NOT NULL, amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, source TEXT NOT NULL, reason TEXT NOT NULL, builder_output_id TEXT, builder_id TEXT, admin_email TEXT, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS builder_blocked_attempts (id TEXT PRIMARY KEY, email TEXT NOT NULL, builder_id TEXT, builder_name TEXT, reason TEXT NOT NULL, tokens_available INTEGER NOT NULL DEFAULT 0, tokens_required INTEGER NOT NULL DEFAULT 0, action_offered TEXT, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS trial_access_tokens (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'Active', activated_at TEXT NOT NULL, expires_at TEXT NOT NULL, token_allowance INTEGER NOT NULL DEFAULT 30, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS token_addon_packages (id TEXT PRIMARY KEY, name TEXT NOT NULL, price_pence INTEGER NOT NULL, token_amount INTEGER NOT NULL DEFAULT 0, package_type TEXT NOT NULL DEFAULT 'tokens', status TEXT NOT NULL DEFAULT 'Configuration Ready', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await seedDefaults(DB);
}

async function seedDefaults(DB) {
  const catalogueVersion = "experience-catalogue-2026-07-18-v1";
  const seeded = await DB.prepare(`SELECT value FROM site_settings WHERE key='experience_builder_catalogue_version'`).first().catch(() => null);
  const existingCount = await DB.prepare(`SELECT COUNT(*) AS count FROM experience_builders`).first().catch(() => ({ count: 0 }));
  if (seeded?.value === catalogueVersion && Number(existingCount?.count || 0) >= DEFAULT_BUILDERS.length) return;
  // Do not prune from a customer request. Besides deleting administrator-created
  // templates, a 200+ item NOT IN list exceeds D1/SQLite bind-variable limits.
  const seedStatements = [];
  for (const row of DEFAULT_BUILDERS) {
    const [id, name, builder_type, category, token_cost, plan_inclusion, visibility, description, catalogueIcon] = row;

    let form_schema = JSON.stringify(EXPERIENCE_PLANNER_SCHEMA);
    let creates_description = `A structured ${name.toLowerCase()} with activities, timings and practical checks.`;
    let icon = catalogueIcon || (category === "Trips & holidays" ? '✈️' : category === "Accessible experiences" ? '♿' : '✨');
    let estimated_minutes = builder_type === "Travel" ? 15 : 10;
    let trial_eligible = plan_inclusion.includes("trial") ? 1 : 0;
    let featured = ["day-trip", "family-day-out", "holiday-planner"].includes(id) ? 1 : 0;
    let display_order = DEFAULT_BUILDERS.findIndex(item => item[0] === id) + 1;
    let output_instructions = 'Create a clear experience plan using the supplied preferences.';

    if (id === 'holiday-planner') {
      form_schema = JSON.stringify(HOLIDAY_PLANNER_SCHEMA);
      creates_description = "You'll create a structured travel planning framework with day-by-day itineraries, budgeting, checklist and accessibility notes.";
      icon = '✈️';
      estimated_minutes = 15;
      trial_eligible = 1;
      featured = 1;
      display_order = 1;
      output_instructions = "Generate a personalized day-by-day vacation planning document.";
    }

    seedStatements.push(DB.prepare(`
        INSERT INTO experience_builders (
          id, name, builder_type, category, token_cost, plan_inclusion, status, visibility, description,
          slug, icon, creates_description, estimated_minutes, trial_eligible, featured, display_order, output_instructions, form_schema
        ) VALUES (?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, builder_type=excluded.builder_type, category=excluded.category,
          token_cost=excluded.token_cost, plan_inclusion=excluded.plan_inclusion, status='Active',
          visibility=excluded.visibility, description=excluded.description, slug=excluded.slug,
          icon=excluded.icon, creates_description=excluded.creates_description,
          estimated_minutes=excluded.estimated_minutes, trial_eligible=excluded.trial_eligible,
          featured=excluded.featured, display_order=excluded.display_order,
          output_instructions=excluded.output_instructions, form_schema=excluded.form_schema,
          updated_at=CURRENT_TIMESTAMP
      `).bind(
        id, name, builder_type, category, token_cost, plan_inclusion, visibility, description,
        id, icon, creates_description, estimated_minutes, trial_eligible, featured, display_order, output_instructions, form_schema
      ));
  }

  for (const row of ADDONS) {
    seedStatements.push(DB.prepare(`INSERT OR IGNORE INTO token_addon_packages (id, name, price_pence, token_amount, package_type) VALUES (?, ?, ?, ?, ?)`).bind(...row));
  }
  if (typeof DB.batch === "function") {
    for (let index = 0; index < seedStatements.length; index += 40) await DB.batch(seedStatements.slice(index, index + 40));
  } else {
    for (const statement of seedStatements) await statement.run();
  }
  await DB.prepare(`INSERT INTO site_settings (key,value,updated_at) VALUES ('experience_builder_catalogue_version',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(catalogueVersion).run().catch(() => {});
}

async function all(DB, sql, bindings = []) {
  const result = await DB.prepare(sql).bind(...bindings).all();
  return result.results || [];
}

async function first(DB, sql, bindings = []) {
  return await DB.prepare(sql).bind(...bindings).first();
}

async function tokenBalance(DB, email) {
  const row = await first(DB, `SELECT COALESCE(SUM(amount), 0) AS balance FROM builder_token_ledger WHERE lower(email) = lower(?)`, [email]);
  return Number(row?.balance || 0);
}

async function activeSubscription(DB, email) {
  return await first(DB, `
    SELECT *
    FROM stripe_subscriptions
    WHERE lower(customer_email) = lower(?)
      AND lower(COALESCE(status, '')) IN ('active', 'trialing')
      AND (
        current_period_end IS NULL
        OR current_period_end = ''
        OR datetime(current_period_end) > datetime('now')
      )
    ORDER BY COALESCE(current_period_end, trial_end, subscription_start, updated_at) DESC
    LIMIT 1
  `, [email]).catch(() => null);
}

async function tokenSummary(DB, email) {
  const [trial, balanceRow, usedRow, addOnRow, stripeSubscription, lifetimeProfile] = await Promise.all([
    first(DB, `SELECT * FROM trial_access_tokens WHERE lower(email) = lower(?)`, [email]),
    first(DB, `SELECT COALESCE(SUM(amount), 0) AS balance FROM builder_token_ledger WHERE lower(email) = lower(?)`, [email]),
    first(DB, `SELECT ABS(COALESCE(SUM(amount), 0)) AS used FROM builder_token_ledger WHERE lower(email) = lower(?) AND amount < 0 AND source = 'builder_usage'`, [email]),
    first(DB, `SELECT COALESCE(SUM(amount), 0) AS purchased FROM builder_token_ledger WHERE lower(email) = lower(?) AND source = 'add_on_purchase'`, [email]),
    activeSubscription(DB, email),
    first(DB, `SELECT admin_lifetime, admin_lifetime_plan_id FROM profiles WHERE lower(email)=lower(?)`, [email]).catch(() => null)
  ]);
  const now = Date.now();
  const activeTrial = trial && trial.status === "Active" && new Date(trial.expires_at).getTime() > now;
  const lifetimeActive = Number(lifetimeProfile?.admin_lifetime || 0) === 1 && Boolean(normalisePlanCode(lifetimeProfile?.admin_lifetime_plan_id));
  const subscription = lifetimeActive ? {
    plan_code: normalisePlanCode(lifetimeProfile.admin_lifetime_plan_id),
    plan_name: `${lifetimeProfile.admin_lifetime_plan_id} lifetime`,
    status: "lifetime",
    current_period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    current_period_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString()
  } : stripeSubscription;
  const activePlan = Boolean(subscription);
  const planCode = activeTrial ? "trial" : normalisePlanCode(subscription?.plan_code || subscription?.plan_name);
  const entitlement = await effectiveEntitlement(DB, planCode);
  const unlimited = Boolean(activePlan && entitlement && entitlement.creditLimit === null);
  let usedThisPeriod = Number(usedRow?.used || 0);
  let usedLastFiveHours = 0;
  let fiveHourResetsAt = "";
  if (activePlan && entitlement && !unlimited) {
    const periodStart = subscription.current_period_start || subscription.subscription_start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const [periodUsage, windowUsage, oldestWindowUsage] = await Promise.all([
      first(DB, `SELECT ABS(COALESCE(SUM(amount), 0)) AS used FROM builder_token_ledger WHERE lower(email) = lower(?) AND amount < 0 AND source = 'builder_usage' AND datetime(created_at) >= datetime(?)`, [email, periodStart]),
      first(DB, `SELECT ABS(COALESCE(SUM(amount), 0)) AS used FROM builder_token_ledger WHERE lower(email) = lower(?) AND amount < 0 AND source = 'builder_usage' AND datetime(created_at) >= datetime('now', '-5 hours')`, [email]),
      first(DB, `SELECT created_at FROM builder_token_ledger WHERE lower(email) = lower(?) AND amount < 0 AND source = 'builder_usage' AND datetime(created_at) >= datetime('now', '-5 hours') ORDER BY datetime(created_at) ASC LIMIT 1`, [email])
    ]);
    usedThisPeriod = Number(periodUsage?.used || 0);
    usedLastFiveHours = Number(windowUsage?.used || 0);
    if (oldestWindowUsage?.created_at) fiveHourResetsAt = new Date(new Date(oldestWindowUsage.created_at).getTime() + 5 * 60 * 60 * 1000).toISOString();
  }
  const remaining = activePlan && entitlement && !unlimited ? Math.max(0, entitlement.creditLimit - usedThisPeriod) : Number(balanceRow?.balance || 0);
  return {
    wording: "Builder Usage Tokens",
    usage_model: unlimited ? "unlimited" : "credits",
    unlimited_builder_use: unlimited,
    remaining_tokens: remaining,
    used_tokens: usedThisPeriod,
    credit_limit: entitlement?.creditLimit ?? null,
    five_hour_limit: entitlement?.fiveHourLimit ?? null,
    used_last_five_hours: usedLastFiveHours,
    five_hour_resets_at: fiveHourResetsAt,
    purchased_addon_tokens: Number(addOnRow?.purchased || 0),
    monthly_allowance: activeTrial ? Number(trial.token_allowance || 30) : 0,
    trial_tokens: trial ? Number(trial.token_allowance || 30) : 0,
    token_reset_at: subscription?.current_period_end || "",
    trial: trial || null,
    trial_active: Boolean(activeTrial),
    subscription: subscription || null,
    subscription_active: activePlan,
    lifetime_access: lifetimeActive,
    plan_active: Boolean(activeTrial || activePlan),
    plan_name: activeTrial ? "30-Day Free Trial" : activePlan ? (subscription.plan_name || "Active membership") : "No active self-service plan detected",
    deduction_rule: unlimited
      ? "Together Plan includes unlimited use of all available builders."
      : activePlan
      ? `Credits reset each billing period. Up to ${entitlement?.fiveHourLimit?.toLocaleString("en-GB") || 0} credits may be used in any rolling five-hour window.`
      : "Free-plan credits are deducted only when a finished builder output is saved. Opening or previewing a builder does not use credits."
  };
}

function accessPlanCode(summary) {
  return summary.trial_active
    ? "trial"
    : normalisePlanCode(summary.subscription?.plan_code || summary.subscription?.plan_name);
}

function builderIncluded(builder, planCode) {
  const included = String(builder?.plan_inclusion || "").toLowerCase().split(",").map((item) => item.trim()).filter(Boolean);
  const acceptedTags = {
    trial: ["trial"],
    personal: ["personal", "membership"],
    standard: ["standard", "membership", "plus"],
    professional: ["professional", "membership", "plus"],
    org_starter: ["org_starter", "org-starter", "membership", "plus", "family"]
  }[planCode] || [planCode];
  return included.length === 0 || acceptedTags.some((tag) => included.includes(tag));
}

async function effectiveEntitlement(DB, value) {
  const base = planEntitlements(value);
  if (!base || !DB) return base;
  const code = base.planCode;
  const keys = [`limit_drafts_${code}`, `retention_days_${code}`, `credit_limit_${code}`, `five_hour_limit_${code}`];
  const placeholders = keys.map(() => "?").join(",");
  const rows = await all(DB, `SELECT key, value FROM site_settings WHERE key IN (${placeholders})`, keys).catch(() => []);
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const positive = (key, fallback) => {
    const number = Number(settings[key]);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  };
  const allowance = (key, fallback) => String(settings[key] || "").toLowerCase() === "unlimited" ? null : positive(key, fallback);
  return {
    ...base,
    draftLimit: positive(`limit_drafts_${code}`, base.draftLimit),
    retentionDays: positive(`retention_days_${code}`, base.retentionDays),
    creditLimit: allowance(`credit_limit_${code}`, base.creditLimit),
    fiveHourLimit: allowance(`five_hour_limit_${code}`, base.fiveHourLimit)
  };
}

async function removeExpiredDrafts(DB, email, retentionDays) {
  if (!retentionDays) return;
  await DB.prepare(`
    DELETE FROM builder_runs
    WHERE lower(email) = lower(?) AND status = 'draft'
      AND datetime(last_saved_at) <= datetime('now', ?)
  `).bind(email, `-${retentionDays} days`).run();
}

export function outputFromInput(builder, body) {
  const fields = body.fields && typeof body.fields === "object" ? body.fields : {};

  // Custom deterministic output compiler for Holiday Planner
  if (builder.id === "holiday-planner" || builder.slug === "holiday-planner") {
    const dest = clean(fields.destination || "Destination", 120);
    const dateStr = clean(fields.travel_dates || "Unspecified Date", 120);
    const duration = Math.min(90, Math.max(1, Number(fields.trip_duration || 3)));
    const adults = Math.max(1, Number(fields.num_adults || 1));
    const childrenText = fields.has_children ? `Yes (Age groups: ${Array.isArray(fields.children_ages) ? fields.children_ages.join(", ") : fields.children_ages || "None specified"})` : "No children traveling";
    const budgetLevel = clean(fields.budget || "moderate", 40);
    const accomStyle = clean(fields.accommodation || "hotel", 40);
    const trans = Array.isArray(fields.transport) ? fields.transport.join(", ") : fields.transport || "None selected";
    const interests = Array.isArray(fields.interests) ? fields.interests.join(", ") : fields.interests || "General sightseeing";
    const pace = clean(fields.preferred_pace || "moderate", 40);
    const mustDo = clean(fields.must_do || "Explore local spots and landmarks.", 1000);
    const avoid = clean(fields.to_avoid || "No exclusions specified.", 1000);
    const occasionText = fields.is_special_occasion ? `Yes (${clean(fields.special_occasion_details || "Celebration", 200)})` : "Standard holiday";
    const access = fields.has_accessibility ? clean(fields.accessibility_details || "None specified", 1000) : "No special accessibility considerations reported.";
    const dietary = fields.has_dietary ? clean(fields.dietary_details || "None specified", 1000) : "No special dietary requirements reported.";
    const notes = clean(fields.additional_notes || "None.", 1000);

    const checklist = [
      "Confirm travel documents, passport validity, and transit visas.",
      `Ensure booking accommodations match your style choice: ${accomStyle}.`,
      `Arrange transport according to preferred selections: ${trans}.`,
      "Double check emergency contact info and travel insurance policy.",
      fields.has_accessibility ? "Pre-book accessible transport and confirm accessibility facilities directly with operators." : null,
      fields.has_dietary ? "Inform airlines and local dining spots of dietary requirements: " + dietary : null
    ].filter(Boolean);

    // Dynamic generation of day framework
    const dayRows = [];
    for (let day = 1; day <= Math.min(7, duration); day++) {
      if (day === 1) {
        dayRows.push({ title: "Day 1: Arrival & Local Orientation", content: `Arrive in ${dest}. Orient yourself, check in to your ${accomStyle} accommodation, and enjoy a relaxed evening dinner.` });
      } else if (day === Math.min(7, duration)) {
        dayRows.push({ title: `Day ${day}: Souvenirs & Departure`, content: `Gather last-minute souvenirs, visit a favorite local spot, pack up, and begin travel from ${dest}.` });
      } else {
        dayRows.push({ title: `Day ${day}: ${interests.split(",")[0] || "Exploring"} Highlights`, content: `A day dedicated to exploring the highlights of ${dest} at a ${pace} pace. Plan a major activity in the morning and a dining spot for lunch.` });
      }
    }
    if (duration > 7) {
      dayRows.push({ title: `Days 8 to ${duration}: Continued Local Discovery`, content: `Continue your ${pace}-paced discovery of ${dest}. Dedicate these days to spontaneous exploration, optional excursions, or relaxation.` });
    }

    const notesSummary = [
      { label: "Destination", value: dest },
      { label: "Departure point", value: clean(fields.departure_point || "Unspecified", 120) },
      { label: "Travel date", value: dateStr },
      { label: "Trip duration (nights)", value: String(duration) },
      { label: "Number of adults", value: String(adults) },
      { label: "Children travelling", value: childrenText },
      { label: "Approximate budget", value: budgetLevel },
      { label: "Accommodation arrangements", value: accomStyle },
      { label: "Transport preferences", value: trans },
      { label: "Interests & Activities", value: interests },
      { label: "Preferred pace", value: pace },
      { label: "Accessibility requirements", value: access },
      { label: "Dietary requirements", value: dietary },
      { label: "Must-do activities", value: mustDo },
      { label: "Activities to avoid", value: avoid },
      { label: "Special occasion", value: occasionText },
      { label: "Additional notes", value: notes }
    ];

    return {
      title: clean(body.title, 160) || `Holiday Plan: ${dest}`,
      builder: "Holiday Planner",
      summary: `Structured vacation plan for ${dest} starting ${dateStr} for ${duration} nights. No live availability, live pricing, or official schedule guarantees are made.`,
      notes: notesSummary,
      holiday_planner_detail: {
        trip_overview: `A personalised ${duration}-night journey to ${dest} designed for ${adults} adult(s) (${childrenText}). The plan is curated around a ${budgetLevel} budget with a ${pace} pace.`,
        itinerary_framework: dayRows,
        activity_preferences: ` curating activities matching interests: ${interests}. Prioritizing: "${mustDo}". Excluding: "${avoid}".`,
        practical_preparation: "Ensure tickets are booked in advance. Please directly confirm all timetables and routes before setting off.",
        transport_considerations: `Using preferred transport: ${trans}. Prioritize booking connections at least 14 days in advance.`,
        budget_notes: `Planning for a ${budgetLevel} cost level. Allocate a dedicated contingency fund for unexpected transport or local experiences.`,
        accessibility_considerations: access,
        packing_checklist: checklist,
        customer_notes: notes
      },
      responsibilities: [
        "Check prices, opening times, availability, accessibility, suitability and provider terms before relying on this plan.",
        "JA Group Services Ltd does not arrange flights, transport, package holidays, visas, third-party bookings, refunds or cancellations.",
        "Accessibility and route notes are general planning support only and are not medical, safety, insurance or immigration advice."
      ]
    };
  }

  // Fallback template for legacy builders
  const notes = Object.entries(fields)
    .filter(([, value]) => clean(value, 1000))
    .map(([key, value]) => ({ label: key.replace(/[_-]+/g, " "), value: clean(value, 1000) }));
  return {
    title: clean(body.title, 160) || `${builder.name} output`,
    builder: builder.name,
    summary: `Self-service ${builder.name} output created from the details supplied by the member.`,
    notes,
    responsibilities: [
      "Check prices, opening times, availability, accessibility, suitability and provider terms before relying on this plan.",
      "JA Group Services Ltd does not arrange flights, transport, package holidays, visas, third-party bookings, refunds or cancellations.",
      "Accessibility and route notes are general planning support only and are not medical, safety, insurance or immigration advice."
    ]
  };
}

async function blockAttempt(DB, email, builder, reason, available, required) {
  await DB.prepare(`INSERT INTO builder_blocked_attempts (id, email, builder_id, builder_name, reason, tokens_available, tokens_required, action_offered) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    crypto.randomUUID(), email, builder?.id || "", builder?.name || "", reason, available, required, "View usage, upgrade plan, or purchase extra Builder Usage Tokens."
  ).run();
  if (builder?.id) {
    await DB.prepare(`UPDATE experience_builders SET blocked_attempts = COALESCE(blocked_attempts, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(builder.id).run();
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (wantsPortalHtml(request, url.pathname)) {
    // Continue to the real static /account/builders/index.html asset. Calling
    // ASSETS.fetch for that protected path re-enters Cloudflare's directory
    // routing and can bounce between /account/builders and its index file.
    if (typeof context.next === "function") return context.next();
    if (env.ASSETS?.fetch) return env.ASSETS.fetch(portalAssetRequest(request, "/account/builders/index.html"));
    return new Response("Account builders page unavailable.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (!env.DB) return json({ error: "Database unavailable." }, 500);

  try {
    await ensureTables(env.DB);
  } catch (error) {
    console.error(JSON.stringify({ event: "builder_catalogue_initialisation_failed", message: String(error?.message || error) }));
    return json({ error: "Experience builders are temporarily unavailable while the catalogue is prepared.", code: "BUILDER_CATALOGUE_UNAVAILABLE" }, 503);
  }
  const identity = getAccessIdentity(request);

  if (!identity.email) {
    return json({ error: "Not signed in." }, 401);
  }

  const profile = await first(env.DB, `SELECT admin_customer_status FROM profiles WHERE lower(email)=lower(?)`, [identity.email]).catch(() => null);
  if (["suspended", "blocked", "closed", "disabled"].includes(String(profile?.admin_customer_status || "").toLowerCase())) {
    return json({ error: "Your account is currently suspended. Please contact Sousa Murray Planeia for assistance." }, 403);
  }

  if (request.method === "GET") {
    const summary = await tokenSummary(env.DB, identity.email);
    const entitlement = await effectiveEntitlement(env.DB, accessPlanCode(summary));
    if (entitlement) await removeExpiredDrafts(env.DB, identity.email, entitlement.retentionDays);
    const [builders, outputs, ledger, attempts, packages, runs] = await Promise.all([
      all(env.DB, `SELECT * FROM experience_builders WHERE COALESCE(status, 'Active') != 'Archived' ORDER BY display_order ASC, category, token_cost, name`),
      all(env.DB, `SELECT * FROM builder_outputs WHERE lower(email) = lower(?) AND archived_at IS NULL ORDER BY created_at DESC LIMIT 100`, [identity.email]),
      all(env.DB, `SELECT * FROM builder_token_ledger WHERE lower(email) = lower(?) ORDER BY created_at DESC LIMIT 100`, [identity.email]),
      all(env.DB, `SELECT * FROM builder_blocked_attempts WHERE lower(email) = lower(?) ORDER BY created_at DESC LIMIT 50`, [identity.email]),
      all(env.DB, `SELECT * FROM token_addon_packages ORDER BY package_type DESC, price_pence ASC`),
      all(env.DB, `SELECT r.*, eb.name AS builder_name, eb.icon AS builder_icon FROM builder_runs r JOIN experience_builders eb ON r.builder_id = eb.id WHERE lower(r.email) = lower(?) AND r.status = 'draft' ORDER BY r.last_saved_at DESC`, [identity.email])
    ]);
    return json({ builders, outputs, ledger, blocked_attempts: attempts, add_on_packages: packages, token_summary: summary, drafts: runs, entitlements: entitlement });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 40);

  if (action === "activate_trial") {
    const existing = await first(env.DB, `SELECT * FROM trial_access_tokens WHERE lower(email) = lower(?)`, [identity.email]);
    if (existing) return json({ error: "A trial has already been activated for this customer account.", trial: existing }, 409);
    const now = new Date();
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const trialId = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO trial_access_tokens (id, email, activated_at, expires_at, token_allowance) VALUES (?, ?, ?, ?, 30)`).bind(trialId, identity.email, now.toISOString(), expires.toISOString()).run();
    const balanceAfter = (await tokenBalance(env.DB, identity.email)) + 30;
    await env.DB.prepare(`INSERT INTO builder_token_ledger (id, email, amount, balance_after, source, reason, metadata) VALUES (?, ?, 30, ?, 'trial', 'One-time 30-day trial Builder Usage Tokens', ?)`).bind(crypto.randomUUID(), identity.email, balanceAfter, JSON.stringify({ trialId })).run();
    return json({ activated: true, token_summary: await tokenSummary(env.DB, identity.email) });
  }

  if (action === "archive_output") {
    const id = clean(body.id, 120);
    await env.DB.prepare(`UPDATE builder_outputs SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lower(email) = lower(?)`).bind(id, identity.email).run();
    return json({ archived: true });
  }

  // --- Draft Persistence / Resume Endpoints ---
  if (action === "get_draft") {
    const builderId = clean(body.builder_id, 120);
    const draft = await first(env.DB, `SELECT * FROM builder_runs WHERE lower(email) = lower(?) AND builder_id = ? AND status = 'draft'`, [identity.email, builderId]);
    return json({ draft });
  }

  if (action === "save_draft") {
    const builderId = clean(body.builder_id, 120);
    const builder = await first(env.DB, `SELECT * FROM experience_builders WHERE id = ?`, [builderId]);
    if (!builder) return json({ error: "Builder not found." }, 404);
    const summary = await tokenSummary(env.DB, identity.email);
    if (!summary.plan_active) return json({ error: "An active trial or paid subscription is required to save a draft." }, 402);
    const planCode = accessPlanCode(summary);
    const entitlement = await effectiveEntitlement(env.DB, planCode);
    if (!entitlement || !builderIncluded(builder, planCode)) return json({ error: "This builder is not included in your current plan." }, 403);
    await removeExpiredDrafts(env.DB, identity.email, entitlement.retentionDays);
    const answers = typeof body.answers === "string" ? body.answers : JSON.stringify(body.answers || {});
    const currentStep = Number(body.current_step || 0);

    const existing = await first(env.DB, `SELECT id FROM builder_runs WHERE lower(email) = lower(?) AND builder_id = ? AND status = 'draft'`, [identity.email, builderId]);
    if (existing) {
      await env.DB.prepare(`UPDATE builder_runs SET answers = ?, current_step = ?, last_saved_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(answers, currentStep, existing.id).run();
      return json({ saved: true, id: existing.id });
    } else {
      const count = await first(env.DB, `SELECT COUNT(*) AS count FROM builder_runs WHERE lower(email) = lower(?) AND status = 'draft'`, [identity.email]);
      if (Number(count?.count || 0) >= entitlement.draftLimit) {
        return json({ error: `Your plan includes up to ${entitlement.draftLimit} saved drafts. Delete an existing draft or upgrade to save another.`, code: "DRAFT_LIMIT_REACHED", entitlements: entitlement }, 409);
      }
      const newId = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO builder_runs (id, email, builder_id, answers, current_step, status, started_at, last_saved_at) VALUES (?, ?, ?, ?, ?, 'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).bind(newId, identity.email, builderId, answers, currentStep).run();
      return json({ saved: true, id: newId });
    }
  }

  if (action === "delete_draft") {
    const builderId = clean(body.builder_id, 120);
    await env.DB.prepare(`DELETE FROM builder_runs WHERE lower(email) = lower(?) AND builder_id = ? AND status = 'draft'`).bind(identity.email, builderId).run();
    return json({ deleted: true });
  }

  if (action === "delete_draft_by_id") {
    const runId = clean(body.id, 120);
    await env.DB.prepare(`DELETE FROM builder_runs WHERE lower(email) = lower(?) AND id = ?`).bind(identity.email, runId).run();
    return json({ deleted: true });
  }

  if (action === "save_output") {
    const builderId = clean(body.builder_id, 120);
    const builder = await first(env.DB, `SELECT * FROM experience_builders WHERE id = ?`, [builderId]);
    if (!builder) return json({ error: "Builder not found." }, 404);
    if (String(builder.status || "Active") !== "Active") {
      await blockAttempt(env.DB, identity.email, builder, "Builder is not active.", await tokenBalance(env.DB, identity.email), Number(builder.token_cost || 0));
      return json({ error: "This builder is not currently available." }, 403);
    }
    const summary = await tokenSummary(env.DB, identity.email);
    if (!summary.plan_active) {
      await blockAttempt(env.DB, identity.email, builder, "No active paid subscription or active trial.", summary.remaining_tokens, Number(builder.token_cost || 0));
      return json({ error: "An active trial or paid subscription is required before completing this builder.", token_summary: summary }, 402);
    }
    const accessCode = accessPlanCode(summary);
    if (!builderIncluded(builder, accessCode)) {
      await blockAttempt(env.DB, identity.email, builder, "Builder is not included in the active plan.", summary.remaining_tokens, Number(builder.token_cost || 0));
      return json({ error: "This builder is not included in your current plan.", token_summary: summary }, 403);
    }
    const cost = summary.unlimited_builder_use ? 0 : Math.max(0, Number(builder.token_cost || 0));
    if (summary.remaining_tokens < cost) {
      await blockAttempt(env.DB, identity.email, builder, "Insufficient Builder Usage Tokens.", summary.remaining_tokens, cost);
      return json({ error: "Not enough Builder Usage Tokens to complete this builder.", token_summary: summary }, 402);
    }
    if (summary.five_hour_limit !== null && summary.used_last_five_hours + cost > summary.five_hour_limit) {
      await blockAttempt(env.DB, identity.email, builder, "Rolling five-hour credit limit reached.", summary.remaining_tokens, cost);
      return json({ error: "You have reached your plan's rolling five-hour credit limit. Please try again later.", code: "FIVE_HOUR_CREDIT_LIMIT", token_summary: summary }, 429);
    }
    const requestId = clean(body.request_id, 120) || crypto.randomUUID();
    const existing = await first(env.DB, `SELECT * FROM builder_outputs WHERE lower(email) = lower(?) AND request_id = ?`, [identity.email, requestId]);
    if (existing) return json({ saved: true, output: existing, token_summary: await tokenSummary(env.DB, identity.email), duplicate: true });

    const outputId = crypto.randomUUID();
    const output = outputFromInput(builder, body);
    const balanceAfter = summary.remaining_tokens - cost;
    const statements = [env.DB.prepare(`INSERT INTO builder_outputs (id, email, builder_id, builder_name, title, token_cost, input_payload, output_payload, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      outputId, identity.email, builder.id, builder.name, output.title, cost, JSON.stringify(body.fields || {}), JSON.stringify(output), requestId
    )];
    if (cost > 0) {
      statements.push(env.DB.prepare(`INSERT INTO builder_token_ledger (id, email, amount, balance_after, source, reason, builder_output_id, builder_id, metadata) VALUES (?, ?, ?, ?, 'builder_usage', ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), identity.email, -cost, balanceAfter, `Completed ${builder.name}`, outputId, builder.id, JSON.stringify({ requestId })
      ));
    }
    statements.push(env.DB.prepare(`UPDATE experience_builders SET usage_count = COALESCE(usage_count, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(builder.id));

    // Clear associated draft on completion
    statements.push(env.DB.prepare(`DELETE FROM builder_runs WHERE lower(email) = lower(?) AND builder_id = ? AND status = 'draft'`).bind(identity.email, builderId));

    if (typeof env.DB.batch === "function") await env.DB.batch(statements);
    else for (const statement of statements) await statement.run();
    return json({ saved: true, output, output_id: outputId, token_summary: await tokenSummary(env.DB, identity.email) });
  }

  return json({ error: "Unknown action." }, 400);
}
