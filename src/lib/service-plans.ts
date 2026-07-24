export interface ServicePlan {
  id: string;
  plan_name: string;
  plan_type: string;
  price_label: string;
  price_pence: number;
  delivery_time: string;
  revisions: string;
  description: string;
  button_label: string;
  is_active: number;
  is_featured: number;
  payment_available?: boolean;
  included_features: string[];
  individual_features: string[];
  organisation_features: string[];
}

export type PlanFeatureValue = string | boolean;
export interface PlanFeatureRow { feature: string; values: Record<string, PlanFeatureValue> }

export function planBaseId(planId: string) {
  return planId.replace(/^business_/, '');
}

export function isBusinessPlan(plan: Pick<ServicePlan, 'id' | 'plan_type'>) {
  return plan.id.startsWith('business_') || plan.plan_type.toLowerCase().includes('business');
}

const COMMON_ROWS: PlanFeatureRow[] = [
  { feature: 'Monthly price', values: { personal: '£5.99', standard: '£7.99', professional: '£14.99', org_starter: '£39.99' } },
  { feature: '30-day free trial', values: { personal: true, standard: true, professional: true, org_starter: true } },
  { feature: 'Credits each billing period', values: { personal: '350,000', standard: '750,000', professional: '1,500,000', org_starter: 'Unlimited' } },
  { feature: 'Rolling five-hour limit', values: { personal: '150,000', standard: '300,000', professional: '600,000', org_starter: 'Unlimited' } },
  { feature: 'Planning builders', values: { personal: 'Essential collection', standard: 'All published', professional: 'All published', org_starter: 'All published' } },
  { feature: 'Travel Itinerary Builder', values: { personal: false, standard: true, professional: true, org_starter: true } },
  { feature: 'Accessibility planning suite', values: { personal: false, standard: true, professional: true, org_starter: true } },
  { feature: 'Saved drafts', values: { personal: 'Up to 3', standard: 'Up to 5', professional: 'Up to 10', org_starter: 'Up to 10' } },
  { feature: 'Draft retention', values: { personal: '14 days', standard: '14 days', professional: '30 days', org_starter: '30 days' } },
];

export const INDIVIDUAL_PLAN_FEATURE_COMPARISON: PlanFeatureRow[] = [
  ...COMMON_ROWS,
  { feature: 'Account type', values: { personal: 'Individual', standard: 'Individual', professional: 'Individual', org_starter: 'Individual' } },
  { feature: 'Private individual workspace', values: { personal: true, standard: true, professional: true, org_starter: true } },
  { feature: 'Personal plans separated from organisations', values: { personal: true, standard: true, professional: true, org_starter: true } },
  { feature: 'Organisation controls', values: { personal: false, standard: false, professional: false, org_starter: false } },
  { feature: 'Share owned itineraries', values: { personal: false, standard: false, professional: false, org_starter: false } },
  { feature: 'Received business itineraries kept under Shared with me', values: { personal: true, standard: true, professional: true, org_starter: true } },
  { feature: 'Organisation member workspace', values: { personal: false, standard: false, professional: false, org_starter: false } },
];

export const ORGANISATION_PLAN_FEATURE_COMPARISON: PlanFeatureRow[] = [
  ...COMMON_ROWS,
  { feature: 'Account type', values: { personal: 'Organisation', standard: 'Organisation', professional: 'Organisation', org_starter: 'Organisation' } },
  { feature: 'Separate organisation workspace', values: { personal: true, standard: true, professional: true, org_starter: true } },
  { feature: 'Business plans separated from personal accounts', values: { personal: true, standard: true, professional: true, org_starter: true } },
  { feature: 'Share completed itineraries', values: { personal: true, standard: true, professional: true, org_starter: true } },
  { feature: 'Maximum invited-user permission', values: { personal: 'Read-only', standard: 'Read-only', professional: 'Read-only', org_starter: 'Read-only or edit' } },
  { feature: 'Invited users can edit', values: { personal: false, standard: false, professional: false, org_starter: true } },
  { feature: 'Recipient must sign in with invited email', values: { personal: true, standard: true, professional: true, org_starter: true } },
  { feature: 'Review and revoke invitations', values: { personal: true, standard: true, professional: true, org_starter: true } },
  { feature: 'Permissions rechecked when opened', values: { personal: true, standard: true, professional: true, org_starter: true } },
  { feature: 'Organisation member workspace', values: { personal: false, standard: false, professional: false, org_starter: true } },
];

export const PLAN_FEATURE_COMPARISON = INDIVIDUAL_PLAN_FEATURE_COMPARISON;

