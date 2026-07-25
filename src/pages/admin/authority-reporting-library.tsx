import { useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/AdminLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  Clock3,
  Database,
  FileCheck2,
  FilePlus2,
  FileSearch,
  FileText,
  FolderOpen,
  HeartHandshake,
  Landmark,
  LayoutGrid,
  LockKeyhole,
  PhoneCall,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Siren,
  UserRound,
} from 'lucide-react';
import {
  AUTHORITY_REPORT_TEMPLATES,
  AUTHORITY_TEMPLATE_CATEGORIES,
  type AuthorityReportTemplate,
  type AuthorityTemplateCategory,
} from '@/lib/authority-report-templates';

interface LibraryReport {
  id: string;
  reference: string;
  report_type: string;
  authority_name: string;
  urgency: 'Emergency' | 'Urgent' | 'Routine';
  status: 'Draft' | 'Ready to report' | 'Reported' | 'Further information requested' | 'Closed';
  linked_user_email: string;
  linked_user_name: string;
  subject_name: string;
  summary: string;
  legal_hold: boolean;
  created_at: string;
  updated_at: string;
}

interface LibraryPayload {
  reports: LibraryReport[];
  summary: {
    total: number;
    drafts: number;
    ready: number;
    reported: number;
    emergency: number;
    evidence_holds: number;
  };
}

type LibraryFilter = 'Featured' | 'All templates' | AuthorityTemplateCategory;

const TEMPLATE_ICONS: Record<AuthorityReportTemplate['icon'], typeof FileText> = {
  siren: Siren,
  shield: ShieldAlert,
  child: HeartHandshake,
  adult: UserRound,
  database: Database,
  cyber: ShieldCheck,
  council: Building2,
  government: Landmark,
  tax: FileText,
  benefits: FileText,
  company: Building2,
  finance: Landmark,
  consumer: ShieldCheck,
  health: HeartHandshake,
  education: FileText,
  employment: FileText,
  transport: Landmark,
  landmark: Landmark,
};

function formatDate(value?: string): string {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-GB');
}

function urgencyClasses(urgency: LibraryReport['urgency'] | AuthorityReportTemplate['urgency']): string {
  if (urgency === 'Emergency') return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200';
  if (urgency === 'Urgent') return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-100';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function SummaryCard({ label, value, detail, Icon }: { label: string; value: number; detail: string; Icon: typeof FileText }) {
  return (
    <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.11em] text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{value.toLocaleString('en-GB')}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
        <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"><Icon className="h-5 w-5" /></span>
      </CardContent>
    </Card>
  );
}

