import { useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/lib/admin-context';
import { hasWritePermission } from '@/lib/admin-types';
import { destinations } from '@/lib/discovery-data';
import {
  ArrowDown, ArrowUp, CheckCircle2, ExternalLink, Eye, EyeOff, Image as ImageIcon,
  Images, Loader2, Plus, RefreshCw, Save, Search, Star, Trash2, X,
} from 'lucide-react';

type Provider = 'headout' | 'getyourguide';

type GalleryDestination = {
  id: string;
  slug: string;
  name: string;
  country: string;
  code: string;
  badge: string;
  imageUrl: string;
  enabled: boolean;
  featured: boolean;
  providerLocationId: string;
  searchQuery: string;
  sortOrder: number;
};

type ProviderGalleryConfig = {
  enabled: boolean;
  eyebrow: string;
  pageTitle: string;
  intro: string;
  galleryLabel: string;
  galleryHeading: string;
  searchPlaceholder: string;
  allDestinationsLabel: string;
  cardButtonLabel: string;
  liveGalleryLabel: string;
  currency: string;
  language: string;
  locale: string;
  resultCount: number;
  maxCount: number;
  showMore: boolean;
  partnerId: string;
  affiliateCode: string;
  affiliateWebsite: string;
  campaign: string;
  destinations: GalleryDestination[];
};

type GalleryConfig = {
  version: number;
  headout: ProviderGalleryConfig;
  getyourguide: ProviderGalleryConfig;
};

function seedProvider(provider: Provider): ProviderGalleryConfig {
  const isHeadout = provider === 'headout';
  return {
    enabled: true,
    eyebrow: isHeadout ? 'Primary affiliate partner' : 'Secondary affiliate partner',
    pageTitle: `Explore activities with ${isHeadout ? 'Headout' : 'GetYourGuide'}`,
    intro: 'Choose a destination and browse live tours, attractions, tickets and experiences without leaving Sousa Murray Planeia.',
    galleryLabel: 'Destination gallery',
    galleryHeading: 'Where would you like to explore?',
    searchPlaceholder: 'Search city or country',
    allDestinationsLabel: 'All destinations',
    cardButtonLabel: 'Open live gallery',
    liveGalleryLabel: `Live ${isHeadout ? 'Headout' : 'GetYourGuide'} gallery for`,
    currency: 'GBP',
    language: 'en',
    locale: 'en-GB',
    resultCount: 5,
    maxCount: 100,
    showMore: true,
    partnerId: isHeadout ? '' : 'ZSEVDSG',
    affiliateCode: isHeadout ? 'JL2D9u' : '',
    affiliateWebsite: isHeadout ? 'https://tours.jagroupservices.co.uk' : 'https://sousamurrayplaneia.jagroupservices.co.uk',
    campaign: 'planyx-discovery',
    destinations: destinations
      .filter((destination) => isHeadout ? Boolean(destination.headout) : true)
      .map((destination, index) => ({
        id: destination.slug,
        slug: destination.slug,
        name: destination.name,
        country: destination.country,
        code: destination.code,
        badge: '',
        imageUrl: '',
        enabled: true,
        featured: index < 8,
        providerLocationId: isHeadout ? (destination.headout || '') : (destination.gyg || ''),
        searchQuery: `${destination.name}, ${destination.country}`,
        sortOrder: index,
      })),
  };
}

const EMPTY_CONFIG: GalleryConfig = {
  version: 1,
  headout: seedProvider('headout'),
  getyourguide: seedProvider('getyourguide'),
};

function normaliseOrder(items: GalleryDestination[]) {
  return items.map((item, index) => ({ ...item, sortOrder: index }));
}

function Field({ label, value, onChange, wide = false, textarea = false, hint = '', type = 'text', disabled = false }: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  wide?: boolean;
  textarea?: boolean;
  hint?: string;
  type?: string;
  disabled?: boolean;
}) {
  const classes = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800';
  return <label className={wide ? 'md:col-span-2' : ''}>
    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</span>
    {hint && <span className="ml-2 text-[10px] text-slate-400">{hint}</span>}
    {textarea
      ? <textarea rows={3} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${classes} py-2`} />
      : <input type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${classes} h-11`} />}
  </label>;
}

