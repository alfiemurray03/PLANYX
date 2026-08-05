import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2, Building2, ArrowRight, ArrowLeft,
  Users, ShieldCheck, BarChart2, ClipboardList, Loader2,
} from 'lucide-react';

const INCLUDED = [
  'Everything in Professional',
  'Multiple user accounts',
  'Role-based permissions',
  'Administration dashboard',
  'Audit logs & activity reporting',
  'Organisation-wide settings',
  'Team management tools',
  'Usage reporting & analytics',
  'Dedicated account manager',
  'Priority support',
  'Every guided planning builder',
  'Unlimited plan creation',
  'Download, print and share plans',
];

const HIGHLIGHTS = [
  {
    icon: Users,
    title: 'Multiple user accounts',
    description: 'Add team members to your organisation account. Each user gets their own login and document workspace.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-based permissions',
    description: 'Control what each team member can access. Assign admin, editor, or viewer roles to manage access securely.',
  },
  {
    icon: BarChart2,
    title: 'Usage reporting',
    description: 'See how your team is using the platform — plans created, builders used, and activity over time.',
  },
  {
    icon: ClipboardList,
    title: 'Audit logs',
    description: 'Full audit trail of all activity across your organisation account — who did what and when.',
  },
];

const USE_CASES = [
  {
    title: 'Law firms',
    description: 'Multiple fee earners creating client documents with consistent branding and full audit trails.',
  },
  {
    title: 'Accountancy practices',
    description: 'Teams creating engagement letters, reports, and client communications at scale.',
  },
  {
    title: 'HR departments',
    description: 'HR teams generating contracts, policies, and employee documents with role-based access control.',
  },
  {
    title: 'Property agencies',
    description: 'Teams coordinating destinations, bookings, accessibility needs and shared plans.',
  },
];

export default function OrganisationPlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const isCurrent = user?.plan === 'org_starter' || user?.plan === 'org_growth' || user?.plan === 'org_professional';

  async function startCheckout() {
    if (!user) { navigate('/register?plan=organisation'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: 'organisation' }),
      });
      const data = await res.json() as { success: boolean; url?: string; error?: string };
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? 'Unable to start checkout. Please try again.');
        setLoading(false);
      }
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <>
      <Helmet>
        <title>Organisation Plan — Sousa Murray Planeia</title>
        <meta name="description" content="Sousa Murray Planeia Organisation plan — £39.99/month. Multiple users, role permissions, admin dashboard, audit logs, and usage reporting for teams." />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">

          {/* Back */}
          <Link to="/pricing" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to all plans
          </Link>

          {/* Hero */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-extrabold text-foreground">Organisation Plan</h1>
                  {isCurrent && (
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] mt-0.5">Your current plan</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-extrabold text-foreground">£39.99</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="text-muted-foreground max-w-md">
                For teams and organisations that need multiple user accounts, role-based access control, and full administrative oversight.
              </p>
            </div>
            <div className="shrink-0 space-y-2">
              {isCurrent ? (
                <Button size="lg" variant="outline" disabled className="min-w-[200px]">Current Plan</Button>
              ) : (
                <>
                  <Button size="lg" className="min-w-[200px]" disabled={loading} onClick={startCheckout}>
                    {loading
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Redirecting…</>
                      : <>Get Started <ArrowRight className="w-4 h-4 ml-1.5" /></>}
                  </Button>
                  <p className="text-[11px] text-center text-muted-foreground">Billed monthly · Cancel anytime</p>
                </>
              )}
              {error && <p className="text-xs text-destructive text-center">{error}</p>}
            </div>
          </div>

          {/* Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {HIGHLIGHTS.map((h) => {
              const Icon = h.icon;
              return (
                <div key={h.title} className="bg-card border border-border rounded-2xl p-5 space-y-2">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-purple-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{h.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{h.description}</p>
                </div>
              );
            })}
          </div>

          {/* Features */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-foreground">Everything included</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              {INCLUDED.map((f) => (
                <div key={f} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span className="text-foreground">{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Use cases */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-foreground">Who it's for</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {USE_CASES.map((uc) => (
                <div key={uc.title} className="bg-card border border-border rounded-2xl p-5 space-y-1.5">
                  <h3 className="text-sm font-semibold text-foreground">{uc.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{uc.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Compare down */}
          <div className="bg-muted/40 border border-border rounded-2xl p-6 space-y-3">
            <h2 className="text-base font-bold text-foreground">Not sure if Organisation is right for you?</h2>
            <p className="text-sm text-muted-foreground">
              If you're a solo user or small team without a need for multi-user access, the Professional plan at £14.99/month may be a better fit.
            </p>
            <Link to="/plans/professional" className="text-sm text-primary font-semibold hover:underline flex items-center gap-1">
              See Professional plan <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* CTA */}
          <div className="bg-purple-600 text-white rounded-2xl p-8 text-center space-y-4">
            <h2 className="text-xl font-bold">Get your team started today</h2>
            <p className="text-sm text-purple-100 max-w-md mx-auto">
              Set up your organisation account, invite your team, and start coordinating shared plans together.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {isCurrent ? (
                <Button size="lg" variant="secondary" disabled>Current Plan</Button>
              ) : (
                <Button size="lg" variant="secondary" disabled={loading} onClick={startCheckout}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Get Started <ArrowRight className="w-4 h-4 ml-1.5" /></>}
                </Button>
              )}
              <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10" asChild>
                <Link to="/pricing">Compare all plans</Link>
              </Button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
