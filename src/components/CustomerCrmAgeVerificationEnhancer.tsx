import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import CustomerAgeVerificationCrmPanel from '@/components/CustomerAgeVerificationCrmPanel';

function customerEmailFromPath() {
  const match = /^\/admin\/users\/([^/?#]+)\/?$/.exec(window.location.pathname);
  if (!match) return '';
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}

export default function CustomerCrmAgeVerificationEnhancer() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [email, setEmail] = useState(() => customerEmailFromPath());
  const key = useMemo(() => email.toLowerCase(), [email]);

  useEffect(() => {
    let scheduled = 0;

    function apply() {
      scheduled = 0;
      const nextEmail = customerEmailFromPath();
      setEmail(nextEmail);
      if (!nextEmail) { setTarget(null); return; }
      const root = document.querySelector<HTMLElement>('.crm-dense');
      if (!root) return;
      const firstCard = root.querySelector<HTMLElement>(':scope > [data-slot="card"]');
      if (!firstCard) return;
      let host = root.querySelector<HTMLElement>(':scope > [data-customer-age-verification-crm="true"]');
      if (!host) {
        host = document.createElement('section');
        host.dataset.customerAgeVerificationCrm = 'true';
        host.setAttribute('aria-label', 'Customer age verification record');
        firstCard.insertAdjacentElement('afterend', host);
      }
      setTarget(host);
    }

    function schedule() {
      if (scheduled) return;
      scheduled = window.requestAnimationFrame(apply);
    }

    apply();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', schedule);
      if (scheduled) window.cancelAnimationFrame(scheduled);
      document.querySelector<HTMLElement>('[data-customer-age-verification-crm="true"]')?.remove();
    };
  }, []);

  return target && key ? createPortal(<CustomerAgeVerificationCrmPanel key={key} email={email} />, target) : null;
}
