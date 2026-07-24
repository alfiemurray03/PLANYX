import { useEffect, useMemo, useState } from 'react';
import { Building2, Check, Clock3, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFeatureConfig } from '@/lib/feature-config-context';
import {
  INDIVIDUAL_PLAN_FEATURE_COMPARISON,
  PLANYX_SUBSCRIPTIONS,
  ORGANISATION_PLAN_FEATURE_COMPARISON,
  isBusinessPlan,
  planBaseId,
  type PlanFeatureRow,
  type ServicePlan,
} from '@/lib/service-plans';

type Audience = 'individual' | 'organisation';

type PublicPlansResponse = {
  plans?: Array<Partial<ServicePlan> & Pick<ServicePlan, 'id' | 'plan_name'>>;
};

function hydratePlan(plan: PublicPlansResponse['plans'][number]): ServicePlan {
  const fallback = PLANYX_SUBSCRIPTIONS.find(item => item.id === plan.id)
    || PLANYX_SUBSCRIPTIONS.find(item => planBaseId(item.id) === planBaseId(plan.id));
  return {
    ...(fallback || PLANYX_SUBSCRIPTIONS[0]),
    ...plan,
    id: plan.id,
    plan_name: plan.plan_name,
    price_pence: Number(plan.price_pence ?? fallback?.price_pence ?? 0),
    is_active: Number(plan.is_active ?? fallback?.is_active ?? 0),
    is_featured: Number(plan.is_featured ?? fallback?.is_featured ?? 0),
    payment_available: Boolean(plan.payment_available),
    included_features: fallback?.included_features || [],
    individual_features: fallback?.individual_features || [],
    organisation_features: fallback?.organisation_features || [],
  };
}

function PlanCard({ plan, audience, payments }: { plan: ServicePlan; audience: Audience; payments: boolean }) {
  const business = audience === 'organisation';
  const features = business ? plan.organisation_features : plan.individual_features;
  const active = Number(plan.is_active || 0) === 1;
  const checkoutReady = active && payments && Boolean(plan.payment_available);
  const checkout = `/create-checkout-session?plan=${encodeURIComponent(plan.id)}&accountType=${audience}`;

  return (
    <article className={`flex min-w-0 flex-col rounded-2xl border bg-card p-5 shadow-sm ${plan.is_featured ? 'border-primary ring-2 ring-primary/15' : 'border-border'} ${active ? '' : 'opacity-90'}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">{business ? 'Business plan' : 'Standard plan'}</p>
        {!active ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"><Clock3 className="h-3 w-3" />Coming soon</span> : null}
      </div>
      <h3 className="mt-1 break-words text-xl font-bold text-foreground">{plan.plan_name}</h3>
      <p className="mt-3 text-3xl font-extrabold text-foreground">{plan.price_label}<span className="ml-1 text-sm font-normal text-muted-foreground">/month</span></p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
      <ul className="my-5 space-y-2 text-sm text-foreground">
        {features.map(feature => <li key={feature} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><span className="break-words">{feature}</span></li>)}
      </ul>
      {checkoutReady ? (
        <a className="mt-auto block" href={checkout}><Button className="w-full whitespace-normal">Choose {business ? 'Business' : 'Standard'} {plan.plan_name}</Button></a>
      ) : (
        <Button className="mt-auto w-full" variant="secondary" disabled>{active && !payments ? 'Payments coming soon' : 'Coming soon'}</Button>
      )}
    </article>
  );
}

function Comparison({ title, rows, plans }: { title: string; rows: PlanFeatureRow[]; plans: ServicePlan[] }) {
  return (
    <div className="mt-8">
      <h3 className="mb-4 text-xl font-bold text-foreground">{title} comparison</h3>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead><tr className="border-b border-border bg-muted/50"><th className="sticky left-0 bg-muted px-5 py-4 text-left">Feature</th>{plans.map(plan => <th key={plan.id} className="px-4 py-4 text-center">{plan.plan_name}<span className="block text-xs font-normal text-muted-foreground">{plan.price_label}/month</span>{!plan.is_active ? <span className="mt-1 block text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">Coming soon</span> : null}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.feature} className="border-b border-border last:border-0"><th className="sticky left-0 bg-card px-5 py-4 text-left font-medium">{row.feature}</th>{plans.map(plan => { const value = row.feature === 'Monthly price' ? plan.price_label : row.values[planBaseId(plan.id)] ?? false; return <td key={plan.id} className="px-4 py-4 text-center text-muted-foreground">{value === true ? <Check className="mx-auto h-5 w-5 text-emerald-500" /> : value === false ? '—' : value}</td>; })}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function Family({ audience, compare, plans, loading }: { audience: Audience; compare: boolean; plans: ServicePlan[]; loading: boolean }) {
  const business = audience === 'organisation';
  const Icon = business ? Building2 : User;
  const { config, isLoading } = useFeatureConfig();

  return (
    <section id={business ? 'business-plans' : 'standard-plans'} className="scroll-mt-24">
      <div className="mb-6 flex items-start gap-4 rounded-2xl border border-border bg-muted/30 p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
        <div><h2 className="text-2xl font-bold text-foreground">{business ? 'Business Plans' : 'Standard Plans'}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{business ? 'For businesses and organisations. Explore, Plan and Complete allow read-only itinerary sharing. Together also allows invited editing and the organisation member workspace.' : 'For individual customers. These plans use a private personal workspace without business sharing or organisation member controls.'}</p><p className="mt-2 text-xs font-semibold text-primary">Each range has its own Stripe products, prices and Admin Centre controls.</p></div>
      </div>
      {loading ? <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(item => <div key={item} className="h-96 animate-pulse rounded-2xl border border-border bg-muted/40" />)}</div> : <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">{plans.map(plan => <PlanCard key={plan.id} plan={plan} audience={audience} payments={!isLoading && config.payments} />)}</div>}
      {compare && !loading ? <Comparison title={business ? 'Business Plans' : 'Standard Plans'} rows={business ? ORGANISATION_PLAN_FEATURE_COMPARISON : INDIVIDUAL_PLAN_FEATURE_COMPARISON} plans={plans} /> : null}
    </section>
  );
}

export default function StandardBusinessPlans({ comparisons = true }: { comparisons?: boolean }) {
  const [plans, setPlans] = useState<ServicePlan[]>(PLANYX_SUBSCRIPTIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/plans', { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as PublicPlansResponse;
        if (!response.ok || !Array.isArray(data.plans)) throw new Error('Plan catalogue unavailable');
        return data.plans.map(hydratePlan);
      })
      .then(next => { if (active) setPlans(next); })
      .catch(() => { if (active) setPlans(PLANYX_SUBSCRIPTIONS); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const standardPlans = useMemo(() => plans.filter(plan => !isBusinessPlan(plan)), [plans]);
  const businessPlans = useMemo(() => plans.filter(plan => isBusinessPlan(plan)), [plans]);

  return <div className="mx-auto w-full max-w-7xl space-y-16"><nav className="grid gap-3 sm:grid-cols-2" aria-label="Plan ranges"><a href="#standard-plans" className="rounded-xl border border-border bg-card p-4 font-semibold text-foreground">Standard Plans<span className="block text-sm font-normal text-muted-foreground">Individual customers</span></a><a href="#business-plans" className="rounded-xl border border-border bg-card p-4 font-semibold text-foreground">Business Plans<span className="block text-sm font-normal text-muted-foreground">Businesses and organisations</span></a></nav><Family audience="individual" compare={comparisons} plans={standardPlans} loading={loading} /><Family audience="organisation" compare={comparisons} plans={businessPlans} loading={loading} /></div>;
}
