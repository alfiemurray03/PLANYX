import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { downloadAuthorityReportPdf, type AuthorityReportPdfData } from '@/lib/authority-report-pdf';
import {
  AlertOctagon,
  AlertTriangle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileCheck2,
  FilePlus2,
  FileSearch,
  HeartHandshake,
  Landmark,
  Loader2,
  LockKeyhole,
  PhoneCall,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Siren,
  UserRound,
} from 'lucide-react';

type ReportType = 'police-emergency' | 'police-non-emergency' | 'child-safeguarding' | 'adult-safeguarding' | 'data-breach-ico' | 'local-authority' | 'other-authority';
type Urgency = 'Emergency' | 'Urgent' | 'Routine';
type Status = 'Draft' | 'Ready to report' | 'Reported' | 'Further information requested' | 'Closed';

interface AuthorityReport extends AuthorityReportPdfData {
  id: string;
  reference: string;
  report_type: ReportType;
  authority_name: string;
  authority_channel: string;
  urgency: Urgency;
  status: Status;
  linked_session_id: string;
  linked_session_reference: string;
  linked_user_email: string;
  linked_user_name: string;
  linked_user_type: string;
  subject_name: string;
  subject_date_of_birth: string;
  incident_datetime: string;
  incident_location: string;
  summary: string;
  narrative: string;
  risk_details: string;
  people_involved: string;
  evidence_summary: string;
  immediate_actions: string;
  safeguarding_actions: string;
  data_categories: string;
  individuals_affected: string;
  containment_actions: string;
  external_reference: string;
  assigned_admin: string;
  internal_notes: string;
  staff_declaration: string;
  form_payload: Record<string, unknown>;
  legal_hold: boolean;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  events: Array<{ id: string; event_type: string; actor_email: string; details: Record<string, unknown>; created_at: string }>;
}

interface ReportingPayload {
  reports: AuthorityReport[];
  selected: AuthorityReport | null;
  summary: { total: number; drafts: number; ready: number; reported: number; emergency: number; evidence_holds: number };
}

interface FormState {
  id: string;
  report_type: ReportType;
  authority_name: string;
  authority_channel: string;
  urgency: Urgency;
  status: Status;
  linked_session_id: string;
  linked_session_reference: string;
  linked_user_email: string;
  linked_user_name: string;
  linked_user_type: string;
  subject_name: string;
  subject_date_of_birth: string;
  incident_datetime: string;
  incident_location: string;
  summary: string;
  narrative: string;
  risk_details: string;
  people_involved: string;
  evidence_summary: string;
  immediate_actions: string;
  safeguarding_actions: string;
  data_categories: string;
  individuals_affected: string;
  containment_actions: string;
  external_reference: string;
  assigned_admin: string;
  internal_notes: string;
  staff_declaration: string;
  legal_hold: boolean;
}

