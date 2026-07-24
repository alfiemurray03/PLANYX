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
  apiId?: string;
  officialUrl: string;
  coverageNote?: string;
}

interface PoliceApiLocation {
  name?: string | null;
  address?: string | null;
  postcode?: string | null;
  telephone?: string | null;
  type?: string | null;
  description?: string | null;
  latitude?: string | null;
  longitude?: string | null;
}

interface PoliceApiNeighbourhood {
  id: string;
  name: string;
}

interface PoliceApiNeighbourhoodDetail {
  locations?: PoliceApiLocation[];
}

interface CachedStations {
  checkedAt: string;
  stations: PoliceStationSelection[];
}

const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const API_BASE = 'https://data.police.uk/api';
const NATIONAL_FORCE_FINDER = 'https://www.police.uk/pu/contact-us/find-force-local-policing-team/';

const FORCE_SOURCES: ForceSource[] = [
  { id: 'avon-and-somerset', name: 'Avon and Somerset Police', nation: 'England', apiId: 'avon-and-somerset', officialUrl: 'https://www.avonandsomerset.police.uk/contact/find-a-police-station/' },
  { id: 'bedfordshire', name: 'Bedfordshire Police', nation: 'England', apiId: 'bedfordshire', officialUrl: 'https://www.beds.police.uk/contact/find-a-police-station/' },
  { id: 'cambridgeshire', name: 'Cambridgeshire Constabulary', nation: 'England', apiId: 'cambridgeshire', officialUrl: 'https://www.cambs.police.uk/contact/find-a-police-station/' },
  { id: 'cheshire', name: 'Cheshire Constabulary', nation: 'England', apiId: 'cheshire', officialUrl: 'https://www.cheshire.police.uk/contact/find-a-police-station/' },
  { id: 'city-of-london', name: 'City of London Police', nation: 'England', apiId: 'city-of-london', officialUrl: 'https://www.cityoflondon.police.uk/contact/find-a-police-station/' },
  { id: 'cleveland', name: 'Cleveland Police', nation: 'England', apiId: 'cleveland', officialUrl: 'https://www.cleveland.police.uk/contact/find-a-police-station/' },
  { id: 'cumbria', name: 'Cumbria Constabulary', nation: 'England', apiId: 'cumbria', officialUrl: 'https://www.cumbria.police.uk/contact/find-a-police-station/' },
  { id: 'derbyshire', name: 'Derbyshire Constabulary', nation: 'England', apiId: 'derbyshire', officialUrl: 'https://www.derbyshire.police.uk/contact/find-a-police-station/' },
  { id: 'devon-and-cornwall', name: 'Devon & Cornwall Police', nation: 'England', apiId: 'devon-and-cornwall', officialUrl: 'https://www.devon-cornwall.police.uk/contact/find-a-police-station/' },
  { id: 'dorset', name: 'Dorset Police', nation: 'England', apiId: 'dorset', officialUrl: 'https://www.dorset.police.uk/contact/find-a-police-station/' },
  { id: 'durham', name: 'Durham Constabulary', nation: 'England', apiId: 'durham', officialUrl: 'https://www.durham.police.uk/contact/find-a-police-station/' },
  { id: 'dyfed-powys', name: 'Dyfed-Powys Police', nation: 'Wales', apiId: 'dyfed-powys', officialUrl: 'https://www.dyfed-powys.police.uk/contact/find-a-police-station/' },
  { id: 'essex', name: 'Essex Police', nation: 'England', apiId: 'essex', officialUrl: 'https://www.essex.police.uk/contact/find-a-police-station/' },
  { id: 'gloucestershire', name: 'Gloucestershire Constabulary', nation: 'England', apiId: 'gloucestershire', officialUrl: 'https://www.gloucestershire.police.uk/contact/find-a-police-station/' },
  { id: 'greater-manchester', name: 'Greater Manchester Police', nation: 'England', apiId: 'greater-manchester', officialUrl: 'https://www.gmp.police.uk/contact/find-a-police-station/' },
  { id: 'gwent', name: 'Gwent Police', nation: 'Wales', apiId: 'gwent', officialUrl: 'https://www.gwent.police.uk/contact/find-a-police-station/' },
  { id: 'hampshire', name: 'Hampshire & Isle of Wight Constabulary', nation: 'England', apiId: 'hampshire', officialUrl: 'https://www.hampshire.police.uk/contact/find-a-police-station/' },
  { id: 'hertfordshire', name: 'Hertfordshire Constabulary', nation: 'England', apiId: 'hertfordshire', officialUrl: 'https://www.herts.police.uk/contact/find-a-police-station/' },
  { id: 'humberside', name: 'Humberside Police', nation: 'England', apiId: 'humberside', officialUrl: 'https://www.humberside.police.uk/contact/find-a-police-station/' },
  { id: 'kent', name: 'Kent Police', nation: 'England', apiId: 'kent', officialUrl: 'https://www.kent.police.uk/contact/find-a-police-station/' },
  { id: 'lancashire', name: 'Lancashire Constabulary', nation: 'England', apiId: 'lancashire', officialUrl: 'https://www.lancashire.police.uk/contact/find-a-police-station/' },
  { id: 'leicestershire', name: 'Leicestershire Police', nation: 'England', apiId: 'leicestershire', officialUrl: 'https://www.leics.police.uk/contact/find-a-police-station/' },
  { id: 'lincolnshire', name: 'Lincolnshire Police', nation: 'England', apiId: 'lincolnshire', officialUrl: 'https://www.lincs.police.uk/contact/find-a-police-station/' },
  { id: 'merseyside', name: 'Merseyside Police', nation: 'England', apiId: 'merseyside', officialUrl: 'https://www.merseyside.police.uk/contact/find-a-police-station/' },
  { id: 'metropolitan', name: 'Metropolitan Police Service', nation: 'England', apiId: 'metropolitan', officialUrl: 'https://www.met.police.uk/contact/find-a-police-station/' },
  { id: 'norfolk', name: 'Norfolk Constabulary', nation: 'England', apiId: 'norfolk', officialUrl: 'https://www.norfolk.police.uk/contact/find-a-police-station/' },
  { id: 'north-wales', name: 'North Wales Police', nation: 'Wales', apiId: 'north-wales', officialUrl: 'https://www.northwales.police.uk/contact/find-a-police-station/' },
  { id: 'north-yorkshire', name: 'North Yorkshire Police', nation: 'England', apiId: 'north-yorkshire', officialUrl: 'https://www.northyorkshire.police.uk/contact/find-a-police-station/' },
  { id: 'northamptonshire', name: 'Northamptonshire Police', nation: 'England', apiId: 'northamptonshire', officialUrl: 'https://www.northants.police.uk/contact/find-a-police-station/' },
  { id: 'northumbria', name: 'Northumbria Police', nation: 'England', apiId: 'northumbria', officialUrl: 'https://www.northumbria.police.uk/contact/find-a-police-station/' },
  { id: 'nottinghamshire', name: 'Nottinghamshire Police', nation: 'England', apiId: 'nottinghamshire', officialUrl: 'https://www.nottinghamshire.police.uk/contact/find-a-police-station/' },
  { id: 'northern-ireland', name: 'Police Service of Northern Ireland', nation: 'Northern Ireland', apiId: 'northern-ireland', officialUrl: 'https://www.psni.police.uk/about-us/police-stations' },
  { id: 'south-wales', name: 'South Wales Police', nation: 'Wales', apiId: 'south-wales', officialUrl: 'https://www.south-wales.police.uk/contact/find-a-police-station/' },
  { id: 'south-yorkshire', name: 'South Yorkshire Police', nation: 'England', apiId: 'south-yorkshire', officialUrl: 'https://www.southyorks.police.uk/contact/find-a-police-station/' },
  { id: 'staffordshire', name: 'Staffordshire Police', nation: 'England', apiId: 'staffordshire', officialUrl: 'https://www.staffordshire.police.uk/contact/find-a-police-station/' },
  { id: 'suffolk', name: 'Suffolk Constabulary', nation: 'England', apiId: 'suffolk', officialUrl: 'https://www.suffolk.police.uk/contact/find-a-police-station/' },
  { id: 'surrey', name: 'Surrey Police', nation: 'England', apiId: 'surrey', officialUrl: 'https://www.surrey.police.uk/contact/find-a-police-station/' },
  { id: 'sussex', name: 'Sussex Police', nation: 'England', apiId: 'sussex', officialUrl: 'https://www.sussex.police.uk/contact/find-a-police-station/' },
  { id: 'thames-valley', name: 'Thames Valley Police', nation: 'England', apiId: 'thames-valley', officialUrl: 'https://www.thamesvalley.police.uk/contact/find-a-police-station/' },
  { id: 'warwickshire', name: 'Warwickshire Police', nation: 'England', apiId: 'warwickshire', officialUrl: 'https://www.warwickshire.police.uk/contact/find-a-police-station/' },
  { id: 'west-mercia', name: 'West Mercia Police', nation: 'England', apiId: 'west-mercia', officialUrl: 'https://www.westmercia.police.uk/contact/find-a-police-station/' },
  { id: 'west-midlands', name: 'West Midlands Police', nation: 'England', apiId: 'west-midlands', officialUrl: 'https://www.westmidlands.police.uk/contact/find-a-police-station/' },
  { id: 'west-yorkshire', name: 'West Yorkshire Police', nation: 'England', apiId: 'west-yorkshire', officialUrl: 'https://www.westyorkshire.police.uk/contact/find-a-police-station/' },
  { id: 'wiltshire', name: 'Wiltshire Police', nation: 'England', apiId: 'wiltshire', officialUrl: 'https://www.wiltshire.police.uk/contact/find-a-police-station/' },
  { id: 'police-scotland', name: 'Police Scotland', nation: 'Scotland', officialUrl: 'https://www.scotland.police.uk/your-community/police-stations/', coverageNote: 'Police Scotland station records are not included in the Police.uk neighbourhood API. Use the official Police Scotland station finder and record the verified address below.' },
  { id: 'btp', name: 'British Transport Police', nation: 'UK specialist', officialUrl: 'https://www.btp.police.uk/contact/find-a-police-station/', coverageNote: 'British Transport Police is excluded from the Police.uk force-list API. Use the official BTP finder for railway-policing locations.' },
  { id: 'cnc', name: 'Civil Nuclear Constabulary', nation: 'UK specialist', officialUrl: 'https://www.gov.uk/government/organisations/civil-nuclear-constabulary', coverageNote: 'CNC is a specialist force and does not operate ordinary public police-station reporting counters.' },
  { id: 'mdp', name: 'Ministry of Defence Police', nation: 'UK specialist', officialUrl: 'https://www.gov.uk/government/organisations/ministry-of-defence-police', coverageNote: 'MDP is a specialist force and does not operate an ordinary public police-station directory for general reporting.' },
];

