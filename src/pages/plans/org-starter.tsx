import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, X, Building2, ArrowLeft, AlertTriangle, Download, ShoppingCart } from 'lucide-react';
import { useState } from 'react';

const INCLUDED = [
  'Every guided planning builder',
  '2 user seats included',
  'Save up to 10 shared plans',
  'Plans retained for 30 days',
  'Shared organisation planning workspace',
  'Download, print and share plans',
  'Additional seats purchasable separately',
];

const NOT_INCLUDED = [
  'Audit history',
  'Shared workspace',
  'Advanced permissions',
  'Reporting tools',
];

export default function OrgStarterPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleCheckout() {
    if (!user) { navigate('/register?plan=org_starter'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: 'org_starter' }),
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
        <title>Organisation Starter Plan — Sousa Murray Planeia</title>
        <meta name="description" content="Organisation Starter: 2 user seats, all templates, 10 shared drafts, 30-day retention. £29.99/month." />
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link to="/pricing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Pricing
        </Link>

        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-extrabold text-foreground">Organisation Starter</h1>
              <Badge variant="secondary">£29.99/month</Badge>
            </div>
            <p className="text-muted-foreground">For small teams getting started with shared planning.</p>
          </div>
        </div>

        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">30-day saved-plan retention</p>
            <p>Up to 10 plans are shared across your organisation and retained for 30 days. Download anything you need to keep.</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-extrabold text-foreground">2</p>
            <p className="text-sm text-muted-foreground">User seats</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-extrabold text-foreground">10</p>
            <p className="text-sm text-muted-foreground">Shared drafts</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-extrabold text-foreground">30</p>
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

        {/* Additional seats */}
        <div className="flex items-start gap-3 bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6">
          <ShoppingCart className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
          <div className="text-sm text-purple-800">
            <p className="font-semibold mb-1">Need more than 2 users?</p>
            <p>Additional User, Manager, and Admin seats can be purchased separately from your account settings after subscribing.</p>
          </div>
        </div>

        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8">
          <Download className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">Export before your retention period ends</p>
            <p>Drafts are deleted after 30 days with no recovery. Export your PDFs as soon as documents are ready.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleCheckout} disabled={loading} className="flex-1">
            {loading ? 'Starting checkout…' : 'Get Started — £29.99/month'}
          </Button>
          <Button variant="outline" asChild className="flex-1">
            <Link to="/plans/org-growth">See Org Growth →</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
