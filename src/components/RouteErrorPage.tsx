import { useMemo, useState } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  Home,
  RefreshCcw,
  ShieldAlert,
} from 'lucide-react';

function describeError(error: unknown) {
  if (isRouteErrorResponse(error)) {
    return {
      status: String(error.status),
      message: typeof error.data === 'string'
        ? error.data
        : error.statusText || 'The requested page could not be displayed.',
    };
  }

  if (error instanceof Error) {
    return {
      status: 'Application error',
      message: error.message || 'An unexpected application error occurred.',
    };
  }

  return {
    status: 'Application error',
    message: typeof error === 'string' ? error : 'An unexpected application error occurred.',
  };
}

export default function RouteErrorPage() {
  const routeError = useRouteError();
  const [copied, setCopied] = useState(false);
  const details = describeError(routeError);
  const path = typeof window === 'undefined' ? '/' : window.location.pathname;
  const isAdmin = path.startsWith('/admin');
  const isChunkError = /dynamically imported module|failed to fetch.*module|preload|importing a module/i.test(details.message);
  const reference = useMemo(
    () => `JAPS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    [],
  );

  const title = isChunkError
    ? 'This page needs the latest Sousa Murray Planeia files'
    : details.status === '404'
      ? 'We could not find that page'
      : 'Something went wrong';

  const explanation = isChunkError
    ? 'Sousa Murray Planeia was updated while this browser tab was open. Refreshing will load the current version safely.'
    : 'The page could not be completed. Your account and saved information have not been changed by this error.';

  const copyDetails = async () => {
    const report = [
      `Reference: ${reference}`,
      `Page: ${path}`,
      `Status: ${details.status}`,
      `Error: ${details.message}`,
      `Time: ${new Date().toISOString()}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <section className="w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/40">
          <div className="border-b border-white/10 bg-gradient-to-r from-blue-600/20 via-slate-900 to-cyan-500/10 px-6 py-6 sm:px-9">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-500/15 font-black text-blue-200">
                JA
              </div>
              <div>
                <p className="font-bold tracking-tight text-white">Sousa Murray Planeia</p>
                <p className="text-sm text-slate-400">Secure application recovery</p>
              </div>
            </div>
          </div>

          <div className="space-y-7 px-6 py-8 sm:px-9 sm:py-10">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 text-amber-300">
                {isChunkError ? <RefreshCcw className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-300">Error {details.status}</p>
                <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{title}</h1>
                <p className="mt-3 max-w-2xl leading-relaxed text-slate-300">{explanation}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-5">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
                <div className="min-w-0">
                  <p className="font-semibold text-red-100">Error details</p>
                  <p className="mt-1 break-words text-sm leading-relaxed text-red-100/80">{details.message}</p>
                </div>
              </div>
            </div>

            <dl className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-slate-500">Page</dt>
                <dd className="mt-1 break-all font-medium text-slate-200">{path}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-500">Reference</dt>
                <dd className="mt-1 break-all font-mono text-slate-200">{reference}</dd>
              </div>
            </dl>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh page
              </button>
              <button
                type="button"
                onClick={() => window.history.back()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-semibold text-slate-100 transition hover:bg-white/10"
              >
                <ArrowLeft className="h-4 w-4" />
                Go back
              </button>
              <a
                href={isAdmin ? '/admin/dashboard' : '/'}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-semibold text-slate-100 transition hover:bg-white/10"
              >
                <Home className="h-4 w-4" />
                {isAdmin ? 'Admin dashboard' : 'Sousa Murray Planeia home'}
              </a>
              <button
                type="button"
                onClick={copyDetails}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-blue-300 transition hover:bg-blue-400/10"
              >
                <Copy className="h-4 w-4" />
                {copied ? 'Copied' : 'Copy error details'}
              </button>
            </div>

            <p className="border-t border-white/10 pt-5 text-sm leading-relaxed text-slate-400">
              If the problem continues, contact{' '}
              <a className="font-semibold text-blue-300 hover:underline" href="mailto:contact@jagroupservices.co.uk">
                contact@jagroupservices.co.uk
              </a>{' '}
              and include the reference shown above.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
