import { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, ExternalLink, Loader2, MapPin, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface PoliceStationSelection {
  forceName: string;
  stationName: string;
  address: string;
  postcode: string;
  telephone: string;
  stationType: string;
  sourceUrl: string;
  checkedAt: string;
}

interface ForceSource {
  id: string;
  name: string;
  nation: 'England' | 'Wales' | 'Scotland' | 'Northern Ireland' | 'UK specialist';
  officialUrl: string;
  coverageNote?: string;
}

interface DirectoryResponse {
  success?: boolean;
  data?: {
    force: { id: string; name: string; officialUrl: string };
    stations: PoliceStationSelection[];
    guidance: string;
    source: string;
    checkedAt: string;
  };
  error?: string;
  fallbackUrl?: string;
  guidance?: string;
}

interface CachedStations {
  checkedAt: string;
  stations: PoliceStationSelection[];
  guidance: string;
  source: string;
}

const CACHE_MAX_AGE = 6 * 60 * 60 * 1000;
const NATIONAL_FORCE_FINDER = 'https://www.police.uk/pu/contact-us/find-force-local-policing-team/';

const FORCE_SOURCES: ForceSource[] = [
  { id: 'avon-and-somerset', name: 'Avon and Somerset Police', nation: 'England', officialUrl: 'https://www.avonandsomerset.police.uk/contact/find-a-police-station/' },
  { id: 'bedfordshire', name: 'Bedfordshire Police', nation: 'England', officialUrl: 'https://www.beds.police.uk/contact/find-a-police-station/' },
  { id: 'cambridgeshire', name: 'Cambridgeshire Constabulary', nation: 'England', officialUrl: 'https://www.cambs.police.uk/contact/find-a-police-station/' },
  { id: 'cheshire', name: 'Cheshire Constabulary', nation: 'England', officialUrl: 'https://www.cheshire.police.uk/contact/find-a-police-station/' },
  { id: 'city-of-london', name: 'City of London Police', nation: 'England', officialUrl: 'https://www.cityoflondon.police.uk/contact/find-a-police-station/' },
  { id: 'cleveland', name: 'Cleveland Police', nation: 'England', officialUrl: 'https://www.cleveland.police.uk/contact/find-a-police-station/' },
  { id: 'cumbria', name: 'Cumbria Constabulary', nation: 'England', officialUrl: 'https://www.cumbria.police.uk/contact/find-a-police-station/' },
  { id: 'derbyshire', name: 'Derbyshire Constabulary', nation: 'England', officialUrl: 'https://www.derbyshire.police.uk/contact/find-a-police-station/' },
  { id: 'devon-and-cornwall', name: 'Devon & Cornwall Police', nation: 'England', officialUrl: 'https://www.devon-cornwall.police.uk/contact/find-a-police-station/' },
  { id: 'dorset', name: 'Dorset Police', nation: 'England', officialUrl: 'https://www.dorset.police.uk/contact/find-a-police-station/' },
  { id: 'durham', name: 'Durham Constabulary', nation: 'England', officialUrl: 'https://www.durham.police.uk/contact/find-a-police-station/' },
  { id: 'dyfed-powys', name: 'Dyfed-Powys Police', nation: 'Wales', officialUrl: 'https://www.dyfed-powys.police.uk/contact/find-a-police-station/' },
  { id: 'essex', name: 'Essex Police', nation: 'England', officialUrl: 'https://www.essex.police.uk/contact/find-a-police-station/' },
  { id: 'gloucestershire', name: 'Gloucestershire Constabulary', nation: 'England', officialUrl: 'https://www.gloucestershire.police.uk/contact/find-a-police-station/' },
  { id: 'greater-manchester', name: 'Greater Manchester Police', nation: 'England', officialUrl: 'https://www.gmp.police.uk/contact/find-a-police-station/' },
  { id: 'gwent', name: 'Gwent Police', nation: 'Wales', officialUrl: 'https://www.gwent.police.uk/contact/find-a-police-station/' },
  { id: 'hampshire', name: 'Hampshire & Isle of Wight Constabulary', nation: 'England', officialUrl: 'https://www.hampshire.police.uk/contact/find-a-police-station/' },
  { id: 'hertfordshire', name: 'Hertfordshire Constabulary', nation: 'England', officialUrl: 'https://www.herts.police.uk/contact/find-a-police-station/' },
  { id: 'humberside', name: 'Humberside Police', nation: 'England', officialUrl: 'https://www.humberside.police.uk/contact/find-a-police-station/' },
  { id: 'kent', name: 'Kent Police', nation: 'England', officialUrl: 'https://www.kent.police.uk/contact/find-a-police-station/' },
  { id: 'lancashire', name: 'Lancashire Constabulary', nation: 'England', officialUrl: 'https://www.lancashire.police.uk/contact/find-a-police-station/' },
  { id: 'leicestershire', name: 'Leicestershire Police', nation: 'England', officialUrl: 'https://www.leics.police.uk/contact/find-a-police-station/' },
  { id: 'lincolnshire', name: 'Lincolnshire Police', nation: 'England', officialUrl: 'https://www.lincs.police.uk/contact/find-a-police-station/' },
  { id: 'merseyside', name: 'Merseyside Police', nation: 'England', officialUrl: 'https://www.merseyside.police.uk/contact/find-a-police-station/' },
  { id: 'metropolitan', name: 'Metropolitan Police Service', nation: 'England', officialUrl: 'https://www.met.police.uk/contact/find-a-police-station/' },
  { id: 'norfolk', name: 'Norfolk Constabulary', nation: 'England', officialUrl: 'https://www.norfolk.police.uk/contact/find-a-police-station/' },
  { id: 'north-wales', name: 'North Wales Police', nation: 'Wales', officialUrl: 'https://www.northwales.police.uk/contact/find-a-police-station/' },
  { id: 'north-yorkshire', name: 'North Yorkshire Police', nation: 'England', officialUrl: 'https://www.northyorkshire.police.uk/contact/find-a-police-station/' },
  { id: 'northamptonshire', name: 'Northamptonshire Police', nation: 'England', officialUrl: 'https://www.northants.police.uk/contact/find-a-police-station/' },
  { id: 'northumbria', name: 'Northumbria Police', nation: 'England', officialUrl: 'https://www.northumbria.police.uk/contact/find-a-police-station/' },
  { id: 'nottinghamshire', name: 'Nottinghamshire Police', nation: 'England', officialUrl: 'https://www.nottinghamshire.police.uk/contact/find-a-police-station/' },
  { id: 'northern-ireland', name: 'Police Service of Northern Ireland', nation: 'Northern Ireland', officialUrl: 'https://www.psni.police.uk/about-us/police-stations' },
  { id: 'south-wales', name: 'South Wales Police', nation: 'Wales', officialUrl: 'https://www.south-wales.police.uk/contact/find-a-police-station/' },
  { id: 'south-yorkshire', name: 'South Yorkshire Police', nation: 'England', officialUrl: 'https://www.southyorks.police.uk/contact/find-a-police-station/' },
  { id: 'staffordshire', name: 'Staffordshire Police', nation: 'England', officialUrl: 'https://www.staffordshire.police.uk/contact/find-a-police-station/' },
  { id: 'suffolk', name: 'Suffolk Constabulary', nation: 'England', officialUrl: 'https://www.suffolk.police.uk/contact/find-a-police-station/' },
  { id: 'surrey', name: 'Surrey Police', nation: 'England', officialUrl: 'https://www.surrey.police.uk/contact/find-a-police-station/' },
  { id: 'sussex', name: 'Sussex Police', nation: 'England', officialUrl: 'https://www.sussex.police.uk/contact/find-a-police-station/' },
  { id: 'thames-valley', name: 'Thames Valley Police', nation: 'England', officialUrl: 'https://www.thamesvalley.police.uk/contact/find-a-police-station/' },
  { id: 'warwickshire', name: 'Warwickshire Police', nation: 'England', officialUrl: 'https://www.warwickshire.police.uk/contact/find-a-police-station/' },
  { id: 'west-mercia', name: 'West Mercia Police', nation: 'England', officialUrl: 'https://www.westmercia.police.uk/contact/find-a-police-station/' },
  { id: 'west-midlands', name: 'West Midlands Police', nation: 'England', officialUrl: 'https://www.westmidlands.police.uk/contact/find-a-police-station/' },
  { id: 'west-yorkshire', name: 'West Yorkshire Police', nation: 'England', officialUrl: 'https://www.westyorkshire.police.uk/contact/find-a-police-station/' },
  { id: 'wiltshire', name: 'Wiltshire Police', nation: 'England', officialUrl: 'https://www.wiltshire.police.uk/contact/find-a-police-station/' },
  { id: 'police-scotland', name: 'Police Scotland', nation: 'Scotland', officialUrl: 'https://www.scotland.police.uk/your-community/police-stations/', coverageNote: 'Police Scotland station records are not included in the Police.uk neighbourhood API. Use the official Police Scotland station finder and verify the address manually.' },
  { id: 'btp', name: 'British Transport Police', nation: 'UK specialist', officialUrl: 'https://www.btp.police.uk/contact/find-a-police-station/', coverageNote: 'British Transport Police is excluded from the Police.uk territorial force API. Use the official BTP finder for railway-policing locations.' },
  { id: 'cnc', name: 'Civil Nuclear Constabulary', nation: 'UK specialist', officialUrl: 'https://www.gov.uk/government/organisations/civil-nuclear-constabulary', coverageNote: 'CNC is a specialist force and does not operate ordinary public police-station reporting counters.' },
  { id: 'mdp', name: 'Ministry of Defence Police', nation: 'UK specialist', officialUrl: 'https://www.gov.uk/government/organisations/ministry-of-defence-police', coverageNote: 'MDP is a specialist force and does not operate an ordinary public police-station directory for general reporting.' },
];

function cacheKey(force: ForceSource): string {
  return `planyx-police-stations-server-v2:${force.id}`;
}

function stationKey(station: PoliceStationSelection): string {
  return [station.forceName, station.stationName, station.address, station.postcode].join('|').toLowerCase();
}

export default function PoliceStationDirectory({ onSelect }: { onSelect: (station: PoliceStationSelection) => void }) {
  const [forceId, setForceId] = useState('metropolitan');
  const [stations, setStations] = useState<PoliceStationSelection[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [guidance, setGuidance] = useState('');
  const [source, setSource] = useState('');
  const [checkedAt, setCheckedAt] = useState('');
  const [manual, setManual] = useState<PoliceStationSelection>({ forceName: '', stationName: '', address: '', postcode: '', telephone: '', stationType: 'Police station', sourceUrl: '', checkedAt: '' });

  const force = FORCE_SOURCES.find(item => item.id === forceId) || FORCE_SOURCES[0];
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return stations;
    return stations.filter(station => [station.stationName, station.address, station.postcode, station.telephone, station.stationType]
      .some(field => String(field || '').toLowerCase().includes(value)));
  }, [query, stations]);

  async function loadStations(forceRefresh = false): Promise<void> {
    setError('');
    setGuidance('');
    setStations([]);
    setQuery('');
    const key = cacheKey(force);
    if (!forceRefresh) {
      try {
        const cached = JSON.parse(localStorage.getItem(key) || 'null') as CachedStations | null;
        if (cached && Date.now() - Date.parse(cached.checkedAt) < CACHE_MAX_AGE) {
          setStations(cached.stations);
          setCheckedAt(cached.checkedAt);
          setGuidance(cached.guidance);
          setSource(cached.source);
          return;
        }
      } catch { /* ignore invalid local cache */ }
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/police-directory?force=${encodeURIComponent(force.id)}${forceRefresh ? '&refresh=1' : ''}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({})) as DirectoryResponse;
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || payload.guidance || 'The official police directory could not be loaded.');
      const data = payload.data;
      const loaded = (data.stations || []).map(station => ({ ...station, sourceUrl: station.sourceUrl || data.force.officialUrl || force.officialUrl }));
      setStations(loaded);
      setCheckedAt(data.checkedAt);
      setGuidance(data.guidance);
      setSource(data.source);
      localStorage.setItem(key, JSON.stringify({ checkedAt: data.checkedAt, stations: loaded, guidance: data.guidance, source: data.source } satisfies CachedStations));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The official station directory could not be loaded.');
      setGuidance('Use the official force finder and enter the verified station manually while the data service is unavailable.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setManual(current => ({ ...current, forceName: force.name, sourceUrl: force.officialUrl, checkedAt: new Date().toISOString() }));
    void loadStations(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceId]);

  function selectManual(): void {
    if (!manual.stationName.trim() || (!manual.address.trim() && !manual.postcode.trim())) {
      setError('Enter the station name and its verified address or postcode before using it in the report.');
      return;
    }
    onSelect({ ...manual, forceName: force.name, sourceUrl: force.officialUrl, checkedAt: new Date().toISOString() });
    setError('');
  }

  return (
    <Card className="min-w-0 overflow-hidden border-blue-200 bg-blue-50/40 dark:border-blue-500/30 dark:bg-blue-500/5">
      <CardContent className="min-w-0 space-y-4 p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><Building2 className="h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" /><h4 className="font-black text-slate-950 dark:text-white">UK police station directory</h4></div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">Station data is now loaded through the protected Planyx server rather than directly from the browser. Always verify public-access arrangements on the force website.</p>
          </div>
          <a href={NATIONAL_FORCE_FINDER} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center text-xs font-bold text-blue-700 underline dark:text-blue-300">National force finder <ExternalLink className="ml-1 h-3.5 w-3.5" /></a>
        </div>

        <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0"><Label htmlFor="police-force-directory">Police force</Label><select id="police-force-directory" value={forceId} onChange={event => setForceId(event.target.value)} className="mt-1 h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm">{(['England','Wales','Scotland','Northern Ireland','UK specialist'] as ForceSource['nation'][]).map(nation => <optgroup key={nation} label={nation}>{FORCE_SOURCES.filter(item => item.nation === nation).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</select></div>
          <div className="flex flex-wrap items-end gap-2"><Button type="button" variant="outline" onClick={() => void loadStations(true)} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh official data</Button><Button asChild type="button" variant="outline"><a href={force.officialUrl} target="_blank" rel="noreferrer">Official finder <ExternalLink className="ml-2 h-4 w-4" /></a></Button></div>
        </div>

        {force.coverageNote && <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"><ShieldAlert className="h-4 w-4" /><AlertDescription>{force.coverageNote}</AlertDescription></Alert>}
        {error && <Alert variant="destructive"><ShieldAlert className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        {guidance && <Alert className="border-blue-200 bg-white text-blue-950 dark:border-blue-500/30 dark:bg-slate-900 dark:text-blue-100"><ShieldAlert className="h-4 w-4" /><AlertDescription>{guidance}{source ? ` Source: ${source}.` : ''}</AlertDescription></Alert>}

        {loading ? <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm dark:border-slate-700 dark:bg-slate-900"><div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /><div><p className="font-bold text-slate-950 dark:text-white">Loading published station locations</p><p className="text-xs text-slate-500 dark:text-slate-400">The Planyx server is checking the official force directory…</p></div></div></div> : stations.length > 0 ? <>
          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><div className="min-w-0"><Label htmlFor="station-directory-search">Search published stations</Label><div className="relative mt-1 min-w-0"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input id="station-directory-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Station, town, address or postcode" className="min-w-0 pl-9" /></div></div><p className="pb-2 text-xs text-slate-500 dark:text-slate-400">{filtered.length.toLocaleString('en-GB')} of {stations.length.toLocaleString('en-GB')} published locations · checked {checkedAt ? new Date(checkedAt).toLocaleString('en-GB') : 'today'}</p></div>
          <div className="max-h-96 min-w-0 space-y-2 overflow-y-auto overflow-x-hidden pr-1">{filtered.slice(0, 200).map(station => <button key={stationKey(station)} type="button" onClick={() => onSelect(station)} className="flex w-full min-w-0 items-start gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-blue-500/10"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" /><span className="min-w-0 flex-1"><span className="block break-words font-bold text-slate-950 dark:text-white">{station.stationName}</span><span className="mt-0.5 block break-words text-xs leading-5 text-slate-600 dark:text-slate-300">{[station.address, station.postcode].filter(Boolean).join(', ') || 'Address not published—verify on the official force finder.'}</span><span className="mt-1 block break-words text-[11px] text-slate-500 dark:text-slate-400">{station.stationType}{station.telephone ? ` · ${station.telephone}` : ''}</span></span><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-slate-300" /></button>)}</div>
          {filtered.length > 200 && <p className="text-xs text-slate-500 dark:text-slate-400">Showing the first 200 matches. Narrow the search to find a specific station.</p>}
        </> : null}

        <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div><p className="font-bold text-slate-950 dark:text-white">Verified manual station entry</p><p className="text-xs text-slate-500 dark:text-slate-400">Use this after checking the official force finder, including for Scotland, specialist forces and locations not published through the API.</p></div>
          <div className="grid min-w-0 gap-3 md:grid-cols-2"><div className="min-w-0"><Label htmlFor="manual-station-name">Station name</Label><Input id="manual-station-name" value={manual.stationName} onChange={event => setManual(current => ({ ...current, stationName: event.target.value }))} /></div><div className="min-w-0"><Label htmlFor="manual-station-type">Location type</Label><Input id="manual-station-type" value={manual.stationType} onChange={event => setManual(current => ({ ...current, stationType: event.target.value }))} placeholder="Police station, front counter or contact point" /></div><div className="min-w-0 md:col-span-2"><Label htmlFor="manual-station-address">Full address</Label><Input id="manual-station-address" value={manual.address} onChange={event => setManual(current => ({ ...current, address: event.target.value }))} /></div><div className="min-w-0"><Label htmlFor="manual-station-postcode">Postcode</Label><Input id="manual-station-postcode" value={manual.postcode} onChange={event => setManual(current => ({ ...current, postcode: event.target.value.toUpperCase() }))} /></div><div className="min-w-0"><Label htmlFor="manual-station-telephone">Published telephone, if applicable</Label><Input id="manual-station-telephone" value={manual.telephone} onChange={event => setManual(current => ({ ...current, telephone: event.target.value }))} /></div></div>
          <Button type="button" onClick={selectManual}><MapPin className="mr-2 h-4 w-4" />Use verified station in report</Button>
        </div>
      </CardContent>
    </Card>
  );
}
