import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';

type Marker = {
  markerReference?: string;
  markerCode?: string;
  markerType?: string;
  category?: string;
  crmLabel?: string;
  riskLevel?: string;
  status?: string;
  visibility?: string;
  branchInstruction?: string;
  siteEnforcement?: string;
  reviewAt?: string | null;
  expiresAt?: string | null;
  confidentialReasonWithheld?: boolean;
};

type Access = {
  decision?: string;
  revokeSessions?: boolean;
  reason?: string;
  restrictions?: Array<Record<string, unknown>>;
  ageAssurance?: Record<string, unknown>;
  confidentialRestrictionReasonsWithheld?: boolean;
};

type SecurityState = {
  contractVersion?: string;
  authority?: string;
  customer?: { customerNumber?: string; accountStatus?: string; securityStatus?: string };
  platform?: { id?: string; code?: string; name?: string };
  lockdown?: { active?: boolean; mode?: string; status?: string; publicMessage?: string; branchInstruction?: string } | null;
  markers?: Marker[];
  access?: Access;
  generatedAt?: string;
  confidentialReasoningWithheld?: boolean;
};

type Payload = {
  success?: boolean;
  available?: boolean;
  cached?: boolean;
  customerNumber?: string;
  fetchedAt?: string;
  state?: SecurityState;
  notice?: string;
  warning?: string;
  error?: string;
};

const asText = (value: unknown, fallback = 'Not recorded') => value === null || value === undefined || value === '' ? fallback : String(value);
const tone = (value: unknown) => {
  const text = String(value || '').toLowerCase();
  if (['allow', 'clear', 'active', 'operational', 'approved'].includes(text)) return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100';
  if (['deny', 'critical', 'blocked', 'suspended', 'lockdown'].includes(text)) return 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100';
  return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100';
};

