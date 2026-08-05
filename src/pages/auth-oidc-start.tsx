/**
 * /auth/oidc/start — Sign-in interstitial page.
 *
 * In production this path is intercepted by the Express server before React
 * ever renders — the OIDC handler immediately redirects the browser to
 * Microsoft Entra. This React page exists as a client-side fallback for two
 * scenarios:
 *
 *  1. The user navigates here via React Router (client-side navigation from
 *     a <Link> or programmatic navigate()) — the page fires a hard redirect
 *     via window.location.href so the server handler takes over.
 *
 *  2. The OIDC server handler is temporarily unavailable — the user sees a
 *     branded "Signing you in…" screen with a retry button rather than a
 *     blank 404.
 *
 * No passwords. No forms. Just a clean handoff to the OIDC flow.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { FileText, ShieldCheck, ArrowRight, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const REDIRECT_DELAY_MS = 400; // brief pause so the page renders before redirect

export default function AuthOidcStartPage() {
  const [status, setStatus] = useState<'redirecting' | 'error'>('redirecting');
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    // Trigger the hard redirect after a short delay so the branded screen
    // is visible for a moment — avoids a jarring flash.
    const timer = setTimeout(() => {
      try {
        window.location.href = '/account/login?return_to=%2Fdashboard';
      } catch {
        setStatus('error');
      }
    }, REDIRECT_DELAY_MS);

    // Countdown for the "Redirecting in N…" label
    const tick = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(tick); return 0; }
        return c - 1;
      });
    }, 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, []);

  function handleRetry() {
    setStatus('redirecting');
    setCountdown(3);
    window.location.href = '/account/login?return_to=%2Fdashboard';
  }

  return (
    <>
      <Helmet>
        <title>Signing In — Sousa Murray Planeia</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Full-screen dark branded layout — matches /sign-in */}
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0d1b2e] px-4 relative overflow-hidden">

        {/* Background orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#1B4F8A]/20 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[#1e1b8a]/15 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-sm text-center">

          {/* Logo */}
          <Link to="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 bg-[#1B4F8A] rounded-2xl flex items-center justify-center shadow-lg group-hover:bg-[#1B4F8A]/80 transition-colors">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="text-white font-bold text-lg leading-tight">Sousa Murray Planeia</p>
              <p className="text-white/40 text-xs">by JA Group Services</p>
            </div>
          </Link>

          {/* Card */}
          <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm space-y-6">

            {status === 'redirecting' ? (
              <>
                {/* Spinner */}
                <div className="flex justify-center">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-4 border-white/10" />
                    <div className="absolute inset-0 rounded-full border-4 border-t-[#4A90D9] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ShieldCheck className="w-6 h-6 text-[#4A90D9]" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h1 className="text-xl font-bold text-white">Signing you in…</h1>
                  <p className="text-white/50 text-sm leading-relaxed">
                    You're being securely redirected to our authentication provider.
                    This only takes a moment.
                  </p>
                </div>

                {/* Progress dots */}
                <div className="flex justify-center gap-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-[#4A90D9] animate-pulse"
                      style={{ animationDelay: `${i * 200}ms` }}
                    />
                  ))}
                </div>

                {/* Trust badge */}
                <div className="flex items-center justify-center gap-2 text-white/30 text-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-green-400/60" />
                  <span>Secured with enterprise-grade authentication</span>
                </div>
              </>
            ) : (
              <>
                {/* Error state */}
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <AlertTriangle className="w-7 h-7 text-red-400" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h1 className="text-xl font-bold text-white">Sign-in unavailable</h1>
                  <p className="text-white/50 text-sm leading-relaxed">
                    We couldn't connect to the authentication service.
                    Please try again in a moment.
                  </p>
                </div>

                <div className="space-y-3">
                  <Button
                    onClick={handleRetry}
                    className="w-full h-11 gap-2 font-semibold text-sm bg-[#1B4F8A] hover:bg-[#1B4F8A]/80"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Try again
                  </Button>
                  <Button
                    variant="ghost"
                    asChild
                    className="w-full h-10 text-sm text-white/50 hover:text-white hover:bg-white/5"
                  >
                    <Link to="/sign-in">
                      Back to sign-in page
                    </Link>
                  </Button>
                </div>

                <p className="text-white/30 text-xs">
                  Still having trouble?{' '}
                  <a
                    href="mailto:contact@jagroupservices.co.uk"
                    className="text-[#4A90D9] hover:underline"
                  >
                    Contact support
                  </a>
                </p>
              </>
            )}
          </div>

          {/* Manual trigger — shown after countdown */}
          {status === 'redirecting' && countdown === 0 && (
            <button
              onClick={handleRetry}
              className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-xs transition-colors"
            >
              Not redirecting?
              <span className="underline underline-offset-2 flex items-center gap-1">
                Click here <ArrowRight className="w-3 h-3" />
              </span>
            </button>
          )}

          {/* Footer links */}
          <div className="flex items-center gap-4 text-white/20 text-xs">
            <Link to="/terms" className="hover:text-white/50 transition-colors">Terms</Link>
            <span>·</span>
            <Link to="/privacy" className="hover:text-white/50 transition-colors">Privacy</Link>
            <span>·</span>
            <Link to="/" className="hover:text-white/50 transition-colors">Home</Link>
          </div>
        </div>
      </div>
    </>
  );
}
