import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  ExternalLink,
  Fingerprint,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Smartphone,
  UserRoundCheck,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { PoliceStationSelection } from '@/components/admin/PoliceStationDirectory';

export interface ReportContextSession {
  id: string;
  reference: string;
  realm: string;
  status: string;
  createdAt?: string | null;
  lastSeenAt?: string | null;
  ipAddress: string;
  countryCode: string;
  userAgent: string;
  legalHold: boolean;
  legalHoldReason: string;
}

export interface ReportContextUser {
  id: string;
  email: string;
  name: string;
  company: string;
  phone: string;
  accountStatus: string;
  accountType: string;
  recordType: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    county: string;
    country: string;
    postcode: string;
    formatted: string;
  };
  addressSource: string;
  stripeCustomerId: string;
  sessions: ReportContextSession[];
  reports: Array<{ id: string; reference: string; report_type: string; urgency: string; status: string; summary: string; updated_at: string }>;
}

interface UserSearchResult {
  id: string;
  email: string;
  name: string;
  company: string;
  postcode: string;
  addressAvailable: boolean;
  accountStatus: string;
  accountType: string;
  recordType: string;
}

interface PoliceResolution {
  origin: { latitude: number; longitude: number; postcode: string; country: string };
  force: { id: string; name: string; neighbourhood: string; source: string } | null;
  stations: Array<PoliceStationSelection & { forceId?: string; distanceMiles?: number | null }>;
  guidance: string;
}

export interface AuthorityLinkContext {
  user: ReportContextUser | null;
  sessions: ReportContextSession[];
  assignedStation: (PoliceStationSelection & { forceId?: string; distanceMiles?: number | null }) | null;
  policeResolution: PoliceResolution | null;
}

function formatDate(value?: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB');
}

function deviceLabel(userAgent: string): string {
  const value = userAgent.toLowerCase();
  const device = value.includes('iphone') ? 'iPhone'
    : value.includes('ipad') ? 'iPad'
      : value.includes('android') ? 'Android device'
        : value.includes('windows') ? 'Windows computer'
          : value.includes('macintosh') || value.includes('mac os') ? 'Mac'
            : 'Unknown device';
  const browser = value.includes('edg/') ? 'Microsoft Edge'
    : value.includes('firefox/') ? 'Firefox'
      : value.includes('chrome/') ? 'Google Chrome'
        : value.includes('safari/') ? 'Safari'
          : 'Unknown browser';
  return `${device} · ${browser}`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';
}