export default function PartnerGalleryManager() {
  const { admin } = useAdmin();
  const canWrite = Boolean(admin && hasWritePermission(admin, 'affiliate'));
  const [config, setConfig] = useState<GalleryConfig>(EMPTY_CONFIG);
  const [provider, setProvider] = useState<Provider>('headout');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/partner-galleries', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) as { success?: boolean; config?: GalleryConfig; error?: string; correlationId?: string } }))
      .then(({ response, payload }) => {
        if (cancelled) return;
        if (!response.ok || !payload.success || !payload.config) throw new Error(`${payload.error || 'Partner galleries could not be loaded.'}${payload.correlationId ? ` Reference: ${payload.correlationId}` : ''}`);
        setConfig({
          version: 1,
          headout: { ...EMPTY_CONFIG.headout, ...payload.config.headout, destinations: payload.config.headout.destinations?.length ? payload.config.headout.destinations : EMPTY_CONFIG.headout.destinations },
          getyourguide: { ...EMPTY_CONFIG.getyourguide, ...payload.config.getyourguide, destinations: payload.config.getyourguide.destinations?.length ? payload.config.getyourguide.destinations : EMPTY_CONFIG.getyourguide.destinations },
        });
      })
      .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : 'Partner galleries could not be loaded.'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const current = config[provider];
  const sorted = useMemo(() => [...current.destinations].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)), [current.destinations]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? sorted.filter((item) => `${item.name} ${item.country} ${item.code} ${item.providerLocationId}`.toLowerCase().includes(term)) : sorted;
  }, [search, sorted]);
  const editing = current.destinations.find((item) => item.id === editingId) || null;

  function updateProvider(patch: Partial<ProviderGalleryConfig>) {
    setConfig((value) => ({ ...value, [provider]: { ...value[provider], ...patch } }));
  }

  function updateDestinations(items: GalleryDestination[]) {
    updateProvider({ destinations: normaliseOrder(items) });
  }

  function updateItem(id: string, patch: Partial<GalleryDestination>) {
    updateDestinations(current.destinations.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function addDestination() {
    const id = `destination-${Date.now()}`;
    const next: GalleryDestination = {
      id,
      slug: id,
      name: 'New destination',
      country: 'Worldwide',
      code: 'GL',
      badge: '',
      imageUrl: '',
      enabled: true,
      featured: false,
      providerLocationId: '',
      searchQuery: '',
      sortOrder: current.destinations.length,
    };
    updateDestinations([...current.destinations, next]);
    setEditingId(id);
  }

  function move(id: string, direction: -1 | 1) {
    const items = [...sorted];
    const index = items.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    updateDestinations(items);
  }

  async function save() {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/admin/partner-galleries', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const payload = await response.json().catch(() => ({})) as { success?: boolean; config?: GalleryConfig; error?: string; correlationId?: string };
      if (!response.ok || !payload.success || !payload.config) throw new Error(`${payload.error || 'Partner galleries could not be saved.'}${payload.correlationId ? ` Reference: ${payload.correlationId}` : ''}`);
      setConfig(payload.config);
      setMessage('Partner galleries saved and published successfully.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Partner galleries could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  function resetProvider() {
    if (!window.confirm(`Reset the ${provider === 'headout' ? 'Headout' : 'GetYourGuide'} gallery to the platform destination directory?`)) return;
    setConfig((value) => ({ ...value, [provider]: seedProvider(provider) }));
    setEditingId(null);
  }

  return <>
    <Helmet><title>Partner Gallery Manager — Sousa Murray Planeia Admin</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <AdminLayout title="Partner Gallery Manager">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 pb-12">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="h-1 bg-gradient-to-r from-blue-600 via-cyan-400 to-violet-600" />
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2"><Images className="h-5 w-5 text-blue-600" /><span className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300">Affiliate content</span></div>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Headout and GetYourGuide galleries</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">Control Sousa Murray Planeia destination cards, images, order, visibility and widget identifiers. Live products, prices and availability remain controlled by the provider.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={provider === 'headout' ? '/headout' : '/getyourguide'} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><ExternalLink className="h-4 w-4" /> Open live page</a>
              <button type="button" onClick={save} disabled={!canWrite || saving || loading} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save and publish</button>
            </div>
          </div>
        </section>

        {message && <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"><CheckCircle2 className="h-5 w-5" />{message}</div>}
        {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</div>}

        <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
          {(['headout', 'getyourguide'] as Provider[]).map((item) => <button key={item} type="button" onClick={() => { setProvider(item); setEditingId(null); setSearch(''); }} className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${provider === item ? 'bg-slate-950 text-white dark:bg-blue-600' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{item === 'headout' ? 'Headout' : 'GetYourGuide'}</button>)}
        </div>

        {loading ? <div className="grid min-h-72 place-items-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center gap-3 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading gallery configuration…</div></div> : <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-lg font-bold text-slate-950 dark:text-white">Page and widget settings</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">These fields update the actual public provider page.</p></div>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700"><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Page enabled</span><input type="checkbox" checked={current.enabled} disabled={!canWrite} onChange={(event) => updateProvider({ enabled: event.target.checked })} className="h-5 w-5 accent-blue-600" /></label>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Partner label" value={current.eyebrow} onChange={(value) => updateProvider({ eyebrow: value })} disabled={!canWrite} />
              <Field label="Page heading" value={current.pageTitle} onChange={(value) => updateProvider({ pageTitle: value })} disabled={!canWrite} />
              <Field label="Page introduction" value={current.intro} onChange={(value) => updateProvider({ intro: value })} textarea wide disabled={!canWrite} />
              <Field label="Gallery label" value={current.galleryLabel} onChange={(value) => updateProvider({ galleryLabel: value })} disabled={!canWrite} />
              <Field label="Gallery heading" value={current.galleryHeading} onChange={(value) => updateProvider({ galleryHeading: value })} disabled={!canWrite} />
              <Field label="Search placeholder" value={current.searchPlaceholder} onChange={(value) => updateProvider({ searchPlaceholder: value })} disabled={!canWrite} />
              <Field label="Card button wording" value={current.cardButtonLabel} onChange={(value) => updateProvider({ cardButtonLabel: value })} disabled={!canWrite} />
              <Field label="Back button wording" value={current.allDestinationsLabel} onChange={(value) => updateProvider({ allDestinationsLabel: value })} disabled={!canWrite} />
              <Field label="Live gallery wording" value={current.liveGalleryLabel} onChange={(value) => updateProvider({ liveGalleryLabel: value })} disabled={!canWrite} />
              {provider === 'headout' ? <>
                <Field label="Headout affiliate code" value={current.affiliateCode} onChange={(value) => updateProvider({ affiliateCode: value })} hint="Public affiliate identifier" disabled={!canWrite} />
                <Field label="Affiliate website" value={current.affiliateWebsite} onChange={(value) => updateProvider({ affiliateWebsite: value })} disabled={!canWrite} />
                <Field label="Maximum activities" value={current.maxCount} type="number" onChange={(value) => updateProvider({ maxCount: Number(value) || 1 })} disabled={!canWrite} />
                <label className="flex items-end"><span className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700"><span>Show more button</span><input type="checkbox" checked={current.showMore} disabled={!canWrite} onChange={(event) => updateProvider({ showMore: event.target.checked })} className="h-5 w-5 accent-blue-600" /></span></label>
              </> : <>
                <Field label="GetYourGuide partner ID" value={current.partnerId} onChange={(value) => updateProvider({ partnerId: value })} hint="Public partner identifier" disabled={!canWrite} />
                <Field label="Results per widget" value={current.resultCount} type="number" onChange={(value) => updateProvider({ resultCount: Number(value) || 1 })} disabled={!canWrite} />
                <Field label="Locale" value={current.locale} onChange={(value) => updateProvider({ locale: value })} disabled={!canWrite} />
                <Field label="Campaign label" value={current.campaign} onChange={(value) => updateProvider({ campaign: value })} disabled={!canWrite} />
              </>}
              <Field label="Currency" value={current.currency} onChange={(value) => updateProvider({ currency: value.toUpperCase() })} disabled={!canWrite} />
              <Field label="Language" value={current.language} onChange={(value) => updateProvider({ language: value })} disabled={!canWrite} />
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between dark:border-slate-800">
              <div><h2 className="text-lg font-bold text-slate-950 dark:text-white">Destination gallery</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{current.destinations.filter((item) => item.enabled).length} visible of {current.destinations.length} destinations</p></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={resetProvider} disabled={!canWrite} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" /> Reset directory</button>
                <button type="button" onClick={addDestination} disabled={!canWrite} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Plus className="h-4 w-4" /> Add destination</button>
              </div>
            </div>
            <div className="border-b border-slate-200 p-4 dark:border-slate-800"><label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search destinations or provider codes" className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label></div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((item) => <div key={item.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <div className="relative h-16 w-full overflow-hidden rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 md:w-24">{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-white/80" />}</div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950 dark:text-white">{item.name}</p>{item.featured && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"><Star className="h-3 w-3" /> Featured</span>}{!item.enabled && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800">Hidden</span>}</div><p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{item.country} · {item.providerLocationId || item.searchQuery || 'Provider mapping required'}</p></div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => move(item.id, -1)} disabled={!canWrite} title="Move up" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => move(item.id, 1)} disabled={!canWrite} title="Move down" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => updateItem(item.id, { featured: !item.featured })} disabled={!canWrite} title="Toggle featured" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-amber-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"><Star className={`h-4 w-4 ${item.featured ? 'fill-amber-400 text-amber-500' : ''}`} /></button>
                  <button type="button" onClick={() => updateItem(item.id, { enabled: !item.enabled })} disabled={!canWrite} title="Toggle visibility" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300">{item.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
                  <button type="button" onClick={() => setEditingId(item.id)} className="h-9 rounded-lg border border-blue-200 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-300">Edit</button>
                </div>
              </div>)}
              {!filtered.length && <p className="p-8 text-center text-sm text-slate-500">No destinations match this search.</p>}
            </div>
          </section>
        </>}
      </div>

      {editing && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditingId(null); }}>
        <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl">
          <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white/95 p-5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"><div><h2 className="text-lg font-bold text-slate-950 dark:text-white">Edit destination</h2><p className="mt-1 text-xs text-slate-500">Changes remain a draft until Save and publish is pressed.</p></div><button type="button" onClick={() => setEditingId(null)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <Field label="Destination name" value={editing.name} onChange={(value) => updateItem(editing.id, { name: value })} disabled={!canWrite} />
            <Field label="Country" value={editing.country} onChange={(value) => updateItem(editing.id, { country: value })} disabled={!canWrite} />
            <Field label="URL slug" value={editing.slug} onChange={(value) => updateItem(editing.id, { slug: value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })} disabled={!canWrite} />
            <Field label="Country/badge code" value={editing.code} onChange={(value) => updateItem(editing.id, { code: value.toUpperCase().slice(0, 12) })} disabled={!canWrite} />
            <Field label="Custom badge" value={editing.badge} onChange={(value) => updateItem(editing.id, { badge: value })} hint="Optional" disabled={!canWrite} />
            <Field label="Image URL or /assets path" value={editing.imageUrl} onChange={(value) => updateItem(editing.id, { imageUrl: value })} disabled={!canWrite} />
            <Field label={provider === 'headout' ? 'Headout city code' : 'GetYourGuide location ID'} value={editing.providerLocationId} onChange={(value) => updateItem(editing.id, { providerLocationId: value })} disabled={!canWrite} />
            <Field label="Fallback provider search query" value={editing.searchQuery} onChange={(value) => updateItem(editing.id, { searchQuery: value })} disabled={!canWrite} />
            <label className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-slate-700"><span className="text-sm font-semibold">Visible</span><input type="checkbox" checked={editing.enabled} disabled={!canWrite} onChange={(event) => updateItem(editing.id, { enabled: event.target.checked })} className="h-5 w-5 accent-blue-600" /></label>
            <label className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-slate-700"><span className="text-sm font-semibold">Featured</span><input type="checkbox" checked={editing.featured} disabled={!canWrite} onChange={(event) => updateItem(editing.id, { featured: event.target.checked })} className="h-5 w-5 accent-blue-600" /></label>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 p-5 sm:flex-row sm:justify-between dark:border-slate-800"><button type="button" disabled={!canWrite} onClick={() => { if (window.confirm(`Remove ${editing.name} from this gallery?`)) { updateDestinations(current.destinations.filter((item) => item.id !== editing.id)); setEditingId(null); } }} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-300"><Trash2 className="h-4 w-4" /> Remove destination</button><button type="button" onClick={() => setEditingId(null)} className="h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white dark:bg-blue-600">Done</button></div>
        </section>
      </div>}
    </AdminLayout>
  </>;
}
