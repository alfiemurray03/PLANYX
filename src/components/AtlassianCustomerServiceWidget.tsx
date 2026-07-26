import { useEffect } from 'react';

type CSMQueueFunction = ((...args: unknown[]) => void) & { __q__: unknown[][] };

declare global {
  interface Window {
    csmWidgetSettings?: {
      widgetId: string;
      site: string;
      cloudId: string;
    };
    CSM?: CSMQueueFunction;
  }
}

export const ATLASSIAN_CSM_WIDGET = Object.freeze({
  widgetId: '2e5cd7dc-e84b-41b5-a6c8-805909741566',
  site: 'jagroupservices.atlassian.net',
  cloudId: 'b3c01f24-8059-47ab-b1fb-52544f659458',
});

const SCRIPT_ID = 'planyx-atlassian-csm-widget';
const SCRIPT_SRC = `https://${ATLASSIAN_CSM_WIDGET.site}/csm/widget/script.js?widgetId=${encodeURIComponent(ATLASSIAN_CSM_WIDGET.widgetId)}&site=${encodeURIComponent(ATLASSIAN_CSM_WIDGET.site)}&cloudId=${encodeURIComponent(ATLASSIAN_CSM_WIDGET.cloudId)}`;

function ensureCSMQueue() {
  if (typeof window.CSM === 'function') return;

  const queued = ((...args: unknown[]) => {
    queued.__q__.push(args);
  }) as CSMQueueFunction;

  queued.__q__ = [];
  window.CSM = queued;
}

export default function AtlassianCustomerServiceWidget() {
  useEffect(() => {
    window.csmWidgetSettings = { ...ATLASSIAN_CSM_WIDGET };
    ensureCSMQueue();

    let cancelled = false;

    const loadWidget = () => {
      if (cancelled || document.getElementById(SCRIPT_ID)) return;

      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.type = 'text/javascript';
      script.async = true;
      script.src = SCRIPT_SRC;
      script.referrerPolicy = 'strict-origin-when-cross-origin';
      script.dataset.widgetId = ATLASSIAN_CSM_WIDGET.widgetId;
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
  }, []);

  return null;
}
