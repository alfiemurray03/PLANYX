import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Compass, ExternalLink, MapPin, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { destinations } from '@/lib/discovery-data';

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

const CARD_GRADIENTS = [
  'from-blue-500 to-cyan-400',
  'from-violet-500 to-fuchsia-400',
  'from-amber-500 to-rose-400',
  'from-emerald-500 to-teal-400',
];

function seededConfig(provider: Provider): ProviderGalleryConfig {
  const isHeadout = provider === 'headout';
  const providerDestinations = destinations
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
    }));
  return {
    enabled: true,
    eyebrow: isHeadout ? 'Primary affiliate partner' : 'Secondary affiliate partner',
    pageTitle: `Explore activities with ${isHeadout ? 'Headout' : 'GetYourGuide'}`,
    intro: 'Choose a destination and browse live tours, attractions, tickets and experiences without leaving Planyx.',
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
    affiliateWebsite: isHeadout ? 'https://tours.jagroupservices.co.uk' : 'https://japlanstudio.jagroupservices.co.uk',
    campaign: 'planyx-discovery',
    destinations: providerDestinations,
  };
}

function loadScript(id: string, src: string, attributes: Record<string, string> = {}) {
  document.getElementById(id)?.remove();
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  Object.entries(attributes).forEach(([key, value]) => script.setAttribute(key, value));
  document.body.appendChild(script);
  return () => script.remove();
}

function ProviderWidget({ provider, destination, config }: { provider: Provider; destination: GalleryDestination; config: ProviderGalleryConfig }) {
  const iframeId = `headout-${destination.slug}`;
  const [headoutHeight, setHeadoutHeight] = useState(900);

  useEffect(() => {
    if (provider === 'headout') {
      setHeadoutHeight(900);
      const resizeHeadout = (event: MessageEvent) => {
        if (event.origin !== 'https://partner.headout.com') return;
        const data = event.data as { type?: string; iframeId?: string; height?: number | string } | null;
        if (data?.type !== 'ho-event-message' || data.iframeId !== iframeId) return;
        const height = Number(data.height);
        if (Number.isFinite(height) && height > 0) setHeadoutHeight(Math.max(400, Math.ceil(height)));
      };
      window.addEventListener('message', resizeHeadout);
      return () => window.removeEventListener('message', resizeHeadout);
    }
    return loadScript('gyg-partner-widget', 'https://widget.getyourguide.com/dist/pa.umd.production.min.js', { 'data-gyg-partner-id': config.partnerId });
  }, [provider, destination.slug, iframeId, config.partnerId]);

  if (provider === 'headout') {
    if (!destination.providerLocationId) return <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">This destination needs a Headout city code in Partner Gallery Manager.</p>;
    const params = new URLSearchParams({
      affiliateCode: config.affiliateCode,
      affiliateWebsite: config.affiliateWebsite,
      currencyCode: config.currency,
      language: config.language,
      city: destination.providerLocationId,
      iframeId,
      maxCount: String(config.maxCount),
      showMore: String(config.showMore),
    });
    return <div className="min-h-80 rounded-2xl border border-border bg-background p-4">
      <iframe key={destination.slug} className="w-full rounded-lg border-0" style={{ height: `${headoutHeight}px` }} src={`https://partner.headout.com/embed/gallery/?${params.toString()}`} title={`Headout activities in ${destination.name}`} loading="eager" referrerPolicy="strict-origin-when-cross-origin" allow="payment" scrolling="no" />
    </div>;
  }

  const query = destination.searchQuery || `${destination.name}, ${destination.country}`;
  const href = `https://www.getyourguide.com/s/?q=${encodeURIComponent(query)}&partner_id=${encodeURIComponent(config.partnerId)}&locale=${encodeURIComponent(config.locale)}&currency=${encodeURIComponent(config.currency)}`;
  return (
    <div className="min-h-80 rounded-2xl border border-border bg-background p-4">
      <div data-gyg-href="https://widget.getyourguide.com/default/activities.frame" data-gyg-widget="activities" data-gyg-partner-id={config.partnerId} {...(destination.providerLocationId ? { 'data-gyg-location-id': destination.providerLocationId } : { 'data-gyg-q': query })} data-gyg-locale-code={config.locale} data-gyg-currency={config.currency} data-gyg-number-of-items={String(config.resultCount)} data-gyg-cmp={config.campaign}>
        <span>Powered by <a href={href} target="_blank" rel="sponsored noopener noreferrer">GetYourGuide</a></span>
      </div>
    </div>
  );
}

