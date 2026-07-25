import { useEffect, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2 } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import WebsiteBuilderSettingsPanel from '@/components/WebsiteBuilderSettingsPanel';
import AIWebsiteBuilderPage from './ai-website-builder';
import WebsiteSourceFilesPage from './website-source-files';

type WebsiteWorkspaceView = 'studio' | 'source' | 'settings';

function requestedView(): WebsiteWorkspaceView {
  if (typeof window === 'undefined') return 'studio';
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'source' || view === 'settings') return view;
  return 'studio';
}

function WebsiteBuilderSettingsPage() {
  return (
    <AdminLayout title="Website Builder Settings">
      <Helmet><title>Website Builder Settings | Planyx Admin Centre</title></Helmet>
      <WebsiteBuilderSettingsPanel />
    </AdminLayout>
  );
}

export default function AdminWebsiteWorkspacePage() {
  const [view, setView] = useState<WebsiteWorkspaceView | null>(null);

  useEffect(() => {
    const sync = () => setView(requestedView());
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  if (!view) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="h-7 w-7 animate-spin text-blue-600" aria-label="Loading website workspace" />
      </div>
    );
  }

  if (view === 'source') return <WebsiteSourceFilesPage />;
  if (view === 'settings') return <WebsiteBuilderSettingsPage />;
  return <AIWebsiteBuilderPage />;
}
