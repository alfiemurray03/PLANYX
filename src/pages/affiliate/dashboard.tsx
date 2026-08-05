import { useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Link2, Copy, CheckCircle2, TrendingUp, Users, PoundSterling,
  Clock, BarChart2, AlertTriangle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';

interface AffiliateStats {
  affiliate: {
    uuid: string; fullName: string; email: string;
    referralCode: string; referralLink: string;
    commissionRate: number; status: string; joinedAt: string;
  };
  stats: {
    clicks: number; signups: number;
    commissionPending: number; commissionApproved: number; commissionPaid: number;
  };
}

function pence(p: number) {
  return `£${(p / 100).toFixed(2)}`;
}

export default function AffiliateDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<AffiliateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    fetch('/api/affiliate/dashboard', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.success) setData(d);
        else setError(d.error ?? 'Failed to load dashboard.');
      })
      .catch(() => setError('Network error.'))
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  function copyLink() {
    if (!data) return;
    navigator.clipboard.writeText(data.affiliate.referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <Helmet>
        <title>Affiliate Dashboard — Sousa Murray Planeia</title>
        <meta name="description" content="Track your referrals, clicks, and commission earnings in your Sousa Murray Planeia affiliate dashboard." />
      </Helmet>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Affiliate Dashboard</h1>
          <p className="text-muted-foreground mt-1">Track your referrals, clicks, and commission earnings.</p>
        </div>

        {loading || authLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !user ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Sign in required</h2>
              <p className="text-muted-foreground mb-6">Please sign in to access your affiliate dashboard.</p>
              <Link to="/sign-in">
                <Button>Sign in</Button>
              </Link>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">
                {error.includes('NOT_AFFILIATE') || error.includes('No approved') ? 'No affiliate account found' : 'Error'}
              </h2>
              <p className="text-muted-foreground mb-6">
                {error.includes('NOT_AFFILIATE') || error.includes('No approved')
                  ? "You don't have an approved affiliate account linked to this email address. If you've applied, please wait for approval."
                  : error}
              </p>
              <Link to="/affiliate">
                <Button>Apply to join the programme</Button>
              </Link>
            </CardContent>
          </Card>
        ) : data ? (
          <div className="space-y-6">
            {/* Status bar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
                </Badge>
                <span className="text-sm text-muted-foreground">Commission rate: <strong className="text-foreground">{data.affiliate.commissionRate}%</strong></span>
              </div>
              <span className="text-xs text-muted-foreground">
                Member since {new Date(data.affiliate.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>

            {/* Referral link */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Link2 className="w-4 h-4 text-primary" /> Your Referral Link
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-md px-3 py-2 text-sm font-mono text-foreground truncate">
                    {data.affiliate.referralLink}
                  </div>
                  <Button variant="outline" size="sm" onClick={copyLink} className="shrink-0 gap-1.5">
                    {copied ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Referral code: <strong className="text-foreground font-mono">{data.affiliate.referralCode}</strong> — share this link or code to track your referrals.
                </p>
              </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total clicks', value: data.stats.clicks.toLocaleString(), icon: TrendingUp, color: 'text-blue-600' },
                { label: 'Signups', value: data.stats.signups.toLocaleString(), icon: Users, color: 'text-purple-600' },
                { label: 'Commission pending', value: pence(data.stats.commissionPending), icon: Clock, color: 'text-amber-600' },
                { label: 'Commission paid', value: pence(data.stats.commissionPaid), icon: PoundSterling, color: 'text-green-600' },
              ].map(stat => (
                <Card key={stat.label}>
                  <CardContent className="pt-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">{stat.label}</span>
                      <stat.icon className={`w-4 h-4 ${stat.color}`} />
                    </div>
                    <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Commission breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart2 className="w-4 h-4 text-primary" /> Commission Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: 'Pending review', value: pence(data.stats.commissionPending), desc: 'Awaiting admin approval', color: 'text-amber-600' },
                    { label: 'Approved', value: pence(data.stats.commissionApproved), desc: 'Approved, awaiting payout', color: 'text-blue-600' },
                    { label: 'Paid out', value: pence(data.stats.commissionPaid), desc: 'Successfully paid', color: 'text-green-600' },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <div className="text-sm font-medium text-foreground">{row.label}</div>
                        <div className="text-xs text-muted-foreground">{row.desc}</div>
                      </div>
                      <div className={`text-sm font-semibold ${row.color}`}>{row.value}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Info */}
            <Alert>
              <AlertDescription className="text-sm">
                Commissions are reviewed monthly. Payouts are issued within 14 days of approval for balances over £25. For payout queries, contact{' '}
                <a href="mailto:hello@jagroupservices.co.uk" className="underline">hello@jagroupservices.co.uk</a>.
              </AlertDescription>
            </Alert>
          </div>
        ) : null}
      </div>
    </>
  );
}