export default function AuthorityReportLinkingPanel({
  context,
  onContextChange,
  onApply,
  onAssignStation,
  onOpenFullDirectory,
}: {
  context: AuthorityLinkContext;
  onContextChange: (context: AuthorityLinkContext) => void;
  onApply: (user: ReportContextUser, sessions: ReportContextSession[]) => void;
  onAssignStation: (station: PoliceStationSelection & { forceId?: string; distanceMiles?: number | null }) => void;
  onOpenFullDirectory: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingUser, setLoadingUser] = useState('');
  const [resolvingPolice, setResolvingPolice] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selectedIds = useMemo(() => new Set(context.sessions.map(session => session.id)), [context.sessions]);

  async function searchUsers(): Promise<void> {
    const value = query.trim();
    if (value.length < 2) {
      setError('Enter at least two characters from the user’s name, email address or organisation.');
      return;
    }
    setSearching(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/authority-user-search?q=${encodeURIComponent(value)}`, { credentials: 'include', cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as { success?: boolean; users?: UserSearchResult[]; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || 'User search failed.');
      setResults(data.users || []);
      if (!(data.users || []).length) setMessage('No Planyx customer, administrator or tracked sign-in identity matched that name or email address.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'User search failed.');
    } finally {
      setSearching(false);
    }
  }

  async function selectUser(result: UserSearchResult): Promise<void> {
    setLoadingUser(result.email);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/authority-user-search?email=${encodeURIComponent(result.email)}`, { credentials: 'include', cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as { success?: boolean; user?: ReportContextUser; error?: string };
      if (!response.ok || !data.success || !data.user) throw new Error(data.error || 'User context could not be loaded.');
      onContextChange({ user: data.user, sessions: [], assignedStation: null, policeResolution: null });
      setResults([]);
      setQuery(data.user.name);
      setMessage(`${data.user.name} is ready to link. Select any sessions that form part of the report.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'User context could not be loaded.');
    } finally {
      setLoadingUser('');
    }
  }

  function toggleSession(session: ReportContextSession): void {
    const sessions = selectedIds.has(session.id)
      ? context.sessions.filter(item => item.id !== session.id)
      : [...context.sessions, session];
    onContextChange({ ...context, sessions });
    setMessage('');
  }

  async function resolvePolice(): Promise<void> {
    if (!context.user) return;
    setResolvingPolice(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/authority-report-context', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action: 'resolve_police', email: context.user.email }),
      });
      const data = await response.json().catch(() => ({})) as { success?: boolean; data?: PoliceResolution; error?: string };
      if (!response.ok || !data.success || !data.data) throw new Error(data.error || 'The responsible police force could not be resolved.');
      onContextChange({ ...context, policeResolution: data.data, assignedStation: null });
      setMessage(data.data.force
        ? `${data.data.force.name} was identified for ${data.data.origin.postcode}. Review and assign a station below.`
        : data.data.guidance);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The responsible police force could not be resolved.');
    } finally {
      setResolvingPolice(false);
    }
  }

  function assignStation(station: PoliceStationSelection & { forceId?: string; distanceMiles?: number | null }): void {
    onContextChange({ ...context, assignedStation: station });
    onAssignStation(station);
    setMessage(`${station.stationName} has been assigned to the report. Verify the station and reporting route before submission.`);
  }

  return (
    <div className="space-y-5 rounded-2xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-500/30 dark:bg-violet-500/5 sm:p-5">
      <div>
        <div className="flex items-center gap-2"><CircleUserRound className="h-5 w-5 text-violet-700 dark:text-violet-300" /><h3 className="font-black text-slate-950 dark:text-white">Search and link a Planyx user</h3></div>
        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Search customers and administrators by full name, partial name, email address or organisation. Select the correct identity, attach relevant sessions and apply it directly to this report.</p>
      </div>

      <Card className="border-blue-200 bg-white dark:border-blue-500/30 dark:bg-slate-900">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><Input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void searchUsers(); } }} placeholder="Name, email address or organisation" className="pl-9" /></div>
            <Button type="button" onClick={() => void searchUsers()} disabled={searching}>{searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Search users</Button>
          </div>
          {results.length > 0 && <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950/60">{results.map(result => <button key={`${result.recordType}-${result.email}`} type="button" onClick={() => void selectUser(result)} className="flex w-full items-center gap-3 rounded-lg border border-transparent bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-blue-500/10"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-black text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">{initials(result.name)}</div><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-950 dark:text-white">{result.name}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{result.recordType}</span></span><span className="block truncate text-xs text-slate-500 dark:text-slate-400">{result.email}{result.company ? ` · ${result.company}` : ''}</span><span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">{result.accountType} · {result.accountStatus} · {result.addressAvailable ? `Address available${result.postcode ? ` (${result.postcode})` : ''}` : 'No saved billing address'}</span></span>{loadingUser === result.email ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}</button>)}</div>}
        </CardContent>
      </Card>

      {context.user && <>
        <Card className="border-emerald-200 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/5">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">{initials(context.user.name)}</div><div><p className="font-black text-slate-950 dark:text-white">{context.user.name}</p><p className="text-sm text-slate-600 dark:text-slate-300">{context.user.email}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{context.user.recordType} · {context.user.company || 'No organisation recorded'} · {context.user.accountType} · {context.user.accountStatus}</p></div></div>
              <Button type="button" onClick={() => onApply(context.user!, context.sessions)}><UserRoundCheck className="mr-2 h-4 w-4" />Link selected details</Button>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" /><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{context.user.addressSource}</p><p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{context.user.address.formatted || 'No postal or billing address is stored for this identity.'}</p>{context.user.stripeCustomerId && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Stripe customer linked: {context.user.stripeCustomerId}</p>}</div></div></div>
            <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void resolvePolice()} disabled={resolvingPolice || !context.user.address.postcode || context.user.recordType !== 'Customer'}>{resolvingPolice ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Find responsible force and nearest station</Button><Button type="button" variant="outline" onClick={onOpenFullDirectory}><Building2 className="mr-2 h-4 w-4" />Open full UK station directory</Button></div>
            {!context.user.address.postcode && <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"><AlertTriangle className="h-4 w-4" /><AlertDescription>No billing or account postcode is stored. Verify the address manually before assigning a force or station.</AlertDescription></Alert>}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Fingerprint className="h-5 w-5 text-violet-600 dark:text-violet-300" /><h3 className="font-black text-slate-950 dark:text-white">Attach this user’s sessions</h3></div><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Select every session relevant to the incident. Saving the report places attached sessions on an evidence hold and records the link in the audit chronology.</p></div><span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">{context.sessions.length} selected</span></div>
            {context.user.sessions.length ? <div className="max-h-96 space-y-2 overflow-y-auto pr-1">{context.user.sessions.map(session => { const selected = selectedIds.has(session.id); return <label key={session.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${selected ? 'border-violet-400 bg-violet-50 dark:border-violet-400 dark:bg-violet-500/10' : 'border-slate-200 hover:border-violet-300 dark:border-slate-700 dark:hover:border-violet-500'}`}><input type="checkbox" checked={selected} onChange={() => toggleSession(session)} className="mt-1 h-4 w-4 rounded border-slate-300" /><Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">{session.reference}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{session.status}</span>{session.legalHold && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">Evidence hold</span>}</span><span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">{deviceLabel(session.userAgent)}</span><span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">Last activity: {formatDate(session.lastSeenAt || session.createdAt)}{session.ipAddress ? ` · IP ${session.ipAddress}` : ''}{session.countryCode ? ` · ${session.countryCode}` : ''}</span></span></label>; })}</div> : <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No tracked sessions are currently linked to this identity.</p>}
          </CardContent>
        </Card>

        {context.policeResolution && <Card className="border-blue-200 bg-blue-50/40 dark:border-blue-500/30 dark:bg-blue-500/5"><CardContent className="space-y-4 p-4 sm:p-5"><div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-blue-700 dark:text-blue-300" /><h3 className="font-black text-slate-950 dark:text-white">Responsible police force and nearest published stations</h3></div><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Postcode used: {context.policeResolution.origin.postcode}. {context.policeResolution.guidance}</p></div>{context.policeResolution.force ? <div className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-500/30 dark:bg-slate-900"><p className="text-xs font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Assigned territorial force</p><p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{context.policeResolution.force.name}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Police.uk neighbourhood: {context.policeResolution.force.neighbourhood || 'Not published'}</p></div> : <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"><AlertTriangle className="h-4 w-4" /><AlertDescription>{context.policeResolution.guidance}</AlertDescription></Alert>}{context.policeResolution.stations.length > 0 && <div className="space-y-2">{context.policeResolution.stations.map(station => <button key={`${station.stationName}-${station.postcode}`} type="button" onClick={() => assignStation(station)} className={`flex w-full items-start gap-3 rounded-xl border bg-white p-3 text-left transition hover:border-blue-400 hover:bg-blue-50 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-blue-500/10 ${context.assignedStation?.stationName === station.stationName && context.assignedStation?.postcode === station.postcode ? 'border-emerald-400 ring-2 ring-emerald-500/15' : 'border-slate-200 dark:border-slate-700'}`}><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" /><span className="min-w-0 flex-1"><span className="block font-bold text-slate-950 dark:text-white">{station.stationName}</span><span className="mt-0.5 block text-xs leading-5 text-slate-600 dark:text-slate-300">{[station.address, station.postcode].filter(Boolean).join(', ') || 'Address not published'}</span><span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">{station.distanceMiles !== null && station.distanceMiles !== undefined ? `${station.distanceMiles.toLocaleString('en-GB')} miles from postcode centroid · ` : ''}{station.stationType}{station.telephone ? ` · ${station.telephone}` : ''}</span></span>{context.assignedStation?.stationName === station.stationName && context.assignedStation?.postcode === station.postcode ? <CheckCircle2 className="mt-1 h-4 w-4 text-emerald-600" /> : <ChevronRight className="mt-1 h-4 w-4 text-slate-400" />}</button>)}</div>}{context.policeResolution.force && <a href={context.policeResolution.stations[0]?.sourceUrl || 'https://www.police.uk/pu/contact-us/find-force-local-policing-team/'} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs font-bold text-blue-700 underline dark:text-blue-300">Verify using the official force website <ExternalLink className="ml-1 h-3.5 w-3.5" /></a>}</CardContent></Card>}
      </>}

      {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
      {message && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{message}</AlertDescription></Alert>}
    </div>
  );
}
