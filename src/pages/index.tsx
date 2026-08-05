import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion } from 'motion/react';
import { useState, useEffect, useLayoutEffect } from 'react';
import InstallAppBanner from '@/components/InstallAppBanner';
import { PLANYX_SUBSCRIPTIONS, type ServicePlan as ApiPlan } from '@/lib/service-plans';

/**
 * When the app is running as an installed PWA (standalone display mode),
 * the marketing homepage makes no sense — redirect straight to the dashboard.
 * The manifest already sets start_url=/dashboard, but this catches any edge
 * case where the user navigates back to / while in standalone mode.
 */
function usePwaRedirect() {
  const navigate = useNavigate();
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (isStandalone) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);
}
import {
  QrCode, Link2, Globe, Phone, Mail, BarChart3, Palette,
  Check, ArrowRight, Users, Briefcase,
  Scissors, Wrench, Star, Zap, Shield,
  Layout, UserCheck, Loader2, Building2,
  Share2, ChevronDown, ChevronUp, Megaphone,
  Lock, Smartphone, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ─── Shared class helpers ──────────────────────────────────────────────── */
const glass = [
  'bg-card',
  'border border-border',
  'rounded-2xl',
  'shadow-[0_4px_24px_-4px_rgba(37,99,235,0.10)] dark:shadow-[0_4px_24px_-4px_rgba(37,99,235,0.18)]',
].join(' ');

const glassStrong = [
  'bg-card',
  'border border-border',
  'rounded-2xl',
  'shadow-[0_8px_40px_-8px_rgba(37,99,235,0.14),0_2px_8px_-2px_rgba(0,0,0,0.06)]',
  'dark:shadow-[0_8px_40px_-8px_rgba(37,99,235,0.28),0_2px_8px_-2px_rgba(0,0,0,0.30)]',
].join(' ');

const glassHover = 'hover:-translate-y-1 hover:shadow-[0_12px_40px_-8px_rgba(37,99,235,0.20)] dark:hover:shadow-[0_12px_40px_-8px_rgba(37,99,235,0.35)] transition-all duration-300';

/* ─── Demo plan card ─────────────────────────────────────────────────────── */
function DemoPlanCard() {
  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <div className="absolute inset-0 rounded-3xl bg-blue-500/20 dark:bg-blue-500/30 blur-3xl scale-110 pointer-events-none" />
      <div className={`relative ${glassStrong} overflow-hidden`}>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-black/4 dark:bg-white/5 border-b border-black/6 dark:border-white/8">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
          </div>
          <div className="flex-1 mx-2 bg-black/6 dark:bg-white/10 rounded-md px-2.5 py-1 text-[10px] text-muted-foreground font-mono truncate">
            planyx.jagroupservices.co.uk/plans/<span className="text-primary">day-trip</span>
          </div>
        </div>
        <div className="px-5 py-5">
          <div className="flex flex-col items-center mb-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center text-white text-lg font-bold mb-2.5 ring-4 ring-blue-500/20 shadow-lg shadow-blue-500/25">
              P
            </div>
            <h3 className="text-foreground font-bold text-sm">Brighton Day Trip</h3>
            <p className="text-primary text-xs mt-0.5 font-medium">Day Trip Builder</p>
            <p className="text-muted-foreground text-[10px] mt-0.5">Saturday · 4 travellers</p>
          </div>
          <div className="space-y-2 mb-4">
            {[
              { icon: <Globe className="w-3 h-3" />, label: 'Travel and arrival plan' },
              { icon: <Users className="w-3 h-3" />, label: 'Activities for everyone' },
              { icon: <Check className="w-3 h-3" />, label: 'Budget and checklist ready' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2 border border-border">
                <span className="text-primary flex-shrink-0">{item.icon}</span>
                <span className="text-foreground text-[10px] truncate">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="flex-1 bg-blue-600 rounded-xl py-2 text-center text-white text-[10px] font-semibold shadow-sm shadow-blue-600/30">
              Edit Plan
            </div>
            <div className="flex-1 bg-muted rounded-xl py-2 text-center text-muted-foreground text-[10px] font-semibold border border-border">
              View Itinerary
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Demo checklist card ─────────────────────────────────────────────────── */
function DemoChecklistCard() {
  return (
    <div className={`relative ${glassStrong} overflow-hidden w-full max-w-[300px]`}>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600/8 via-transparent to-purple-600/6 pointer-events-none" />
      <div className="relative p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600/80 flex items-center justify-center text-white shadow-sm flex-shrink-0"><Check className="w-5 h-5" /></div>
          <div>
            <p className="text-foreground font-bold text-sm leading-tight">Travel Checklist</p>
            <p className="text-primary text-[10px] mt-0.5">6 of 8 complete</p>
          </div>
        </div>
        <div className="space-y-1.5 mb-4">
          {[
            { icon: <Check className="w-3 h-3" />, label: 'Tickets and confirmations' },
            { icon: <Check className="w-3 h-3" />, label: 'Accessibility arrangements' },
            { icon: <Shield className="w-3 h-3" />, label: 'Emergency details' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="text-primary">{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="flex-1 bg-blue-600 rounded-lg py-1.5 text-center text-white text-[10px] font-semibold">
            Open Checklist
          </div>
          <div className="flex-1 bg-muted rounded-lg py-1.5 text-center text-muted-foreground text-[10px] font-semibold border border-border">
            Share Plan
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Section badge ──────────────────────────────────────────────────────── */
function SectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-600/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 mb-4">
      {children}
    </span>
  );
}

/* ─── Trust strip ────────────────────────────────────────────────────────── */
function TrustStrip() {
  const items = [
    { icon: <Lock className="w-4 h-4" />,       label: 'UK-based & GDPR compliant' },
    { icon: <Shield className="w-4 h-4" />,      label: 'Secure sign-in via JA Group Services ID' },
    { icon: <Smartphone className="w-4 h-4" />,  label: 'Works on any device' },
    { icon: <FileText className="w-4 h-4" />,    label: 'No credit card to get started' },
  ];
  return (
    <div className="border-y border-blue-200/70 bg-gradient-to-r from-blue-50 via-cyan-50 to-violet-50 dark:border-blue-800/60 dark:from-blue-950/45 dark:via-cyan-950/25 dark:to-violet-950/35 py-5">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
          {items.map(item => (
            <div key={item.label} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="text-primary">{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── FAQ item ───────────────────────────────────────────────────────────── */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${glass} overflow-hidden`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-foreground font-semibold text-sm">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-4 text-muted-foreground text-sm leading-relaxed border-t border-border/50 pt-3">
          {a}
        </div>
      )}
    </div>
  );
}

/* ─── Homepage content type ──────────────────────────────────────────────── */
interface HomepageContent {
  hero_badge: string;
  hero_title_line1: string;
  hero_title_highlight: string;
  hero_subtitle: string;
  hero_cta_primary: string;
  hero_cta_secondary: string;
  announcement_enabled: boolean;
  announcement_text: string;
  announcement_link: string;
  announcement_link_label: string;
}

const HOMEPAGE_DEFAULTS: HomepageContent = {
  hero_badge:              'Guided planning builders',
  hero_title_line1:        'Your plans,',
  hero_title_highlight:    'made simple',
  hero_subtitle:           'Create personalised day trips, family days out, travel itineraries, accessibility checklists, budgets and occasions from one secure account.',
  hero_cta_primary:        'Explore Builders',
  hero_cta_secondary:      'See how it works',
  stats_users:             '',
  stats_countries:         '',
  stats_uptime:            '',
  announcement_enabled:    false,
  announcement_text:       '',
  announcement_link:       '',
  announcement_link_label: 'Learn more',
};

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════════════════ */
export default function HomePage() {
  usePwaRedirect();
  const [plans, setPlans] = useState<ApiPlan[]>(PLANYX_SUBSCRIPTIONS);
  const [plansLoading, setPlansLoading] = useState(true);
  const [hpContent, setHpContent] = useState<HomepageContent>(HOMEPAGE_DEFAULTS);

  useEffect(() => {
    fetch('/api/homepage-content')
      .then(r => r.json())
      .then(d => {
        if (!d.success || !d.data) return;
        const announcement = String(d.data.announcement_text || '');
        if (/document|profile/i.test(announcement)) return;
        setHpContent(current => ({
          ...current,
          announcement_enabled: Boolean(d.data.announcement_enabled),
          announcement_text: announcement,
          announcement_link: String(d.data.announcement_link || ''),
          announcement_link_label: String(d.data.announcement_link_label || 'Learn more'),
        }));
      })
      .catch(() => {});
    fetch('/plans-data', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Plans unavailable')))
      .then(data => {
        if (!Array.isArray(data.plans)) return;
        const recognised = new Set(PLANYX_SUBSCRIPTIONS.map(plan => plan.id));
        const currentPlans = data.plans.filter((plan: ApiPlan) => recognised.has(plan.id)).map((plan: ApiPlan) => {
          const defaults = PLANYX_SUBSCRIPTIONS.find(item => item.id === plan.id)!;
          return { ...defaults, ...plan, included_features: defaults.included_features };
        });
        if (currentPlans.length) setPlans(currentPlans);
      })
      .catch(() => {})
      .finally(() => setPlansLoading(false));
  }, []);

  const site = 'https://sousamurrayplaneia.jagroupservices.co.uk';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${site}/#website`,
        name: 'Sousa Murray Planeia',
        alternateName: 'Sousa Murray Planeia by JA Group Services',
        url: `${site}/`,
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${site}/search?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        '@id': `${site}/#organization`,
        name: 'Sousa Murray Planeia',
        legalName: 'JA Group Services Ltd',
        url: `${site}/`,
        logo: `${site}/airo-assets/images/logo/main`,
        sameAs: [],
      },
      {
        '@type': 'WebPage', '@id': `${site}/#webpage`, url: `${site}/`,
        name: 'Sousa Murray Planeia | Guided Planning Made Simple',
        isPartOf: { '@id': `${site}/#website` },
        about: { '@id': `${site}/#organization` },
        datePublished: '2025-01-01', dateModified: '2026-07-12',
      },
    ],
  };

  return (
    <>
    <div className="relative">
      <Helmet>
        <title>Sousa Murray Planeia | Guided Planning Made Simple</title>
        <meta name="description" content="Create personalised day trips, family days out, itineraries, budgets, accessibility checklists, occasions and holiday plans with guided builders." />
        <meta property="og:title" content="Sousa Murray Planeia | Guided Planning Made Simple" />
        <meta property="og:description" content="Build personalised everyday, travel and accessibility plans in minutes." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${site}/`} />
        <meta property="og:image" content={`${site}/og-image.png`} />
        <meta property="og:site_name" content="Sousa Murray Planeia" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Sousa Murray Planeia | Guided Planning Made Simple" />
        <meta name="twitter:description" content="Build personalised everyday, travel and accessibility plans in minutes." />
        <meta name="twitter:image" content={`${site}/og-image.png`} />
        <link rel="canonical" href={`${site}/`} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      {/* ── Ambient background ── */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-1/4 w-[700px] h-[700px] rounded-full bg-blue-300/15 dark:bg-blue-600/15 blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] rounded-full bg-indigo-300/10 dark:bg-purple-600/10 blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full bg-sky-300/10 dark:bg-blue-800/12 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(hsl(221 83% 53%) 1px, transparent 1px), linear-gradient(90deg, hsl(221 83% 53%) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════
          1. HERO
      ══════════════════════════════════════════════════════════ */}
      <section className="relative pt-20 pb-28 px-4 sm:px-6 lg:px-8 overflow-hidden bg-gradient-to-br from-blue-50 via-white to-violet-50 dark:from-slate-950 dark:via-blue-950/40 dark:to-violet-950/30">
        <div className="absolute -top-32 -left-24 h-80 w-80 rounded-full bg-cyan-400/25 blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="absolute -bottom-40 right-0 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="max-w-7xl mx-auto">

          {/* Announcement banner */}
          {hpContent.announcement_enabled && hpContent.announcement_text && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-sm text-primary mb-8 max-w-3xl mx-auto">
              <Megaphone className="w-4 h-4 shrink-0" />
              <span className="flex-1">{hpContent.announcement_text}</span>
              {hpContent.announcement_link && hpContent.announcement_link_label && (
                <a href={hpContent.announcement_link} className="font-semibold underline hover:no-underline shrink-0">
                  {hpContent.announcement_link_label}
                </a>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

            {/* Left — copy */}
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' as const }}
              style={{ isolation: 'isolate' }}
            >
              <SectionBadge>Sousa Murray Planeia · Guided planning builders</SectionBadge>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold text-foreground leading-[1.1] tracking-tight mb-6">
                Build personalised plans,{' '}
                <span className="bg-gradient-to-r from-blue-600 via-cyan-500 to-violet-600 bg-clip-text text-transparent">
                  step by step
                </span>
              </h1>
              <p className="text-lg text-foreground/80 leading-relaxed mb-8 max-w-lg font-normal">
                Choose from more than 200 guided templates for day trips, destinations, itineraries, business travel, education, public services, budgets, accessibility and travel preparation.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to="/sign-in">
                  <Button
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-xl shadow-blue-600/25 px-7 rounded-xl transition-all duration-200 hover:-translate-y-px"
                  >
                    Start Building a Plan <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <a href="#how-it-works">
                  <Button size="lg" variant="outline" className="border-border text-foreground hover:bg-muted px-7 rounded-xl font-medium">
                    How Plan Building Works
                  </Button>
                </a>
              </div>

            </motion.div>

            {/* Right — demo cards */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.15, ease: 'easeOut' as const }}
              className="relative flex items-center justify-center"
            >
              <div className="relative w-full max-w-sm mx-auto">
                <DemoPlanCard />
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' as const }}
                  className="absolute -bottom-10 -right-4 hidden sm:block z-10"
                >
                  <DemoChecklistCard />
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Trust strip ── */}
      <TrustStrip />

      {/* ══════════════════════════════════════════════════════════
          2. PERSONAL vs BUSINESS
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <SectionBadge>Built for real life</SectionBadge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight mb-3">
              Everyday plans or shared organisation planning — you choose
            </h2>
            <p className="text-muted-foreground text-base max-w-2xl mx-auto">
              Build a plan around your own needs or give your organisation a shared, controlled planning workspace.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Personal */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className={`${glass} p-7`}
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 mb-5">
                <UserCheck className="w-6 h-6" />
              </div>
              <h3 className="text-foreground font-bold text-xl mb-3">Personal Plans</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                Plan everyday experiences without starting from a blank page. Choose a guided builder and add the details that matter to you.
              </p>
              <ul className="space-y-2.5">
                {[
                  'Day trips and family days out',
                  'Travel itineraries and holidays',
                  'Budgets and booking trackers',
                  'Accessibility and travel checklists',
                  'Save plans securely',
                  'Download, print or share',
                ].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/80">
                    <Check className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Business */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className={`${glass} p-7`}
            >
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500 mb-5">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="text-foreground font-bold text-xl mb-3">Organisation Planning</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                A shared planning workspace with managed seats and controlled access for businesses, schools, colleges, universities, charities, government and public-service teams.
              </p>
              <ul className="space-y-2.5">
                {[
                  'Shared plans and reusable checklists',
                  'Coordinated activities and occasions',
                  'Role-based team access',
                  'Central planning oversight',
                  'Organisation seats for staff members',
                  'Central billing and controls',
                ].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/80">
                    <Check className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          3. DASHBOARD
      ══════════════════════════════════════════════════════════ */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/20">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <SectionBadge>Your dashboard</SectionBadge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight mb-3">
              Everything managed from one place
            </h2>
            <p className="text-muted-foreground text-base max-w-2xl mx-auto">
              Your Sousa Murray Planeia dashboard gives you full control over builders, saved plans, organisation members and settings—all in one clean interface.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: <Layout className="w-5 h-5" />,    title: 'Planning Builders',       desc: 'Use guided builders for trips, itineraries, budgets, accessibility, occasions and more.' },
              { icon: <Link2 className="w-5 h-5" />,     title: 'Builder Library',         desc: 'Browse the available planning tools and choose the right starting point.' },
              { icon: <QrCode className="w-5 h-5" />,    title: 'Guided Questions',        desc: 'Answer clear questions while Sousa Murray Planeia organises your plan.' },
              { icon: <BarChart3 className="w-5 h-5" />, title: 'My Plans',                desc: 'Find active, recent and completed plans from one place.' },
              { icon: <Mail className="w-5 h-5" />,      title: 'Reminders',               desc: 'Keep track of bookings, preparation and important planning dates.' },
              { icon: <Palette className="w-5 h-5" />,   title: 'Personalised Results',    desc: 'Shape plans around your priorities, budget, accessibility and preferred pace.' },
              { icon: <Users className="w-5 h-5" />,     title: 'Organisation Seats',      desc: 'Invite team members with role-based access and shared organisation controls.' },
              { icon: <Shield className="w-5 h-5" />,    title: 'Security',                desc: 'Manage your account security, sessions and privacy settings.' },
              { icon: <Share2 className="w-5 h-5" />,    title: 'Share & Export',          desc: 'Download, print or share completed plans from your workspace.' },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className={`${glass} ${glassHover} p-5 group cursor-default`}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3 group-hover:bg-primary/20 transition-colors">
                  {f.icon}
                </div>
                <h3 className="text-foreground font-semibold text-sm mb-1.5">{f.title}</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          4. HOW IT WORKS
      ══════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <SectionBadge>How it works</SectionBadge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              Up and running in minutes
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: '01', title: 'Choose a planning builder', desc: 'Select the day trip, itinerary, budget, accessibility, occasion or holiday tool you need.' },
              { step: '02', title: 'Answer the guided questions', desc: 'Add your needs, timings, budget and preferences while Sousa Murray Planeia organises the details.' },
              { step: '03', title: 'Save, download or share', desc: 'Keep your plan securely, return to it later, print it or share it with the people involved.' },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className={`${glass} p-7 relative overflow-hidden`}
              >
                <div className="absolute top-3 right-4 text-6xl font-black text-blue-600/6 dark:text-white/5 select-none leading-none">
                  {s.step}
                </div>
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm mb-4 shadow-lg shadow-blue-600/30">
                  {parseInt(s.step)}
                </div>
                <h3 className="text-foreground font-bold text-base mb-2">{s.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          5. WHO IT'S FOR
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50/90 via-cyan-50/60 to-violet-50/90 dark:from-blue-950/35 dark:via-slate-950 dark:to-violet-950/30">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <SectionBadge>Who it's for</SectionBadge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              Built for individuals, organisations, education and public services
            </h2>
          </motion.div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: <Globe className="w-5 h-5" />,      label: 'Travellers' },
              { icon: <Users className="w-5 h-5" />,      label: 'Families' },
              { icon: <Star className="w-5 h-5" />,       label: 'Couples' },
              { icon: <UserCheck className="w-5 h-5" />,  label: 'Solo Planners' },
              { icon: <Shield className="w-5 h-5" />,     label: 'Accessible Travel' },
              { icon: <Briefcase className="w-5 h-5" />,  label: 'Group Organisers' },
              { icon: <Zap className="w-5 h-5" />,        label: 'Day Trips' },
              { icon: <QrCode className="w-5 h-5" />,     label: 'Special Occasions' },
              { icon: <Building2 className="w-5 h-5" />,  label: 'Businesses' },
              { icon: <Users className="w-5 h-5" />,      label: 'Schools & Universities' },
              { icon: <Shield className="w-5 h-5" />,     label: 'Government Teams' },
              { icon: <Shield className="w-5 h-5" />,     label: 'Police Services' },
            ].map((w, i) => (
              <motion.div
                key={w.label}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className={`${glass} ${glassHover} p-5 flex flex-col items-center text-center gap-3 cursor-default`}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  {w.icon}
                </div>
                <span className="text-foreground text-sm font-semibold">{w.label}</span>
              </motion.div>
            ))}
          </div>
          <p className="text-center text-muted-foreground text-sm mt-6">
            And anyone who wants to make everyday planning clearer, calmer and easier to manage.
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          6. PRICING
      ══════════════════════════════════════════════════════════ */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <SectionBadge>Pricing</SectionBadge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight mb-3">
              Simple, transparent pricing
            </h2>
            <p className="text-muted-foreground text-base">
              Choose Explore, Plan, Complete or Together. Every option is a monthly Sousa Murray Planeia subscription.
            </p>
          </motion.div>

          {plansLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch mb-4">
                {plans.map((plan, i) => {
                  const highlighted = Boolean(plan.is_featured);
                  const href = `/create-checkout-session?plan=${encodeURIComponent(plan.id)}`;
                  return (
                    <motion.div
                      key={plan.id}
                      initial={{ opacity: 0, y: 16 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.35, delay: i * 0.07 }}
                      className={`relative flex flex-col rounded-2xl overflow-hidden ${highlighted ? 'bg-blue-600 shadow-2xl shadow-blue-600/30 ring-2 ring-blue-500' : 'bg-card border border-border shadow-md'}`}
                    >
                      {highlighted && (
                        <div className="px-5 pt-4 pb-0">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">
                            Most popular subscription
                          </span>
                        </div>
                      )}

                      <div className="p-5 flex flex-col flex-1 gap-4">
                        <div>
                          <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${highlighted ? 'text-blue-100' : 'text-primary'}`}>{plan.plan_type}</p>
                          <h3 className={`font-bold text-base mb-2 ${highlighted ? 'text-white' : 'text-foreground'}`}>
                            {plan.plan_name}
                          </h3>
                          <span className={`text-3xl font-extrabold ${highlighted ? 'text-white' : 'text-foreground'}`}>{plan.price_label}</span>
                          <span className={`ml-1 text-xs ${highlighted ? 'text-blue-100' : 'text-muted-foreground'}`}>/month</span>
                        </div>

                        <p className={`text-xs leading-relaxed ${highlighted ? 'text-blue-100' : 'text-muted-foreground'}`}>{plan.description}</p>
                        <p className={`text-[10px] font-bold uppercase tracking-wide ${highlighted ? 'text-white' : 'text-foreground'}`}>Included</p>
                        <ul className="space-y-2">
                          {plan.included_features.map(feature => <li key={feature} className={`flex items-start gap-1.5 text-xs ${highlighted ? 'text-blue-50' : 'text-muted-foreground'}`}><Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400" />{feature}</li>)}
                        </ul>
                        <div className="mt-auto pt-1">
                          <a href={href} className="block">
                            <Button className={`w-full text-sm font-semibold rounded-xl py-2 ${highlighted ? 'bg-white text-black hover:bg-blue-50 shadow-md' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-600/20'}`}>
                              {plan.button_label || (plan.price_pence === 0 ? 'Start free enquiry' : 'Choose plan')}
                            </Button>
                          </a>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <p className="text-center text-xs text-muted-foreground mt-5">
                All subscriptions are billed monthly. <Link to="/pricing" className="text-primary font-semibold hover:underline">Compare every Sousa Murray Planeia subscription.</Link>
              </p>
            </>
          )}

        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          7. FAQ
      ══════════════════════════════════════════════════════════ */}
      <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/20">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <SectionBadge>FAQ</SectionBadge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              Frequently asked questions
            </h2>
          </motion.div>

          <div className="space-y-3">
            {[
              { q: 'What is Sousa Murray Planeia?', a: 'Sousa Murray Planeia is a secure guided-planning service for individuals and organisations. It turns clear questions into organised, personalised plans.' },
              { q: 'Which builders are included?', a: 'The catalogue contains more than 200 guided templates across personal travel, families, business, education, government, police, community groups, accessibility, destinations, events and contingency planning. Availability follows your subscription.' },
              { q: 'What does the dashboard include?', a: 'Your dashboard brings together planning builders, saved plans, organisation members, account settings and support.' },
              { q: 'Is there a free plan?', a: 'Yes. The Free plan lets you try one guided builder. Paid plans unlock more builders, saved plans and longer retention.' },
              { q: 'Can organisations use Sousa Murray Planeia?', a: 'Yes. Organisation plans provide shared planning, managed seats and central controls for teams and groups.' },
              { q: 'Who can use Sousa Murray Planeia?', a: 'Sousa Murray Planeia supports individuals, families, businesses, charities, community groups and organisations that want simpler planning.' },
              { q: 'How do I get started?', a: 'Sign in through JA Group Services ID, choose a planning builder and answer the guided questions. Your account is created automatically on first sign-in.' },
              { q: 'Who operates Sousa Murray Planeia?', a: 'Sousa Murray Planeia is a service brand operated by JA Group Services Ltd, a company registered in England and Wales.' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
              >
                <FaqItem q={item.q} a={item.a} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          8. FINAL CTA
      ══════════════════════════════════════════════════════════ */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className={`${glassStrong} p-10 sm:p-14 text-center relative overflow-hidden`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-cyan-600 to-violet-700 pointer-events-none rounded-2xl" />
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center text-white mx-auto mb-6 shadow-lg shadow-blue-950/20">
                <QrCode className="w-7 h-7" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
                Ready to create your first plan?
              </h2>
              <p className="text-blue-50 mb-8 leading-relaxed text-base max-w-xl mx-auto">
                Sign in through JA Group Services ID, choose a guided builder and create your first personalised plan. Free to start—no credit card required.
              </p>
              <div className="flex flex-wrap gap-3 justify-center mb-8">
                <Link to="/sign-in">
                  <Button
                    size="lg"
                    className="bg-white hover:bg-blue-50 text-blue-700 font-semibold shadow-xl shadow-blue-950/25 px-8 rounded-xl transition-all duration-200 hover:-translate-y-px"
                  >
                    Explore Builders <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link to="/sign-in">
                  <Button size="lg" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white px-8 rounded-xl font-medium">
                    Sign in to dashboard
                  </Button>
                </Link>
              </div>
              <div className="flex flex-wrap justify-center gap-5 pt-6 border-t border-white/25">
                {['Free to get started', 'No credit card required', 'UK-based service'].map(t => (
                  <div key={t} className="flex items-center gap-1.5 text-sm text-blue-50">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
    <InstallAppBanner />
    </>
  );
}
