import AIWebsiteBuilderPage from './ai-website-builder';
import WebsiteSourceFilesPage from './website-source-files';

export default function AdminWebsiteWorkspacePage() {
  const view = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('view') : null;
  return view === 'source' ? <WebsiteSourceFilesPage /> : <AIWebsiteBuilderPage />;
}