const REPORT_DEFINITIONS: Record<ReportType, {
  title: string;
  authority: string;
  channel: string;
  description: string;
  emergency: string;
  officialUrl: string;
  icon: typeof Siren;
  defaultUrgency: Urgency;
}> = {
  'police-emergency': {
    title: 'Emergency police incident', authority: 'Police / emergency services', channel: 'Call 999 immediately',
    description: 'Use this internal record only after emergency action has started. Do not delay a 999 call to complete the form.',
    emergency: 'Serious offence in progress or just happened, immediate danger, property at risk or serious public disruption.',
    officialUrl: 'https://www.police.uk/pu/contact-us/what-and-how-to-report/how-to-report/', icon: Siren, defaultUrgency: 'Emergency',
  },
  'police-non-emergency': {
    title: 'Police 101 / online report', authority: 'Police', channel: 'Call 101 or report online to the responsible police force',
    description: 'For non-emergency crime, suspicious activity, antisocial behaviour, property damage or information that does not require an immediate response.',
    emergency: 'Change to the emergency route and call 999 if anyone becomes immediately unsafe.',
    officialUrl: 'https://www.police.uk/pu/contact-us/what-and-how-to-report/how-to-report/', icon: ShieldAlert, defaultUrgency: 'Routine',
  },
  'child-safeguarding': {
    title: 'Child safeguarding referral', authority: "Child's local authority children’s social care", channel: 'Local council safeguarding / MASH referral channel',
    description: 'Record concerns about abuse, neglect, exploitation or risk of harm. Staff do not need proof before raising a genuine concern.',
    emergency: 'Call 999 first when a child is in immediate danger. A suspected crime can also be reported through 101 or the police online service when it is not an emergency.',
    officialUrl: 'https://www.gov.uk/report-child-abuse', icon: HeartHandshake, defaultUrgency: 'Urgent',
  },
  'adult-safeguarding': {
    title: 'Adult safeguarding referral', authority: 'Local authority adult safeguarding team', channel: 'Council adult safeguarding professional referral',
    description: 'For an adult with care and support needs who may be experiencing abuse, neglect or exploitation and may be unable to protect themselves.',
    emergency: 'Call 999 if the adult is in immediate danger or urgent emergency assistance is required.',
    officialUrl: 'https://www.gov.uk/government/publications/ofsted-safeguarding-policy/safeguarding-concerns-guidance-for-inspectors', icon: UserRound, defaultUrgency: 'Urgent',
  },
  'data-breach-ico': {
    title: 'Personal data breach / ICO assessment', authority: "Information Commissioner's Office", channel: 'ICO breach assessment and online reporting service',
    description: 'Log every personal data breach, assess the likely risk to people and record the decision whether notification is required.',
    emergency: 'A notifiable breach must be reported without undue delay and, where feasible, within 72 hours of becoming aware of it. Report early and update later where necessary.',
    officialUrl: 'https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/', icon: Database, defaultUrgency: 'Urgent',
  },
  'local-authority': {
    title: 'Local authority / public protection referral', authority: 'Relevant local authority', channel: 'Official professional referral form, duty team or published contact route',
    description: 'For a council service, licensing, housing, environmental health, public protection or another local statutory function.',
    emergency: 'Use 999 for immediate danger. Confirm the responsible council and service before submitting personal information.',
    officialUrl: 'https://www.gov.uk/find-local-council', icon: Building2, defaultUrgency: 'Routine',
  },
  'other-authority': {
    title: 'Other authority or regulator', authority: 'Relevant statutory authority or regulator', channel: 'Authority-approved reporting channel',
    description: 'Use where another statutory body, regulator or law-enforcement agency is responsible. Record why that authority was selected.',
    emergency: 'Do not use a general regulator form instead of 999 where there is immediate danger.',
    officialUrl: 'https://www.gov.uk/', icon: Landmark, defaultUrgency: 'Routine',
  },
};

function blankForm(params: URLSearchParams): FormState {
  return {
    id: '', report_type: 'police-non-emergency', authority_name: REPORT_DEFINITIONS['police-non-emergency'].authority,
    authority_channel: REPORT_DEFINITIONS['police-non-emergency'].channel, urgency: 'Routine', status: 'Draft',
    linked_session_id: params.get('session_id') || '', linked_session_reference: params.get('session_reference') || '',
    linked_user_email: params.get('user_email') || '', linked_user_name: params.get('user_name') || '', linked_user_type: params.get('user_type') || '',
    subject_name: '', subject_date_of_birth: '', incident_datetime: '', incident_location: '', summary: '', narrative: '', risk_details: '',
    people_involved: '', evidence_summary: '', immediate_actions: '', safeguarding_actions: '', data_categories: '', individuals_affected: '',
    containment_actions: '', external_reference: '', assigned_admin: '', internal_notes: '',
    staff_declaration: 'I confirm that this record is factual to the best of my knowledge, distinguishes fact from opinion, and does not intentionally omit information relevant to risk or safeguarding.',
    legal_hold: true,
  };
}

function formatDate(value?: string): string {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-GB');
}

