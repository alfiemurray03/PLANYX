import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AgeVerificationAIControl from '@/components/AgeVerificationAIControl';

function text(element: Element | null) {
  return element?.textContent?.trim() || '';
}

function EmbeddedAgeVerificationControlCentre() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [frameHeight, setFrameHeight] = useState(1200);

  useEffect(() => () => cleanupRef.current?.(), []);

  function prepareFrame() {
    cleanupRef.current?.();
    cleanupRef.current = null;

    const frame = frameRef.current;
    const document = frame?.contentDocument;
    if (!frame || !document?.body) return;

    try {
      let style = document.getElementById('planyx-embedded-age-verification') as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement('style');
        style.id = 'planyx-embedded-age-verification';
        style.textContent = `
          html, body { background: transparent !important; }
          body { margin: 0 !important; overflow: hidden !important; }
          .admin-portal { min-height: 0 !important; background: transparent !important; }
          .admin-portal > header,
          .admin-portal > footer { display: none !important; }
          .admin-portal > main {
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
          }
        `;
        document.head.appendChild(style);
      }

      const resize = () => {
        const nextHeight = Math.max(
          900,
          document.documentElement?.scrollHeight || 0,
          document.body?.scrollHeight || 0,
        );
        setFrameHeight(nextHeight + 8);
      };

      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(document.body);
      window.addEventListener('resize', resize);
      const interval = window.setInterval(resize, 750);

      cleanupRef.current = () => {
        observer.disconnect();
        window.removeEventListener('resize', resize);
        window.clearInterval(interval);
      };
    } catch {
      setFrameHeight(1200);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border bg-muted/25 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="text-base font-bold text-foreground">Age Verification Control Centre</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Manage the complete 16+ gate, customer design, provider readiness, safeguards, governance, diagnostics and events here.
          </p>
        </div>
        <a
          href="/admin/age-verification"
          className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-muted"
        >
          Open full page
        </a>
      </div>
      <iframe
        ref={frameRef}
        src="/admin/age-verification?embedded=contact-age-ai"
        title="Embedded Age Verification Control Centre"
        className="block w-full border-0 bg-transparent"
        style={{ height: `${frameHeight}px` }}
        onLoad={prepareFrame}
      />
    </section>
  );
}

function ContactAndAgeAiWorkspace() {
  return (
    <div className="space-y-6">
      <AgeVerificationAIControl />
      <EmbeddedAgeVerificationControlCentre />
    </div>
  );
}

export default function AISystemsControlEnhancer() {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let createdTarget: HTMLElement | null = null;
    let scheduled = 0;

    function apply() {
      scheduled = 0;
      document.title = 'AI Systems Control Centre — Admin Portal';

      const pageHeading = Array.from(document.querySelectorAll('h1')).find(element => text(element) === 'AI Chatbot Control');
      if (pageHeading) pageHeading.textContent = 'AI Systems Control Centre';

      const headingContainer = pageHeading?.parentElement?.parentElement;
      const subtitle = headingContainer?.querySelector('p');
      if (subtitle && /Manage the assistant, published content and customer conversations/i.test(text(subtitle))) {
        subtitle.textContent = 'Manage Sousa Murray Planeia support, contact, age-verification and future AI systems from one governed control centre.';
      }

      const nav = document.querySelector<HTMLElement>('nav[aria-label="Chatbot settings sections"], nav[aria-label="AI systems settings sections"]');
      if (!nav) return;
      nav.setAttribute('aria-label', 'AI systems settings sections');

      const contactButton = Array.from(nav.querySelectorAll('button')).find(button => /^(Contact page|Contact & Age AI)$/i.test(text(button)));
      if (contactButton && text(contactButton) !== 'Contact & Age AI') {
        const nodes = Array.from(contactButton.childNodes);
        const labelNode = nodes.find(node => node.nodeType === Node.TEXT_NODE && /Contact page/i.test(node.textContent || ''));
        if (labelNode) labelNode.textContent = 'Contact & Age AI';
        else contactButton.append('Contact & Age AI');
      }

      const activeContact = Boolean(contactButton?.getAttribute('aria-current') === 'page');
      const topSection = nav.closest('section');
      const root = topSection?.parentElement;
      if (!root) return;

      const directChildren = Array.from(root.children);
      const contentHost = directChildren.find(element => element !== topSection && element instanceof HTMLDivElement && element.classList.contains('rounded-2xl') && element.classList.contains('border')) as HTMLElement | undefined;
      if (!contentHost) return;

      let target = root.querySelector<HTMLElement>(':scope > [data-age-ai-portal="true"]');
      if (!target) {
        target = document.createElement('div');
        target.dataset.ageAiPortal = 'true';
        target.className = 'age-ai-contact-tab-extension';
        contentHost.insertAdjacentElement('afterend', target);
        createdTarget = target;
      }
      target.hidden = !activeContact;
      setPortalTarget(activeContact ? target : null);
    }

    function schedule() {
      if (scheduled) return;
      scheduled = window.requestAnimationFrame(apply);
    }

    apply();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current'] });
    window.addEventListener('popstate', schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', schedule);
      if (scheduled) window.cancelAnimationFrame(scheduled);
      createdTarget?.remove();
    };
  }, []);

  return portalTarget ? createPortal(<ContactAndAgeAiWorkspace />, portalTarget) : null;
}
