import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import WebsiteBuilderSettingsPanel from '@/components/WebsiteBuilderSettingsPanel';
import AIWebsiteBuilderPage from './ai-website-builder';
import WebsiteSourceFilesPage from './website-source-files';

function WebsiteBuilderSettingsPage() {
  return (
    <AdminLayout title="Website Builder Settings">
      <Helmet><title>Website Builder Settings | Planyx Admin Centre</title></Helmet>
      <WebsiteBuilderSettingsPanel />
    </AdminLayout>
  );
}

export default function AdminWebsiteWorkspacePage() {
  const view = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('view') : null;
  if (view === 'source') return <WebsiteSourceFilesPage />;
  if (view === 'settings') return <WebsiteBuilderSettingsPage />;
  return <AIWebsiteBuilderPage />;
}
