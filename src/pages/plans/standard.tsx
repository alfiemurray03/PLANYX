import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, X, Zap, Lock, ArrowLeft, AlertTriangle, Download } from 'lucide-react';
import { useState } from 'react';

const INCLUDED = [
  'Expanded guided planning builder library',
  'Save up to 5 active plans',
  'Plans retained for 14 days',
  'Download, print and share plans',
];

const NOT_INCLUDED = [
  'Every advanced planning builder',
  'Organisation planning workspace',
  'Multi-user accounts',
];

export default function StandardPlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleCheckout() {
    if (!user) { navigate('/register?plan=standard'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: 'standard' }),
      });
      const data = await res.json() as { success: boolean; url?: string; error?: string };
      if (data.success && data.url) window.location.href = data.url;
      else alert(data.error ?? 'Unable to start checkout.');
    } catch { alert('Network error. Please try again.'); }
    finally { setLoading(false); }
  }

  return (
    <>
      <Helmet>
        <title>Standard Plan — Sousa Murray Planeia</title>
        <meta name="description" content="Expanded planning builders and up to 5 active plans for £7.99/month." />
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link to="/pricing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Pricing
        </Link>

        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Zap className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-extrabold text-foreground">Standard Plan</h1>
              <Badge variant="secondary">£7.99/month</Badge>
              <Badge className="bg-green-100 text-green-800 border-green-200">30-day free trial</Badge>
            </div>
            <p className="text-muted-foreground">For people who plan regularly and need more builder access.</p>
          </div>
        </div>

        {/* Draft retention notice */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">14-day saved-plan retention</p>
            <p>Saved plans are automatically deleted after 14 days. Download anything you need to keep.</p>
          </div>
        </div>

        {/* Key limits */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-extrabold text-foreground">5</p>
            <p className="text-sm text-muted-foreground">Saved drafts</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-extrabold text-foreground">14</p>
            <p className="text-sm text-muted-foreground">Days retention</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <h2 className="font-bold text-foreground mb-4">What's included</h2>
          <ul className="space-y-3">
            {INCLUDED.map(f => (
              <li key={f} className="flex items-start gap-3 text-sm text-foreground">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 mb-8">
          <h2 className="font-bold text-foreground mb-4">Not included</h2>
          <ul className="space-y-3">
            {NOT_INCLUDED.map(f => (
              <li key={f} className="flex items-start gap-3 text-sm text-muted-foreground">
                <X className="w-4 h-4 mt-0.5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Builder access */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-8">
          <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
            <Lock className="w-4 h-4 text-muted-foreground" /> Builder Access
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-4 h-4" /> Core builders
            </div>
            <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-4 h-4" /> Expanded builders
            </div>
            <div className="flex items-center gap-2 text-muted-foreground bg-muted rounded-lg px-3 py-2">
              <Lock className="w-4 h-4" /> Advanced builders
            </div>
            <div className="flex items-center gap-2 text-muted-foreground bg-muted rounded-lg px-3 py-2">
              <Lock className="w-4 h-4" /> Shared planning
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8">
          <Download className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">Download plans you need to keep</p>
            <p>Saved plans are deleted after 14 days. Download or print them before the retention period ends.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleCheckout} disabled={loading} className="flex-1">
            {loading ? 'Starting checkout…' : 'Start Free Trial — £7.99/month'}
          </Button>
          <Button variant="outline" asChild className="flex-1">
            <Link to="/plans/professional">See Professional →</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-3">30-day free trial. Cancel before the first payment.</p>
      </div>
    </>
  );
}
