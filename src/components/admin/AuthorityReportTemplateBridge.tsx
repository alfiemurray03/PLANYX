import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAuthorityReportTemplate } from '@/lib/authority-report-templates';

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

function setSelect(id: string, value: string): boolean {
  const select = document.getElementById(id);
  if (!(select instanceof HTMLSelectElement)) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (!setter) return false;
  setter.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function findToolbarMount(): HTMLElement | null {
  const sessionLink = Array.from(document.querySelectorAll('a')).find(anchor => anchor.getAttribute('href') === '/admin/sessions');
  const toolbar = sessionLink?.parentElement;
  if (!toolbar) return null;
  const found = document.getElementById('authority-library-back-root');
  if (found) return found;
  const mount = document.createElement('span');
  mount.id = 'authority-library-back-root';
  mount.dataset.authorityLibraryBack = 'true';
  toolbar.prepend(mount);
  return mount;
}

export default function AuthorityReportTemplateBridge() {
  const [searchParams] = useSearchParams();
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const appliedRef = useRef('');
  const template = getAuthorityReportTemplate(searchParams.get('template'));
  const savedReportOpen = searchParams.has('report');

  useEffect(() => {
    const attach = () => {
      const next = findToolbarMount();
      if (next) setMount(next);
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!template || savedReportOpen || appliedRef.current === template.id) return;
    let attempts = 0;
    let cancelled = false;
    const apply = () => {
      if (cancelled || appliedRef.current === template.id) return;
      attempts += 1;
      const ready = setSelect('report-type', template.reportType);
      if (!ready && attempts < 50) {
        window.setTimeout(apply, 80);
        return;
      }
      window.setTimeout(() => {
        if (cancelled) return;
        setInput('authority-name', template.authority);
        setInput('authority-channel', template.channel);
        setSelect('urgency', template.urgency);
        appliedRef.current = template.id;
      }, 40);
    };
    apply();
    return () => { cancelled = true; };
  }, [savedReportOpen, template]);

  return mount ? createPortal(
    <Button asChild variant="outline">
      <Link to="/admin/authority-reporting"><LayoutGrid className="mr-2 h-4 w-4" />Report library</Link>
    </Button>,
    mount,
  ) : null;
}
