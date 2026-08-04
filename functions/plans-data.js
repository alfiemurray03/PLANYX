const DEFAULT_PLANS = [
  ["personal", "Explore Plan", "Standard monthly subscription", "£5.99", 599, "prod_UtkvP5dvxrwLNa", "price_1TtxPrDZzb3r6Q3cIViE64O4", "Essential planning builders", "Save and revisit your plans", "A simple starting point for exploring ideas and building clear, practical plans.", "Start 30-day free trial", 1, 0, 10],
  ["standard", "Plan Plan", "Standard monthly subscription", "£7.99", 799, "prod_UtkvpswzvV53y7", "price_1TtxPyDZzb3r6Q3cg9hcgXeA", "More builders and planning tools", "Download your finished plans", "For regularly creating detailed destination, itinerary, experience and everyday plans.", "Start 30-day free trial", 1, 1, 20],
  ["professional", "Complete Plan", "Standard monthly subscription", "£14.99", 1499, "prod_Utkv85XaRxReja", "price_1TtxQ5DZzb3r6Q3c0XxvHRDY", "Full planning-builder access", "Enhanced planning and outputs", "Complete access for building and managing more comprehensive personalised plans.", "Start 30-day free trial", 1, 0, 30],
  ["org_starter", "Together Plan", "Standard monthly subscription", "£39.99", 3999, "prod_Utkwas33GBC6Yn", "price_1TtxQDDZzb3r6Q3cI8rCEJwJ", "High-capacity personal planning", "All builders and unlimited use", "High-capacity private planning for households and individuals who do not need an organisation workspace.", "Start 30-day free trial", 1, 0, 40],
  ["business_personal", "Explore Plan", "Business monthly subscription", "£5.99", 599, "prod_Uwgus0xRHwgrlj", "price_1TwnWFDZzb3r6Q3c0SKHckVo", "Essential business planning builders", "Read-only itinerary sharing", "For small businesses and organisations that need core planning tools and a separate organisation workspace.", "Start 30-day free trial", 1, 0, 110],
  ["business_standard", "Plan Plan", "Business monthly subscription", "£7.99", 799, "prod_UwgunfLOeoBA9V", "price_1TwnWVDZzb3r6Q3caG24V63l", "Expanded business planning builders", "Read-only itinerary sharing", "For organisations that need a wider range of guided builders and regular read-only sharing.", "Start 30-day free trial", 1, 1, 120],
  ["business_professional", "Complete Plan", "Business monthly subscription", "£14.99", 1499, "prod_UwgujYPsJYBj1F", "price_1TwnWjDZzb3r6Q3crQKwr2bw", "Complete business planning access", "Advanced tools and read-only sharing", "For organisations that need full planning-builder access, advanced planning tools and read-only sharing.", "Start 30-day free trial", 1, 0, 130],
  ["business_org_starter", "Together Plan", "Business monthly subscription", "£39.99", 3999, "prod_Uwgu4EVCfy4wKb", "price_1TwnWxDZzb3r6Q3cxqCPgI3o", "Shared planning for teams", "Invited editing and member workspace", "For businesses, teams and organisations that need shared planning, invited editing and member administration.", "Start 30-day free trial", 1, 0, 140]
];

export async function onRequestGet({ env }) {
  const fallback = defaultPlanPayload();
  if (!env.DB) return json({ plans: fallback, source: "code" });

  try {
    const result = await env.DB.prepare(`
      SELECT id, plan_name, plan_type, price_label, price_pence, delivery_time, revisions,
        description, button_label, is_active, is_featured, sort_order,
        CASE WHEN stripe_price_id IS NOT NULL AND stripe_price_id != '' THEN 1 ELSE 0 END AS has_stripe_price
      FROM service_plans
      ORDER BY sort_order ASC, plan_name ASC
    `).all();

    const rows = result.results || [];
    const plans = rows.map((plan) => ({
      ...plan,
      is_active: Number(plan.is_active || 0),
      is_featured: Number(plan.is_featured || 0),
      catalogue: String(plan.id || "").startsWith("business_") ? "business" : "standard",
      payment_available: Number(plan.is_active || 0) === 1 && Number(plan.has_stripe_price || 0) === 1
    }));

    return json({ plans: rows.length ? plans : fallback, source: rows.length ? "database-overrides" : "code" });
  } catch (error) {
    console.error("Plan catalogue read failed:", error instanceof Error ? error.message : String(error));
    return json({ plans: fallback, source: "code-fallback" });
  }
}

function defaultPlanPayload() {
  return DEFAULT_PLANS.map((plan) => ({
    id: plan[0], plan_name: plan[1], plan_type: plan[2], price_label: plan[3], price_pence: plan[4],
    delivery_time: plan[7], revisions: plan[8], description: plan[9], button_label: plan[10],
    is_active: plan[11], is_featured: plan[12], sort_order: plan[13],
    catalogue: String(plan[0]).startsWith("business_") ? "business" : "standard",
    payment_available: Boolean(plan[6]) && Number(plan[11]) === 1
  }));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
      "X-Planyx-Plan-Catalogue": "code-first"
    }
  });
}
