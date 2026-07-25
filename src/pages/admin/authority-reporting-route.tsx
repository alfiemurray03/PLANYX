import { useSearchParams } from 'react-router-dom';
import AdminAuthorityReportingPage from '@/pages/admin/authority-reporting';
import AuthorityReportingLibraryPage from '@/pages/admin/authority-reporting-library';
import AuthorityReportTemplateBridge from '@/components/admin/AuthorityReportTemplateBridge';
import EmbeddedAuthoritySelection from '@/components/admin/EmbeddedAuthoritySelection';
import EmbeddedAuthorityReportLinking from '@/components/admin/EmbeddedAuthorityReportLinking';

export default function AdminAuthorityReportingRoutePage() {
  const [searchParams] = useSearchParams();
  const workspaceOpen = searchParams.get('view') === 'workspace'
    || searchParams.has('report')
    || searchParams.has('template')
    || searchParams.has('session_id')
    || searchParams.has('session_reference')
    || searchParams.has('user_email')
    || searchParams.has('user_name');

  if (!workspaceOpen) return <AuthorityReportingLibraryPage />;

  return (
    <>
      <AdminAuthorityReportingPage />
      <AuthorityReportTemplateBridge />
      <EmbeddedAuthoritySelection />
      <EmbeddedAuthorityReportLinking />
    </>
  );
}