function fromReport(report: AuthorityReport): FormState {
  return {
    id: report.id, report_type: report.report_type, authority_name: report.authority_name || '', authority_channel: report.authority_channel || '',
    urgency: report.urgency, status: report.status, linked_session_id: report.linked_session_id || '', linked_session_reference: report.linked_session_reference || '',
    linked_user_email: report.linked_user_email || '', linked_user_name: report.linked_user_name || '', linked_user_type: report.linked_user_type || '',
    subject_name: report.subject_name || '', subject_date_of_birth: report.subject_date_of_birth || '', incident_datetime: report.incident_datetime || '',
    incident_location: report.incident_location || '', summary: report.summary || '', narrative: report.narrative || '', risk_details: report.risk_details || '',
    people_involved: report.people_involved || '', evidence_summary: report.evidence_summary || '', immediate_actions: report.immediate_actions || '',
    safeguarding_actions: report.safeguarding_actions || '', data_categories: report.data_categories || '', individuals_affected: report.individuals_affected || '',
    containment_actions: report.containment_actions || '', external_reference: report.external_reference || '', assigned_admin: report.assigned_admin || '',
    internal_notes: report.internal_notes || '', staff_declaration: report.staff_declaration || '', legal_hold: report.legal_hold,
  };
}

function StatCard({ label, value, detail, Icon }: { label: string; value: number; detail: string; Icon: typeof FileSearch }) {
  return <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><CardContent className="flex items-start justify-between gap-3 p-5"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p><p className="mt-1 text-3xl font-black text-slate-950 dark:text-white">{value}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p></div><div className="rounded-xl bg-violet-100 p-2.5 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"><Icon className="h-5 w-5" /></div></CardContent></Card>;
}

