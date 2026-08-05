import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowRight, Building2, Check, ChevronDown, ChevronUp, Compass, Route, Sparkles, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFeatureConfig } from '@/lib/feature-config-context';
import { useAuth } from '@/lib/auth-context';
import { getAccountClassification } from '@/lib/account-type-client';
import type { AccountType } from '@/lib/account-entitlements';
import {
  INDIVIDUAL_PLAN_FEATURE_COMPARISON,
  PLANYX_SUBSCRIPTIONS,
  ORGANISATION_PLAN_FEATURE_COMPARISON,
  type ServicePlan,
} from '@/lib/service-plans';

const FAQS = [
  { q: 'Are these subscriptions?', a: 'Yes. Explore, Plan, Complete and Together are monthly subscriptions. Your account type is separate from the subscription you choose.' },
  { q: 'Can an organisation use Explore, Plan or Complete?', a: 'Yes. Organisations may use any of the four live plans. Explore, Plan and Complete include read-only itinerary sharing. Together also permits invited collaborators to edit.' },
  { q: 'Will entering a company name change an Individual account?', a: 'No. Sousa Murray Planeia only treats an account as an Organisation when the customer explicitly selects Organisation. A company name alone never mixes the two workspaces.' },
  { q: 'Who can edit a shared itinerary?', a: 'Only invited users on an Organisation account with the Together Plan may receive editing permission. Sharing under Explore, Plan and Complete is always read-only.' },
  { q: 'Does Sousa Murray Planeia make bookings?', a: 'No. Sousa Murray Planeia provides discovery and planning guidance. Third-party bookings, prices, availability, refunds and provider terms remain between you and the relevant provider.' },
];

