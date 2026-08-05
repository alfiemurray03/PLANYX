import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import SiteNavHeader from '@/layouts/parts/Header';
import Footer from '@/layouts/parts/Footer';
import {
  AlertTriangle, ArrowRight, BarChart3, Bot, Compass, CreditCard,
  LockKeyhole, MapPinned, RefreshCw, ShieldCheck, Users,
} from 'lucide-react';

const OIDC_ERRORS: Record<string, { title: string; body: string }> = {
  oidc_unavailable: { title: 'Sign-in temporarily unavailable', body: 'We could not complete your sign-in. Please wait a moment and try again.' },
  oidc_state_missing: { title: 'Session expired', body: 'Your sign-in session timed out. Please start again.' },
  oidc_state_invalid: { title: 'Sign-in could not be verified', body: 'Something went wrong verifying your sign-in. Please try again.' },
  oidc_wrong_tenant: { title: 'Access denied', body: 'This portal is restricted to JA Group Services Ltd accounts only.' },
  oidc_no_email: { title: 'Email address not available', body: 'We could not retrieve your email address from your account. Please try again.' },
  oidc_not_authorised: { title: 'Not authorised', body: 'Your account is not authorised for this portal. Contact your administrator.' },
  oidc_account_suspended: { title: 'Account suspended', body: 'Your account has been suspended. Contact your administrator.' },
  oidc_callback_failed: { title: 'Sign-in did not complete', body: 'Authentication did not complete successfully. Please try again.' },
};

const CONTROL_AREAS = [
  { icon: Compass, title: 'Experience builders', text: 'Planning catalogue, availability and customer experience.' },
  { icon: Users, title: 'Customer CRM', text: 'Customers, memberships, enquiries and account records.' },
  { icon: CreditCard, title: 'Plans and billing', text: 'Subscriptions, payment settings and plan access.' },
  { icon: Bot, title: 'AI support assistant', text: 'Conversations, knowledge and support escalation.' },
];

export default function AdminLoginPage() {
  const [searchParams] = useSearchParams();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const errorCode = searchParams.get('error') ?? '';
  const errorInfo = OIDC_ERRORS[errorCode] ?? (errorCode ? { title: 'Sign-in failed', body: 'An unexpected error occurred. Please try again.' } : null);

  function handleSignIn() {
    setIsRedirecting(true);
    window.location.href = '/admin/login?return_to=%2Fadmin%2Fdashboard%2F';
  }

  return (
    <>
      <Helmet>
        <title>Admin Centre — Sousa Murray Planeia</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="flex min-h-screen flex-col bg-[#f6f8fc] text-black transition-colors dark:bg-[#0b1120] dark:text-white">
        <SiteNavHeader />

        <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-[#101827]">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-2.5 sm:px-7">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-300" />
              <p className="!text-sm !font-medium !text-black dark:!text-white">Admin Centre</p>
            </div>
            <p className="hidden !text-xs !text-slate-600 dark:!text-slate-300 sm:block">Authorised JA Group Services staff only</p>
          </div>
        </div>

        <main className="flex-1">
          <section className="mx-auto grid max-w-6xl gap-7 px-5 py-8 sm:px-7 lg:grid-cols-[1.12fr_.88fr] lg:items-center lg:py-11">
            <div>
              <div className="mb-7 text-xl font-black tracking-tight text-black dark:text-white">Sousa Murray Planeia</div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1.5 !text-xs !font-medium !text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:!text-blue-200">
                <MapPinned className="h-3.5 w-3.5" />Planning platform operations
              </div>
              <h1 className="max-w-2xl !text-3xl !font-semibold tracking-[-0.035em] !text-black sm:!text-4xl lg:!text-[44px] lg:!leading-[1.08] dark:!text-white">
                The control centre for <span className="!text-[#2463eb] dark:!text-blue-400">Sousa Murray Planeia.</span>
              </h1>
              <p className="mt-4 max-w-2xl !text-sm !leading-6 !text-slate-700 sm:!text-base dark:!text-slate-300">
                Manage planning experiences, customers, memberships, support and platform operations from one secure workspace.
              </p>

              <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
                {CONTROL_AREAS.map(({ icon: Icon, title, text }) => (
                  <article key={title} className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-[#111b2d]">
                    <div className="flex items-start gap-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 !text-blue-700 dark:bg-blue-950 dark:!text-blue-300"><Icon className="h-4 w-4" /></div>
                      <div>
                        <h2 className="!text-sm !font-medium !text-black dark:!text-white">{title}</h2>
                        <p className="mt-0.5 !text-xs !leading-5 !text-slate-600 dark:!text-slate-300">{text}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-4 !text-xs !text-slate-600 dark:!text-slate-300">
                <span className="inline-flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5 text-blue-600" />Live operational visibility</span>
                <span className="inline-flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5 text-blue-600" />Microsoft sign-in and Admin PIN</span>
              </div>
            </div>

            <section aria-labelledby="admin-sign-in-title" className="relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-blue-200 bg-white p-6 shadow-[0_24px_70px_rgba(37,99,235,.12)] dark:border-blue-900/70 dark:bg-[#0d182a] dark:shadow-2xl dark:shadow-black/25">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-cyan-400 to-blue-500" />
              <div className="mb-5 grid h-10 w-10 place-items-center rounded-xl bg-slate-950 !text-white dark:bg-white dark:!text-black"><ShieldCheck className="h-5 w-5" /></div>
              <p className="!text-xs !font-semibold uppercase tracking-[.12em] !text-blue-700 dark:!text-blue-300">Secure staff access</p>
              <h2 id="admin-sign-in-title" className="mt-2 !text-xl !font-semibold tracking-tight !text-black dark:!text-white">Sign in to the Admin Centre</h2>
              <p className="mt-2 !text-sm !leading-6 !text-slate-700 dark:!text-slate-300">Use your authorised JA Group Services Microsoft account. Your personal four-digit Admin PIN is requested next.</p>

              {errorInfo && (
                <Alert variant="destructive" className="mt-5 border-red-300 bg-red-50">
                  <AlertTriangle className="h-4 w-4 text-red-700" />
                  <AlertDescription className="!text-red-800"><span className="block font-semibold">{errorInfo.title}</span><span className="text-sm">{errorInfo.body}</span></AlertDescription>
                </Alert>
              )}

              <Button type="button" size="lg" className="mt-5 h-11 w-full gap-2 text-sm font-medium" onClick={handleSignIn} disabled={isRedirecting}>
                {isRedirecting ? <><RefreshCw className="h-4 w-4 animate-spin" />Connecting to Microsoft…</> : <>Continue with Microsoft<ArrowRight className="h-4 w-4" /></>}
              </Button>

              <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-3 dark:border-blue-900 dark:bg-blue-950/50">
                <p className="!text-xs !leading-5 !text-blue-900 dark:!text-blue-200"><LockKeyhole className="mr-1.5 inline h-3.5 w-3.5" />Authorised administrators only. Sign-ins and privileged actions are audited.</p>
              </div>

            </section>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
