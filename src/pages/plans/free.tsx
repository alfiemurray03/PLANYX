import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, X, FileText, Download, Lock, ArrowLeft, AlertTriangle } from 'lucide-react';

const INCLUDED = [
  'Browse every Sousa Murray Planeia builder',
  'Try 1 guided planning builder',
  'Preview your personalised plan',
];

const NOT_INCLUDED = [
  'Save plans within the platform',
  'Full planning builder access',
  'Organisation planning workspace',
];

export default function FreePlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Free Plan — Sousa Murray Planeia</title>
        <meta name="description" content="Try one Sousa Murray Planeia guided planning builder at no cost." />
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link to="/pricing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Pricing
        </Link>

        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6 text-slate-500" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-extrabold text-foreground">Free Plan</h1>
              <Badge variant="secondary">£0 forever</Badge>
            </div>
            <p className="text-muted-foreground">Try guided planning with no subscription.</p>
          </div>
        </div>

        {/* Retention notice */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">No saved plans on the Free plan</p>
            <p>The Free plan is a builder preview. Upgrade if you want to save and return to plans.</p>
          </div>
        </div>

        {/* What's included */}
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

        {/* Not included */}
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
          <p className="text-sm text-muted-foreground mb-4">
            Free plan users can browse every planning builder and try one guided builder before upgrading.
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-4 h-4" /> 1 guided builder demo
            </div>
            <div className="flex items-center gap-2 text-muted-foreground bg-muted rounded-lg px-3 py-2">
              <Lock className="w-4 h-4" /> Core builder library
            </div>
            <div className="flex items-center gap-2 text-muted-foreground bg-muted rounded-lg px-3 py-2">
              <Lock className="w-4 h-4" /> Advanced builders
            </div>
            <div className="flex items-center gap-2 text-muted-foreground bg-muted rounded-lg px-3 py-2">
              <Lock className="w-4 h-4" /> Shared planning
            </div>
          </div>
        </div>

        {/* Export reminder */}
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8">
          <Download className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">Upgrade to save your plans</p>
            <p>The free preview is not retained. Choose a paid plan if you need to save or return to your planning.</p>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3">
          {user ? (
            <Button onClick={() => navigate('/builders')} className="flex-1">
              Browse Builders
            </Button>
          ) : (
            <Button onClick={() => navigate('/register')} className="flex-1">
              Get Started Free
            </Button>
          )}
          <Button variant="outline" asChild className="flex-1">
            <Link to="/plans/standard">Upgrade to Standard →</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
