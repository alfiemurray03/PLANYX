import { useState } from 'react';
import { Building2, CheckCircle2, X } from 'lucide-react';
import AdminAuthorityReportingPage from '@/pages/admin/authority-reporting';
import PoliceStationDirectory, { type PoliceStationSelection } from '@/components/admin/PoliceStationDirectory';
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

export default function AdminAuthorityReportingRoutePage() {
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [appliedStation, setAppliedStation] = useState('');

  function applyStation(station: PoliceStationSelection): void {
    const verifiedAddress = stationAddress(station) || 'Address not published—verify using the official force finder';
    const authority = `${station.forceName} — ${station.stationName}`;
    const channel = [
      `${station.stationType}: ${verifiedAddress}`,
      station.telephone ? `Published telephone: ${station.telephone}` : 'Non-emergency reporting: 101 or the force online reporting service',
      `Official source: ${station.sourceUrl}`,
      `Checked: ${new Date(station.checkedAt).toLocaleString('en-GB')}`,
    ].join(' · ');

    const authorityUpdated = updateControlledInput('authority-name', authority);
    const channelUpdated = updateControlledInput('authority-channel', channel);
    if (authorityUpdated && channelUpdated) {
      setAppliedStation(`${station.stationName}, ${verifiedAddress}`);
      window.setTimeout(() => document.getElementById('authority-name')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  }

  return (
    <>
      <AdminAuthorityReportingPage />

      <button
        type="button"
        onClick={() => setDirectoryOpen(true)}
        className="fixed bottom-24 right-4 z-[68] inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-300 bg-blue-600 px-4 text-sm font-bold text-white shadow-xl transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-blue-500/40 dark:bg-blue-600 dark:hover:bg-blue-500"
        aria-label="Open UK police station directory"
      >
        <Building2 className="h-4 w-4" />
        <span className="hidden sm:inline">Police stations</span>
      </button>

      {directoryOpen && (
        <div className="fixed inset-0 z-[120] flex justify-end bg-slate-950/65 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDirectoryOpen(false); }}>
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
              <PoliceStationDirectory onSelect={applyStation} />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