export default function AdminAuthorityReportingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<ReportingPayload | null>(null);
  const [form, setForm] = useState<FormState>(() => blankForm(searchParams));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [query, setQuery] = useState('');
  const definition = REPORT_DEFINITIONS[form.report_type];

  async function load(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const id = searchParams.get('report');
      const response = await fetch(`/api/admin/authority-reports${id ? `?id=${encodeURIComponent(id)}` : ''}`, { credentials: 'include', cache: 'no-store' });
      const result = await response.json().catch(() => ({})) as { success?: boolean; data?: ReportingPayload; error?: string };
      if (!response.ok || !result.success || !result.data) throw new Error(result.error || 'Authority reports could not be loaded.');
      setData(result.data);
      if (result.data.selected) setForm(fromReport(result.data.selected));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authority reports could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filteredReports = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return data?.reports || [];
    return (data?.reports || []).filter(report => [report.reference, report.summary, report.linked_user_email, report.linked_user_name, report.authority_name, report.status]
      .some(field => String(field || '').toLowerCase().includes(value)));
  }, [data?.reports, query]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm(current => ({ ...current, [key]: value }));
    setError('');
    setSuccess('');
  }

  function chooseType(type: ReportType): void {
    const next = REPORT_DEFINITIONS[type];
    setForm(current => ({ ...current, report_type: type, authority_name: next.authority, authority_channel: next.channel, urgency: next.defaultUrgency }));
  }

  function newReport(type: ReportType = 'police-non-emergency'): void {
    const next = blankForm(searchParams);
    const definitionValue = REPORT_DEFINITIONS[type];
    setForm({ ...next, report_type: type, authority_name: definitionValue.authority, authority_channel: definitionValue.channel, urgency: definitionValue.defaultUrgency });
    setSearchParams(current => {
      current.delete('report');
      return current;
    });
    setError('');
    setSuccess('');
  }

  async function saveReport(): Promise<void> {
    if (!form.summary.trim()) { setError('Enter a clear incident or concern summary.'); return; }
    if (!form.narrative.trim()) { setError('Enter a factual chronology or narrative.'); return; }
    if (form.urgency === 'Emergency' && !form.immediate_actions.trim()) { setError('Record the immediate action taken, including whether 999 was called.'); return; }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/admin/authority-reports', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...form, action: form.id ? 'update' : 'create', form_payload: { guidance_version: '2026-07-24', prepared_in: 'Sousa Murray Planeia Authority Reporting Centre' } }),
      });
      const result = await response.json().catch(() => ({})) as { success?: boolean; report?: AuthorityReport; data?: ReportingPayload; error?: string };
      if (!response.ok || !result.success || !result.report || !result.data) throw new Error(result.error || 'The report could not be saved.');
      setData(result.data);
      setForm(fromReport(result.report));
      setSearchParams({ report: result.report.id });
      setSuccess(`${result.report.reference} was saved. The linked session is preserved on an evidence hold where applicable.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The report could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const selectedReport = data?.reports.find(report => report.id === form.id) || null;

  return (
    <>
      <Helmet><title>Authority Reporting Centre - Sousa Murray Planeia Admin Centre</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <AdminLayout title="Authority Reporting Centre">
        <div className="mx-auto w-full max-w-7xl space-y-5 pb-20">
          <section className="overflow-hidden rounded-2xl border border-red-200 bg-gradient-to-r from-white via-red-50/70 to-amber-50/70 shadow-lg dark:border-red-500/30 dark:from-slate-950 dark:via-red-950/20 dark:to-amber-950/20">
            <div className="h-1 bg-gradient-to-r from-red-600 via-amber-500 to-blue-600" />
            <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4"><div className="rounded-2xl bg-red-100 p-3 text-red-700 dark:bg-red-500/15 dark:text-red-200"><Siren className="h-6 w-6" /></div><div><p className="text-xs font-black uppercase tracking-[0.14em] text-red-700 dark:text-red-200">Police · safeguarding · regulators · local authorities</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">Prepare a clear, factual and auditable authority report</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">This centre builds an internal record and formal PDF pack. It does not submit the report. Staff must use the authority’s official phone or online channel and record the external reference.</p></div></div>
              <div className="flex shrink-0 flex-wrap gap-2"><Button asChild variant="outline"><Link to="/admin/sessions"><FileSearch className="mr-2 h-4 w-4" />Session Centre</Link></Button><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button></div>
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-3">
            <a href="tel:999" className="rounded-2xl border border-red-300 bg-red-600 p-5 text-white shadow-sm transition hover:bg-red-700"><div className="flex items-center gap-3"><PhoneCall className="h-6 w-6" /><div><p className="text-xs font-bold uppercase tracking-wide text-red-100">Immediate danger or serious incident</p><p className="text-2xl font-black">Call 999</p></div></div><p className="mt-3 text-sm leading-6 text-red-50">Serious offence in progress or just happened, someone in immediate danger, property at risk or serious public disruption. Do not wait to complete a form.</p></a>
            <a href="tel:101" className="rounded-2xl border border-blue-300 bg-blue-600 p-5 text-white shadow-sm transition hover:bg-blue-700"><div className="flex items-center gap-3"><ShieldAlert className="h-6 w-6" /><div><p className="text-xs font-bold uppercase tracking-wide text-blue-100">Police matter without immediate danger</p><p className="text-2xl font-black">Call 101 or report online</p></div></div><p className="mt-3 text-sm leading-6 text-blue-50">Minor crime, property damage, antisocial behaviour, suspicious activity, non-urgent information or enquiries.</p></a>
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"><div className="flex items-center gap-3"><AlertOctagon className="h-6 w-6" /><div><p className="text-xs font-bold uppercase tracking-wide">Safeguarding rule</p><p className="text-xl font-black">Protect first, record second</p></div></div><p className="mt-3 text-sm leading-6">Call 999 for immediate danger. Otherwise report child concerns to children’s social care and adult concerns to the local authority adult safeguarding team. You do not need proof before reporting a genuine concern.</p></div>
          </div>

          {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
          {success && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{success}</AlertDescription></Alert>}

          {loading || !data ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0,1,2,3].map(item => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}</div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="All reports" value={data.summary.total} detail="Permanent internal references" Icon={FileSearch} /><StatCard label="Ready" value={data.summary.ready} detail="Awaiting official submission" Icon={FileCheck2} /><StatCard label="Reported" value={data.summary.reported} detail="External action recorded" Icon={BadgeCheck} /><StatCard label="Evidence holds" value={data.summary.evidence_holds} detail={`${data.summary.emergency} open emergency reports`} Icon={LockKeyhole} /></div>}

          <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
              <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><CardContent className="p-4"><div className="flex items-center justify-between gap-2"><h2 className="font-black text-slate-950 dark:text-white">Report builders</h2><Button size="sm" variant="outline" onClick={() => newReport()}><FilePlus2 className="mr-2 h-4 w-4" />New</Button></div><div className="mt-3 space-y-2">{(Object.entries(REPORT_DEFINITIONS) as Array<[ReportType, typeof REPORT_DEFINITIONS[ReportType]]>).map(([type, item]) => { const Icon = item.icon; const active = form.report_type === type; return <button key={type} type="button" onClick={() => chooseType(type)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/15 dark:border-blue-400 dark:bg-blue-500/10' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-blue-500 dark:hover:bg-slate-800'}`}><div className="rounded-lg bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Icon className="h-4 w-4" /></div><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-950 dark:text-white">{item.title}</span><span className="block truncate text-xs text-slate-500 dark:text-slate-400">{item.authority}</span></span><ChevronRight className="h-4 w-4 text-slate-400" /></button>; })}</div></CardContent></Card>

              <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><CardContent className="p-4"><Label htmlFor="report-search">Saved reports</Label><Input id="report-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search reference or person" className="mt-2" /><div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">{filteredReports.length ? filteredReports.map(report => <button key={report.id} type="button" onClick={() => { setForm(fromReport(report)); setSearchParams({ report: report.id }); }} className={`w-full rounded-xl border p-3 text-left ${form.id === report.id ? 'border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-500/10' : 'border-slate-200 dark:border-slate-700'}`}><div className="flex items-center justify-between gap-2"><span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{report.reference}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${report.urgency === 'Emergency' ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{report.status}</span></div><p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-950 dark:text-white">{report.summary}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDate(report.updated_at)}</p></button>) : <p className="py-6 text-center text-sm text-slate-500">No reports found.</p>}</div></CardContent></Card>
            </aside>

            <main className="space-y-4">
              <Alert className={`${form.urgency === 'Emergency' ? 'border-red-300 bg-red-50 text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100' : 'border-blue-200 bg-blue-50/70 text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100'}`}><definition.icon className="h-4 w-4" /><AlertDescription><strong>{definition.title}:</strong> {definition.description}<br /><span className="mt-1 block font-semibold">{definition.emergency}</span><a href={definition.officialUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center font-bold underline">Open official guidance <ExternalLink className="ml-1 h-3.5 w-3.5" /></a></AlertDescription></Alert>

              <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><CardContent className="space-y-6 p-5 sm:p-6">
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-slate-700 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">{form.id ? 'Editing saved report' : 'New report draft'}</p><h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{selectedReport?.reference || definition.title}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Complete facts known at this stage. Clearly state when information is alleged, reported by someone else or not yet verified.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!selectedReport} onClick={() => selectedReport && downloadAuthorityReportPdf(selectedReport)}><Download className="mr-2 h-4 w-4" />Download PDF</Button><Button onClick={() => void saveReport()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{form.id ? 'Save update' : 'Save report'}</Button></div></div>

                <section className="space-y-4"><div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-blue-600 dark:text-blue-300" /><h3 className="font-black text-slate-950 dark:text-white">1. Authority, urgency and status</h3></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><div><Label htmlFor="report-type">Report type</Label><select id="report-type" value={form.report_type} onChange={event => chooseType(event.target.value as ReportType)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{Object.entries(REPORT_DEFINITIONS).map(([type, item]) => <option key={type} value={type}>{item.title}</option>)}</select></div><div><Label htmlFor="urgency">Urgency</Label><select id="urgency" value={form.urgency} onChange={event => update('urgency', event.target.value as Urgency)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option>Emergency</option><option>Urgent</option><option>Routine</option></select></div><div><Label htmlFor="status">Internal status</Label><select id="status" value={form.status} onChange={event => update('status', event.target.value as Status)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option>Draft</option><option>Ready to report</option><option>Reported</option><option>Further information requested</option><option>Closed</option></select></div><div><Label htmlFor="authority-name">Authority</Label><Input id="authority-name" value={form.authority_name} onChange={event => update('authority_name', event.target.value)} /></div><div className="md:col-span-2"><Label htmlFor="authority-channel">Official submission channel</Label><Input id="authority-channel" value={form.authority_channel} onChange={event => update('authority_channel', event.target.value)} /></div></div></section>

                <section className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700"><div className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-violet-600 dark:text-violet-300" /><h3 className="font-black text-slate-950 dark:text-white">2. Linked Sousa Murray Planeia records</h3></div><div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="session-reference">Session reference</Label><Input id="session-reference" value={form.linked_session_reference} onChange={event => update('linked_session_reference', event.target.value)} placeholder="SES-ADM-..." /></div><div><Label htmlFor="user-email">Linked user email</Label><Input id="user-email" type="email" value={form.linked_user_email} onChange={event => update('linked_user_email', event.target.value)} /></div><div><Label htmlFor="user-name">Linked user name</Label><Input id="user-name" value={form.linked_user_name} onChange={event => update('linked_user_name', event.target.value)} /></div><div><Label htmlFor="user-type">Record type</Label><Input id="user-type" value={form.linked_user_type} onChange={event => update('linked_user_type', event.target.value)} placeholder="Customer or Administrator" /></div></div>{form.linked_session_id && <Alert className="border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100"><LockKeyhole className="h-4 w-4" /><AlertDescription>Saving this report places the linked session on an evidence hold so it is not treated as an ordinary expired record.</AlertDescription></Alert>}</section>

                <section className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700"><div className="flex items-center gap-2"><UserRound className="h-5 w-5 text-blue-600 dark:text-blue-300" /><h3 className="font-black text-slate-950 dark:text-white">3. Person or subject of concern</h3></div><div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="subject-name">Full name</Label><Input id="subject-name" value={form.subject_name} onChange={event => update('subject_name', event.target.value)} /></div><div><Label htmlFor="subject-dob">Date of birth, if lawfully known and relevant</Label><Input id="subject-dob" type="date" value={form.subject_date_of_birth} onChange={event => update('subject_date_of_birth', event.target.value)} /></div></div></section>

                <section className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-300" /><h3 className="font-black text-slate-950 dark:text-white">4. Incident, concern and chronology</h3></div><div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="incident-time">Incident date and time</Label><Input id="incident-time" type="datetime-local" value={form.incident_datetime} onChange={event => update('incident_datetime', event.target.value)} /></div><div><Label htmlFor="incident-location">Location, platform area or address</Label><Input id="incident-location" value={form.incident_location} onChange={event => update('incident_location', event.target.value)} /></div></div><div><Label htmlFor="summary">Short factual summary *</Label><Textarea id="summary" rows={3} value={form.summary} onChange={event => update('summary', event.target.value)} placeholder="What happened or what is the concern?" /></div><div><Label htmlFor="narrative">Detailed factual chronology *</Label><Textarea id="narrative" rows={8} value={form.narrative} onChange={event => update('narrative', event.target.value)} placeholder="Record events in date and time order. Identify the source of each fact and distinguish fact, allegation and professional judgement." /></div><div><Label htmlFor="risk">Risk, harm and immediate danger</Label><Textarea id="risk" rows={4} value={form.risk_details} onChange={event => update('risk_details', event.target.value)} /></div><div><Label htmlFor="people">People involved, witnesses and contact details</Label><Textarea id="people" rows={4} value={form.people_involved} onChange={event => update('people_involved', event.target.value)} /></div></section>

                <section className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-300" /><h3 className="font-black text-slate-950 dark:text-white">5. Evidence and protective action</h3></div><div><Label htmlFor="evidence">Evidence preserved</Label><Textarea id="evidence" rows={4} value={form.evidence_summary} onChange={event => update('evidence_summary', event.target.value)} placeholder="Session reference, screenshots, emails, messages, logs, documents, file names and where originals are preserved." /></div><div><Label htmlFor="actions">Immediate action taken</Label><Textarea id="actions" rows={4} value={form.immediate_actions} onChange={event => update('immediate_actions', event.target.value)} placeholder="999/101 call, welfare action, account protection, manager notification, evidence preservation or other action." /></div>{(form.report_type === 'child-safeguarding' || form.report_type === 'adult-safeguarding') && <div><Label htmlFor="safeguarding-actions">Safeguarding actions and escalation</Label><Textarea id="safeguarding-actions" rows={4} value={form.safeguarding_actions} onChange={event => update('safeguarding_actions', event.target.value)} placeholder="Designated Safeguarding Officer informed, local authority contacted, consent considerations, emergency action and referral details." /></div>}</section>

                {form.report_type === 'data-breach-ico' && <section className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700"><div className="flex items-center gap-2"><Database className="h-5 w-5 text-violet-600 dark:text-violet-300" /><h3 className="font-black text-slate-950 dark:text-white">6. Personal data breach assessment</h3></div><div><Label htmlFor="data-categories">Categories and sensitivity of personal data</Label><Textarea id="data-categories" rows={4} value={form.data_categories} onChange={event => update('data_categories', event.target.value)} /></div><div><Label htmlFor="affected">Individuals and approximate number affected</Label><Textarea id="affected" rows={4} value={form.individuals_affected} onChange={event => update('individuals_affected', event.target.value)} /></div><div><Label htmlFor="containment">Containment, recovery and mitigation</Label><Textarea id="containment" rows={4} value={form.containment_actions} onChange={event => update('containment_actions', event.target.value)} /></div><Alert className="border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100"><Clock3 className="h-4 w-4" /><AlertDescription>Record when the organisation became aware of the breach. The 72-hour reporting period runs from awareness, not necessarily from when the incident first occurred.</AlertDescription></Alert></section>}

                <section className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700"><div className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-blue-600 dark:text-blue-300" /><h3 className="font-black text-slate-950 dark:text-white">7. Submission, administration and declaration</h3></div><div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="external-reference">Authority reference / crime number</Label><Input id="external-reference" value={form.external_reference} onChange={event => update('external_reference', event.target.value)} /></div><div><Label htmlFor="assigned-admin">Assigned staff email</Label><Input id="assigned-admin" type="email" value={form.assigned_admin} onChange={event => update('assigned_admin', event.target.value)} /></div></div><div><Label htmlFor="internal-notes">Restricted internal notes</Label><Textarea id="internal-notes" rows={4} value={form.internal_notes} onChange={event => update('internal_notes', event.target.value)} /></div><div><Label htmlFor="declaration">Staff declaration</Label><Textarea id="declaration" rows={3} value={form.staff_declaration} onChange={event => update('staff_declaration', event.target.value)} /></div><label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50"><input type="checkbox" checked={form.legal_hold} onChange={event => update('legal_hold', event.target.checked)} className="mt-1" /><span><span className="block font-bold text-slate-950 dark:text-white">Preserve linked session evidence</span><span className="block text-sm text-slate-500 dark:text-slate-400">Keep the session on an evidence hold while this report or investigation remains open.</span></span></label></section>

                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-5 dark:border-slate-700"><Button variant="outline" onClick={() => newReport(form.report_type)}>Clear form</Button><Button variant="outline" disabled={!selectedReport} onClick={() => selectedReport && downloadAuthorityReportPdf(selectedReport)}><Download className="mr-2 h-4 w-4" />Download formal PDF</Button><Button onClick={() => void saveReport()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{form.id ? 'Save update' : 'Save report'}</Button></div>
              </CardContent></Card>

              {selectedReport && selectedReport.events.length > 0 && <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><CardContent className="p-5"><h2 className="font-black text-slate-950 dark:text-white">Report chronology</h2><ol className="mt-4 space-y-4">{selectedReport.events.map(event => <li key={event.id} className="border-l-2 border-blue-200 pl-4 dark:border-blue-500/30"><p className="font-bold text-slate-900 dark:text-white">{event.event_type}</p><p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(event.created_at)} · {event.actor_email || 'System'}</p></li>)}</ol></CardContent></Card>}
            </main>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}
