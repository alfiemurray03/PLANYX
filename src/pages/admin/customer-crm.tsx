import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useParams } from 'react-router-dom';
import AdminLayout from '@/components/AdminLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity, ArrowLeft, CheckCircle2, CreditCard,
  Download, FileText, Fingerprint, KeyRound, Mail, Pencil, RefreshCw, Scale, ShieldCheck, StickyNote, Trash2,
  UserRound, Wrench,
} from 'lucide-react';

type Row = Record<string, unknown>;
type Verification = { verified?: boolean; method?: string; expires_at?: string; locked?: boolean; admin_pin_override_available?: boolean };
type CrmResponse = { customer?: Row; verification?: Verification; error?: string };

const asText = (value: unknown, fallback = 'Not recorded') => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};
const asRows = (value: unknown): Row[] => Array.isArray(value) ? value.filter((item): item is Row => !!item && typeof item === 'object') : [];
const date = (value: unknown) => {
  if (!value) return 'Not recorded';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};

function Detail({ label, value }: { label: string; value: unknown }) {
  return <div className="min-w-0 border-b border-border/70 px-1 py-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 break-words text-[13px] font-medium text-foreground">{asText(value)}</p></div>;
}

function Empty({ children }: { children: string }) {
  return <div className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">{children}</div>;
}

function Records({ rows, title, fields }: { rows: Row[]; title: string; fields: Array<[string, string]> }) {
  if (!rows.length) return <Empty>{`No ${title.toLowerCase()} recorded.`}</Empty>;
  return <div className="divide-y overflow-hidden rounded-lg border border-border bg-card">{rows.map((row, index) => (
    <div key={asText(row.id || row.reference || `${title}-${index}`)}>
      <div className="grid gap-x-4 px-3 py-2 sm:grid-cols-2 xl:grid-cols-4">
        {fields.map(([key, label]) => <Detail key={key} label={label} value={key.includes('at') || key.includes('date') ? date(row[key]) : row[key]} />)}
      </div>
    </div>
  ))}</div>;
}