export const STANDARD_PLANYX_SUBSCRIPTIONS: ServicePlan[] = [
  {
    id: 'personal', plan_name: 'Explore Plan', plan_type: 'Standard monthly subscription', price_label: '£5.99', price_pence: 599,
    delivery_time: 'Essential planning builders', revisions: 'Save and revisit your plans',
    description: 'A simple starting point for exploring ideas and building clear, practical plans.', button_label: 'Start 30-day free trial', is_active: 1, is_featured: 0,
    included_features: ['30-day free trial', '350,000 credits per billing period', 'Essential planning builders', 'Up to 3 saved drafts', '14-day retention'],
    individual_features: ['Private Individual workspace', 'Personal plans separated from organisations', '350,000 credits', 'Essential planning builders', 'Up to 3 saved drafts', '14-day retention'],
    organisation_features: [],
  },
  {
    id: 'standard', plan_name: 'Plan Plan', plan_type: 'Standard monthly subscription', price_label: '£7.99', price_pence: 799,
    delivery_time: 'More builders and planning tools', revisions: 'Download your finished plans',
    description: 'For regularly creating detailed destination, itinerary, experience and everyday plans.', button_label: 'Start 30-day free trial', is_active: 1, is_featured: 1,
    included_features: ['30-day free trial', '750,000 credits per billing period', 'All published builders', 'Travel Itinerary Builder', 'Up to 5 saved drafts', '14-day retention'],
    individual_features: ['Private Individual workspace', 'Personal plans separated from organisations', '750,000 credits', 'All published builders', 'Travel and accessibility planning', 'Up to 5 saved drafts'],
    organisation_features: [],
  },
  {
    id: 'professional', plan_name: 'Complete Plan', plan_type: 'Standard monthly subscription', price_label: '£14.99', price_pence: 1499,
    delivery_time: 'Full planning-builder access', revisions: 'Enhanced planning and outputs',
    description: 'Complete access for building and managing more comprehensive personalised plans.', button_label: 'Start 30-day free trial', is_active: 1, is_featured: 0,
    included_features: ['30-day free trial', '1,500,000 credits per billing period', 'All published builders', 'Up to 10 saved drafts', '30-day retention'],
    individual_features: ['Private Individual workspace', 'Personal plans separated from organisations', '1,500,000 credits', 'All published builders', 'Complete individual access', 'Up to 10 saved drafts'],
    organisation_features: [],
  },
  {
    id: 'org_starter', plan_name: 'Together Plan', plan_type: 'Standard monthly subscription', price_label: '£39.99', price_pence: 3999,
    delivery_time: 'High-capacity personal planning', revisions: 'All builders and unlimited use',
    description: 'High-capacity private planning for households and individuals who do not need an organisation workspace.', button_label: 'Start 30-day free trial', is_active: 1, is_featured: 0,
    included_features: ['30-day free trial', 'All published builders', 'Unlimited builder use', 'Up to 10 saved drafts', '30-day retention'],
    individual_features: ['Private Individual workspace', 'Personal plans separated from organisations', 'Unlimited builder use', 'All published builders', 'Up to 10 saved drafts', 'No business controls'],
    organisation_features: [],
  },
];

export const BUSINESS_PLANYX_SUBSCRIPTIONS: ServicePlan[] = [
  {
    id: 'business_personal', plan_name: 'Explore Plan', plan_type: 'Business monthly subscription', price_label: '£5.99', price_pence: 599,
    delivery_time: 'Essential business planning builders', revisions: 'Read-only itinerary sharing',
    description: 'For small businesses and organisations that need core planning tools and a separate organisation workspace.', button_label: 'Start 30-day free trial', is_active: 1, is_featured: 0,
    included_features: ['30-day free trial', '350,000 credits per billing period', 'Separate organisation workspace', 'Read-only itinerary sharing'],
    individual_features: [],
    organisation_features: ['Separate Organisation workspace', 'Business plans separated from personal accounts', '350,000 credits', 'Essential planning builders', 'Share completed itineraries', 'Read-only invited access', 'Signed-in invited email required'],
  },
  {
    id: 'business_standard', plan_name: 'Plan Plan', plan_type: 'Business monthly subscription', price_label: '£7.99', price_pence: 799,
    delivery_time: 'Expanded business planning builders', revisions: 'Read-only itinerary sharing',
    description: 'For organisations that need a wider range of guided builders and regular read-only sharing.', button_label: 'Start 30-day free trial', is_active: 1, is_featured: 1,
    included_features: ['30-day free trial', '750,000 credits per billing period', 'All published builders', 'Separate organisation workspace', 'Read-only itinerary sharing'],
    individual_features: [],
    organisation_features: ['Separate Organisation workspace', 'Business plans separated from personal accounts', '750,000 credits', 'All published builders', 'Share completed itineraries', 'Read-only invited access', 'Signed-in invited email required'],
  },
  {
    id: 'business_professional', plan_name: 'Complete Plan', plan_type: 'Business monthly subscription', price_label: '£14.99', price_pence: 1499,
    delivery_time: 'Complete business planning access', revisions: 'Advanced tools and read-only sharing',
    description: 'For organisations that need full planning-builder access, advanced planning tools and read-only sharing.', button_label: 'Start 30-day free trial', is_active: 1, is_featured: 0,
    included_features: ['30-day free trial', '1,500,000 credits per billing period', 'All published builders', 'Separate organisation workspace', 'Read-only itinerary sharing'],
    individual_features: [],
    organisation_features: ['Separate Organisation workspace', 'Business plans separated from personal accounts', '1,500,000 credits', 'All published builders', 'Complete business planning access', 'Share completed itineraries', 'Read-only invited access'],
  },
  {
    id: 'business_org_starter', plan_name: 'Together Plan', plan_type: 'Business monthly subscription', price_label: '£39.99', price_pence: 3999,
    delivery_time: 'Shared planning for teams', revisions: 'Invited editing and member workspace',
    description: 'For businesses, teams and organisations that need shared planning, invited editing and member administration.', button_label: 'Start 30-day free trial', is_active: 1, is_featured: 0,
    included_features: ['30-day free trial', 'Unlimited builder use', 'All published builders', 'Invited editing', 'Organisation member workspace'],
    individual_features: [],
    organisation_features: ['Separate Organisation workspace', 'Business plans separated from personal accounts', 'Unlimited builder use', 'All published builders', 'Invite read-only viewers', 'Invite collaborators who can edit', 'Organisation member workspace', 'Review and revoke invitations'],
  },
];

export const PLANYX_SUBSCRIPTIONS: ServicePlan[] = [
  ...STANDARD_PLANYX_SUBSCRIPTIONS,
  ...BUSINESS_PLANYX_SUBSCRIPTIONS,
];
