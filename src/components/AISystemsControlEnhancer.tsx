import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import AgeVerificationAIControl from '@/components/AgeVerificationAIControl';

function text(element: Element | null) {
  return element?.textContent?.trim() || '';
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
        subtitle.textContent = 'Manage Planyx support, contact, age-verification and future AI systems from one governed control centre.';
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

  return portalTarget ? createPortal(<AgeVerificationAIControl />, portalTarget) : null;
}