function cacheKey(force: ForceSource): string {
  return `planyx-police-stations-v1:${force.id}`;
}

function normalise(value?: string | null): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isStationLocation(location: PoliceApiLocation): boolean {
  const type = normalise(location.type).toLowerCase();
  const name = normalise(location.name).toLowerCase();
  return type.includes('station') || type.includes('police') || name.includes('police station');
}

function stationKey(station: PoliceStationSelection): string {
  return [station.forceName, station.stationName, station.address, station.postcode].join('|').toLowerCase();
}

async function fetchForceStations(force: ForceSource, onProgress: (completed: number, total: number) => void): Promise<PoliceStationSelection[]> {
  if (!force.apiId) return [];
  const neighbourhoodResponse = await fetch(`${API_BASE}/${encodeURIComponent(force.apiId)}/neighbourhoods`, { cache: 'no-store' });
  if (!neighbourhoodResponse.ok) throw new Error(`Police.uk did not return the ${force.name} neighbourhood directory.`);
  const neighbourhoods = await neighbourhoodResponse.json() as PoliceApiNeighbourhood[];
  const checkedAt = new Date().toISOString();
  const results = new Map<string, PoliceStationSelection>();
  const batchSize = 10;

  for (let start = 0; start < neighbourhoods.length; start += batchSize) {
    const batch = neighbourhoods.slice(start, start + batchSize);
    const details = await Promise.all(batch.map(async neighbourhood => {
      const response = await fetch(`${API_BASE}/${encodeURIComponent(force.apiId!)}/${encodeURIComponent(neighbourhood.id)}`, { cache: 'no-store' });
      if (!response.ok) return null;
      return response.json() as Promise<PoliceApiNeighbourhoodDetail>;
    }));

    details.forEach(detail => {
      (detail?.locations || []).filter(isStationLocation).forEach(location => {
        const station: PoliceStationSelection = {
          forceName: force.name,
          stationName: normalise(location.name) || 'Police station or contact point',
          address: normalise(location.address),
          postcode: normalise(location.postcode).toUpperCase(),
          telephone: normalise(location.telephone),
          stationType: normalise(location.type) || 'Police station',
          sourceUrl: force.officialUrl,
          checkedAt,
        };
        if (station.address || station.postcode || station.stationName) results.set(stationKey(station), station);
      });
    });

    onProgress(Math.min(start + batch.length, neighbourhoods.length), neighbourhoods.length);
    if (start + batchSize < neighbourhoods.length) await new Promise(resolve => window.setTimeout(resolve, 800));
  }

  return [...results.values()].sort((a, b) => a.stationName.localeCompare(b.stationName, 'en-GB'));
}

