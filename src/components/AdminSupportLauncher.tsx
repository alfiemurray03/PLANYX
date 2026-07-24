import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';

import { useAdmin } from '@/lib/admin-context';
import { hasPermission } from '@/lib/admin-types';

export default function AdminSupportLauncher() {
  const { admin } = useAdmin();
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    const updatePortalState = () => setPortalReady(Boolean(document.querySelector('.admin-portal')));
    updatePortalState();
    const observer = new MutationObserver(updatePortalState);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!admin || !portalReady || !hasPermission(admin, 'support')) return null;
  if (window.location.pathname.replace(/\/+$/, '') === '/admin/manuals') return null;

  return (
    <a
      href="/admin/manuals"
      className="fixed bottom-16 left-4 z-[69] inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-300 bg-blue-600 px-3.5 text-sm font-semibold text-white shadow-xl transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-blue-500/40 dark:bg-blue-600 dark:hover:bg-blue-500"
      aria-label="Open Admin Support and Manuals"
      aria-keyshortcuts="g m"
    >
      <BookOpen className="h-4 w-4" />
      <span className="hidden sm:inline">Support & Manuals</span>
      <kbd className="rounded border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">G M</kbd>
    </a>
  );
}
