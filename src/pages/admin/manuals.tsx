import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  Keyboard,
  LifeBuoy,
  Mail,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';

import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Manual {
  title: string;
  description: string;
  audience: string;
  file: string;
  pages: number;
  size: string;
  icon: typeof BookOpen;
  topics: string[];
  accent: string;
}

const MANUALS: Manual[] = [
  {
    title: 'Admin Centre Manual',
    description: 'Secure operation of the Planyx Admin Centre, customer records, subscriptions, builders, website controls and incident checks.',
    audience: 'Authorised administrators and support staff',
    file: '/manuals/planyx-admin-centre-manual.pdf',
    pages: 7,
    size: '132 KB',
    icon: ShieldCheck,
    topics: ['Microsoft sign-in and Admin PIN', 'Keyboard shortcuts', 'Customer CRM and enquiries', 'Stripe and subscription routes', 'Contact Us status controls'],
    accent: 'from-blue-600 to-cyan-500',
  },
  {
    title: 'Customer Portal Manual',
    description: 'How customer accounts, subscriptions, planning builders, exports, read-only sharing and organisation workspaces operate.',
    audience: 'Customers, administrators and customer-support staff',
    file: '/manuals/planyx-customer-portal-manual.pdf',
    pages: 5,
    size: '92 KB',
    icon: Users,
    topics: ['Signing in and account basics', 'Plans and account types', 'Creating itineraries', 'PDF export and sharing', 'Privacy and troubleshooting'],
    accent: 'from-violet-600 to-blue-600',
  },
  {
    title: 'Public Website Manual',
    description: 'Reference for the customer-facing Planyx website, pricing, Help Centre, Contact Us states, partner discovery and legal pages.',
    audience: 'Administrators, content staff, support staff and customers',
    file: '/manuals/planyx-public-website-manual.pdf',
    pages: 4,
    size: '84 KB',
    icon: Globe2,
    topics: ['Website purpose and navigation', 'Plans, pricing and sign-in', 'Contact Us and Help Centre', 'Partner discovery', 'Legal, cookies and accessibility'],
    accent: 'from-cyan-500 to-violet-600',
  },
];

const QUICK_LINKS = [
  { label: 'Customer Support Tickets', description: 'Manage customer conversations and ticket status.', href: '/admin/support', icon: MessageSquare },
  { label: 'Contact Enquiries', description: 'Review enquiries sent through Contact Us.', href: '/admin/enquiries', icon: Mail },
  { label: 'Production Health', description: 'Check live platform and endpoint health.', href: '/admin/health', icon: Activity },
  { label: 'Site Status & Settings', description: 'Control website and service availability.', href: '/admin/site-settings', icon: Settings },
  { label: 'Security', description: 'Review administrator and platform security controls.', href: '/admin/security', icon: ShieldCheck },
  { label: 'Customer CRM', description: 'Find customer accounts and subscription records.', href: '/admin/users', icon: Users },
];