export default function PoliceStationDirectory({ onSelect }: { onSelect: (station: PoliceStationSelection) => void }) {
  const [forceId, setForceId] = useState('metropolitan');
  const [stations, setStations] = useState<PoliceStationSelection[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState('');
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
    setStations([]);
    setQuery('');
    setProgress({ completed: 0, total: 0 });
    if (!force.apiId) {
      setCheckedAt('');
      return;
    }

    const key = cacheKey(force);
    if (!forceRefresh) {
      try {
        const cached = JSON.parse(localStorage.getItem(key) || 'null') as CachedStations | null;
        if (cached && Date.now() - Date.parse(cached.checkedAt) < CACHE_MAX_AGE) {
          setStations(cached.stations);
          setCheckedAt(cached.checkedAt);
          return;
        }
      } catch { /* ignore an invalid local cache */ }
    }

    setLoading(true);
    try {
      const loaded = await fetchForceStations(force, (completed, total) => setProgress({ completed, total }));
      const nextCheckedAt = new Date().toISOString();
      setStations(loaded.map(station => ({ ...station, checkedAt: nextCheckedAt })));
      setCheckedAt(nextCheckedAt);
      localStorage.setItem(key, JSON.stringify({ checkedAt: nextCheckedAt, stations: loaded.map(station => ({ ...station, checkedAt: nextCheckedAt })) } satisfies CachedStations));
      if (!loaded.length) setError('Police.uk did not publish station locations for this force through its neighbourhood data. Use the force’s official station finder and verify the address manually.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The official station directory could not be loaded.');
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
    <Card className="border-blue-200 bg-blue-50/40 dark:border-blue-500/30 dark:bg-blue-500/5">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-blue-700 dark:text-blue-300" /><h4 className="font-black text-slate-950 dark:text-white">UK police station directory</h4></div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">Search station locations published by police forces through Police.uk. Always verify the selected address and public-access arrangements on the force’s official station finder before sending or attending.</p>
          </div>
          <a href={NATIONAL_FORCE_FINDER} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center text-xs font-bold text-blue-700 underline dark:text-blue-300">National force finder <ExternalLink className="ml-1 h-3.5 w-3.5" /></a>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div><Label htmlFor="police-force-directory">Police force</Label><select id="police-force-directory" value={forceId} onChange={event => setForceId(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm">{(['England','Wales','Scotland','Northern Ireland','UK specialist'] as ForceSource['nation'][]).map(nation => <optgroup key={nation} label={nation}>{FORCE_SOURCES.filter(item => item.nation === nation).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</select></div>
          <div className="flex items-end gap-2"><Button type="button" variant="outline" onClick={() => void loadStations(true)} disabled={loading || !force.apiId}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh official data</Button><Button asChild type="button" variant="outline"><a href={force.officialUrl} target="_blank" rel="noreferrer">Official finder <ExternalLink className="ml-2 h-4 w-4" /></a></Button></div>
        </div>

        {force.coverageNote && <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"><ShieldAlert className="h-4 w-4" /><AlertDescription>{force.coverageNote}</AlertDescription></Alert>}
        {error && <Alert variant="destructive"><ShieldAlert className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

        {loading ? <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm dark:border-slate-700 dark:bg-slate-900"><div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /><div><p className="font-bold text-slate-950 dark:text-white">Loading published station locations</p><p className="text-xs text-slate-500 dark:text-slate-400">{progress.total ? `${progress.completed.toLocaleString('en-GB')} of ${progress.total.toLocaleString('en-GB')} neighbourhood records checked` : 'Loading the official force directory…'}</p></div></div></div> : force.apiId && stations.length > 0 ? <>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><div><Label htmlFor="station-directory-search">Search published stations</Label><div className="relative mt-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input id="station-directory-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Station, town, address or postcode" className="pl-9" /></div></div><p className="pb-2 text-xs text-slate-500 dark:text-slate-400">{filtered.length.toLocaleString('en-GB')} of {stations.length.toLocaleString('en-GB')} published locations · checked {checkedAt ? new Date(checkedAt).toLocaleString('en-GB') : 'today'}</p></div>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">{filtered.slice(0, 200).map(station => <button key={stationKey(station)} type="button" onClick={() => onSelect(station)} className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-blue-500/10"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" /><span className="min-w-0 flex-1"><span className="block font-bold text-slate-950 dark:text-white">{station.stationName}</span><span className="mt-0.5 block text-xs leading-5 text-slate-600 dark:text-slate-300">{[station.address, station.postcode].filter(Boolean).join(', ') || 'Address not published in the API—verify on the official force finder.'}</span><span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">{station.stationType}{station.telephone ? ` · ${station.telephone}` : ''}</span></span><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-slate-300" /></button>)}</div>
          {filtered.length > 200 && <p className="text-xs text-slate-500 dark:text-slate-400">Showing the first 200 matches. Narrow the search to find a specific station.</p>}
        </> : null}

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div><p className="font-bold text-slate-950 dark:text-white">Verified manual station entry</p><p className="text-xs text-slate-500 dark:text-slate-400">Use this after checking the force’s official station finder, including for Scotland, BTP and locations not published through the API.</p></div>
          <div className="grid gap-3 md:grid-cols-2"><div><Label htmlFor="manual-station-name">Station name</Label><Input id="manual-station-name" value={manual.stationName} onChange={event => setManual(current => ({ ...current, stationName: event.target.value }))} /></div><div><Label htmlFor="manual-station-type">Location type</Label><Input id="manual-station-type" value={manual.stationType} onChange={event => setManual(current => ({ ...current, stationType: event.target.value }))} placeholder="Police station, front counter or contact point" /></div><div className="md:col-span-2"><Label htmlFor="manual-station-address">Full address</Label><Input id="manual-station-address" value={manual.address} onChange={event => setManual(current => ({ ...current, address: event.target.value }))} /></div><div><Label htmlFor="manual-station-postcode">Postcode</Label><Input id="manual-station-postcode" value={manual.postcode} onChange={event => setManual(current => ({ ...current, postcode: event.target.value.toUpperCase() }))} /></div><div><Label htmlFor="manual-station-telephone">Published telephone, if applicable</Label><Input id="manual-station-telephone" value={manual.telephone} onChange={event => setManual(current => ({ ...current, telephone: event.target.value }))} /></div></div>
          <Button type="button" onClick={selectManual}><MapPin className="mr-2 h-4 w-4" />Use verified station in report</Button>
        </div>
      </CardContent>
    </Card>
  );
}
