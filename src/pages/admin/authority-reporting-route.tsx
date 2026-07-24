import AdminAuthorityReportingPage from '@/pages/admin/authority-reporting';
import EmbeddedAuthoritySelection from '@/components/admin/EmbeddedAuthoritySelection';
import EmbeddedAuthorityReportLinking from '@/components/admin/EmbeddedAuthorityReportLinking';

export default function AdminAuthorityReportingRoutePage() {
  return (
    <>
      <AdminAuthorityReportingPage />
      <EmbeddedAuthoritySelection />
      <EmbeddedAuthorityReportLinking />
    </>
  );
}
