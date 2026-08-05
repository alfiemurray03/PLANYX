import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PreviewSettings {
  designVariant: 'standard' | 'compact' | 'assurance';
  publicHeading: string;
  publicDescription: string;
  buttonLabel: string;
  maintenanceHeading: string;
  maintenanceMessage: string;
  showPrivacyNotice: boolean;
  showSafetyLink: boolean;
}

function fieldValue(id: string, fallback: string) {
  const field = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  return field?.value?.trim() || fallback;
}

function switchValue(label: string, fallback: boolean) {
  const control = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="switch"]'))
    .find(button => button.getAttribute('aria-label') === label);
  if (!control) return fallback;
  return control.getAttribute('aria-checked') === 'true';
}

function readSettings(): PreviewSettings {
  const design = fieldValue('age-design', 'standard');
  return {
    designVariant: design === 'compact' || design === 'assurance' ? design : 'standard',
    publicHeading: fieldValue('age-heading', 'Confirm you are aged 16 or over'),
    publicDescription: fieldValue('age-description', 'Enter your date of birth so Sousa Murray Planeia can apply the correct account access and privacy settings.'),
    buttonLabel: fieldValue('age-button', 'Confirm age and continue'),
    maintenanceHeading: fieldValue('maintenance-heading', 'Age verification is temporarily unavailable'),
    maintenanceMessage: fieldValue('maintenance-message', 'New registrations are paused while the age-verification service is maintained.'),
    showPrivacyNotice: switchValue('Show privacy and data-minimisation notice', true),
    showSafetyLink: switchValue('Show 16+ safety guidance link', true),
  };
}

function ensurePrivacySummary(frameDocument: Document) {
  let summary = frameDocument.getElementById('privacy-summary') as HTMLDivElement | null;
  if (summary) return summary;

  const primary = frameDocument.querySelector<HTMLElement>('.verification-primary');
  if (!primary) return null;

  summary = frameDocument.createElement('div');
  summary.id = 'privacy-summary';
  summary.className = 'privacy-summary';
  summary.innerHTML = '<span class="privacy-summary__icon" aria-hidden="true">◈</span><div><strong>Your information is protected</strong><p>Your date of birth is encrypted in a restricted age-verification record linked to your Customer CRM profile. It is masked by default and access is audited. The normal customer profile stores only eligibility, age band and safeguarding status.</p></div>';
  primary.appendChild(summary);
  return summary;
}

function ActualCustomerPreview() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  function syncPreview() {
    const frameDocument = frameRef.current?.contentDocument;
    if (!frameDocument?.body) return;

    const settings = readSettings();
    const maintenance = Boolean(frameDocument.querySelector('.state-panel--warning'));
    const heading = frameDocument.getElementById('age-check-title');
    const description = frameDocument.querySelector<HTMLElement>('.lead');
    const continueButton = frameDocument.querySelector<HTMLButtonElement>('.verification-form .button--primary');

    frameDocument.body.classList.toggle('age-page--compact', settings.designVariant === 'compact');
    frameDocument.body.classList.toggle('age-page--assurance', settings.designVariant === 'assurance');

    if (heading) heading.textContent = maintenance ? settings.maintenanceHeading : settings.publicHeading;
    if (description) description.textContent = maintenance ? settings.maintenanceMessage : settings.publicDescription;
    if (continueButton) continueButton.innerHTML = `${settings.buttonLabel.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')} <span aria-hidden="true">→</span>`;

    const privacySummary = ensurePrivacySummary(frameDocument);
    if (privacySummary) privacySummary.hidden = !settings.showPrivacyNotice || maintenance;

    frameDocument.querySelectorAll<HTMLElement>('a[href="/safety"]').forEach(link => {
      link.hidden = !settings.showSafetyLink;
    });

    if (!frameDocument.getElementById('planyx-admin-actual-preview')) {
      const style = frameDocument.createElement('style');
      style.id = 'planyx-admin-actual-preview';
      style.textContent = `
        html { scroll-behavior: auto !important; }
        form, a, button, input, textarea { cursor: default !important; }
        .age-guide { display: none !important; }
      `;
      frameDocument.head.appendChild(style);

      frameDocument.addEventListener('submit', event => event.preventDefault(), true);
      frameDocument.addEventListener('click', event => event.preventDefault(), true);
    }

    setReady(true);
  }

  function scheduleSync() {
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(syncPreview, 30);
  }

  useEffect(() => {
    document.addEventListener('input', scheduleSync, true);
    document.addEventListener('change', scheduleSync, true);
    document.addEventListener('click', scheduleSync, true);

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-checked', 'value'],
    });

    return () => {
      document.removeEventListener('input', scheduleSync, true);
      document.removeEventListener('change', scheduleSync, true);
      document.removeEventListener('click', scheduleSync, true);
      observer.disconnect();
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-white">Actual customer page</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">This is the real age-check route at the preview width shown. It updates as you edit.</p>
        </div>
        <a href="/age-check?return_to=%2Fdashboard" target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700 underline-offset-4 hover:underline dark:text-blue-300">Open customer page</a>
      </div>
      <div className="relative min-h-[720px] bg-slate-100 dark:bg-slate-950">
        {!ready && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 text-sm font-medium text-slate-500 dark:bg-slate-950/90 dark:text-slate-300">
            Loading the actual customer page…
          </div>
        )}
        <iframe
          ref={frameRef}
          src="/age-check?return_to=%2Fdashboard&admin_preview=1"
          title="Actual Sousa Murray Planeia customer age-check page preview"
          className="block h-[720px] w-full border-0 bg-transparent"
          onLoad={syncPreview}
        />
      </div>
      <p className="border-t border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Preview mode blocks submissions and links. No personal information is collected.</p>
    </div>
  );
}

export default function ActualAgeCheckPreviewEnhancer() {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let createdTarget: HTMLElement | null = null;
    let scheduled = 0;

    function apply() {
      scheduled = 0;
      const heading = Array.from(document.querySelectorAll('h2')).find(element => element.textContent?.trim() === 'Customer preview');
      const headingRow = heading?.parentElement;
      const section = heading?.closest('section');
      if (!heading || !headingRow || !section) return;

      heading.textContent = 'Customer page preview';

      const existingPreview = Array.from(section.children).find(child => child !== headingRow && !(child instanceof HTMLElement && child.dataset.actualAgePreviewTarget === 'true')) as HTMLElement | undefined;
      if (existingPreview) {
        existingPreview.hidden = true;
        existingPreview.setAttribute('aria-hidden', 'true');
      }

      let target = section.querySelector<HTMLElement>(':scope > [data-actual-age-preview-target="true"]');
      if (!target) {
        target = document.createElement('div');
        target.dataset.actualAgePreviewTarget = 'true';
        headingRow.insertAdjacentElement('afterend', target);
        createdTarget = target;
      }

      setPortalTarget(target);
    }

    function schedule() {
      if (scheduled) return;
      scheduled = window.requestAnimationFrame(apply);
    }

    apply();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (scheduled) window.cancelAnimationFrame(scheduled);
      createdTarget?.remove();
    };
  }, []);

  return portalTarget ? createPortal(<ActualCustomerPreview />, portalTarget) : null;
}