export default function AdminCustomerCrm() {
  const { email: encodedEmail = '' } = useParams();
  const email = useMemo(() => decodeURIComponent(encodedEmail), [encodedEmail]);
  const [data, setData] = useState<CrmResponse>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pin, setPin] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [directorPin, setDirectorPin] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState({ verified_name: '', display_name: '', contact_email: '', phone: '', communication_preference: '', support_notes: '', admin_notes: '' });
  const [pdfSections, setPdfSections] = useState({ internalNotes: false, supportHistory: false, activityAudit: false, notifications: false });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/admin/api?section=customer&email=${encodeURIComponent(email)}`, { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as CrmResponse;
      if (!response.ok || !payload.customer) throw new Error(payload.error || 'The customer record could not be loaded.');
      setData(payload);
      setEdit({
        verified_name: asText(payload.customer.verified_name, ''), display_name: asText(payload.customer.display_name, ''),
        contact_email: asText(payload.customer.contact_email, ''), phone: asText(payload.customer.phone, ''),
        communication_preference: asText(payload.customer.communication_preference, ''), support_notes: asText(payload.customer.support_notes, ''),
        admin_notes: asText(payload.customer.admin_notes, ''),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The customer record could not be loaded.');
    } finally { setLoading(false); }
  }, [email]);

  useEffect(() => { void load(); }, [load]);

  async function verifyIdentity() {
    if (!/^\d{6}$/.test(pin)) { setMessage('Enter the customer’s six-digit Support PIN.'); return; }
    setVerifying(true); setMessage('');
    try {
      const response = await fetch('/admin/api?section=customer', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_pin', email, pin, method: 'Support PIN' }),
      });
      const payload = await response.json().catch(() => ({})) as { saved?: boolean; error?: string };
      if (!response.ok || !payload.saved) throw new Error(payload.error || 'Identity could not be verified.');
      setPin(''); setMessage('Identity verified. The one-time PIN has been used and reset.'); await load();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Identity could not be verified.'); }
    finally { setVerifying(false); }
  }

  async function useAdministratorPin() {
    if (!/^\d{4}$/.test(directorPin)) { setMessage('Enter your four-digit administrator CRM override PIN.'); return; }
    if (overrideReason.trim().length < 4) { setMessage('Enter a reason of at least four characters.'); return; }
    setVerifying(true); setMessage('');
    try {
      const pinResponse = await fetch('/admin/api?section=adminpin', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', pin: directorPin }),
      });
      const pinPayload = await pinResponse.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!pinResponse.ok || !pinPayload.success) throw new Error(pinPayload.error || 'The administrator CRM override PIN could not be verified.');
      const response = await fetch('/admin/api?section=customer', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'admin_pin_override', email, reason: overrideReason.trim() }),
      });
      const payload = await response.json().catch(() => ({})) as { saved?: boolean; error?: string };
      if (!response.ok || !payload.saved) throw new Error(payload.error || 'Administrator override access could not be authorised.');
      setDirectorPin(''); setOverrideReason(''); setMessage('Protected CRM access authorised with your administrator PIN. This access has been audited.'); await load();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Administrator override access could not be authorised.'); }
    finally { setVerifying(false); }
  }

  async function downloadCustomerData() {
    setMessage('Preparing the customer SAR report…');
    try {
      const response = await fetch('/admin/api?section=customer', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export_customer_data', customer_email: email, format: 'json' }),
      });
      const payload = await response.json().catch(() => ({})) as { export?: { filename?: string; content?: string }; error?: string };
      if (!response.ok || !payload.export?.content) throw new Error(payload.error || 'The export could not be prepared.');
      const sar = JSON.parse(payload.export.content) as { profile?: Row; dataRequests?: Row[]; systemReports?: Row[]; closureRequests?: Row[] };
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 16;
      const blue: [number, number, number] = [24, 78, 170];
      const navy: [number, number, number] = [15, 23, 42];
      const muted: [number, number, number] = [71, 85, 105];
      const generated = new Date();
      const reportReference = `SAR-${generated.toISOString().slice(0, 10).replaceAll('-', '')}-${email.split('@')[0].slice(0, 12).toUpperCase()}`;
      const text = (value: unknown) => value === null || value === undefined || value === '' ? 'Not recorded' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
      const heading = (title: string, y: number) => { pdf.setTextColor(...navy); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.text(title, margin, y); pdf.setDrawColor(203, 213, 225); pdf.line(margin, y + 2, pageWidth - margin, y + 2); return y + 7; };
      const table = (rows: Array<[string, unknown]>, y: number) => {
        autoTable(pdf, { startY: y, body: rows.map(([label, value]) => [label, text(value)]), margin: { left: margin, right: margin }, theme: 'grid', styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.4, textColor: navy, lineColor: [226, 232, 240], lineWidth: 0.2, overflow: 'linebreak' }, columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold', fillColor: [248, 250, 252], textColor: muted }, 1: { cellWidth: 'auto' } } });
        return (pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
      };
      const listTable = (title: string, rows: Row[], columns: Array<[string, string]>, y: number) => {
        if (y > 245) { pdf.addPage(); y = 20; }
        y = heading(title, y);
        if (!rows.length) { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...muted); pdf.text('No records were found in this section.', margin, y + 3); return y + 9; }
        autoTable(pdf, { startY: y, head: [columns.map(([, label]) => label)], body: rows.map(row => columns.map(([key]) => text(row[key]))), margin: { left: margin, right: margin }, theme: 'grid', styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2, textColor: navy, lineColor: [226, 232, 240], lineWidth: 0.2, overflow: 'linebreak' }, headStyles: { fillColor: blue, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [248, 250, 252] } });
        return ((pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;
      };

      pdf.setFillColor(...blue); pdf.rect(0, 0, pageWidth, 46, 'F');
      pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(21); pdf.text('Subject Access Request', margin, 20);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11); pdf.text('Customer information report', margin, 29);
      pdf.setFontSize(8); pdf.text('Sousa Murray Planeia | JA Group Services Ltd', margin, 38);
      let y = 58;
      pdf.setTextColor(...navy); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); pdf.text('Your personal data', margin, y); y += 8;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(...muted);
      const introduction = 'This report has been prepared in response to a subject access request. It summarises the personal information currently associated with the customer account and the administrative records included in the approved export.';
      const introLines = pdf.splitTextToSize(introduction, pageWidth - (margin * 2)); pdf.text(introLines, margin, y); y += introLines.length * 4.5 + 5;
      y = table([['Report reference', reportReference], ['Prepared for', sar.profile?.verified_name || sar.profile?.display_name || name], ['Account email', email], ['Generated', generated.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })], ['Format', 'Customer SAR disclosure report']], y) + 9;
      y = heading('Customer account information', y);
      const profile = sar.profile || {};
      y = table([['Verified name', profile.verified_name], ['Display name', profile.display_name], ['Account email', profile.email || email], ['Contact email', profile.contact_email], ['Telephone', profile.phone], ['Communication preference', profile.communication_preference], ['Account status', profile.admin_customer_status], ['Account created', profile.created_at], ['Last updated', profile.updated_at]], y) + 8;
      if (y > 238) { pdf.addPage(); y = 20; }
      y = heading('How this information is used', y);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...muted);
      const useText = 'Sousa Murray Planeia uses account and contact information to provide the service, administer membership, respond to support requests, maintain security and meet legal obligations. Payment-card numbers and Microsoft passwords are not included because Sousa Murray Planeia does not store them in the customer profile.';
      const useLines = pdf.splitTextToSize(useText, pageWidth - (margin * 2)); pdf.text(useLines, margin, y); y += useLines.length * 4.3 + 7;
      y = listTable('Data protection requests', Array.isArray(sar.dataRequests) ? sar.dataRequests : [], [['reference', 'Reference'], ['request_type', 'Request type'], ['status', 'Status'], ['submitted_at', 'Submitted'], ['due_at', 'Due']], y);
      y = listTable('Customer system reports', Array.isArray(sar.systemReports) ? sar.systemReports : [], [['reference', 'Reference'], ['category', 'Category'], ['subject', 'Subject'], ['status', 'Status'], ['created_at', 'Created']], y);
      y = listTable('Account closure and erasure records', Array.isArray(sar.closureRequests) ? sar.closureRequests : [], [['reference', 'Reference'], ['reason', 'Reason'], ['status', 'Status'], ['created_at', 'Created'], ['completed_at', 'Completed']], y);
      if (pdfSections.supportHistory) {
        y = listTable('Support cases', cases, [['reference', 'Reference'], ['subject', 'Subject'], ['category', 'Category'], ['status', 'Status'], ['updated_at', 'Updated']], y);
        y = listTable('Contact enquiries', enquiries, [['reference', 'Reference'], ['subject', 'Subject'], ['status', 'Status'], ['created_at', 'Submitted']], y);
      }
      if (pdfSections.internalNotes) {
        const internalRows: Row[] = [
          ...(customer.support_notes ? [{ category: 'Customer support notes', body: customer.support_notes, author_email: 'Customer profile', updated_at: customer.updated_at }] : []),
          ...(customer.admin_notes ? [{ category: 'Admin notes', body: customer.admin_notes, author_email: 'Admin CRM', updated_at: customer.admin_updated_at }] : []),
          ...notes,
        ];
        y = listTable('Internal notes - approved for disclosure', internalRows, [['category', 'Category'], ['body', 'Note'], ['author_email', 'Author'], ['updated_at', 'Updated']], y);
      }
      if (pdfSections.notifications) y = listTable('Customer notifications', notifications, [['title', 'Title'], ['category', 'Category'], ['status', 'Status'], ['created_at', 'Created']], y);
      if (pdfSections.activityAudit) {
        y = listTable('Customer activity timeline', timeline, [['title', 'Event'], ['detail', 'Details'], ['actor_email', 'Actor'], ['created_at', 'Date']], y);
        y = listTable('Administrative audit history - approved for disclosure', audit, [['action', 'Action'], ['summary', 'Summary'], ['actor_email', 'Administrator'], ['created_at', 'Date']], y);
      }
      if (y > 230) { pdf.addPage(); y = 20; }
      y = heading('Questions or corrections', y);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...muted);
      const rights = 'If any information in this report is inaccurate, or you have questions about the response, contact the Sousa Murray Planeia Data Protection team. You may also request rectification, restriction, erasure or objection where the relevant legal conditions apply.';
      pdf.text(pdf.splitTextToSize(rights, pageWidth - (margin * 2)), margin, y);

      const pages = pdf.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        pdf.setPage(page); pdf.setDrawColor(226, 232, 240); pdf.line(margin, 283, pageWidth - margin, 283);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...muted);
        pdf.text('Private and confidential - intended for the named customer', margin, 289);
        pdf.text(`Page ${page} of ${pages}`, pageWidth - margin, 289, { align: 'right' });
      }
      pdf.save(`Sousa Murray Planeia-SAR-${email.replace(/[^a-z0-9]+/gi, '-')}.pdf`);
      setMessage('Formatted SAR PDF downloaded and the export has been recorded in the audit log.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The SAR PDF could not be prepared.'); }
  }

  async function saveProfile() {
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/admin/api?section=customer', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_profile', email, ...edit }) });
      const payload = await response.json().catch(() => ({})) as { saved?: boolean; error?: string };
      if (!response.ok || !payload.saved) throw new Error(payload.error || 'The customer details could not be saved.');
      setEditing(false); setMessage('Customer details updated. The amendment has been added to the audit history.'); await load();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The customer details could not be saved.'); }
    finally { setSaving(false); }
  }

  async function startErasureRequest() {
    if (!window.confirm(`Start a formal data deletion and account-closure request for ${email}? Data will not be erased until the request is reviewed for legal and financial retention requirements.`)) return;
    setMessage('Creating the deletion request…');
    try {
      const response = await fetch('/admin/api?section=closures', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_email: email, customer_name: name, reason: 'Customer data deletion / erasure request created from Customer CRM', status: 'Open' }) });
      const payload = await response.json().catch(() => ({})) as { saved?: boolean; error?: string };
      if (!response.ok || !payload.saved) throw new Error(payload.error || 'The deletion request could not be created.');
      setMessage('Deletion request created. Review and complete it in Closure and Erasure Requests.'); await load();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The deletion request could not be created.'); }
  }

  const customer = data.customer || {};
  const name = asText(customer.verified_name || customer.display_name, email);
  const billing = (customer.billing && typeof customer.billing === 'object' ? customer.billing : {}) as Row;
  const subscription = (billing.subscription && typeof billing.subscription === 'object' ? billing.subscription : {}) as Row;
  const flags = asRows(customer.flags);
  const timeline = asRows(customer.timeline);
  const cases = asRows(customer.supportCases);
  const enquiries = asRows(customer.customerEnquiries);
  const notes = asRows(customer.notes);
  const outputs = asRows(customer.builderOutputs);
  const ledger = asRows(customer.tokenLedger);
  const saved = asRows(customer.savedItems);
  const notifications = asRows(customer.notifications);
  const requests = asRows(customer.dataRequests);
  const audit = asRows(customer.customerAudit);

  return <>
    <Helmet><title>{name} — Customer CRM — Sousa Murray Planeia Admin</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <AdminLayout title="Customer CRM" subtitle="Account, membership, support and activity in one record">
      <div className="crm-dense space-y-3 text-sm [&_[data-slot=card]]:shadow-none [&_[data-slot=card-header]]:p-3 [&_[data-slot=card-content]]:p-3 [&_[data-slot=card-content]]:pt-0 [&_[data-slot=card-title]]:text-sm [&_[data-slot=card-title]]:font-semibold">
        <Button asChild variant="outline" size="sm"><Link to="/admin/users"><ArrowLeft className="mr-2 h-4 w-4" />All customers</Link></Button>
        {loading ? <div className="flex min-h-72 items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-muted-foreground" /></div> : error ?
          <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" size="sm" className="ml-3" onClick={() => void load()}>Retry</Button></AlertDescription></Alert> : <>
          <Card className="shadow-none">
            <CardContent className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">{name.slice(0, 2).toUpperCase()}</div><div className="min-w-0"><h1 className="break-words text-lg font-semibold text-foreground">{name}</h1><p className="break-all text-xs text-muted-foreground">{email}</p><div className="mt-1 flex flex-wrap gap-1.5"><Badge className="h-5 text-[10px]">{asText(customer.admin_customer_status, 'Standard')}</Badge>{customer.admin_lifetime ? <Badge className="h-5 bg-amber-100 text-[10px] text-amber-800">Lifetime</Badge> : null}{data.verification?.verified ? <Badge className="h-5 bg-green-100 text-[10px] text-green-800">Verified</Badge> : <Badge variant="outline" className="h-5 text-[10px]">Verification required</Badge>}</div></div></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Detail label="Joined" value={date(customer.created_at)} /><Detail label="Last updated" value={date(customer.updated_at)} /><Detail label="Plan" value={subscription.plan || customer.admin_lifetime_plan_id} /><Detail label="Membership" value={subscription.status || customer.admin_customer_status} /></div>
            </CardContent>
          </Card>

          <Tabs defaultValue={data.verification?.verified ? "overview" : "security"} className="w-full">
            <div className="overflow-x-auto border-b border-border pb-1"><TabsList className="h-8 min-w-max justify-start gap-0 bg-transparent p-0 [&_button]:h-8 [&_button]:rounded-none [&_button]:px-2.5 [&_button]:text-xs">
              <TabsTrigger value="overview"><UserRound className="mr-2 h-4 w-4" />Overview</TabsTrigger><TabsTrigger value="membership"><CreditCard className="mr-2 h-4 w-4" />Membership</TabsTrigger><TabsTrigger value="support"><Mail className="mr-2 h-4 w-4" />Support</TabsTrigger><TabsTrigger value="activity"><Activity className="mr-2 h-4 w-4" />Activity</TabsTrigger><TabsTrigger value="builders"><Wrench className="mr-2 h-4 w-4" />Builders</TabsTrigger><TabsTrigger value="security"><ShieldCheck className="mr-2 h-4 w-4" />Security</TabsTrigger><TabsTrigger value="notes"><StickyNote className="mr-2 h-4 w-4" />Notes</TabsTrigger><TabsTrigger value="compliance"><Scale className="mr-2 h-4 w-4" />Compliance</TabsTrigger><TabsTrigger value="data"><FileText className="mr-2 h-4 w-4" />Data & audit</TabsTrigger>
            </TabsList></div>

            <TabsContent value="overview" className="mt-3 space-y-3"><Card className="shadow-none"><CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-3"><CardTitle className="text-sm font-semibold">Contact and account information</CardTitle><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(value => !value)}><Pencil className="mr-1.5 h-3 w-3" />{editing ? 'Cancel' : 'Amend details'}</Button></CardHeader><CardContent className="px-4 pb-4">{editing ? <div className="space-y-3"><Alert><AlertDescription>Profile amendments require an active Support PIN verification and are permanently audited.</AlertDescription></Alert><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs">Verified name<Input className="mt-1 h-8" value={edit.verified_name} onChange={event => setEdit(value => ({ ...value, verified_name: event.target.value }))} /></label><label className="text-xs">Display name<Input className="mt-1 h-8" value={edit.display_name} onChange={event => setEdit(value => ({ ...value, display_name: event.target.value }))} /></label><label className="text-xs">Contact email<Input className="mt-1 h-8" type="email" value={edit.contact_email} onChange={event => setEdit(value => ({ ...value, contact_email: event.target.value }))} /></label><label className="text-xs">Telephone<Input className="mt-1 h-8" value={edit.phone} onChange={event => setEdit(value => ({ ...value, phone: event.target.value }))} /></label><label className="text-xs sm:col-span-2">Communication preference<Input className="mt-1 h-8" value={edit.communication_preference} onChange={event => setEdit(value => ({ ...value, communication_preference: event.target.value }))} /></label><label className="text-xs">Support notes<Textarea className="mt-1 min-h-20 text-sm" value={edit.support_notes} onChange={event => setEdit(value => ({ ...value, support_notes: event.target.value }))} /></label><label className="text-xs">Internal Admin notes<Textarea className="mt-1 min-h-20 text-sm" value={edit.admin_notes} onChange={event => setEdit(value => ({ ...value, admin_notes: event.target.value }))} /></label></div><div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button><Button size="sm" onClick={() => void saveProfile()} disabled={saving}>{saving ? 'Saving…' : 'Save amendments'}</Button></div></div> : <div className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-4"><Detail label="Verified name" value={customer.verified_name} /><Detail label="Display name" value={customer.display_name} /><Detail label="Account email" value={customer.email} /><Detail label="Contact email" value={customer.contact_email} /><Detail label="Telephone" value={customer.phone} /><Detail label="Contact preference" value={customer.communication_preference} /><Detail label="Customer status" value={customer.admin_customer_status} /><Detail label="Account created" value={date(customer.created_at)} /></div>}{message && <p role="status" aria-live="polite" className="mt-3 text-xs text-muted-foreground">{message}</p>}</CardContent></Card><Records rows={flags} title="Account flags" fields={[["flag","Flag"],["note","Details"],["source","Source"],["created_at","Added"]]} /></TabsContent>

            <TabsContent value="membership" className="mt-4 space-y-4"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" />Membership and billing</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Detail label="Plan" value={subscription.plan || customer.admin_lifetime_plan_id} /><Detail label="Subscription status" value={subscription.status || customer.admin_customer_status} /><Detail label="Lifetime access" value={customer.admin_lifetime} /><Detail label="Stripe customer" value={billing.stripeCustomerId} /><Detail label="Current period ends" value={date(subscription.currentPeriodEnd || subscription.current_period_end)} /><Detail label="Trial ends" value={date(subscription.trialEnd || subscription.trial_end)} /><Detail label="Cancellation scheduled" value={subscription.cancelAtPeriodEnd || subscription.cancel_at_period_end} /><Detail label="Billing portal available" value={billing.portalAvailable} /></CardContent></Card><Records rows={ledger} title="Token transactions" fields={[["amount","Amount"],["balance_after","Balance after"],["source","Source"],["created_at","Date"]]} /></TabsContent>

            <TabsContent value="support" className="mt-4 space-y-5"><section><h2 className="mb-3 font-semibold">Support cases</h2><Records rows={cases} title="Support cases" fields={[["reference","Reference"],["subject","Subject"],["status","Status"],["priority","Priority"],["updated_at","Updated"]]} /></section><section><h2 className="mb-3 font-semibold">Contact enquiries</h2><Records rows={enquiries} title="Contact enquiries" fields={[["reference","Reference"],["subject","Subject"],["status","Status"],["created_at","Submitted"]]} /></section></TabsContent>
            <TabsContent value="activity" className="mt-4"><Records rows={timeline} title="Timeline events" fields={[["title","Event"],["detail","Details"],["actor_email","Actor"],["created_at","Date"]]} /></TabsContent>
            <TabsContent value="builders" className="mt-4 space-y-5"><section><h2 className="mb-3 font-semibold">Builder outputs</h2><Records rows={outputs} title="Builder outputs" fields={[["builder_name","Builder"],["title","Title"],["status","Status"],["created_at","Created"]]} /></section><section><h2 className="mb-3 font-semibold">Saved items</h2><Records rows={saved} title="Saved items" fields={[["title","Item"],["item_type","Type"],["status","Status"],["updated_at","Updated"]]} /></section></TabsContent>
            <TabsContent value="security" className="mt-4 space-y-4"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Fingerprint className="h-4 w-4" />Verify customer identity</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Before discussing protected account information with a customer, enter their visible single-use Support PIN. It expires after ten minutes and resets after successful use.</p>{data.verification?.verified ? <Alert><CheckCircle2 className="h-4 w-4" /><AlertDescription>Verified using {data.verification.method || 'Support PIN'}. CRM access expires {date(data.verification.expires_at)}.</AlertDescription></Alert> : <><div className="flex max-w-md gap-2"><Input aria-label="Customer Support PIN" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Six-digit PIN" className="font-mono tracking-[0.25em]" /><Button onClick={() => void verifyIdentity()} disabled={verifying || pin.length !== 6}><KeyRound className="mr-2 h-4 w-4" />{verifying ? 'Verifying…' : 'Verify'}</Button></div><div className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-950">Administrator CRM override</p><p className="mt-1 text-xs leading-relaxed text-amber-800">Use this only when the customer cannot complete Support PIN verification or their PIN is locked. Enter your own four-digit administrator PIN. The reason and access are permanently audited.</p><Input className="mt-2 h-9 bg-white text-sm" type="password" inputMode="numeric" autoComplete="off" aria-label="Administrator CRM override PIN" value={directorPin} onChange={event => setDirectorPin(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Four-digit administrator PIN" maxLength={4} /><Textarea className="mt-2 min-h-16 bg-white text-sm" value={overrideReason} onChange={event => setOverrideReason(event.target.value)} placeholder="Reason for override (for example: test)" maxLength={500} /><Button size="sm" variant="outline" className="mt-2" onClick={() => void useAdministratorPin()} disabled={verifying || directorPin.length !== 4 || overrideReason.trim().length < 4}><ShieldCheck className="mr-2 h-4 w-4" />Use administrator override</Button></div></>}{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}</CardContent></Card><Records rows={asRows(customer.pins)} title="Support PIN history" fields={[["pin_last4","Last four"],["status","Status"],["expires_at","Expires"],["used_at","Used"]]} /></TabsContent>
            <TabsContent value="notes" className="mt-4 space-y-5"><Card><CardHeader><CardTitle className="text-base">Customer and Admin notes</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Detail label="Customer support notes" value={customer.support_notes} /><Detail label="Admin notes" value={customer.admin_notes} /></CardContent></Card><Records rows={notes} title="Internal notes" fields={[["note","Note"],["author_email","Author"],["pinned","Pinned"],["updated_at","Updated"]]} /></TabsContent>
            <TabsContent value="compliance" className="mt-4 space-y-4">
              <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>This record is restricted to authorised Admin roles. Protected details remain masked until identity verification, and CRM access and exports are written to the audit log.</AlertDescription></Alert>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card><CardHeader><CardTitle className="text-base">Processing and communications</CardTitle></CardHeader><CardContent className="space-y-3"><Detail label="Core account processing" value="Contract and service administration" /><Detail label="Support processing" value="Customer request and legitimate operational interests" /><Detail label="Marketing consent" value={customer.marketing_consent || 'No marketing consent recorded — do not send marketing'} /><Detail label="Communication preference" value={customer.communication_preference} /><p className="text-xs leading-relaxed text-muted-foreground">Service messages and marketing must remain separate. No recorded consent must be treated as no permission for consent-based electronic marketing.</p></CardContent></Card>
                <Card><CardHeader><CardTitle>Individual rights</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">Download a professionally formatted customer SAR report. Internal operational information is excluded unless you explicitly approve it below.</p><fieldset className="rounded-md border border-border p-3"><legend className="px-1 text-xs font-semibold">Optional PDF sections</legend><div className="grid gap-2 sm:grid-cols-2">{([['internalNotes','Include internal notes'],['supportHistory','Include support and enquiries'],['activityAudit','Include activity and audit history'],['notifications','Include customer notifications']] as const).map(([key,label]) => <label key={key} className="flex cursor-pointer items-start gap-2 text-xs text-foreground"><input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-border" checked={pdfSections[key]} onChange={event => setPdfSections(current => ({ ...current, [key]: event.target.checked }))} /><span>{label}{key === 'internalNotes' || key === 'activityAudit' ? <span className="block text-[10px] text-amber-700">Review carefully before disclosure.</span> : null}</span></label>)}</div></fieldset><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void downloadCustomerData()}><Download className="mr-2 h-3.5 w-3.5" />Download SAR PDF</Button><Button size="sm" variant="destructive" onClick={() => void startErasureRequest()}><Trash2 className="mr-2 h-3.5 w-3.5" />Start data deletion</Button><Button asChild size="sm" variant="outline"><Link to="/admin/gdpr">Rights requests</Link></Button><Button asChild size="sm" variant="outline"><Link to="/admin/closure-requests">Deletion queue</Link></Button></div>{message && <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{message}</p>}</CardContent></Card>
              </div>
              <Card><CardHeader><CardTitle className="text-base">Data minimisation and retention review</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Detail label="Profile last updated" value={date(customer.updated_at)} /><Detail label="Open data requests" value={requests.filter(row => !['completed','closed'].includes(asText(row.status, '').toLowerCase())).length} /><Detail label="Stored support cases" value={cases.length} /><Detail label="Stored notifications" value={notifications.length} /></CardContent></Card>
            </TabsContent>
            <TabsContent value="data" className="mt-4 space-y-5"><section><h2 className="mb-3 font-semibold">Data protection requests</h2><Records rows={requests} title="Data protection requests" fields={[["reference","Reference"],["request_type","Request"],["status","Status"],["due_at","Due"]]} /></section><section><h2 className="mb-3 font-semibold">Notifications</h2><Records rows={notifications} title="Notifications" fields={[["title","Notification"],["category","Category"],["status","Status"],["created_at","Created"]]} /></section><section><h2 className="mb-3 font-semibold">Admin audit history</h2><Records rows={audit} title="Audit records" fields={[["action","Action"],["summary","Summary"],["actor_email","Admin"],["created_at","Date"]]} /></section></TabsContent>
          </Tabs>
        </>}
      </div>
    </AdminLayout>
  </>;
}
