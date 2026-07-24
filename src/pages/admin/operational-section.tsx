import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AdminLayout from '@/components/AdminLayout';
import AdminBrandingPage from '@/pages/admin/branding';
import AdminEnquiriesPage from '@/pages/admin/enquiries';
import AdminPlansPage from '@/pages/admin/plans';
import AdminSessionsPage from '@/pages/admin/sessions';
import AdminAuthorityReportingPage from '@/pages/admin/authority-reporting';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Activity, AlertTriangle, Database, RefreshCw, Settings } from 'lucide-react';

interface SectionDefinition {
  section: string;
  title: string;
  subtitle: string;
}

const DEFINITIONS: Record<string, SectionDefinition> = {
  '/admin/health': { section: 'health', title: 'Production Health', subtitle: 'Verified platform, database and integration signals.' },
  '/admin/operations': { section: 'operations', title: 'Operations', subtitle: 'Live customer and platform operations.' },
  '/admin/reports': { section: 'reports', title: 'Authority Reporting Centre', subtitle: 'Police, safeguarding, regulatory and local-authority reporting records.' },
  '/admin/status': { section: 'status', title: 'Status Centre', subtitle: 'Current public website and service availability.' },
  '/admin/notifications': { section: 'notifications', title: 'Notifications', subtitle: 'Customer and administration communications.' },
  '/admin/system-reports': { section: 'systemreports', title: 'System Reports', subtitle: 'Reported platform issues and their resolution status.' },
  '/admin/closure-requests': { section: 'closures', title: 'Closure Requests', subtitle: 'Customer account closure requests and progress.' },
  '/admin/enquiries': { section: 'enquiries', title: 'Contact Enquiries', subtitle: 'Messages and enquiries received from customers.' },
  '/admin/admin-users': { section: 'admins', title: 'Admin Users', subtitle: 'Administrator accounts and access status.' },
  '/admin/roles': { section: 'roles', title: 'Roles', subtitle: 'Administration roles and assigned permissions.' },
  '/admin/sessions': { section: 'sessions', title: 'Session & Sign-in Centre', subtitle: 'Linked staff and customer access, security evidence and investigation records.' },
  '/admin/credits': { section: 'credits', title: 'Builder Usage Tokens', subtitle: 'Builder token balances, grants and usage.' },
  '/admin/usage': { section: 'usage', title: 'Customer Usage', subtitle: 'Builder activity and customer usage information.' },
  '/admin/addons': { section: 'addons', title: 'Paid Add-Ons', subtitle: 'Optional paid features and customer entitlements.' },
  '/admin/plans': { section: 'plans', title: 'Subscription Plans', subtitle: 'Configured customer plans, pricing and availability.' },
  '/admin/branding': { section: 'branding', title: 'Branding & Appearance', subtitle: 'Browser-tab identity and complete Admin Portal appearance.' },
  '/admin/affiliate-content': { section: 'affiliate', title: 'Affiliate Content', subtitle: 'Approved affiliate disclosures and website content.' },
};

function titleCase(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not available';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString('en-GB');
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString('en-GB');
    return value;
  }
  return JSON.stringify(value);
}

function scalarEntries(value: Record<string, unknown>) {
  return Object.entries(value).filter(([, item]) => item === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof item));
}

function objectEntries(value: Record<string, unknown>) {
  return Object.entries(value).filter(([, item]) => item && !Array.isArray(item) && typeof item === 'object');
}

function arrayEntries(value: Record<string, unknown>) {
  return Object.entries(value).filter(([, item]) => Array.isArray(item)) as Array<[string, unknown[]]>;
}

