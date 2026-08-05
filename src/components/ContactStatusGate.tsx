import { useEffect, useState, type ReactNode } from 'react';
import { BotOff, CircleOff, Clock, Loader2, Mail, Phone, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PLANYX_EMAIL, GROUP_PHONE_DISPLAY, GROUP_PHONE_HREF } from '@/lib/contact-details';

type ContactStatus = 'online' | 'maintenance' | 'offline';

interface ContactStatusConfig {
  enabled: boolean;
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  contactPageEnabled: boolean;
  contactPageStatus: ContactStatus;
  contactMaintenanceTitle: string;
  contactMaintenanceReason: string;
  contactMaintenanceMessage: string;
  contactMaintenanceStart: string;
  contactMaintenanceExpectedReturn: string;
  contactOfflineMessage: string;
  contactSupportEmail: string;
  contactPhoneDisplay: string;
  contactPhoneHref: string;
}

const DEFAULT_CONFIG: ContactStatusConfig = {
  enabled: true,
  maintenanceEnabled: false,
  maintenanceMessage: 'The Help Centre assistant is temporarily unavailable while maintenance is completed.',
  contactPageEnabled: true,
  contactPageStatus: 'online',
  contactMaintenanceTitle: 'Contact support is temporarily unavailable',
  contactMaintenanceReason: 'Contact service maintenance',
  contactMaintenanceMessage: 'We are carrying out essential work on the Sousa Murray Planeia contact service. Please check back shortly.',
  contactMaintenanceStart: '',
  contactMaintenanceExpectedReturn: '',
  contactOfflineMessage: 'The Contact Us page is currently offline. Please use the published contact details if your enquiry cannot wait.',
  contactSupportEmail: PLANYX_EMAIL,
  contactPhoneDisplay: GROUP_PHONE_DISPLAY,
  contactPhoneHref: GROUP_PHONE_HREF,
};

function formatDate(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function ContactStatusGate({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetch('/api/support-assistant', {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as {
          success?: boolean;
          config?: Partial<ContactStatusConfig>;
        };
        if (response.ok && data.success && data.config) {
          setConfig(current => ({ ...current, ...data.config }));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <section className="flex min-h-[58vh] items-center justify-center bg-background px-4" aria-live="polite">
        <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Checking Contact Us availability…
        </div>
      </section>
    );
  }

  if (config.contactPageEnabled && config.contactPageStatus === 'online') {
    const assistantUnavailable = !config.enabled || config.maintenanceEnabled;
    const AssistantIcon = config.maintenanceEnabled ? Wrench : BotOff;
    return (
      <>
        {assistantUnavailable && (
          <section role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
            <div className="mx-auto flex max-w-7xl items-start gap-3">
              <AssistantIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="text-sm font-bold">The AI Help Centre assistant is currently unavailable</p>
                <p className="mt-1 text-xs leading-5 text-amber-900">
                  {config.maintenanceEnabled ? config.maintenanceMessage : 'The assistant has been switched off.'} The Contact Us page and manual enquiry form remain available.
                </p>
              </div>
            </div>
          </section>
        )}
        {children}
      </>
    );
  }

  const maintenance = config.contactPageStatus === 'maintenance';
  const title = maintenance ? config.contactMaintenanceTitle : 'Contact Us is currently offline';
  const reason = maintenance ? config.contactMaintenanceReason : 'Contact page unavailable';
  const message = maintenance ? config.contactMaintenanceMessage : config.contactOfflineMessage;
  const started = maintenance ? formatDate(config.contactMaintenanceStart) : '';
  const expected = maintenance ? formatDate(config.contactMaintenanceExpectedReturn) : '';
  const StatusIcon = maintenance ? Wrench : CircleOff;

  return (
    <section className="relative min-h-[68vh] overflow-hidden border-y border-border/60 bg-background px-4 py-14 sm:px-6 sm:py-20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,hsl(var(--primary)/0.18),transparent_34%),radial-gradient(circle_at_86%_78%,rgb(14_165_233/0.12),transparent_32%)]" />
      <div className="relative mx-auto max-w-3xl overflow-hidden rounded-[28px] border border-primary/20 bg-card shadow-2xl shadow-primary/10">
        <div className="h-1.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-violet-600" />
        <div className="p-6 sm:p-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <StatusIcon className="h-7 w-7" />
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-primary">{reason}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{message}</p>

          {(started || expected) && (
            <div className="mt-7 grid overflow-hidden rounded-2xl border border-border sm:grid-cols-2">
              {started && (
                <div className="border-b border-border bg-muted/30 p-4 sm:border-b-0 sm:border-r">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><Clock className="h-4 w-4" />Work started</p>
                  <p className="mt-2 font-semibold text-foreground">{started}</p>
                </div>
              )}
              {expected && (
                <div className="bg-muted/30 p-4">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><Clock className="h-4 w-4" />Expected return</p>
                  <p className="mt-2 font-semibold text-foreground">{expected}</p>
                </div>
              )}
            </div>
          )}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="gap-2">
              <a href={`mailto:${config.contactSupportEmail || PLANYX_EMAIL}`}><Mail className="h-4 w-4" />Email Sousa Murray Planeia support</a>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <a href={config.contactPhoneHref || GROUP_PHONE_HREF}><Phone className="h-4 w-4" />Call {config.contactPhoneDisplay || GROUP_PHONE_DISPLAY}</a>
            </Button>
          </div>

          <p className="mt-6 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
            The online enquiry form and AI-assisted contact box are unavailable in this mode. The Support Assistant is also prevented from offering or submitting an enquiry. Admin Centre access remains available.
          </p>
        </div>
      </div>
    </section>
  );
}
