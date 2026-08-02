import { Navigate } from 'react-router-dom';

export default function LegacySupportRedirect() {
  return <Navigate to="/admin/support" replace />;
}