function DataTable({ title, rows }: { title: string; rows: unknown[] }) {
  const objects = rows.filter(row => row && typeof row === 'object') as Array<Record<string, unknown>>;
  const detectedColumns = Array.from(new Set(objects.flatMap(row => Object.keys(row))));
  const columns = detectedColumns.includes('reference')
    ? ['reference', ...detectedColumns.filter(column => column !== 'reference')].slice(0, 8)
    : detectedColumns.slice(0, 8);

  return (
    <Card className="overflow-hidden border-slate-200 bg-white">
      <CardHeader className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="min-w-0 break-words font-semibold text-slate-900">{titleCase(title)}</h2>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{rows.length.toLocaleString('en-GB')} records</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!rows.length ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">No records currently need attention.</div>
        ) : objects.length ? (
          <div className="admin-table-scroll">
            <table className="admin-data-table min-w-[760px]" aria-label={titleCase(title)}>
              <thead><tr>{columns.map(column => <th key={column} scope="col">{titleCase(column)}</th>)}</tr></thead>
              <tbody>{objects.slice(0, 100).map((row, index) => (
                <tr key={String(row.id || row.reference || row.email || index)}>
                  {columns.map(column => {
                    const text = displayValue(row[column]);
                    return <td key={column} title={text} className="min-w-[140px] max-w-[320px] whitespace-normal break-words">{text}</td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <div className="break-words p-5 text-sm text-slate-700">{rows.map(displayValue).join(', ')}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminOperationalSection() {
  const location = useLocation();
  const definition = DEFINITIONS[location.pathname] || DEFINITIONS['/admin/operations'];
  const isBranding = definition.section === 'branding';
  const isEnquiries = definition.section === 'enquiries';
  const isPlans = definition.section === 'plans';
  const isSessions = definition.section === 'sessions';
  const isAuthorityReporting = definition.section === 'reports';
  const dedicatedPage = isBranding || isEnquiries || isPlans || isSessions || isAuthorityReporting;
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(!dedicatedPage);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (dedicatedPage) {
      setLoading(false);
      setError('');
      setData({});
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/section/${definition.section}`, { credentials: 'include' });
      const result = await response.json() as { success?: boolean; data?: unknown; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || 'This administration section could not be loaded.');
      const payload = result.data;
      setData(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : { records: Array.isArray(payload) ? payload : [] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This administration section could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [definition.section, dedicatedPage]);

  useEffect(() => { void load(); }, [load]);

  const scalars = useMemo(() => scalarEntries(data), [data]);
  const objects = useMemo(() => objectEntries(data), [data]);
  const arrays = useMemo(() => arrayEntries(data), [data]);

  if (isBranding) return <AdminBrandingPage />;
  if (isEnquiries) return <AdminEnquiriesPage />;
  if (isPlans) return <AdminPlansPage />;
  if (isSessions) return <AdminSessionsPage />;
  if (isAuthorityReporting) return <AdminAuthorityReportingPage />;

  return (
    <AdminLayout title={definition.title} subtitle={definition.subtitle}>
      <div className="mx-auto w-full max-w-7xl space-y-6 pb-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100"><Activity className="h-5 w-5 text-blue-600" /></div>
            <div className="min-w-0"><h1 className="break-words text-2xl font-bold text-slate-950">{definition.title}</h1><p className="break-words text-sm text-slate-500">{definition.subtitle}</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {definition.section === 'status' && <Button asChild variant="outline" size="sm"><Link to="/admin/site-settings"><Settings className="mr-2 h-4 w-4" />Manage status</Link></Button>}
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
          </div>
        </div>

        {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

        {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0,1,2,3].map(item => <div key={item} className="h-28 rounded-xl bg-slate-100 animate-pulse" />)}</div> : (
          <>
            {scalars.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{scalars.map(([key, value]) => (
              <Card key={key} className="h-full border-slate-200 bg-white"><CardContent className="p-5"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="mb-1 break-words text-xs text-slate-500">{titleCase(key)}</p><p className="break-words text-xl font-bold text-slate-950">{displayValue(value)}</p></div><Database className="h-5 w-5 shrink-0 text-blue-500" /></div></CardContent></Card>
            ))}</div>}

            {objects.map(([key, value]) => {
              const entries = scalarEntries(value as Record<string, unknown>);
              if (!entries.length) return null;
              return <Card key={key} className="border-slate-200 bg-white"><CardHeader className="border-b border-slate-100 px-5 py-4"><h2 className="break-words font-semibold text-slate-900">{titleCase(key)}</h2></CardHeader><CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">{entries.map(([itemKey, itemValue]) => <div key={itemKey} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="mb-1 break-words text-xs text-slate-500">{titleCase(itemKey)}</p><p className="break-words font-semibold text-slate-900">{displayValue(itemValue)}</p></div>)}</CardContent></Card>;
            })}

            {arrays.map(([key, rows]) => <DataTable key={key} title={key} rows={rows} />)}
            {!scalars.length && !objects.length && !arrays.length && !error && <Card className="border-slate-200"><CardContent className="py-16 text-center"><Database className="mx-auto mb-3 h-8 w-8 text-slate-300" /><p className="font-medium text-slate-800">No administration data is available</p><p className="text-sm text-slate-500">There are currently no records in this section.</p></CardContent></Card>}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
