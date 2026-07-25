import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BadgeCheck, CalendarDays, CheckCircle2, ClipboardCopy,
  Eye, EyeOff, Fingerprint, Loader2, LockKeyhole, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AgeRecord = {
  verificationId: string;
  email: string;
  dateOfBirthMasked: string;
  ageBand: string;
  eligible: boolean;
  status: string;
  method: string;
  providerName: string;
  providerReference: string;
  policyVersion: string;
  verifiedAt: string;
  expiresAt: string;
  linkedAt: string;
  legacy?: boolean;
};

type Safeguards = {
  ageBand: string;
  registrationEligible: boolean;
  minorSafeguardsEnabled: boolean;
  adultTransitionAt: string;
  profileVisibility: string;
  publicDiscoveryAllowed: boolean;
  profilingAllowed: boolean;
  marketingAllowed: boolean;
  preciseLocationDefault: boolean;
  safeguardingReviewRequired: boolean;
};

type Payload = {
  success?: boolean;
  record?: AgeRecord | null;
  safeguards?: Safeguards;
  permissions?: { canView: boolean; canReveal: boolean };
  notice?: string;
  error?: string;
};

function valueDate(value?: string, withTime = true) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-GB', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'long' });
}

function birthDate(value?: string) {
  if (!value) return 'Not revealed';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function Detail({ label, value, mono = false }: { label: string; value: string | number | boolean | undefined; mono?: boolean }) {
  const shown = value === undefined || value === '' ? 'Not recorded' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return <div className="min-w-0 rounded-lg border border-border bg-background px-3 py-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-1 break-words text-sm font-semibold text-foreground ${mono ? 'font-mono text-xs' : ''}`}>{shown}</p></div>;
}

export default function CustomerAgeVerificationCrmPanel({ email }: { email: string }) {
  const [payload, setPayload] = useState<Payload>({});
  const [loading, setLoading] = useState(true);
  const [revealing, setRevealing] = useState(false);
  const [reason, setReason] = useState('');
  const [revealedDob, setRevealedDob] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/admin/customer-age-verification?email=${encodeURIComponent(email)}`, { credentials: 'include', cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as Payload;
      if (!response.ok || !data.success) throw new Error(data.error || 'The age-verification record could not be loaded.');
      setPayload(data);
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'The age-verification record could not be loaded.');
    } finally { setLoading(false); }
  }, [email]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!revealedDob) return;
    const timer = window.setTimeout(() => setRevealedDob(''), 60_000);
    return () => window.clearTimeout(timer);
  }, [revealedDob]);

  async function revealDob() {
    if (reason.trim().length < 10) {
      setError('Enter a clear operational, safeguarding or legal reason of at least ten characters.');
      return;
    }
    setRevealing(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/customer-age-verification', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reveal_dob', email, reason: reason.trim() }),
      });
      const data = await response.json().catch(() => ({})) as { success?: boolean; dateOfBirth?: string; error?: string };
      if (!response.ok || !data.success || !data.dateOfBirth) throw new Error(data.error || 'The protected date of birth could not be revealed.');
      setRevealedDob(data.dateOfBirth);
      setReason('');
      setMessage('Date of birth revealed for 60 seconds. This access has been permanently audited.');
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'The protected date of birth could not be revealed.');
    } finally { setRevealing(false); }
  }

  async function copyVerificationId() {
    const id = payload.record?.verificationId;
    if (!id) return;
    try { await navigator.clipboard.writeText(id); setMessage('Verification ID copied.'); }
    catch { setMessage('Copy was blocked by the browser. Select the verification ID manually.'); }
  }

  const record = payload.record;
  const safeguards = payload.safeguards;
  const statusTone = useMemo(() => record?.eligible && record?.status === 'Passed' ? 'bg-emerald-100 text-emerald-800' : record ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700', [record]);

  return (
    <Card className="border-blue-200 bg-blue-50/50 shadow-none dark:border-blue-900 dark:bg-blue-950/20">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><BadgeCheck className="h-5 w-5" /></span>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-base">Age Verification</CardTitle><Badge className={statusTone}>{record?.status || 'Not completed'}</Badge>{record?.legacy && <Badge variant="outline">Legacy result</Badge>}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">Restricted customer age record. The DOB is encrypted, masked by default and every reveal is audited.</p></div>
        </div>
        <div className="flex shrink-0 gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</Button><Button asChild type="button" variant="outline" size="sm"><Link to="/admin/age-verification">Controls</Link></Button></div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        {loading ? <div className="flex min-h-28 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div> : error && !record ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert> : !record ? <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>No age-verification record is linked to this customer. They must complete a fresh 16+ check before customer access can continue.</AlertDescription></Alert> : <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0 rounded-lg border border-border bg-background px-3 py-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Verification ID</p><div className="mt-1 flex items-center gap-2"><p className="min-w-0 flex-1 break-all font-mono text-xs font-semibold text-foreground">{record.verificationId}</p><Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => void copyVerificationId()} aria-label="Copy verification ID"><ClipboardCopy className="h-3.5 w-3.5" /></Button></div></div>
            <Detail label="Date of birth" value={revealedDob ? birthDate(revealedDob) : record.dateOfBirthMasked} />
            <Detail label="Age band" value={record.ageBand} />
            <Detail label="Registration eligible" value={record.eligible} />
            <Detail label="Verification method" value={record.method} />
            <Detail label="Provider" value={record.providerName} />
            <Detail label="Provider reference" value={record.providerReference} mono />
            <Detail label="Policy version" value={record.policyVersion} mono />
            <Detail label="Verified" value={valueDate(record.verifiedAt)} />
            <Detail label="Expires / recheck" value={valueDate(record.expiresAt)} />
            <Detail label="Linked to CRM" value={valueDate(record.linkedAt)} />
            <Detail label="Adult safeguards transition" value={valueDate(safeguards?.adultTransitionAt, false)} />
          </div>

          {record.legacy && <Alert className="border-amber-200 bg-amber-50 text-amber-950"><AlertTriangle className="h-4 w-4" /><AlertDescription>This customer verified before encrypted CRM DOB retention was introduced. Their old result remains visible, but a fresh age check is required before a DOB can be attached.</AlertDescription></Alert>}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
            <div className="rounded-xl border border-border bg-background p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-bold">Safeguard status</h3></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3"><span className="rounded-lg bg-muted px-2.5 py-2">Private profile: <strong>{safeguards?.profileVisibility === 'private' ? 'Yes' : 'Review'}</strong></span><span className="rounded-lg bg-muted px-2.5 py-2">Public discovery: <strong>{safeguards?.publicDiscoveryAllowed ? 'On' : 'Off'}</strong></span><span className="rounded-lg bg-muted px-2.5 py-2">Profiling: <strong>{safeguards?.profilingAllowed ? 'On' : 'Off'}</strong></span><span className="rounded-lg bg-muted px-2.5 py-2">Marketing: <strong>{safeguards?.marketingAllowed ? 'On' : 'Off'}</strong></span><span className="rounded-lg bg-muted px-2.5 py-2">Precise location: <strong>{safeguards?.preciseLocationDefault ? 'On' : 'Off'}</strong></span><span className="rounded-lg bg-muted px-2.5 py-2">Safeguarding review: <strong>{safeguards?.safeguardingReviewRequired ? 'Required' : 'Not required'}</strong></span></div></div>

            <div className="rounded-xl border border-border bg-background p-4"><div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-bold">Protected DOB access</h3></div>{revealedDob ? <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-950"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide">Revealed temporarily</p><p className="mt-1 text-xl font-black">{birthDate(revealedDob)}</p></div><Button type="button" variant="outline" size="sm" onClick={() => setRevealedDob('')}><EyeOff className="mr-1.5 h-3.5 w-3.5" />Hide now</Button></div></div> : payload.permissions?.canReveal ? <div className="mt-3 space-y-2"><Label htmlFor="dob-reveal-reason" className="text-xs">Reason for revealing DOB</Label><Input id="dob-reveal-reason" value={reason} onChange={event => setReason(event.target.value)} placeholder="Safeguarding, rectification or legal need" maxLength={500} /><Button type="button" className="w-full" onClick={() => void revealDob()} disabled={revealing || reason.trim().length < 10 || record.legacy}>{revealing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}Reveal DOB</Button><p className="text-[10px] leading-4 text-muted-foreground">Requires your active Admin PIN session. The reason, administrator and verification ID are written to the audit log. The DOB itself is not logged.</p></div> : <p className="mt-3 text-xs leading-5 text-muted-foreground">Your role may view the masked record but cannot reveal the exact DOB.</p>}</div>
          </div>
        </>}
        {message && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{message}</AlertDescription></Alert>}
        {error && record && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        <Alert><Fingerprint className="h-4 w-4" /><AlertDescription>{payload.notice || 'Age-verification information must only be used for eligibility, safeguarding, compliance and customer-rights administration.'}</AlertDescription></Alert>
      </CardContent>
    </Card>
  );
}
