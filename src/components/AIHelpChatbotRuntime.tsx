import { useEffect, useState } from 'react';
import { ChevronDown, LifeBuoy, Mail, Phone, Wrench, X } from 'lucide-react';
import ManagedAIHelpChatbot from './ManagedAIHelpChatbot';

type ContactStatus = 'online' | 'maintenance' | 'offline';

interface RuntimeConfig {
  enabled: boolean;
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  escalationEnabled: boolean;
  assistantName: string;
  position: 'bottom-right' | 'bottom-left';
  primaryColor: string;
  panelWidth: number;
  borderRadius: number;
  launcherSize: number;
  launcherLabel: string;
  contactPageEnabled: boolean;
  contactEnquiriesAvailable: boolean;
  contactPageStatus: ContactStatus;
  contactMaintenanceMessage: string;
  contactOfflineMessage: string;
  contactEmailEnabled: boolean;
  contactTelephoneEnabled: boolean;
  contactSupportEmail: string;
  contactPhoneDisplay: string;
  contactPhoneHref: string;
}

const DEFAULT_CONFIG: RuntimeConfig = {
  enabled: true,
  maintenanceEnabled: false,
  maintenanceMessage: 'The Help Centre assistant is undergoing maintenance.',
  escalationEnabled: true,
  assistantName: 'Planyx Support Assistant',
  position: 'bottom-right',
  primaryColor: '#2563eb',
  panelWidth: 430,
  borderRadius: 18,
  launcherSize: 56,
  launcherLabel: 'Help',
  contactPageEnabled: true,
  contactEnquiriesAvailable: true,
  contactPageStatus: 'online',
  contactMaintenanceMessage: 'The Contact Us service is temporarily unavailable while maintenance is completed.',
  contactOfflineMessage: 'The Contact Us page is currently offline.',
  contactEmailEnabled: true,
  contactTelephoneEnabled: true,
  contactSupportEmail: 'planyx@jagroupservices.co.uk',
  contactPhoneDisplay: '020 3834 2790',
  contactPhoneHref: 'tel:+442038342790',
};

function MaintenanceWidget({ config }: { config: RuntimeConfig }) {
  const [open, setOpen] = useState(false);
  const side = config.position === 'bottom-left' ? 'left-5' : 'right-5';
  const panelSide = config.position === 'bottom-left' ? 'sm:left-5' : 'sm:right-5';
  const contactAvailable = config.contactPageEnabled && config.contactEnquiriesAvailable && config.contactPageStatus === 'online';
  const canCreateEnquiry = contactAvailable && config.escalationEnabled;
  const contactStatusMessage = config.contactPageStatus === 'maintenance'
    ? config.contactMaintenanceMessage
    : config.contactPageStatus === 'offline'
      ? config.contactOfflineMessage
      : 'Online enquiries are currently unavailable.';

  return (
    <>
      <div className={`fixed bottom-5 ${side} z-[70] flex items-center gap-2`}>
        {config.launcherLabel && !open && (
          <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg sm:block">
            {config.launcherLabel}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(current => !current)}
          aria-label={open ? 'Close support maintenance notice' : 'Open support maintenance notice'}
          style={{ width: config.launcherSize, height: config.launcherSize, backgroundColor: config.primaryColor }}
          className="flex items-center justify-center rounded-full text-white shadow-2xl transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          {open ? <ChevronDown className="h-6 w-6" /> : <Wrench className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <section
          role="dialog"
          aria-label="Support assistant maintenance notice"
          style={{ width: `min(calc(100vw - 1.5rem), ${config.panelWidth}px)`, borderRadius: config.borderRadius }}
          className={`fixed inset-x-3 bottom-20 z-[69] overflow-hidden border border-slate-200 bg-white text-slate-950 shadow-2xl sm:left-auto ${panelSide}`}
        >
          <header style={{ backgroundColor: config.primaryColor }} className="flex items-center justify-between px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"><Wrench className="h-5 w-5" /></span>
              <div><p className="text-sm font-bold">{config.assistantName}</p><p className="text-[11px] text-white/80">Maintenance mode</p></div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-white/80 hover:bg-white/10" aria-label="Close"><X className="h-4 w-4" /></button>
          </header>
          <div className="p-5">
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <p className="text-sm leading-relaxed text-amber-950">{config.maintenanceMessage}</p>
            </div>

            {canCreateEnquiry ? (
              <button
                type="button"
                onClick={() => window.location.assign('/contact')}
                style={{ backgroundColor: config.primaryColor }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white hover:brightness-95"
              >
                <LifeBuoy className="h-4 w-4" /> Create a Contact Enquiry
              </button>
            ) : (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-950">Online Contact Enquiries are unavailable</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{contactStatusMessage}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {config.contactEmailEnabled && config.contactSupportEmail && (
                    <a href={`mailto:${config.contactSupportEmail}`} className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100">
                      <Mail className="h-4 w-4" /> Email support
                    </a>
                  )}
                  {config.contactTelephoneEnabled && config.contactPhoneHref && (
                    <a href={config.contactPhoneHref} className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100">
                      <Phone className="h-4 w-4" /> Call {config.contactPhoneDisplay}
                    </a>
                  )}
                </div>
              </div>
            )}

            <p className="mt-3 text-center text-xs text-slate-500">
              {canCreateEnquiry
                ? 'The Contact Enquiry form is available without signing in.'
                : 'The assistant will not direct anyone to an unavailable enquiry form.'}
            </p>
          </div>
        </section>
      )}
    </>
  );
}

export default function AIHelpChatbotRuntime() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [ready, setReady] = useState(false);
  const hiddenForPortal = typeof window !== 'undefined'
    && (window.location.pathname.startsWith('/admin') || window.location.pathname.startsWith('/reseller'));

  useEffect(() => {
    let active = true;
    fetch('/api/support-assistant', { credentials: 'include', cache: 'no-store' })
      .then(response => response.json())
      .then((data: { success?: boolean; config?: Partial<RuntimeConfig> }) => {
        if (active && data.success && data.config) setConfig({ ...DEFAULT_CONFIG, ...data.config });
      })
      .catch(() => {})
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  if (!ready || hiddenForPortal || !config.enabled) return null;
  if (config.maintenanceEnabled) return <MaintenanceWidget config={config} />;
  return <ManagedAIHelpChatbot />;
}
