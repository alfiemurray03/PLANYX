import { Helmet } from '@dr.pogodin/react-helmet';
import { ExternalLink, HeadphonesIcon, ShieldCheck } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';

export default function AdminSupport() {
  return (
    <AdminLayout title="Customer Support">
      <Helmet>
        <title>Customer Support | Sousa Murray Planeia Admin Centre</title>
      </Helmet>

      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              <HeadphonesIcon className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Head Office Customer Service</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Sousa Murray Planeia customer conversations, escalations and adviser activity are managed through the JA Group Services Head Office Customer Service Centre.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-500/25 dark:bg-emerald-500/10">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
            <div>
              <h2 className="font-semibold text-emerald-950 dark:text-emerald-100">Central control is active</h2>
              <p className="mt-1 text-sm leading-6 text-emerald-900 dark:text-emerald-200">
                Third-party chat and ticketing services have been retired. Use the Head Office Portal for authorised case handling and customer replies.
              </p>
            </div>
          </div>
        </section>

        <a
          href="https://customerops.jagroupservices.co.uk/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-800"
        >
          Open Head Office Customer Service Centre
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </AdminLayout>
  );
}
