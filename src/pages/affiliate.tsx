import { useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Users, TrendingUp, PoundSterling, Link2, Shield, CheckCircle2,
  ArrowRight, Star, Clock, FileText, BarChart2, AlertTriangle, Bell,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const HOW_IT_WORKS = [
  { icon: Users, title: 'Apply to join', desc: 'Fill in the short application form below. We review all applications within 3–5 business days.' },
  { icon: Link2, title: 'Get your referral link', desc: 'Once approved, you receive a unique referral link and code to share with your audience.' },
  { icon: TrendingUp, title: 'Refer customers', desc: 'Share your link via your website, social media, email newsletters, or any channel you choose.' },
  { icon: PoundSterling, title: 'Earn commission', desc: 'Earn commission on every paying customer you refer. Commissions are reviewed and paid monthly.' },
];

const BENEFITS = [
  'Competitive commission on every referred subscription',
  'Real-time dashboard — track clicks, signups, and earnings',
  'Dedicated affiliate support from our team',
  'No cap on earnings — the more you refer, the more you earn',
  'Monthly payouts via bank transfer',
  'Marketing materials and copy provided',
];

const PROHIBITED = [
  'Self-referrals or referring your own accounts',
  'Spam, unsolicited emails, or misleading advertising',
  'Bidding on Sousa Murray Planeia branded keywords in paid search',
  'Making false claims about our products or services',
  'Creating fake reviews or testimonials',
  'Any activity that violates applicable law',
];

export default function AffiliatePage() {
  const [comingSoon, setComingSoon] = useState(true); // controlled by admin via site settings
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', company: '', website: '',
    socialLinks: '', referralMethod: '', expectedAudience: '', agreedToTerms: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifySubmitted, setNotifySubmitted] = useState(false);

  // Fetch coming-soon flag from site settings
  useEffect(() => {
    fetch('/api/site-settings/public')
      .then(r => r.json() as Promise<{ success: boolean; settings?: Record<string, string> }>)
      .then(d => {
        if (d.success && d.settings) {
          setComingSoon(d.settings['affiliate_coming_soon'] !== 'false');
        }
      })
      .catch(() => {});
  }, []);

  function set(field: string, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }));
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.agreedToTerms) { setError('Please agree to the affiliate terms to continue.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/affiliate/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          phone: form.phone || undefined,
          company: form.company || undefined,
          website: form.website || undefined,
          socialLinks: form.socialLinks ? form.socialLinks.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
          referralMethod: form.referralMethod || undefined,
          expectedAudience: form.expectedAudience || undefined,
          agreedToTerms: form.agreedToTerms,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        setError(data.error ?? 'Failed to submit application.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Helmet>
        <title>Affiliate Programme — Sousa Murray Planeia</title>
        <meta name="description" content="Join the Sousa Murray Planeia affiliate programme. Earn commission by referring customers to our professional document builder platform." />
      </Helmet>

      {/* ── Coming Soon Banner ── */}
      {comingSoon && (
        <div className="bg-amber-500 text-white py-3 px-4 text-center text-sm font-semibold flex items-center justify-center gap-2">
          <Clock className="w-4 h-4 shrink-0" />
          The Affiliate Programme is coming soon — applications are not yet open.
        </div>
      )}

      {/* Hero */}
      <section className={`bg-primary text-primary-foreground py-20 ${comingSoon ? 'opacity-80' : ''}`}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <Badge className="mb-4 bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30">
            {comingSoon ? 'Coming Soon' : 'Affiliate Programme'}
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Earn by referring customers</h1>
          <p className="text-xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
            Partner with Sousa Murray Planeia and earn commission for every customer you refer to our professional document builder platform.
          </p>
          {comingSoon ? (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <div className="inline-flex items-center gap-2 bg-primary-foreground/10 border border-primary-foreground/30 rounded-lg px-5 py-3 text-primary-foreground/80 text-sm">
                <Bell className="w-4 h-4" />
                We'll notify you when applications open
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="#apply">
                <Button size="lg" variant="secondary" className="gap-2">
                  Join the Programme <ArrowRight className="w-4 h-4" />
                </Button>
              </a>
              <Link to="/affiliate/dashboard">
                <Button size="lg" variant="outline" className="gap-2 border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10">
                  Affiliate Dashboard
                </Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-center text-foreground mb-10">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map((step, i) => (
              <Card key={i} className="text-center">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <step.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Step {i + 1}</div>
                  <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Commission & benefits */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-4">Commission structure</h2>
              <p className="text-muted-foreground mb-6">
                Earn a percentage commission on every paying subscription you refer. Commission rates are set individually based on your audience and referral method, starting from 10%.
              </p>
              <div className="space-y-3">
                {[
                  { label: 'Commission type', value: 'Revenue share per subscription' },
                  { label: 'Starting rate', value: '10% (negotiable)' },
                  { label: 'Cookie duration', value: '30 days' },
                  { label: 'Payout frequency', value: 'Monthly' },
                  { label: 'Minimum payout', value: '£25' },
                  { label: 'Payment method', value: 'Bank transfer (UK)' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm text-muted-foreground">{row.label}</span>
                    <span className="text-sm font-medium text-foreground">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-4">Why join?</h2>
              <ul className="space-y-3">
                {BENEFITS.map((b, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <span className="text-sm text-muted-foreground">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Who can join */}
      <section className="py-16 bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-foreground mb-4 text-center">Who can join?</h2>
          <p className="text-center text-muted-foreground mb-8">
            The programme is open to individuals and businesses who can genuinely promote Sousa Murray Planeia to a relevant UK audience.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { icon: FileText, title: 'Content creators', desc: 'Bloggers, YouTubers, and newsletter writers covering business, legal, or HR topics.' },
              { icon: Users, title: 'Professionals', desc: 'Accountants, solicitors, HR consultants, and business advisors recommending tools to clients.' },
              { icon: BarChart2, title: 'Marketers & agencies', desc: 'Digital marketers and agencies with access to business audiences.' },
            ].map((item, i) => (
              <Card key={i}>
                <CardContent className="pt-6 text-center">
                  <item.icon className="w-8 h-8 text-primary mx-auto mb-3" />
                  <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Payout terms */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
                <Clock className="w-6 h-6 text-primary" /> Payout terms
              </h2>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Commissions are reviewed at the end of each calendar month. Approved commissions are paid within 14 days of the review date.</p>
                <p>A minimum balance of £25 must be accumulated before a payout is issued. Balances below this threshold roll over to the following month.</p>
                <p>Payouts are made via UK bank transfer. Payment details are collected securely after approval.</p>
                <p>Commissions may be withheld or reversed if a referred customer cancels within 30 days or if fraudulent activity is detected.</p>
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
                <Shield className="w-6 h-6 text-primary" /> Prohibited activity
              </h2>
              <ul className="space-y-2">
                {PROHIBITED.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Approval process */}
      <section className="py-12 bg-background">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl font-bold text-foreground mb-3">Approval process</h2>
          <p className="text-muted-foreground">
            All applications are reviewed manually by our team. We aim to respond within 3–5 business days. We may ask for additional information about your audience or promotional methods. Approval is at our sole discretion. Approved affiliates receive their referral link and code by email.
          </p>
        </div>
      </section>

      {/* Application form — hidden when coming soon */}
      <section id="apply" className="py-16 bg-muted/30">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-foreground mb-2">
              {comingSoon ? 'Get notified when we launch' : 'Apply to join'}
            </h2>
            <p className="text-muted-foreground">
              {comingSoon
                ? 'Leave your email and we\'ll let you know as soon as the affiliate programme opens.'
                : 'Fill in the form below and we\'ll be in touch within 3–5 business days.'}
            </p>
          </div>

          {comingSoon ? (
            /* ── Coming Soon: notify-me form ── */
            notifySubmitted ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-foreground mb-2">You're on the list!</h3>
                  <p className="text-muted-foreground">We'll email you as soon as the affiliate programme opens.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-8 pb-8">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={notifyEmail}
                      onChange={e => setNotifyEmail(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      onClick={() => { if (notifyEmail) setNotifySubmitted(true); }}
                      className="gap-2 shrink-0"
                    >
                      <Bell className="w-4 h-4" /> Notify me
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 text-center">
                    No spam. One email when we launch. Unsubscribe any time.
                  </p>
                </CardContent>
              </Card>
            )
          ) : submitted ? (
            /* ── Submitted confirmation ── */
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">Application submitted!</h3>
                <p className="text-muted-foreground mb-6">
                  Thank you for applying. We'll review your application and get back to you within 3–5 business days.
                </p>
                <Link to="/">
                  <Button variant="outline">Return to homepage</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            /* ── Full application form ── */
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-primary" /> Affiliate Application
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="fullName">Full name <span className="text-destructive">*</span></Label>
                      <Input id="fullName" value={form.fullName} onChange={e => set('fullName', e.target.value)} required placeholder="Jane Smith" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email address <span className="text-destructive">*</span></Label>
                      <Input id="email" type="email" value={form.email} onChange={e => set('email', e.target.value)} required placeholder="jane@example.com" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Phone number <span className="text-muted-foreground text-xs">(optional)</span></Label>
                      <Input id="phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+44 7700 000000" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="company">Company / website name <span className="text-muted-foreground text-xs">(optional)</span></Label>
                      <Input id="company" value={form.company} onChange={e => set('company', e.target.value)} placeholder="Acme Ltd" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="website">Website URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input id="website" type="url" value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://yourwebsite.com" />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="socialLinks">Social media / profile links <span className="text-muted-foreground text-xs">(optional — one per line)</span></Label>
                    <Textarea id="socialLinks" value={form.socialLinks} onChange={e => set('socialLinks', e.target.value)} placeholder="https://linkedin.com/in/yourprofile&#10;https://twitter.com/yourhandle" rows={3} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="referralMethod">How do you plan to refer customers? <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input id="referralMethod" value={form.referralMethod} onChange={e => set('referralMethod', e.target.value)} placeholder="e.g. Blog, newsletter, social media, client recommendations" />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="expectedAudience">Describe your audience <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Textarea id="expectedAudience" value={form.expectedAudience} onChange={e => set('expectedAudience', e.target.value)} placeholder="e.g. UK small business owners, HR professionals, sole traders" rows={3} />
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4 text-xs text-muted-foreground space-y-2">
                    <p className="font-semibold text-foreground">Affiliate Terms Summary</p>
                    <p>By joining the programme you agree to promote Sousa Murray Planeia honestly and in accordance with our full affiliate terms. You must not engage in spam, self-referrals, misleading advertising, or any prohibited activity listed above. Payment details will be collected securely after approval. We reserve the right to suspend or terminate affiliate accounts for violations.</p>
                    <p>Full terms available on request from <a href="mailto:hello@jagroupservices.co.uk" className="underline">hello@jagroupservices.co.uk</a>.</p>
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="terms"
                      checked={form.agreedToTerms}
                      onCheckedChange={v => set('agreedToTerms', Boolean(v))}
                    />
                    <Label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer">
                      I have read and agree to the affiliate terms and conditions, and confirm that all information provided is accurate. <span className="text-destructive">*</span>
                    </Label>
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit Application'}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    Already approved?{' '}
                    <Link to="/affiliate/dashboard" className="underline hover:text-foreground">
                      Log in to your affiliate dashboard
                    </Link>
                  </p>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Contact */}
      <section className="py-12 bg-background border-t border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Questions about the programme?</h2>
          <p className="text-muted-foreground mb-4">
            Contact our affiliate team at{' '}
            <a href="mailto:hello@jagroupservices.co.uk" className="text-primary underline">
              hello@jagroupservices.co.uk
            </a>
          </p>
          <Link to="/contact">
            <Button variant="outline">Contact Us</Button>
          </Link>
        </div>
      </section>
    </>
  );
}
