import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

type CSMTokenResponse = { access_token: string };
type CSMQueueFunction = ((...args: unknown[]) => void) & { __q__: unknown[][] };
type CSMWidgetDefinition = {
  widgetId: string;
  site: string;
  cloudId: string;
};
type CSMWidgetSettings = CSMWidgetDefinition & {
  authenticate?: () => Promise<CSMTokenResponse>;
};

declare global {
  interface Window {
    csmWidgetSettings?: CSMWidgetSettings;
    CSM?: CSMQueueFunction;
  }
}

export const ATLASSIAN_CSM_PUBLIC_WIDGET: Readonly<CSMWidgetDefinition> = Object.freeze({
  widgetId: '2e5cd7dc-e84b-41b5-a6c8-805909741566',
  site: 'jagroupservices.atlassian.net',
  cloudId: 'b3c01f24-8059-47ab-b1fb-52544f659458',
});

export const ATLASSIAN_CSM_AUTHENTICATED_WIDGET: Readonly<CSMWidgetDefinition> = Object.freeze({
  widgetId: '7e246b9d-dc9b-46e1-b41b-2997edbfe4da',
  site: 'jagroupservices.atlassian.net',
  cloudId: 'b3c01f24-8059-47ab-b1fb-52544f659458',
});

// Backwards-compatible export for code that still imports the original public widget constant.
export const ATLASSIAN_CSM_WIDGET = ATLASSIAN_CSM_PUBLIC_WIDGET;

const SCRIPT_ID = 'planyx-atlassian-csm-widget';

function scriptSource(widget: CSMWidgetDefinition) {
  return `https://${widget.site}/csm/widget/script.js?widgetId=${encodeURIComponent(widget.widgetId)}&site=${encodeURIComponent(widget.site)}&cloudId=${encodeURIComponent(widget.cloudId)}`;
}

function ensureCSMQueue() {
  if (typeof window.CSM === 'function') return;

  const queued = ((...args: unknown[]) => {
    queued.__q__.push(args);
  }) as CSMQueueFunction;

  queued.__q__ = [];
  window.CSM = queued;
}

async function authenticateLoggedInCustomer(): Promise<CSMTokenResponse> {
  const response = await fetch('/csm-widget-token', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const payload = await response.json().catch(() => ({})) as Partial<CSMTokenResponse> & { error?: string };
  if (!response.ok || typeof payload.access_token !== 'string' || !payload.access_token.trim()) {
    throw new Error(payload.error || 'Personalised support authentication failed.');
  }
  return { access_token: payload.access_token };
}

export default function AtlassianCustomerServiceWidget() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    const widget = user ? ATLASSIAN_CSM_AUTHENTICATED_WIDGET : ATLASSIAN_CSM_PUBLIC_WIDGET;
    window.csmWidgetSettings = user
      ? { ...widget, authenticate: authenticateLoggedInCustomer }
      : { ...widget };
    ensureCSMQueue();

    let cancelled = false;

    const loadWidget = () => {
      if (cancelled) return;

      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (existing?.dataset.widgetId === widget.widgetId) return;
      if (existing) {
        existing.remove();
        delete window.CSM;
        ensureCSMQueue();
      }

      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.type = 'text/javascript';
      script.async = true;
      script.src = scriptSource(widget);
      script.referrerPolicy = 'strict-origin-when-cross-origin';
      script.dataset.widgetId = widget.widgetId;
      script.dataset.customerMode = user ? 'authenticated' : 'public';
      script.addEventListener('error', () => {
        console.error('Planyx could not load the Atlassian Customer Service AI widget.');
      }, { once: true });
      document.body.appendChild(script);
    };

    if (document.readyState === 'complete') {
      loadWidget();
    } else {
      window.addEventListener('load', loadWidget, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('load', loadWidget);
    };
  }, [isLoading, user?.email]);

  return null;
}