export default function AdminManualsPage() {
  return (
    <>
      <Helmet>
        <title>Admin Support & Manuals - Planyx Admin Centre</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <AdminLayout title="Admin Support & Manuals" subtitle="Administrator guidance, PDF manuals and support routes">
        <div className="space-y-8">
          <section className="relative overflow-hidden rounded-3xl border border-blue-200 bg-slate-950 px-6 py-8 text-white shadow-2xl dark:border-blue-500/30 sm:px-8 sm:py-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgb(37_99_235/0.35),transparent_34%),radial-gradient(circle_at_88%_78%,rgb(124_58_237/0.28),transparent_32%)]" />
            <div className="relative grid gap-7 lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
              <div>
                <div className="flex items-center gap-2 text-blue-200">
                  <LifeBuoy className="h-5 w-5" />
                  <span className="text-xs font-bold uppercase tracking-[0.16em]">Administrator support</span>
                </div>
                <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">Support guidance for operating Planyx safely</h1>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                  Open or download the current manuals for the Admin Centre, Customer Portal and public website. These documents are stored inside the production Planyx application and can be used during support, training and incident checks.
                </p>
                <div className="mt-6 flex flex-wrap gap-3 text-xs font-semibold text-slate-200">
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5">Version 1.0</span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5">Updated July 2026</span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5">PDF format</span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/20 text-blue-200">
                    <Keyboard className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold">Keyboard access</p>
                    <p className="text-sm text-slate-400">Open this page from anywhere in the unlocked Admin Centre.</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <kbd className="rounded-lg border border-white/15 bg-slate-900 px-3 py-2 font-mono text-sm font-bold">G</kbd>
                  <span className="text-sm text-slate-500">then</span>
                  <kbd className="rounded-lg border border-blue-400/40 bg-blue-500/15 px-3 py-2 font-mono text-sm font-bold text-blue-100">M</kbd>
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="manual-library-title">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">Document library</p>
                <h2 id="manual-library-title" className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">PDF manuals</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Each manual opens in a new browser tab and can also be downloaded.</p>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">3 current documents</span>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-3">
              {MANUALS.map(manual => {
                const Icon = manual.icon;
                return (
                  <Card key={manual.file} className="overflow-hidden border-slate-200 bg-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <div className={`h-1.5 bg-gradient-to-r ${manual.accent}`} />
                    <CardContent className="flex h-full flex-col p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                          <Icon className="h-6 w-6" />
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">PDF</span>
                      </div>

                      <h3 className="mt-5 text-xl font-bold text-slate-950 dark:text-white">{manual.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{manual.description}</p>

                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-950/60">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">Audience</p>
                        <p className="mt-1 leading-5 text-slate-500 dark:text-slate-400">{manual.audience}</p>
                      </div>

                      <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                        {manual.topics.map(topic => (
                          <li key={topic} className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <span>{topic}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-auto pt-5">
                        <div className="mb-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>{manual.pages} pages</span>
                          <span>{manual.size}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button asChild variant="outline" className="gap-2">
                            <a href={manual.file} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4" /> Open
                            </a>
                          </Button>
                          <Button asChild className="gap-2">
                            <a href={manual.file} download>
                              <Download className="h-4 w-4" /> Download
                            </a>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
            <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">Quick access</p>
                    <h2 className="text-xl font-bold text-slate-950 dark:text-white">Admin support routes</h2>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {QUICK_LINKS.map(item => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        className="group flex items-start gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:hover:border-blue-500 dark:hover:bg-blue-950/30"
                      >
                        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
                        <span>
                          <span className="block text-sm font-semibold text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-200">{item.label}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{item.description}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-3 text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-5 w-5" />
                  <h2 className="text-lg font-bold">Escalating a problem</h2>
                </div>
                <ol className="mt-4 space-y-3 text-sm leading-6 text-amber-950/80 dark:text-amber-100/80">
                  <li><strong>1.</strong> Record the exact page, time and error wording.</li>
                  <li><strong>2.</strong> Check Production Health before changing settings.</li>
                  <li><strong>3.</strong> Confirm whether one customer or the whole platform is affected.</li>
                  <li><strong>4.</strong> Do not include passwords or payment-card details.</li>
                </ol>
                <Button asChild className="mt-5 w-full gap-2 bg-amber-700 text-white hover:bg-amber-800">
                  <a href="mailto:planyx@jagroupservices.co.uk?subject=Planyx%20Admin%20Support%20Request">
                    <Mail className="h-4 w-4" /> Email Planyx support
                  </a>
                </Button>
              </CardContent>
            </Card>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
              <p>
                Manuals support the live platform but do not replace current company policies, data-protection procedures, safeguarding requirements or authorised Stripe records. Where the manual and the live platform differ, stop and verify the current approved process before making a sensitive change.
              </p>
            </div>
          </section>
        </div>
      </AdminLayout>
    </>
  );
}
