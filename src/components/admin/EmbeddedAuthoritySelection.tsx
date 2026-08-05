import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import AuthoritySelectionPanel, { type AuthoritySelection } from '@/components/admin/AuthoritySelectionPanel';

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

function findOrCreateMount(): HTMLElement | null {
  const section = document.getElementById('authority-name')?.closest('section');
  if (!section) return null;
  const found = document.getElementById('authority-selection-inline-root');
  if (found) return found;
  const mount = document.createElement('div');
  mount.id = 'authority-selection-inline-root';
  mount.dataset.authoritySelection = 'embedded';
  mount.className = 'mt-4';
  section.firstElementChild?.after(mount);
  return mount;
}

function currentReportType(): string {
  const select = document.getElementById('report-type');
  return select instanceof HTMLSelectElement ? select.value : 'other-authority';
}

function authorityEvidence(authority: AuthoritySelection, context: { postcode: string; postcodeSource: string; guidance: string }): string {
  return [
    '--- Sousa Murray Planeia authority selection context ---',
    `Authority: ${authority.name}`,
    `Category: ${authority.category}`,
    `Official route: ${authority.channel}`,
    `Official source: ${authority.officialUrl}`,
    `Directory source: ${authority.source || 'Official authority website'}`,
    `Postcode used: ${context.postcode || authority.postcode || 'Not used'}`,
    `Postcode source: ${context.postcodeSource || 'Not recorded'}`,
    `Guidance: ${context.guidance}`,
    `Checked: ${authority.checkedAt ? new Date(authority.checkedAt).toLocaleString('en-GB') : new Date().toLocaleString('en-GB')}`,
  ].join('\n');
}

function mergeEvidence(existing: string, block: string): string {
  const base = existing.replace(/\n*--- Sousa Murray Planeia authority selection context ---[\s\S]*$/m, '').trim();
  return [base, block].filter(Boolean).join('\n\n').slice(0, 6000);
}

export default function EmbeddedAuthoritySelection() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [reportType, setReportType] = useState('other-authority');

  useEffect(() => {
    const attach = () => {
      const next = findOrCreateMount();
      if (next) setMount(next);
      setReportType(currentReportType());
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const select = document.getElementById('report-type');
    if (!(select instanceof HTMLSelectElement)) return;
    const update = () => setReportType(select.value || 'other-authority');
    select.addEventListener('change', update);
    return () => select.removeEventListener('change', update);
  }, [mount]);

  function applyAuthority(authority: AuthoritySelection, context: { postcode: string; postcodeSource: string; guidance: string }): void {
    setInput('authority-name', authority.name);
    setInput('authority-channel', [
      authority.channel,
      `Official source: ${authority.officialUrl}`,
      `Verified through: ${authority.source || 'Official authority website'}`,
      context.postcode || authority.postcode ? `Postcode used: ${context.postcode || authority.postcode} (${context.postcodeSource || 'source not recorded'})` : '',
      `Checked: ${authority.checkedAt ? new Date(authority.checkedAt).toLocaleString('en-GB') : new Date().toLocaleString('en-GB')}`,
    ].filter(Boolean).join(' · '));

    const evidence = document.getElementById('evidence');
    if (evidence instanceof HTMLTextAreaElement) {
      setInput('evidence', mergeEvidence(evidence.value, authorityEvidence(authority, context)));
    }
  }

  return mount ? createPortal(
    <AuthoritySelectionPanel reportType={reportType} onSelect={applyAuthority} />,
    mount,
  ) : null;
}