export function PartnerDiscoveryPage({ provider }: { provider: Provider }) {
  const [searchParams] = useSearchParams();
  const requestedDestination = searchParams.get('destination');
  const [query, setQuery] = useState('');
  const [config, setConfig] = useState<ProviderGalleryConfig>(() => seededConfig(provider));
  const [selected, setSelected] = useState<string | null>(() => destinations.some((item) => item.slug === requestedDestination) ? requestedDestination : null);
  const isHeadout = provider === 'headout';

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/partner-galleries?provider=${provider}`, { cache: 'no-store' })
      .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) as { success?: boolean; config?: Partial<ProviderGalleryConfig> } }))
      .then(({ response, payload }) => {
        if (cancelled || !response.ok || !payload.success || !payload.config) return;
        setConfig((fallback) => ({
          ...fallback,
          ...payload.config,
          destinations: Array.isArray(payload.config?.destinations) && payload.config.destinations.length ? payload.config.destinations : fallback.destinations,
        }));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [provider]);

  const available = useMemo(() => config.destinations
    .filter((item) => item.enabled)
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .filter((item) => `${item.name} ${item.country} ${item.badge}`.toLowerCase().includes(query.toLowerCase())), [config.destinations, query]);
  const current = available.find((item) => item.slug === selected) || config.destinations.find((item) => item.slug === selected && item.enabled);

  if (!config.enabled) {
    return <section className="bg-background py-24"><div className="mx-auto max-w-3xl px-4 text-center"><Compass className="mx-auto h-10 w-10 text-primary" /><h1 className="mt-5 font-heading text-4xl font-bold">{isHeadout ? 'Headout' : 'GetYourGuide'} gallery unavailable</h1><p className="mt-4 text-muted-foreground">This partner gallery is currently switched off by a Planyx administrator.</p></div></section>;
  }

  return <>
    <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-secondary text-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-sm"><Compass className="h-4 w-4" /> {config.eyebrow}</span>
        <h1 className="mt-5 max-w-3xl font-heading text-4xl font-bold tracking-tight sm:text-5xl">{config.pageTitle}</h1>
        <p className="mt-5 max-w-2xl text-lg text-white/80">{config.intro}</p>
      </div>
    </section>
    <section className="bg-background py-14" id="destinations">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm font-semibold uppercase tracking-widest text-primary">{config.galleryLabel}</p><h2 className="mt-2 font-heading text-3xl font-bold">{current ? current.name : config.galleryHeading}</h2></div>
          {current ? <Button variant="outline" onClick={() => setSelected(null)}><ArrowLeft className="h-4 w-4" /> {config.allDestinationsLabel}</Button> : <label className="relative block w-full sm:w-80"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm" placeholder={config.searchPlaceholder} /></label>}
        </div>
        {current ? <div className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-7"><div className="mb-5"><p className="text-sm text-muted-foreground">{config.liveGalleryLabel} {current.name}</p></div><ProviderWidget provider={provider} destination={current} config={config} /></div> :
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{available.map((item, index) => <button key={item.id || item.slug} onClick={() => setSelected(item.slug)} className="group overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"><div className={`relative h-36 overflow-hidden bg-gradient-to-br ${CARD_GRADIENTS[index % CARD_GRADIENTS.length]} p-5 text-white`}>{item.imageUrl && <img src={item.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />}<div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent" /><span className="relative rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold backdrop-blur">{item.badge || item.code}</span><MapPin className="relative mt-12 h-6 w-6" /></div><div className="p-5"><h3 className="font-semibold group-hover:text-primary">{item.name}</h3><p className="mt-1 text-sm text-muted-foreground">{item.country}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">{config.cardButtonLabel} <ArrowRight className="h-4 w-4" /></span></div></button>)}</div>}
      </div>
    </section>
    <section className="border-t border-border bg-muted/30 py-10"><div className="mx-auto grid max-w-7xl gap-5 px-4 sm:px-6 md:grid-cols-2 lg:px-8"><Card><CardContent className="flex gap-4 p-6"><ShieldCheck className="h-6 w-6 shrink-0 text-primary" /><div><h2 className="font-semibold">Book directly with the provider</h2><p className="mt-1 text-sm text-muted-foreground">Prices, availability, booking terms, cancellations and support are provided by {isHeadout ? 'Headout' : 'GetYourGuide'} or the relevant activity supplier.</p></div></CardContent></Card><Card><CardContent className="flex gap-4 p-6"><ExternalLink className="h-6 w-6 shrink-0 text-primary" /><div><h2 className="font-semibold">Affiliate disclosure</h2><p className="mt-1 text-sm text-muted-foreground">JA Group Services Ltd may receive a commission from qualifying bookings. This does not increase the price you pay.</p></div></CardContent></Card></div></section>
  </>;
}
