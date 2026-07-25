import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Landmark,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  UserRoundSearch,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface AuthoritySelection {
  id: string;
  name: string;
  category: string;
  channel: string;
  officialUrl: string;
  source: string;
  checkedAt: string;
  postcode?: string;
  forceId?: string;
  neighbourhood?: string;
  tier?: string;
  district?: { name: string; officialUrl: string; tier: string } | null;
  parent?: { name: string; officialUrl: string; tier: string } | null;
}

interface DirectoryData {
  authorities: AuthoritySelection[];
  categories: string[];
  total: number;
  checkedAt: string;
}

interface ResolutionData {
  reportType: string;
  postcode: string;
  recommendations: AuthoritySelection[];
  errors: string[];
  guidance: string;
  checkedAt: string;
}

interface UserDetailResponse {
  success?: boolean;
  user?: {
    email: string;
    name: string;
    address?: { postcode?: string; formatted?: string };
    addressSource?: string;
  };
  error?: string;
}

const REPORT_LABELS: Record<string, string> = {
  'police-emergency': 'Emergency police incident',
  'police-non-emergency': 'Police 101 / online report',
  'child-safeguarding': 'Child safeguarding referral',
  'adult-safeguarding': 'Adult safeguarding referral',
  'data-breach-ico': 'Personal data breach / ICO assessment',
  'local-authority': 'Local authority / public protection referral',
  'other-authority': 'Other authority, government department or regulator',
};

function normalisePostcode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 10);
}

function guidanceFor(reportType: string): { title: string; text: string; tone: 'amber' | 'blue' | 'red' } {
  if (reportType === 'child-safeguarding') {
    return {
      title: "Use the child's home postcode",
      text: "Match the referral to the council responsible for the child or young person's home address where lawfully known. The linked account's billing postcode is only a fallback and may be the wrong area. Call 999 first if the child is in immediate danger.",
      tone: 'red',
    };
  }
  if (reportType === 'adult-safeguarding') {
    return {
      title: "Use the adult's home or ordinary-residence postcode",
      text: "The responsible adult safeguarding authority depends on where the adult lives or is ordinarily resident. Call 999 first for immediate danger.",
      tone: 'amber',
    };
  }
  if (reportType === 'data-breach-ico') {
    return {
      title: 'A single incident can require several reports',
      text: 'Assess the ICO, police, NCSC and Report Fraud routes separately. Selecting one authority here does not remove the need to consider the others.',
      tone: 'blue',
    };
  }
  return {
    title: 'Verify remit before submission',
    text: 'Use the postcode resolver where location determines responsibility, then confirm the authority and current official submission channel before sharing personal information.',
    tone: 'blue',
  };
}

