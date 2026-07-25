import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowRight, ShieldCheck, Loader2, AlertTriangle, Check, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

const errorMessages: Record<string, string> = {
  oidc_init_failed: 'Could not start the sign-in process. Please try again.',
  oidc_callback_failed: 'Sign-in was not completed. Please try again.',
  oidc_state_missing: 'Your sign-in session expired. Please try again.',
  oidc_state_invalid: 'Your sign-in session could not be verified. Please try again.',
  oidc_no_email: 'Your account does not have an email address. Please contact support.',
  account_suspended: 'This account is currently suspended. Please contact support.',
  oidc_unavailable: 'Sign-in is temporarily unavailable. Please try again shortly.',
  age_check_required: 'Complete the Planyx 16+ age check before signing in.',
  under_16_not_eligible: 'Planyx accounts are not available to anyone under 16 years of age.',
};

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const [redirecting, setRedirecting] = useState(false);
  const error = searchParams.get('error');

  const handleSignIn = () => {
    setRedirecting(true);
    const requested = searchParams.get('redirect') || searchParams.get('next') || '/dashboard';
    const returnTo = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard';
    window.location.href = `/account/login?return_to=${encodeURIComponent(returnTo)}`;
  };

  return (
    <>
      <Helmet>
        <title>Sign In — Planyx</title>
        <meta name="description" content="Sign in to your 16+ Planyx account." />
        <link rel="canonical" href="/sign-in" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="relative min-h-[calc(100vh-4.5rem)] overflow-hidden bg-background px-4 py-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(37,99,235,.12),transparent_34%),radial-gradient(circle_at_82%_76%,rgba(6,182,212,.09),transparent_30%)]" />
        <div className="relative mx-auto grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1fr_390px]">
          <section className="hidden lg:block">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[.16em] text-blue-600 dark:text-blue-300">JA Group Services ID · Planyx 16+</p>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-[-.04em] text-foreground">One secure sign-in for every <span className="text-blue-600 dark:text-blue-400">Planyx experience.</span></h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">Continue planning, save your itineraries and keep your experience details together without creating another password.</p>
            <div className="mt-7 grid max-w-lg gap-3 sm:grid-cols-3">
              {['Microsoft secured', 'Strictly age 16+', 'Young-person safeguards'].map(item => <div key={item} className="rounded-xl border border-border bg-card/80 px-3 py-3 text-xs font-medium text-foreground">{item}</div>)}
            </div>
          </section>

          <div className="w-full space-y-5">
            <div className="text-center lg:text-left">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-blue-200 bg-blue-100 lg:mx-0 dark:border-blue-700 dark:bg-blue-900/40">
                <ShieldCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">Sign in to Planyx</h2>
              <p className="text-xs text-muted-foreground">Protected by JA Group Services ID · Account holders must be aged 16 or over</p>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm leading-relaxed text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessages[error] ?? 'An unexpected error occurred. Please try again.'}</span>
              </div>
            )}

            <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex gap-2.5 rounded-xl border border-violet-200 bg-violet-50 p-3.5 dark:border-violet-800 dark:bg-violet-950/30">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" />
                <p className="text-xs leading-relaxed text-violet-800 dark:text-violet-200"><strong>Planyx is strictly 16+.</strong> You will complete an age check before Microsoft sign-in. People aged 16–17 receive enhanced privacy and safeguarding defaults.</p>
              </div>

              <Button
                onClick={handleSignIn}
                disabled={redirecting}
                className="h-12 w-full rounded-xl bg-blue-600 font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500"
              >
                {redirecting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking eligibility…</> : <>Continue to age check and sign in <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>

              <div className="flex gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3.5 dark:border-blue-800 dark:bg-blue-950/30">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <p className="text-xs leading-relaxed text-blue-700 dark:text-blue-300">Enterprise-grade authentication. No separate Planyx password to remember.</p>
              </div>

              <div className="border-t border-border pt-4">
                <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-foreground">Plan, explore and save</p>
                <ul className="space-y-2">
                  {['Explore destinations and live activities', 'Use guided experience-planning builders', 'Save and continue your plans securely'].map(item => (
                    <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />{item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Need help or have a safeguarding concern? <Link to="/contact" className="font-medium text-primary hover:underline">Contact Planyx</Link>
            </p>
            <p className="text-center text-[11px] text-muted-foreground">
              <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
              <span className="mx-2">·</span>
              <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
