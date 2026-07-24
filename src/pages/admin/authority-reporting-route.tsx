import { useEffect, useRef, useState } from 'react';
import { Building2, CheckCircle2, Link2, X } from 'lucide-react';
import AdminAuthorityReportingPage from '@/pages/admin/authority-reporting';
import PoliceStationDirectory, { type PoliceStationSelection } from '@/components/admin/PoliceStationDirectory';
import AuthorityReportLinkingPanel, {
  type AuthorityLinkContext,
  type ReportContextSession,
  type ReportContextUser,
} from '@/components/admin/AuthorityReportLinkingPanel';
import { Button } from '@/components/ui/button';

function updateControlledInput(id: string, value: string): boolean {
  const input = document.getElementById(id);
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return false;
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) return false;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function stationAddress(station: PoliceStationSelection): string {
  return [station.address, station.postcode].filter(Boolean).join(', ');
}

function linkedEvidence(context: AuthorityLinkContext): string {
  if (!context.user) return '';
  const lines = [
    '--- Planyx linked investigation context ---',
    `Linked customer: ${context.user.name} <${context.user.email}>`,
    `Address source: ${context.user.addressSource}`,
    `Address used for force lookup: ${context.user.address.formatted || 'Not recorded'}`,
  ];
  if (context.sessions.length) {
    lines.push('Linked Planyx sessions:');
    context.sessions.forEach(session => lines.push(`- ${session.reference} | ${session.status} | last activity ${session.lastSeenAt || session.createdAt || 'not recorded'}`));
  } else {
    lines.push('Linked Planyx sessions: None selected');
  }
  if (context.policeResolution?.force) lines.push(`Responsible police force: ${context.policeResolution.force.name}`);
  if (context.assignedStation) lines.push(`Assigned police station: ${context.assignedStation.stationName}, ${stationAddress(context.assignedStation) || 'address not published'}`);
  return lines.join('\n');
}

function mergeEvidence(existing: unknown, context: AuthorityLinkContext): string {
  const base = String(existing || '').replace(/\n*--- Planyx linked investigation context ---[\s\S]*$/m, '').trim();
  const block = linkedEvidence(context);
  return [base, block].filter(Boolean).join('\n\n').slice(0, 6000);
}

function investigationPayload(context: AuthorityLinkContext) {
  if (!context.user) return null;
  return {
    linked_user: {
      id: context.user.id,
      email: context.user.email,
      name: context.user.name,
      company: context.user.company,
      account_type: context.user.accountType,
      address_source: context.user.addressSource,
      address: context.user.address,
    },
    linked_sessions: context.sessions.map(session => ({
      id: session.id,
      reference: session.reference,
      status: session.status,
      created_at: session.createdAt || null,
      last_seen_at: session.lastSeenAt || null,
      legal_hold: session.legalHold,
    })),
    police: context.policeResolution ? {
      origin: context.policeResolution.origin,
      force: context.policeResolution.force,
      assigned_station: context.assignedStation,
      guidance: context.policeResolution.guidance,
    } : null,
    linked_at: new Date().toISOString(),
  };
}

const EMPTY_CONTEXT: AuthorityLinkContext = {
  user: null,
  sessions: [],
  assignedStation: null,
  policeResolution: null,
};