function AuthorityCard({ authority, onSelect, recommended = false }: {
  authority: AuthoritySelection;
  onSelect: (authority: AuthoritySelection) => void;
  recommended?: boolean;
}) {
  return (
    <div className={`min-w-0 overflow-hidden rounded-xl border bg-white p-4 dark:bg-slate-900 ${recommended ? 'border-emerald-300 dark:border-emerald-500/40' : 'border-slate-200 dark:border-slate-700'}`}>
      <div className="flex min-w-0 items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${recommended ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200'}`}>
          {authority.category.toLowerCase().includes('local') || authority.name.toLowerCase().includes('council') ? <Building2 className="h-5 w-5" /> : <Landmark className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h4 className="min-w-0 break-words font-black text-slate-950 dark:text-white">{authority.name}</h4>
            {recommended && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">Recommended</span>}
          </div>
          <p className="mt-1 break-words text-xs font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">{authority.category}</p>
          <p className="mt-2 break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{authority.channel}</p>
          {(authority.postcode || authority.source) && (
            <p className="mt-2 break-words text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              {authority.postcode ? `Postcode used: ${authority.postcode} · ` : ''}Source: {authority.source || 'Official authority website'}
            </p>
          )}
          {authority.district && authority.parent && (
            <p className="mt-1 break-words text-[11px] leading-5 text-amber-700 dark:text-amber-300">
              Two-tier area: {authority.district.name} is the district; {authority.parent.name} is the upper-tier authority selected for social care.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => onSelect(authority)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />Use in report
            </Button>
            <Button asChild type="button" size="sm" variant="outline">
              <a href={authority.officialUrl} target="_blank" rel="noreferrer">Official website <ExternalLink className="ml-2 h-3.5 w-3.5" /></a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthoritySelectionPanel({ reportType, onSelect }: {
  reportType: string;
  onSelect: (authority: AuthoritySelection, context: { postcode: string; postcodeSource: string; guidance: string }) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [directory, setDirectory] = useState<DirectoryData>({ authorities: [], categories: [], total: 0, checkedAt: '' });
  const [postcode, setPostcode] = useState('');
  const [postcodeSource, setPostcodeSource] = useState('Entered and verified by staff');
  const [resolution, setResolution] = useState<ResolutionData | null>(null);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [loadingLinkedAddress, setLoadingLinkedAddress] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const reportGuidance = useMemo(() => guidanceFor(reportType), [reportType]);

  async function loadDirectory(): Promise<void> {
    setLoadingDirectory(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (category) params.set('category', category);
      params.set('report_type', reportType || 'other-authority');
      const response = await fetch(`/api/admin/authority-directory?${params.toString()}`, {
        credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({})) as { success?: boolean; data?: DirectoryData; error?: string };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || 'The authority directory could not be loaded.');
      setDirectory(payload.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The authority directory could not be loaded.');
    } finally {
      setLoadingDirectory(false);
    }
  }

  useEffect(() => {
    setResolution(null);
    setMessage('');
    void loadDirectory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, category]);

  async function useLinkedUserPostcode(): Promise<void> {
    const emailInput = document.getElementById('user-email');
    const email = emailInput instanceof HTMLInputElement ? emailInput.value.trim() : '';
    if (!email) {
      setError('Link or enter a Planyx user in Section 2 before using the account-address fallback.');
      return;
    }
    setLoadingLinkedAddress(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/authority-user-search?email=${encodeURIComponent(email)}`, {
        credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({})) as UserDetailResponse;
      if (!response.ok || !payload.success || !payload.user) throw new Error(payload.error || 'The linked user could not be loaded.');
      const linkedPostcode = normalisePostcode(payload.user.address?.postcode || '');
      if (!linkedPostcode) throw new Error('The linked user does not have a billing or account postcode. Enter and verify the relevant person’s postcode manually.');
      setPostcode(linkedPostcode);
      setPostcodeSource(`${payload.user.addressSource || 'Linked Planyx account address'} for ${payload.user.name}`);
      setMessage(`Loaded ${linkedPostcode} from ${payload.user.addressSource || 'the linked Planyx account'}. Verify that this is the relevant person’s address before resolving an authority.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The linked user postcode could not be loaded.');
    } finally {
      setLoadingLinkedAddress(false);
    }
  }

  async function resolveAuthorities(): Promise<void> {
    const value = normalisePostcode(postcode);
    if (['child-safeguarding', 'adult-safeguarding', 'local-authority', 'police-emergency', 'police-non-emergency'].includes(reportType) && !value) {
      setError('Enter and verify the relevant postcode before resolving the responsible local authority or police force.');
      return;
    }
    setResolving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/authority-directory', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action: 'resolve', report_type: reportType || 'other-authority', postcode: value }),
      });
      const payload = await response.json().catch(() => ({})) as { success?: boolean; data?: ResolutionData; error?: string };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || 'The responsible authorities could not be resolved.');
      setResolution(payload.data);
      setPostcode(value);
      setMessage(`${payload.data.recommendations.length.toLocaleString('en-GB')} relevant authority option${payload.data.recommendations.length === 1 ? '' : 's'} prepared. Review the official remit before selecting one.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The responsible authorities could not be resolved.');
    } finally {
      setResolving(false);
    }
  }

  function choose(authority: AuthoritySelection): void {
    onSelect(authority, {
      postcode: postcode.trim(),
      postcodeSource,
      guidance: resolution?.guidance || reportGuidance.text,
    });
    setMessage(`${authority.name} has been placed into the report. Open the official website and verify the current submission route before reporting.`);
  }

  const requiresLocation = ['child-safeguarding', 'adult-safeguarding', 'local-authority', 'police-emergency', 'police-non-emergency'].includes(reportType);

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden rounded-2xl border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-500/30 dark:bg-blue-500/5 sm:p-5">
      <div className="min-w-0 space-y-5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><Landmark className="h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" /><h3 className="font-black text-slate-950 dark:text-white">Find and assign the correct authority</h3></div>
            <p className="mt-1 max-w-3xl break-words text-xs leading-5 text-slate-600 dark:text-slate-300">Current report: <strong>{REPORT_LABELS[reportType] || reportType || 'Other authority or regulator'}</strong>. Resolve location-based responsibility, or search the operational UK authority catalogue.</p>
          </div>
          <span className="shrink-0 rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">Official-source directory</span>
        </div>

        <Alert className={`${reportGuidance.tone === 'red' ? 'border-red-300 bg-red-50 text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100' : reportGuidance.tone === 'amber' ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100' : 'border-blue-200 bg-white text-blue-950 dark:border-blue-500/30 dark:bg-slate-900 dark:text-blue-100'}`}>
          <AlertTriangle className="h-4 w-4" /><AlertDescription><strong>{reportGuidance.title}:</strong> {reportGuidance.text}</AlertDescription>
        </Alert>

        <Card className="min-w-0 overflow-hidden border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <CardContent className="min-w-0 space-y-4 p-4 sm:p-5">
            <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div className="min-w-0">
                <Label htmlFor="authority-postcode">Relevant person or incident postcode{requiresLocation ? ' (required)' : ' (optional)'}</Label>
                <div className="relative mt-1 min-w-0"><MapPin className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><Input id="authority-postcode" value={postcode} onChange={event => { setPostcode(normalisePostcode(event.target.value)); setPostcodeSource('Entered and verified by staff'); }} placeholder="For example N8 7NS" className="min-w-0 pl-9" /></div>
                <p className="mt-1 break-words text-[11px] text-slate-500 dark:text-slate-400">Source: {postcodeSource}. Staff remain responsible for confirming that the postcode belongs to the relevant person or incident.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void useLinkedUserPostcode()} disabled={loadingLinkedAddress}>
                  {loadingLinkedAddress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserRoundSearch className="mr-2 h-4 w-4" />}Use linked user postcode
                </Button>
                <Button type="button" onClick={() => void resolveAuthorities()} disabled={resolving}>
                  {resolving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Resolve authorities
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        {message && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{message}</AlertDescription></Alert>}

        {resolution && (
          <Card className="min-w-0 overflow-hidden border-emerald-200 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/5">
            <CardContent className="min-w-0 space-y-3 p-4 sm:p-5">
              <div><h4 className="font-black text-slate-950 dark:text-white">Recommended authorities</h4><p className="mt-1 break-words text-xs leading-5 text-slate-600 dark:text-slate-300">{resolution.guidance}</p></div>
              {resolution.errors.length > 0 && <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"><AlertTriangle className="h-4 w-4" /><AlertDescription>{resolution.errors.join(' ')}</AlertDescription></Alert>}
              <div className="grid min-w-0 gap-3 xl:grid-cols-2">{resolution.recommendations.map(authority => <AuthorityCard key={authority.id} authority={authority} recommended onSelect={choose} />)}</div>
            </CardContent>
          </Card>
        )}

        <Card className="min-w-0 overflow-hidden border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <CardContent className="min-w-0 space-y-4 p-4 sm:p-5">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end">
              <div className="min-w-0 flex-1"><Label htmlFor="authority-directory-search">Search all relevant authorities</Label><div className="relative mt-1 min-w-0"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><Input id="authority-directory-search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void loadDirectory(); } }} placeholder="For example HMRC, ICO, education, fraud or transport" className="min-w-0 pl-9" /></div></div>
              <div className="min-w-0 lg:w-72"><Label htmlFor="authority-category">Category</Label><select id="authority-category" value={category} onChange={event => setCategory(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"><option value="">All relevant categories</option>{directory.categories.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
              <Button type="button" variant="outline" onClick={() => void loadDirectory()} disabled={loadingDirectory}>{loadingDirectory ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Search directory</Button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{directory.total.toLocaleString('en-GB')} matching authority route{directory.total === 1 ? '' : 's'}. This is a comprehensive operational directory, not a claim that every UK public body has identical reporting powers.</p>
            <div className="grid min-w-0 gap-3 xl:grid-cols-2">{directory.authorities.map(authority => <AuthorityCard key={authority.id} authority={authority} onSelect={choose} />)}</div>
            {!loadingDirectory && directory.authorities.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No matching authority route was found. Search a wider term or use the HM Government department directory.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
