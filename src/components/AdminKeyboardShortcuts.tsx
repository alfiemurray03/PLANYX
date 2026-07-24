import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Keyboard, X } from 'lucide-react';
import { useAdmin } from '@/lib/admin-context';
import { hasPermission } from '@/lib/admin-types';

interface AdminShortcut {
  key: string;
  label: string;
  description: string;
  href: string;
  section: string;
}

const ADMIN_SHORTCUTS: AdminShortcut[] = [
  { key: 'd', label: 'Dashboard', description: 'Admin Centre overview', href: '/admin/dashboard', section: 'dashboard' },
  { key: 'c', label: 'Customer CRM', description: 'Customers and account records', href: '/admin/users', section: 'customers' },
  { key: 'p', label: 'Subscription Plans', description: 'Plans, prices and Stripe IDs', href: '/admin/plans', section: 'plans' },
  { key: 'e', label: 'Contact Enquiries', description: 'Customer support requests', href: '/admin/enquiries', section: 'enquiries' },
  { key: 'b', label: 'Experience Builders', description: 'Builder availability and controls', href: '/admin/builders', section: 'builders' },
  { key: 'a', label: 'AI Chatbot Control', description: 'Chatbot and Contact Us settings', href: '/admin/ai-chatbot', section: 'systemsettings' },
  { key: 's', label: 'Site Status & Settings', description: 'Website status and platform settings', href: '/admin/site-settings', section: 'systemsettings' },
  { key: 'h', label: 'Production Health', description: 'Live platform health checks', href: '/admin/health', section: 'health' },
  { key: 'm', label: 'Admin Support & Manuals', description: 'PDF manuals and administrator guidance', href: '/admin/manuals', section: 'support' },
];

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    || Boolean(target.closest('[contenteditable="true"], [role="textbox"]'));
}

function navigateToAdminPage(shortcut: AdminShortcut) {
  const matchingLink = document.querySelector<HTMLAnchorElement>(`.admin-portal a[href="${shortcut.href}"]`);
  if (matchingLink) {
    matchingLink.click();
    return;
  }
  window.location.assign(shortcut.href);
}

export default function AdminKeyboardShortcuts() {
  const { admin } = useAdmin();
  const [portalReady, setPortalReady] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [prefixActive, setPrefixActive] = useState(false);
  const prefixTimerRef = useRef<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const allowedShortcuts = useMemo(
    () => ADMIN_SHORTCUTS.filter(shortcut => admin && hasPermission(admin, shortcut.section)),
    [admin],
  );

  function clearPrefix() {
    if (prefixTimerRef.current !== null) {
      window.clearTimeout(prefixTimerRef.current);
      prefixTimerRef.current = null;
    }
    setPrefixActive(false);
  }

  function beginPrefix() {
    clearPrefix();
    setPrefixActive(true);
    prefixTimerRef.current = window.setTimeout(() => {
      prefixTimerRef.current = null;
      setPrefixActive(false);
    }, 1800);
  }

  function openShortcut(shortcut: AdminShortcut) {
    clearPrefix();
    setHelpOpen(false);
    navigateToAdminPage(shortcut);
  }

  useEffect(() => {
    const updatePortalState = () => setPortalReady(Boolean(document.querySelector('.admin-portal')));
    updatePortalState();
    const observer = new MutationObserver(updatePortalState);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!helpOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => previousFocusRef.current?.focus();
  }, [helpOpen]);

  useEffect(() => {
    if (!admin || !portalReady) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;

      if (event.key === 'Escape') {
        if (helpOpen) setHelpOpen(false);
        clearPrefix();
        return;
      }

      if (isEditableTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === '?') {
        event.preventDefault();
        clearPrefix();
        setHelpOpen(open => !open);
        return;
      }

      const key = event.key.toLowerCase();
      if (prefixActive) {
        const shortcut = allowedShortcuts.find(item => item.key === key);
        clearPrefix();
        if (shortcut) {
          event.preventDefault();
          openShortcut(shortcut);
        }
        return;
      }

      if (key === 'g') {
        event.preventDefault();
        beginPrefix();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [admin, allowedShortcuts, helpOpen, portalReady, prefixActive]);

  useEffect(() => () => {
    if (prefixTimerRef.current !== null) window.clearTimeout(prefixTimerRef.current);
  }, []);

  if (!admin || !portalReady || allowedShortcuts.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setHelpOpen(true)}
        className="fixed bottom-4 left-4 z-[70] inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-xl transition hover:border-blue-400 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-300"
        aria-label="Open Admin Centre keyboard shortcuts"
        aria-keyshortcuts="?"
      >
        <Keyboard className="h-4 w-4" />
        <span className="hidden sm:inline">Shortcuts</span>
        <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-slate-600 dark:bg-slate-800">?</kbd>
      </button>

      {prefixActive && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-[80] -translate-x-1/2 rounded-xl border border-blue-300 bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl"
        >
          Go to page… press {allowedShortcuts.map(shortcut => shortcut.key.toUpperCase()).join(', ')}
        </div>
      )}

      {helpOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setHelpOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-shortcuts-title"
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-700">
              <div>
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-300">
                  <Keyboard className="h-5 w-5" />
                  <span className="text-xs font-bold uppercase tracking-[0.14em]">Admin Centre</span>
                </div>
                <h2 id="admin-shortcuts-title" className="mt-2 text-xl font-bold">Keyboard shortcuts</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Press G, release it, then press the page letter.</p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setHelpOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="Close keyboard shortcuts"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid max-h-[65vh] gap-2 overflow-y-auto p-5 sm:grid-cols-2">
              {allowedShortcuts.map(shortcut => (
                <button
                  key={shortcut.href}
                  type="button"
                  onClick={() => openShortcut(shortcut)}
                  className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-blue-400 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:hover:border-blue-500 dark:hover:bg-blue-950/30"
                >
                  <span className="flex shrink-0 items-center gap-1">
                    <kbd className="rounded-md border border-slate-300 bg-slate-100 px-2 py-1 font-mono text-xs font-bold dark:border-slate-600 dark:bg-slate-800">G</kbd>
                    <span className="text-xs text-slate-400">then</span>
                    <kbd className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 font-mono text-xs font-bold text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200">{shortcut.key.toUpperCase()}</kbd>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{shortcut.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{shortcut.description}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600 dark:text-slate-600 dark:group-hover:text-blue-300" />
                </button>
              ))}
            </div>

            <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">
              Press <kbd className="rounded border px-1.5 py-0.5 font-mono">?</kbd> to open this guide and <kbd className="rounded border px-1.5 py-0.5 font-mono">Esc</kbd> to close it. Shortcuts are paused while you type in a form.
            </div>
          </section>
        </div>
      )}
    </>
  );
}