function BranchSecurityPanel({ email }: { email: string }) {
  const [payload, setPayload] = useState<Payload>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/head-office-security?email=${encodeURIComponent(email)}`, { credentials: 'include', cache: 'no-store' });
      const result = await response.json().catch(() => ({})) as Payload;
      if (!response.ok && !result.state) throw new Error(result.error || 'Head Office security state could not be loaded.');
      setPayload(result);
    } catch (error) {
      setPayload({ success: false, available: false, error: error instanceof Error ? error.message : 'Head Office security state could not be loaded.' });
    } finally { setLoading(false); }
  }, [email]);

  useEffect(() => { void load(); }, [load]);

  const state = payload.state || {};
  const markers = Array.isArray(state.markers) ? state.markers : [];
  const access = state.access || {};
  const age = access.ageAssurance || {};

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-blue-200 bg-white shadow-none dark:border-blue-900 dark:bg-slate-950" data-head-office-security-state>
      <header className="flex flex-col gap-3 border-b border-blue-100 bg-blue-50/70 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/20 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-blue-100 p-2 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200"><ShieldCheck className="h-4 w-4" /></div>
          <div><h3 className="text-sm font-semibold text-slate-950 dark:text-white">Head Office security authority</h3><p className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-300">Live branch-safe access decision, security markers and instructions for this Sousa Murray Planeia customer.</p></div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh from Head Office</button>
      </header>

      <div className="space-y-4 p-4">
        {payload.warning ? <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{payload.warning}</span></div> : null}
        {payload.error && !payload.state ? <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{payload.error}</span></div> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><p className="text-[10px] uppercase tracking-wide text-slate-500">Universal Customer Number</p><p className="mt-1 font-mono text-sm font-semibold">{asText(payload.customerNumber || state.customer?.customerNumber)}</p></div>
          <div className={`rounded-lg border p-3 ${tone(access.decision)}`}><p className="text-[10px] uppercase tracking-wide opacity-75">Current access decision</p><p className="mt-1 text-sm font-semibold uppercase">{asText(access.decision, loading ? 'Checking' : 'Unavailable')}</p></div>
          <div className={`rounded-lg border p-3 ${tone(state.customer?.securityStatus)}`}><p className="text-[10px] uppercase tracking-wide opacity-75">Head Office security status</p><p className="mt-1 text-sm font-semibold">{asText(state.customer?.securityStatus)}</p></div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><p className="text-[10px] uppercase tracking-wide text-slate-500">Central age assurance</p><p className="mt-1 text-sm font-semibold">{age.required === true ? `${asText(age.minimumAge, '16')}+ ${age.satisfied === true ? 'satisfied' : asText(age.decision, 'required')}` : 'Not currently required'}</p></div>
        </div>

        {state.lockdown?.active ? <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100"><div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" />Platform security control active</div><p className="mt-1 text-xs leading-5">{state.lockdown.branchInstruction || state.lockdown.publicMessage || 'Follow the Head Office lockdown instruction.'}</p></div> : null}

        <div>
          <div className="mb-2 flex items-center justify-between"><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">Head Office security markers</h4><span className="text-[11px] text-slate-500">{markers.length} active marker{markers.length === 1 ? '' : 's'}</span></div>
          {markers.length ? <div className="space-y-2">{markers.map((marker, index) => <article key={marker.markerReference || `${marker.markerCode}-${index}`} className={`rounded-lg border p-3 ${tone(marker.riskLevel)}`}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">{marker.crmLabel || marker.markerCode || marker.markerType || 'Security marker'}</p><p className="font-mono text-[10px] opacity-75">{marker.markerReference || 'Reference withheld'} · {marker.category || 'security'}</p></div><span className="text-[10px] font-semibold uppercase">{marker.riskLevel || marker.status || 'review'}</span></div>
            <p className="mt-2 text-xs leading-5">{marker.branchInstruction || 'Follow the current Head Office access decision and contact Head Office for case details.'}</p>
            <p className="mt-2 text-[10px] opacity-70">Confidential Head Office reasoning is withheld from the branch portal.</p>
          </article>)}</div> : <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 p-4 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"><CheckCircle2 className="h-4 w-4 text-emerald-600" />No active branch-visible Head Office security markers.</div>}
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-[11px] leading-5 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          <strong>Decision authority:</strong> JA Group Services Ltd Head Office. Sousa Murray Planeia displays and enforces the branch instruction but cannot create, clear or override a central marker. {payload.cached ? 'This view is cached because the live connection was unavailable.' : 'This view was checked live.'}
          <span className="block">Last checked: {payload.fetchedAt ? new Date(payload.fetchedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not available'}.</span>
        </div>
      </div>
    </section>
  );
}

export default function HeadOfficeSecurityCrmEnhancer() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [email, setEmail] = useState('');

  const locate = useCallback(() => {
    const match = window.location.pathname.match(/^\/admin\/users\/([^/]+)\/?$/);
    if (!match) { setTarget(null); setEmail(''); return; }
    const decoded = decodeURIComponent(match[1]);
    const heading = Array.from(document.querySelectorAll('h3')).find(node => node.textContent?.trim() === 'Verify customer identity');
    const panel = heading?.closest('[role="tabpanel"]') || heading?.closest('div[data-state]') || heading?.closest('section')?.parentElement;
    if (!panel) return;
    let mount = panel.querySelector<HTMLElement>(':scope > [data-head-office-security-mount]');
    if (!mount) {
      mount = document.createElement('div');
      mount.dataset.headOfficeSecurityMount = 'true';
      panel.prepend(mount);
    }
    setEmail(decoded);
    setTarget(mount);
  }, []);

  useEffect(() => {
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', locate);
    return () => { observer.disconnect(); window.removeEventListener('popstate', locate); };
  }, [locate]);

  const content = useMemo(() => target && email ? <BranchSecurityPanel email={email} /> : null, [target, email]);
  return target && content ? createPortal(content, target) : null;
}
