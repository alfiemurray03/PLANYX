import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, X, Clock, ArrowLeft, AlertTriangle, Download } from 'lucide-react';
import { useState } from 'react';

const INCLUDED = [
  'Core guided planning builders',
  'Save up to 3 active plans',
  'Plans retained for 14 days',
  'Download, print and share plans',
];

const NOT_INCLUDED = [
  'Advanced planning builders',
  'Organisation planning workspace',
  'Multi-user accounts',
];

export default function PersonalPlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleCheckout() {
    if (!user) { navigate('/register?plan=personal'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: 'personal' }),
      });
      const data = await res.json() as { success: boolean; url?: string; error?: string };
      if (data.success && data.url) window.location.href = data.url;
      else alert(data.error ?? 'Unable to start checkout.');
    } catch { alert('Network error. Please try again.'); }
    finally { setLoading(false); }
  }

  const isCurrent = user?.plan === 'personal';

  return (
    <>
      <Helmet>
        <title>Personal Plan — £5.99/month | Sousa Murray Planeia</title>
        <meta name="description" content="Core planning builders and up to 3 active plans for £5.99/month." />
      </Helmet>

      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link to="/pricing" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Pricing
        </Link>

        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
            <Clock className="w-7 h-7 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-bold text-foreground">Personal</h1>
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">Best Value</Badge>
            </div>
            <p className="text-muted-foreground">For individuals who want core builders and saved plans.</p>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-foreground">£5.99</span>
              <span className="text-muted-foreground">/month</span>
              <span className="ml-2 text-sm text-emerald-600 font-medium">30-day free trial</span>
            </div>
          </div>
        </div>

        {/* Trial notice */}
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-6">
          <AlertTriangle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-800">
            <strong>30-day free trial.</strong> Your first monthly payment is collected after the trial. Cancel before it ends and you won't be charged.
          </p>
        </div>

        {/* CTA */}
        <div className="mb-8">
          {isCurrent ? (
            <Button size="lg" className="w-full" disabled>You're on the Personal plan</Button>
          ) : (
            <Button size="lg" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCheckout} disabled={loading}>
              {loading ? 'Redirecting…' : 'Start Free Trial — £5.99/month'}
            </Button>
          )}
          <p className="text-xs text-muted-foreground text-center mt-2">
            Billed monthly. Cancel any time from account settings.
          </p>
        </div>

        {/* What's included */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <h2 className="text-base font-semibold text-foreground mb-4">What's included</h2>
          <ul className="space-y-3">
            {INCLUDED.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                <span className="text-foreground">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Not included */}
        <div className="bg-muted/40 border border-border rounded-2xl p-6 mb-8">
          <h2 className="text-base font-semibold text-muted-foreground mb-4">Not included</h2>
          <ul className="space-y-3">
            {NOT_INCLUDED.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm">
                <X className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                <span className="text-muted-foreground">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Draft warning */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-8">
          <Download className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Download plans you need to keep</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Saved plans are retained for 14 days. Download or print anything you need to keep before it is deleted.
            </p>
          </div>
        </div>

        {/* Upgrade nudge */}
        <div className="text-center text-sm text-muted-foreground">
          Need more active plans or advanced builders?{' '}
          <Link to="/plans/standard" className="text-primary font-medium hover:underline">See Standard (£7.99/mo)</Link>
          {' '}or{' '}
          <Link to="/plans/professional" className="text-primary font-medium hover:underline">Professional (£14.99/mo)</Link>
        </div>
      </div>
    </>
  );
}