function PlanCard({ plan, paymentsEnabled, audience, signedIn }: { plan: ServicePlan; paymentsEnabled: boolean; audience: AccountType; signedIn: boolean }) {
  const featured = Boolean(plan.is_featured);
  const href = `/create-checkout-session?plan=${encodeURIComponent(plan.id)}&accountType=${encodeURIComponent(audience)}`;
  const features = audience === 'organisation' ? plan.organisation_features : plan.individual_features;

  return (
    <article className={`relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${featured ? 'border-primary ring-2 ring-primary/15 bg-primary/[0.03]' : 'border-border bg-card'}`}>
      {featured && <Badge className="absolute -top-3 left-6 max-w-[calc(100%-3rem)]">Sousa Murray Planeia package</Badge>}
      <p className="mb-2 break-words text-xs font-bold uppercase tracking-wider text-primary">{audience === 'organisation' ? 'Organisation subscription' : 'Individual subscription'}</p>
      <h3 className="break-words text-xl font-bold leading-tight text-foreground">{plan.plan_name}</h3>
      <p className="mt-2 text-xs font-semibold text-emerald-600">30-day free trial</p>
      <div className="my-5 flex flex-wrap items-end gap-1"><span className="break-words text-4xl font-extrabold text-foreground">{plan.price_label}</span><span className="pb-1 text-sm text-muted-foreground">/month</span></div>
      <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-foreground">Included for {audience === 'organisation' ? 'organisations' : 'individuals'}</p>
      <ul className="mb-6 space-y-3 text-sm text-foreground">
        {features.map(feature => <li key={feature} className="flex min-w-0 items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><span className="min-w-0 break-words">{feature}</span></li>)}
      </ul>
      {paymentsEnabled ? (
        <a href={href} className="mt-auto block">
          <Button className="w-full gap-2 whitespace-normal">{signedIn ? (plan.button_label || 'Choose this subscription') : 'Create account to subscribe'} <ArrowRight className="h-4 w-4 shrink-0" /></Button>
        </a>
      ) : (
        <Button className="mt-auto w-full whitespace-normal" variant="secondary" disabled aria-disabled="true">Payments coming soon</Button>
      )}
    </article>
  );
}

export default function PricingPage() {
  const [plans, setPlans] = useState<ServicePlan[]>(PLANYX_SUBSCRIPTIONS);
  const [audience, setAudience] = useState<AccountType>('individual');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { config, isLoading: featureLoading } = useFeatureConfig();
  const paymentsEnabled = !featureLoading && config.payments;
  const cancelled = searchParams.get('payment') === 'cancelled' || searchParams.get('checkout') === 'cancelled';
  const paymentsDisabled = searchParams.get('payments') === 'disabled' || (!featureLoading && !config.payments);
  const checkoutUnavailable = searchParams.get('checkout') === 'unavailable' || searchParams.get('plan') === 'unavailable';
  const comparison = useMemo(() => audience === 'organisation' ? ORGANISATION_PLAN_FEATURE_COMPARISON : INDIVIDUAL_PLAN_FEATURE_COMPARISON, [audience]);

  useEffect(() => {
    if (!user) return;
    void getAccountClassification().then(classification => setAudience(classification.accountType));
  }, [user]);

  useEffect(() => {
    fetch('/plans-data', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Plan catalogue unavailable')))
      .then(data => {
        if (!Array.isArray(data.plans)) return;
        const recognised = new Set(PLANYX_SUBSCRIPTIONS.map(plan => plan.id));
        const current = data.plans.filter((plan: ServicePlan) => recognised.has(plan.id)).map((plan: ServicePlan) => {
          const defaults = PLANYX_SUBSCRIPTIONS.find(item => item.id === plan.id)!;
          return {
            ...defaults,
            ...plan,
            included_features: defaults.included_features,
            individual_features: defaults.individual_features,
            organisation_features: defaults.organisation_features,
          };
        });
        if (current.length) setPlans(current);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <Helmet>
        <title>Plans & Pricing | Sousa Murray Planeia</title>
        <meta name="description" content="Compare individual and organisation Sousa Murray Planeia subscriptions, including read-only and collaborative itinerary sharing." />
        <link rel="canonical" href="https://sousamurrayplaneia.jagroupservices.co.uk/pricing" />
      </Helmet>

      <main className="min-h-screen overflow-x-clip bg-background">
        <section className="border-b border-border bg-gradient-to-b from-primary/10 to-background px-4 py-20 text-center">
          <Badge variant="outline" className="mb-5">Sousa Murray Planeia plans</Badge>
          <h1 className="mx-auto max-w-4xl break-words text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">Plans for individuals and organisations</h1>
          <p className="mx-auto mt-5 max-w-2xl break-words text-lg leading-relaxed text-muted-foreground">Choose the account type first, then compare the exact features permitted under Explore, Plan, Complete and Together.</p>
        </section>

        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          {cancelled && <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">Checkout was cancelled. No payment was taken.</div>}
          {paymentsDisabled && <div className="mb-8 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900"><strong>Payments are coming soon.</strong> You can compare every subscription now, but checkout is temporarily switched off by Sousa Murray Planeia.</div>}
          {checkoutUnavailable && !paymentsDisabled && <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">Checkout is temporarily unavailable. No payment was taken. Please try again later or contact Sousa Murray Planeia.</div>}

          <section className="mx-auto mb-12 max-w-3xl" aria-labelledby="account-type-heading">
            <div className="text-center"><h2 id="account-type-heading" className="text-2xl font-bold text-foreground">Who will use this account?</h2><p className="mt-2 text-sm text-muted-foreground">This changes the workspace and permissions shown below. It does not rely on whether a company name is present.</p></div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <button type="button" onClick={() => setAudience('individual')} className={`min-w-0 rounded-2xl border-2 p-5 text-left transition ${audience === 'individual' ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'}`} aria-pressed={audience === 'individual'}>
                <User className="h-6 w-6 text-primary" /><h3 className="mt-3 font-bold text-foreground">Individual</h3><p className="mt-1 text-sm text-muted-foreground">A private personal workspace. Organisation tools and invited-user permissions remain hidden.</p>
              </button>
              <button type="button" onClick={() => setAudience('organisation')} className={`min-w-0 rounded-2xl border-2 p-5 text-left transition ${audience === 'organisation' ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'}`} aria-pressed={audience === 'organisation'}>
                <Building2 className="h-6 w-6 text-primary" /><h3 className="mt-3 font-bold text-foreground">Organisation</h3><p className="mt-1 text-sm text-muted-foreground">A separate business workspace. The first three plans share read-only; Together may allow editing.</p>
              </button>
            </div>
          </section>

          <section aria-labelledby="subscription-plans" className="mb-20">
            <div className="mb-9 text-center"><h2 id="subscription-plans" className="text-3xl font-bold text-foreground">{audience === 'organisation' ? 'Organisation subscriptions' : 'Individual subscriptions'}</h2><p className="mt-2 text-muted-foreground">Four clear options, billed monthly through secure Stripe checkout.</p></div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">{plans.map(plan => <PlanCard key={plan.id} plan={plan} paymentsEnabled={paymentsEnabled} audience={audience} signedIn={Boolean(user)} />)}</div>
          </section>

          <section aria-labelledby="feature-comparison" className="mb-20">
            <div className="mb-8 text-center"><Badge variant="outline" className="mb-3">Compare {audience} features</Badge><h2 id="feature-comparison" className="text-3xl font-bold text-foreground">Features included with each plan</h2><p className="mt-2 text-muted-foreground">The table only shows features relevant to the selected account type.</p></div>
            <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead><tr className="border-b border-border bg-muted/40"><th scope="col" className="sticky left-0 z-10 min-w-64 bg-muted px-5 py-4 font-semibold text-foreground">Feature</th>{plans.map(plan => <th key={plan.id} scope="col" className="min-w-36 px-4 py-4 text-center font-semibold text-foreground">{plan.plan_name}</th>)}</tr></thead>
                <tbody>{comparison.map((row, index) => <tr key={row.feature} className={index < comparison.length - 1 ? 'border-b border-border' : ''}><th scope="row" className="sticky left-0 z-10 bg-card px-5 py-4 font-medium text-foreground">{row.feature}</th>{plans.map(plan => { const value = row.values[plan.id] ?? false; return <td key={plan.id} className="px-4 py-4 text-center text-muted-foreground">{value === true ? <Check aria-label="Included" className="mx-auto h-5 w-5 text-emerald-500" /> : value === false ? <span aria-label="Not included" className="text-muted-foreground/40">—</span> : value}</td>; })}</tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="mb-20"><div className="mb-9 text-center"><Badge variant="outline" className="mb-3">Building your plan</Badge><h2 className="text-3xl font-bold text-foreground">What Sousa Murray Planeia helps you build</h2></div><div className="grid gap-5 md:grid-cols-3">{[
            { icon: Compass, title: 'Destination discovery', text: 'Turn early ideas, preferences and priorities into a focused destination direction.' },
            { icon: Route, title: 'Itinerary and experiences', text: 'Structure timings, experience ideas, practical checks and the steps needed before booking.' },
            { icon: Sparkles, title: 'Complete planning guidance', text: 'Bring discovery, itinerary thinking and practical planning guidance together in one complete package.' },
          ].map(item => <article key={item.title} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-6"><item.icon className="mb-4 h-6 w-6 text-primary" /><h3 className="break-words font-bold text-foreground">{item.title}</h3><p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">{item.text}</p></article>)}</div></section>

          <section className="mx-auto max-w-3xl"><h2 className="mb-7 text-center text-2xl font-bold text-foreground">Frequently asked questions</h2><div className="space-y-3">{FAQS.map((faq, index) => <div key={faq.q} className="overflow-hidden rounded-xl border border-border bg-card"><button type="button" onClick={() => setOpenFaq(openFaq === index ? null : index)} className="flex w-full min-w-0 items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-foreground"><span className="min-w-0 break-words">{faq.q}</span>{openFaq === index ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}</button>{openFaq === index && <p className="border-t border-border px-5 py-4 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>}</div>)}</div><div className="mt-10 text-center"><p className="mb-4 text-muted-foreground">Not sure which subscription fits?</p><Button asChild variant="outline"><Link to="/contact">Contact Sousa Murray Planeia <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div></section>
        </div>
      </main>
    </>
  );
}
