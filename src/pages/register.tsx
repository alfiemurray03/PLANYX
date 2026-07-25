import { Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Button } from '@/components/ui/button';
import { ArrowRight, BadgeCheck, CheckCircle2, FileText, Shield, Zap } from 'lucide-react';
import { useSiteSettings } from '@/lib/site-settings-context';

const PERKS = [
  { icon: FileText, text: 'Use guided builders for everyday and travel plans' },
  { icon: Zap, text: 'Build and organise personalised plans step by step' },
  { icon: Shield, text: 'Secure account with privacy and safety controls' },
  { icon: CheckCircle2, text: 'Free plan — no credit card required' },
];

export default function RegisterPage() {
  const { siteName } = useSiteSettings();
  return (
    <>
      <Helmet>
        <title>Create a 16+ Account — {siteName}</title>
        <meta name="description" content={`Create a ${siteName} account if you are aged 16 or over.`} />
      </Helmet>

      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16 bg-background">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <div>
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-primary mb-3">Strictly age 16+</span>
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight">Build personalised plans step by step</h1>
              <p className="text-muted-foreground mt-3 text-base leading-relaxed">Join {siteName} and use guided builders for day trips, destinations, itineraries, budgets, accessibility and practical travel preparation.</p>
            </div>

            <ul className="space-y-3">
              {PERKS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-foreground">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-primary" /></div>
                  {text}
                </li>
              ))}
            </ul>

            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/30 dark:bg-violet-500/10">
              <div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-700 dark:text-violet-200" /><div><p className="text-sm font-black text-violet-950 dark:text-white">Nobody under 16 may register</p><p className="mt-1 text-xs leading-5 text-violet-800 dark:text-violet-200">You will complete an age check before account creation. People aged 16–17 receive high-privacy and safeguarding defaults. A payment card is not treated as proof of age.</p></div></div>
            </div>

            <p className="text-xs text-muted-foreground">Already have an account? <Link to="/sign-in" className="text-primary hover:underline font-medium">Sign in here</Link></p>
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-lg p-8 space-y-6">
            <div><h2 className="text-xl font-bold text-foreground">Create your 16+ account</h2><p className="text-sm text-muted-foreground mt-1">Age check first, followed by secure Microsoft account creation or sign-in.</p></div>

            <Button size="lg" className="w-full h-12 gap-2 font-semibold text-sm" onClick={() => { window.location.href = '/age-check?return_to=%2Fdashboard'; }}>
              Check eligibility and continue <ArrowRight className="w-4 h-4" />
            </Button>

            <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div><div className="relative flex justify-center text-xs"><span className="bg-card px-3 text-muted-foreground">or</span></div></div>

            <Button variant="outline" size="lg" className="w-full h-11 text-sm" onClick={() => { window.location.href = '/account/login?return_to=%2Fdashboard'; }}>Sign in to existing account</Button>

            <div className="rounded-xl bg-muted/40 border border-border px-4 py-3"><p className="text-xs text-muted-foreground leading-relaxed text-center">Existing users without a recorded age band must complete the same 16+ check before continuing.</p></div>

            <p className="text-center text-xs text-muted-foreground">By creating an account you confirm that you are aged 16 or over and agree to our <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>, <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link> and <Link to="/safety" className="text-primary hover:underline">Safety rules</Link>.</p>
          </div>
        </div>
      </div>
    </>
  );
}
