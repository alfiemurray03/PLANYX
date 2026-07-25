import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X } from 'lucide-react';
import PoliceStationDirectory, { type PoliceStationSelection } from '@/components/admin/PoliceStationDirectory';
import AuthorityReportLinkingPanel, {
  type AuthorityLinkContext,
  type ReportContextSession,
  type ReportContextUser,
} from '@/components/admin/AuthorityReportLinkingPanel';
import { Button } from '@/components/ui/button';

function setInput(id: string, value: string): boolean {
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

function evidenceBlock(context: AuthorityLinkContext): string {
  if (!context.user) return '';
  const lines = [
    '--- Planyx linked investigation context ---',
    `Linked ${context.user.recordType.toLowerCase()}: ${context.user.name} <${context.user.email}>`,
    `Address source: ${context.user.addressSource}`,
    `Address used for force lookup: ${context.user.address.formatted || 'Not recorded'}`,
  ];
  if (context.sessions.length) {
    lines.push('Linked Planyx sessions:');
    context.sessions.forEach(session => lines.push(`- ${session.reference} | ${session.status} | last activity ${session.lastSeenAt || session.createdAt || 'not recorded'}`));
  } else lines.push('Linked Planyx sessions: None selected');
  if (context.policeResolution?.force) lines.push(`Responsible police force: ${context.policeResolution.force.name}`);
  if (context.assignedStation) lines.push(`Assigned police station: ${context.assignedStation.stationName}, ${stationAddress(context.assignedStation) || 'address not published'}`);
  return lines.join('\n');
}

function mergeEvidence(existing: unknown, context: AuthorityLinkContext): string {
  const base = String(existing || '').replace(/\n*--- Planyx linked investigation context ---[\s\S]*$/m, '').trim();
  return [base, evidenceBlock(context)].filter(Boolean).join('\n\n').slice(0, 6000);
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
      record_type: context.user.recordType,
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

const EMPTY_CONTEXT: AuthorityLinkContext = { user: null, sessions: [], assignedStation: null, policeResolution: null };

function findOrCreateMount(): HTMLElement | null {
  const section = document.getElementById('user-email')?.closest('section');
  if (!section) return null;
  const found = document.getElementById('authority-linking-inline-root');
  if (found) return found;
  const mount = document.createElement('div');
  mount.id = 'authority-linking-inline-root';
  mount.dataset.authorityLinking = 'embedded';
  mount.className = 'mt-4';
  const heading = section.firstElementChild;
  heading?.after(mount);
  return mount;
}

export default function EmbeddedAuthorityReportLinking() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [appliedStation, setAppliedStation] = useState('');
  const [context, setContext] = useState<AuthorityLinkContext>(EMPTY_CONTEXT);
  const hydratedReportRef = useRef('');

  function applyStation(station: PoliceStationSelection & { distanceMiles?: number | null }): void {
    const address = stationAddress(station) || 'Address not published—verify using the official force finder';
    setInput('authority-name', `${station.forceName} — ${station.stationName}`);
    setInput('authority-channel', [
      `${station.stationType}: ${address}`,
      station.distanceMiles !== null && station.distanceMiles !== undefined ? `Approximate distance from billing postcode: ${station.distanceMiles.toLocaleString('en-GB')} miles` : '',
      station.telephone ? `Published telephone: ${station.telephone}` : 'Non-emergency reporting: 101 or the force online reporting service',
      `Official source: ${station.sourceUrl}`,
      `Checked: ${new Date(station.checkedAt).toLocaleString('en-GB')}`,
    ].filter(Boolean).join(' · '));
    setContext(current => ({ ...current, assignedStation: station }));
    setAppliedStation(`${station.stationName}, ${address}`);
    setDirectoryOpen(false);
  }

  function applyUser(user: ReportContextUser, sessions: ReportContextSession[]): void {
    setInput('user-email', user.email);
    setInput('user-name', user.name);
    setInput('user-type', user.recordType);
    setInput('session-reference', sessions[0]?.reference || '');
    const evidence = document.getElementById('evidence');
    if (evidence instanceof HTMLTextAreaElement) setInput('evidence', mergeEvidence(evidence.value, { ...context, user, sessions }));
    setContext(current => ({ ...current, user, sessions }));
  }

  useEffect(() => {
    const attach = () => {
      const next = findOrCreateMount();
      if (next) setMount(next);
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

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
          const currentPayload = body.form_payload && typeof body.form_payload === 'object' ? body.form_payload as Record<string, unknown> : {};
          nextInit = {
            ...init,
            body: JSON.stringify({
              ...body,
              linked_user_email: context.user.email,
              linked_user_name: context.user.name,
              linked_user_type: context.user.recordType,
              linked_session_id: primary?.id || '',
              linked_session_reference: primary?.reference || '',
              evidence_summary: mergeEvidence(body.evidence_summary, context),
              form_payload: { ...currentPayload, investigation_context: investigationPayload(context) },
            }),
          };
        } catch { nextInit = init; }
      }

      const response = await nativeFetch(input, nextInit);
      if (url.origin === window.location.origin && url.pathname === '/api/admin/authority-reports' && response.ok) {
        void response.clone().json().then(async (payload: { report?: { id?: string; reference?: string; linked_user_email?: string; form_payload?: Record<string, unknown> }; data?: { selected?: { id?: string; reference?: string; linked_user_email?: string; form_payload?: Record<string, unknown> } | null } }) => {
          if (!active) return;
          const report = method === 'POST' ? payload.report : payload.data?.selected;
          const investigation = report?.form_payload?.investigation_context as {
            linked_user?: { email?: string };
            linked_sessions?: Array<{ id?: string }>;
            police?: { force?: NonNullable<AuthorityLinkContext['policeResolution']>['force']; assigned_station?: AuthorityLinkContext['assignedStation']; origin?: NonNullable<AuthorityLinkContext['policeResolution']>['origin']; guidance?: string };
          } | undefined;

          if (method === 'POST' && report?.id && context.user) {
            await nativeFetch('/api/admin/authority-report-context', {
              method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({
                action: 'sync_sessions', report_id: report.id, email: context.user.email,
                user_name: context.user.name, user_type: context.user.recordType,
                session_ids: context.sessions.map(session => session.id),
              }),
            });
          }

          const linkedEmail = investigation?.linked_user?.email || report?.linked_user_email || '';
          const reportKey = `${report?.id || report?.reference || ''}:${linkedEmail}`;
          if (linkedEmail && method === 'GET' && hydratedReportRef.current !== reportKey) {
            hydratedReportRef.current = reportKey;
            const detailResponse = await nativeFetch(`/api/admin/authority-user-search?email=${encodeURIComponent(linkedEmail)}`, { credentials: 'include', cache: 'no-store' });
            const detail = await detailResponse.json().catch(() => ({})) as { success?: boolean; user?: ReportContextUser };
            if (!active || !detail.success || !detail.user) return;
            const linkedIds = new Set((investigation?.linked_sessions || []).map(item => item.id).filter(Boolean));
            const sessions = detail.user.sessions.filter(session => linkedIds.has(session.id));
            const police = investigation?.police;
            setContext({
              user: detail.user,
              sessions,
              assignedStation: police?.assigned_station || null,
              policeResolution: police?.force && police?.origin ? {
                force: police.force, origin: police.origin,
                stations: police.assigned_station ? [police.assigned_station] : [],
                guidance: police.guidance || 'Police assignment restored from the saved report.',
              } : null,
            });
          }
        }).catch(() => undefined);
      }
      return response;
    };
    return () => { active = false; window.fetch = nativeFetch; };
  }, [context]);

  return (
    <>
      {mount && createPortal(
        <AuthorityReportLinkingPanel
          context={context}
          onContextChange={setContext}
          onApply={applyUser}
          onAssignStation={applyStation}
          onOpenFullDirectory={() => setDirectoryOpen(true)}
        />,
        mount,
      )}

      {directoryOpen && (
        <div className="fixed inset-0 z-[130] flex justify-end bg-slate-950/65 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDirectoryOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="police-station-directory-title" className="h-full w-full max-w-3xl overflow-y-auto bg-slate-50 shadow-2xl dark:bg-slate-950">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
              <div><p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">Authority Reporting Centre</p><h2 id="police-station-directory-title" className="mt-1 text-xl font-black text-slate-950 dark:text-white">UK police station directory</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Select a published station to attach it immediately to the report, or enter a verified station manually.</p></div>
              <Button type="button" variant="outline" size="icon" onClick={() => setDirectoryOpen(false)} aria-label="Close police station directory"><X className="h-4 w-4" /></Button>
            </header>
            <div className="space-y-4 p-4 sm:p-6">
              {appliedStation && <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Station attached to this report</p><p className="mt-1 text-sm">{appliedStation}</p></div></div>}
              <PoliceStationDirectory onSelect={applyStation} />
            </div>
          </section>
        </div>
      )}

      {appliedStation && !directoryOpen && (
        <div role="status" aria-live="polite" className="fixed bottom-6 right-6 z-[140] flex max-w-md items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 text-emerald-950 shadow-2xl dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
          <div className="min-w-0 flex-1">
            <p className="font-black">Police station assigned</p>
            <p className="mt-1 break-words text-sm">{appliedStation}</p>
            <p className="mt-1 text-xs opacity-80">The Authority and official submission fields have been updated. Save the report to preserve the assignment.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setAppliedStation('')} aria-label="Dismiss station assigned message"><X className="h-4 w-4" /></Button>
        </div>
      )}
    </>
  );
}