export default function AdminAuthorityReportingRoutePage() {
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [linkingOpen, setLinkingOpen] = useState(false);
  const [appliedStation, setAppliedStation] = useState('');
  const [context, setContext] = useState<AuthorityLinkContext>(EMPTY_CONTEXT);
  const hydratedReportRef = useRef('');

  function applyStation(station: PoliceStationSelection & { forceId?: string; distanceMiles?: number | null }): void {
    const verifiedAddress = stationAddress(station) || 'Address not published—verify using the official force finder';
    const authority = `${station.forceName} — ${station.stationName}`;
    const channel = [
      `${station.stationType}: ${verifiedAddress}`,
      station.distanceMiles !== null && station.distanceMiles !== undefined ? `Approximate distance from billing postcode: ${station.distanceMiles.toLocaleString('en-GB')} miles` : '',
      station.telephone ? `Published telephone: ${station.telephone}` : 'Non-emergency reporting: 101 or the force online reporting service',
      `Official source: ${station.sourceUrl}`,
      `Checked: ${new Date(station.checkedAt).toLocaleString('en-GB')}`,
    ].filter(Boolean).join(' · ');

    const authorityUpdated = updateControlledInput('authority-name', authority);
    const channelUpdated = updateControlledInput('authority-channel', channel);
    setContext(current => ({ ...current, assignedStation: station }));
    if (authorityUpdated && channelUpdated) {
      setAppliedStation(`${station.stationName}, ${verifiedAddress}`);
      window.setTimeout(() => document.getElementById('authority-name')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  }

  function applyLinkedDetails(user: ReportContextUser, sessions: ReportContextSession[]): void {
    updateControlledInput('user-email', user.email);
    updateControlledInput('user-name', user.name);
    updateControlledInput('user-type', 'Customer');
    updateControlledInput('session-reference', sessions[0]?.reference || '');
    const evidence = document.getElementById('evidence');
    if (evidence instanceof HTMLTextAreaElement) updateControlledInput('evidence', mergeEvidence(evidence.value, { ...context, user, sessions }));
    setContext(current => ({ ...current, user, sessions }));
    setLinkingOpen(false);
    window.setTimeout(() => document.getElementById('user-email')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  }

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    let active = true;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(requestUrl, window.location.origin);
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      let nextInit = init;

      if (url.origin === window.location.origin && url.pathname === '/api/admin/authority-reports' && method === 'POST' && context.user && typeof init?.body === 'string') {
        try {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          const primary = context.sessions[0];
          const formPayload = body.form_payload && typeof body.form_payload === 'object' ? body.form_payload as Record<string, unknown> : {};
          const updatedBody = {
            ...body,
            linked_user_email: context.user.email,
            linked_user_name: context.user.name,
            linked_user_type: 'Customer',
            linked_session_id: primary?.id || '',
            linked_session_reference: primary?.reference || '',
            evidence_summary: mergeEvidence(body.evidence_summary, context),
            form_payload: {
              ...formPayload,
              investigation_context: investigationPayload(context),
            },
          };
          nextInit = { ...init, body: JSON.stringify(updatedBody) };
        } catch {
          nextInit = init;
        }
      }

      const response = await nativeFetch(input, nextInit);

      if (url.origin === window.location.origin && url.pathname === '/api/admin/authority-reports' && response.ok) {
        void response.clone().json().then(async (payload: { report?: { id?: string; reference?: string; linked_user_email?: string; form_payload?: Record<string, unknown> }; data?: { selected?: { id?: string; reference?: string; linked_user_email?: string; form_payload?: Record<string, unknown> } | null } }) => {
          if (!active) return;
          const report = method === 'POST' ? payload.report : payload.data?.selected;
          const investigation = report?.form_payload?.investigation_context as {
            linked_user?: { email?: string };
            linked_sessions?: Array<{ id?: string }>;
            police?: { force?: AuthorityLinkContext['policeResolution'] extends infer R ? R : never; assigned_station?: AuthorityLinkContext['assignedStation']; origin?: AuthorityLinkContext['policeResolution'] extends { origin: infer O } ? O : never; guidance?: string };
          } | undefined;

          if (method === 'POST' && report?.id && context.user) {
            await nativeFetch('/api/admin/authority-report-context', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({
                action: 'sync_sessions',
                report_id: report.id,
                email: context.user.email,
                user_name: context.user.name,
                user_type: 'Customer',
                session_ids: context.sessions.map(session => session.id),
              }),
            }).catch(() => null);
          }

          const linkedEmail = investigation?.linked_user?.email || report?.linked_user_email || '';
          const reportKey = `${report?.id || report?.reference || ''}:${linkedEmail}`;
          if (linkedEmail && method === 'GET' && hydratedReportRef.current !== reportKey) {
            hydratedReportRef.current = reportKey;
            const detailResponse = await nativeFetch(`/api/admin/authority-report-context?email=${encodeURIComponent(linkedEmail)}`, { credentials: 'include', cache: 'no-store' });
            const detailPayload = await detailResponse.json().catch(() => ({})) as { success?: boolean; user?: ReportContextUser };
            if (!active || !detailPayload.success || !detailPayload.user) return;
            const linkedIds = new Set((investigation?.linked_sessions || []).map(item => item.id).filter(Boolean));
            const sessions = detailPayload.user.sessions.filter(session => linkedIds.has(session.id));
            const policeValue = investigation?.police;
            setContext({
              user: detailPayload.user,
              sessions,
              assignedStation: policeValue?.assigned_station || null,
              policeResolution: policeValue?.force && policeValue?.origin ? {
                force: policeValue.force as never,
                origin: policeValue.origin as never,
                stations: policeValue.assigned_station ? [policeValue.assigned_station] : [],
                guidance: policeValue.guidance || 'Police assignment restored from the saved report.',
              } : null,
            });
          }
        }).catch(() => undefined);
      }

      return response;
    };

    return () => {
      active = false;
      window.fetch = nativeFetch;
    };
  }, [context]);

  return (
    <>
      <AdminAuthorityReportingPage />

      <button
        type="button"
        onClick={() => setLinkingOpen(true)}
        className="fixed bottom-24 right-4 z-[68] inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-300 bg-violet-600 px-4 text-sm font-bold text-white shadow-xl transition hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-violet-500/40 dark:bg-violet-600 dark:hover:bg-violet-500"
        aria-label="Link customer sessions and police assignment"
      >
        <Link2 className="h-4 w-4" />
        <span className="hidden sm:inline">Link user, sessions & police</span>
        {context.user && <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{context.sessions.length}</span>}
      </button>

      {linkingOpen && (
        <div className="fixed inset-0 z-[120] flex justify-end bg-slate-950/65 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setLinkingOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="authority-linking-title" className="h-full w-full max-w-4xl overflow-y-auto bg-slate-50 shadow-2xl dark:bg-slate-950">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">Authority Reporting Centre</p>
                <h2 id="authority-linking-title" className="mt-1 text-xl font-black text-slate-950 dark:text-white">Link customer, sessions and responsible police</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Search the account, select evidence sessions, then assign the force and station nearest to the verified billing postcode.</p>
              </div>
              <Button type="button" variant="outline" size="icon" onClick={() => setLinkingOpen(false)} aria-label="Close investigation linking panel"><X className="h-4 w-4" /></Button>
            </header>
            <div className="p-4 sm:p-6">
              <AuthorityReportLinkingPanel
                context={context}
                onContextChange={setContext}
                onApply={applyLinkedDetails}
                onAssignStation={applyStation}
                onOpenFullDirectory={() => setDirectoryOpen(true)}
              />
            </div>
          </section>
        </div>
      )}

      {directoryOpen && (
        <div className="fixed inset-0 z-[130] flex justify-end bg-slate-950/65 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDirectoryOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="police-station-directory-title" className="h-full w-full max-w-3xl overflow-y-auto bg-slate-50 shadow-2xl dark:bg-slate-950">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">Authority Reporting Centre</p>
                <h2 id="police-station-directory-title" className="mt-1 text-xl font-black text-slate-950 dark:text-white">UK police station directory</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose an official published station or enter a station after verifying it on the force website.</p>
              </div>
              <Button type="button" variant="outline" size="icon" onClick={() => setDirectoryOpen(false)} aria-label="Close police station directory"><X className="h-4 w-4" /></Button>
            </header>
            <div className="space-y-4 p-4 sm:p-6">
              {appliedStation && <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Station added to the report</p><p className="mt-1 text-sm">{appliedStation}</p><p className="mt-1 text-xs">Review the Authority and Official submission channel fields, then save the report.</p></div></div>}
              <PoliceStationDirectory onSelect={station => { applyStation(station); setDirectoryOpen(false); }} />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