function TemplateCard({ template }: { template: AuthorityReportTemplate }) {
  const Icon = TEMPLATE_ICONS[template.icon] || FileText;
  const href = `/admin/authority-reporting?view=workspace&template=${encodeURIComponent(template.id)}`;
  return (
    <Card className="group min-w-0 overflow-hidden border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500">
      <CardContent className="flex h-full min-w-0 flex-col p-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <span className="rounded-xl bg-blue-100 p-2.5 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"><Icon className="h-5 w-5" /></span>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${urgencyClasses(template.urgency)}`}>{template.urgency}</span>
        </div>
        <p className="mt-4 text-[11px] font-black uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300">{template.category}</p>
        <h3 className="mt-1 text-lg font-black leading-6 text-slate-950 dark:text-white">{template.title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{template.description}</p>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Prepared for</p>
          <p className="mt-1 break-words text-xs font-bold leading-5 text-slate-800 dark:text-slate-200">{template.authority}</p>
        </div>
        <div className="mt-auto pt-4">
          <Button asChild className="w-full justify-between">
            <Link to={href}>Open report template <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AuthorityReportingLibraryPage() {
  const [data, setData] = useState<LibraryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('Featured');

  async function load(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/authority-reports', { credentials: 'include', cache: 'no-store' });
      const result = await response.json().catch(() => ({})) as { success?: boolean; data?: LibraryPayload; error?: string };
      if (!response.ok || !result.success || !result.data) throw new Error(result.error || 'The report library could not be loaded.');
      setData(result.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The report library could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const visibleTemplates = useMemo(() => {
    const value = query.trim().toLowerCase();
    return AUTHORITY_REPORT_TEMPLATES.filter(template => {
      const categoryMatch = value
        ? true
        : filter === 'Featured'
          ? Boolean(template.featured)
          : filter === 'All templates'
            ? true
            : template.category === filter;
      if (!categoryMatch) return false;
      if (!value) return true;
      return [template.title, template.shortTitle, template.category, template.authority, template.channel, template.description, template.useWhen, ...template.keywords]
        .some(field => String(field || '').toLowerCase().includes(value));
    });
  }, [filter, query]);

  const visibleReports = useMemo(() => {
    const reports = data?.reports || [];
    const value = query.trim().toLowerCase();
    const filtered = value
      ? reports.filter(report => [report.reference, report.summary, report.linked_user_email, report.linked_user_name, report.subject_name, report.authority_name, report.status]
        .some(field => String(field || '').toLowerCase().includes(value)))
      : reports;
    return filtered.slice(0, 7);
  }, [data?.reports, query]);

  const summary = data?.summary || { total: 0, drafts: 0, ready: 0, reported: 0, emergency: 0, evidence_holds: 0 };

  return (
    <>
      <Helmet><title>Report Template Library - Planyx Admin Centre</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <AdminLayout title="Authority Reporting Centre">
        <div className="mx-auto w-full max-w-7xl space-y-5 pb-16">
          <section className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-r from-white via-blue-50/70 to-violet-50/70 shadow-lg dark:border-blue-500/30 dark:from-slate-950 dark:via-blue-950/20 dark:to-violet-950/20">
            <div className="h-1 bg-gradient-to-r from-blue-600 via-violet-500 to-cyan-500" />
            <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <span className="rounded-2xl bg-blue-100 p-3 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"><LayoutGrid className="h-6 w-6" /></span>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700 dark:text-blue-200">Template library · saved reports · evidence records</p>
                  <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">Choose the right report before opening the workspace</h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">Start from a guided authority template or reopen a saved report. The full form, linked users, sessions, police stations, authority matching and PDF tools appear only inside the selected report workspace.</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild variant="outline"><Link to="/admin/sessions"><FileSearch className="mr-2 h-4 w-4" />Session Centre</Link></Button>
                <Button asChild><Link to="/admin/authority-reporting?view=workspace"><FilePlus2 className="mr-2 h-4 w-4" />Blank report</Link></Button>
                <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
              </div>
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-3">
            <a href="tel:999" className="rounded-2xl border border-red-300 bg-red-600 p-4 text-white shadow-sm transition hover:bg-red-700">
              <div className="flex items-center gap-3"><PhoneCall className="h-5 w-5" /><div><p className="text-[10px] font-black uppercase tracking-wide text-red-100">Immediate danger</p><p className="text-xl font-black">Call 999 first</p></div></div>
              <p className="mt-2 text-xs leading-5 text-red-50">Do not delay emergency action to complete a Planyx report.</p>
            </a>
            <a href="tel:101" className="rounded-2xl border border-blue-300 bg-blue-600 p-4 text-white shadow-sm transition hover:bg-blue-700">
              <div className="flex items-center gap-3"><ShieldAlert className="h-5 w-5" /><div><p className="text-[10px] font-black uppercase tracking-wide text-blue-100">Non-emergency police matter</p><p className="text-xl font-black">Call 101 or report online</p></div></div>
              <p className="mt-2 text-xs leading-5 text-blue-50">Use the responsible force’s official channel and retain its reference.</p>
            </a>
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              <div className="flex items-center gap-3"><AlertOctagon className="h-5 w-5" /><div><p className="text-[10px] font-black uppercase tracking-wide">Safeguarding</p><p className="text-xl font-black">Protect first, record second</p></div></div>
              <p className="mt-2 text-xs leading-5">Child referrals must use the child’s responsible council. Adult referrals use the responsible adult safeguarding authority.</p>
            </div>
          </section>

          {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {loading ? [0, 1, 2, 3].map(item => <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />) : <>
              <SummaryCard label="All reports" value={summary.total} detail={`${summary.drafts} drafts`} Icon={FolderOpen} />
              <SummaryCard label="Ready to report" value={summary.ready} detail="Awaiting official submission" Icon={FileCheck2} />
              <SummaryCard label="Reported" value={summary.reported} detail="External action recorded" Icon={BadgeCheck} />
              <SummaryCard label="Evidence holds" value={summary.evidence_holds} detail={`${summary.emergency} emergency records`} Icon={LockKeyhole} />
            </>}
          </section>

          <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <CardContent className="p-4 sm:p-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search templates, authorities, report references, people or email addresses" className="h-11 pl-9" />
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {(['Featured', 'All templates', ...AUTHORITY_TEMPLATE_CATEGORIES] as LibraryFilter[]).map(item => (
                  <button key={item} type="button" onClick={() => setFilter(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition ${filter === item && !query ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-200'}`}>{item}</button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <main className="min-w-0 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="text-xs font-black uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300">Report templates</p><h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{query ? 'Search results' : filter}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{visibleTemplates.length.toLocaleString('en-GB')} template{visibleTemplates.length === 1 ? '' : 's'} available</p></div>
                {filter === 'Featured' && !query && <Button type="button" variant="outline" onClick={() => setFilter('All templates')}>View all templates <ArrowRight className="ml-2 h-4 w-4" /></Button>}
              </div>
              {visibleTemplates.length ? <div className="grid min-w-0 gap-4 md:grid-cols-2">{visibleTemplates.map(template => <TemplateCard key={template.id} template={template} />)}</div> : <Card><CardContent className="py-12 text-center"><FileSearch className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-bold text-slate-950 dark:text-white">No matching report template</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Try a broader authority, subject or report-type search.</p></CardContent></Card>}
            </main>

            <aside className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start">
              <Card className="min-w-0 border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <CardContent className="min-w-0 p-4">
                  <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-[0.11em] text-violet-700 dark:text-violet-300">Saved report library</p><h2 className="mt-1 font-black text-slate-950 dark:text-white">Recent and matching reports</h2></div><FolderOpen className="h-5 w-5 text-violet-600" /></div>
                  <div className="mt-4 space-y-2">
                    {loading ? [0, 1, 2].map(item => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />) : visibleReports.length ? visibleReports.map(report => (
                      <Link key={report.id} to={`/admin/authority-reporting?view=workspace&report=${encodeURIComponent(report.id)}`} className="block min-w-0 rounded-xl border border-slate-200 p-3 transition hover:border-violet-400 hover:bg-violet-50 dark:border-slate-700 dark:hover:border-violet-500 dark:hover:bg-violet-500/10">
                        <div className="flex min-w-0 items-center justify-between gap-2"><span className="truncate font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{report.reference}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${urgencyClasses(report.urgency)}`}>{report.status}</span></div>
                        <p className="mt-1 line-clamp-2 break-words text-sm font-bold text-slate-950 dark:text-white">{report.summary || 'Untitled report draft'}</p>
                        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{report.linked_user_name || report.linked_user_email || report.authority_name || 'No linked person'} · {formatDate(report.updated_at)}</p>
                      </Link>
                    )) : <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700"><FileText className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">No saved reports found</p></div>}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-blue-50/60 dark:border-blue-500/30 dark:bg-blue-500/10"><CardContent className="p-4"><div className="flex items-start gap-3"><Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-blue-700 dark:text-blue-200" /><div><p className="font-black text-blue-950 dark:text-blue-100">The library does not submit reports</p><p className="mt-1 text-xs leading-5 text-blue-900 dark:text-blue-200">Planyx prepares and preserves the internal record and PDF pack. Staff must use the authority’s official route and record the external reference in the workspace.</p></div></div></CardContent></Card>
            </aside>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}
