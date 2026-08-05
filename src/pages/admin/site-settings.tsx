/**
 * Admin — Site Settings
 * Branding, navigation links, footer links, contact info, feature flags, and maintenance mode.
 * Tabbed interface. Platform Owner / Super Admin only.
 * All settings persisted to ja_site_settings via /api/admin/site-settings.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus, Trash2, Save, CheckCircle2, AlertTriangle,
  Palette, ToggleLeft, ToggleRight, GripVertical,
  Building2, Navigation, Footprints, Accessibility, Globe,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavLink { id: string; label: string; href: string; openNewTab: boolean; }
interface FooterLink { id: string; label: string; href: string; group: string; }

interface A11yConfig {
  enabled: boolean;
  position: 'bottom-right' | 'bottom-left';
  featFontSize: boolean;
  featContrast: boolean;
  featMotion: boolean;
  featDyslexia: boolean;
  featLinks: boolean;
  featGrayscale: boolean;
}

interface SiteConfig {
  siteStatus: 'normal' | 'coming_soon' | 'maintenance';
  comingSoonHeadline: string;
  comingSoonSubtext: string;
  comingSoonLaunchDate: string;
  comingSoonCountdownEnabled: boolean;
  siteName: string;
  brandName: string;       // public-facing brand — "JA Group Services"
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  companyName: string;     // legal entity — "JA Group Services Ltd"
  companyAddress: string;
  companyNumber: string;
  vatNumber: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
  faviconUrl: string;
  maintenanceMode: boolean;
  maintenanceTitle: string;
  maintenanceReason: string;
  maintenanceMessage: string;
  maintenanceStart: string;
  maintenanceExpectedReturn: string;
  maintenanceContactText: string;
  contactPageStatus: 'online' | 'maintenance' | 'offline';
  contactMaintenanceTitle: string;
  contactMaintenanceReason: string;
  contactMaintenanceMessage: string;
  contactMaintenanceStart: string;
  contactMaintenanceExpectedReturn: string;
  contactOfflineMessage: string;
  registrationEnabled: boolean;
  freeTrialEnabled: boolean;
  affiliateComingSoon: boolean;
  googleAnalyticsId: string;
  cookieBannerEnabled: boolean;
  navLinks: NavLink[];
  footerLinks: FooterLink[];
}

// ── Seed ──────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SiteConfig = {
  siteStatus: 'normal',
  comingSoonHeadline: 'Coming Soon',
  comingSoonSubtext: 'We are putting the finishing touches on something great.',
  comingSoonLaunchDate: '',
  comingSoonCountdownEnabled: false,
  siteName:    'Sousa Murray Planeia',
  brandName:   'JA Group Services',
  tagline:     'Personalised Plans, Built Step by Step',
  supportEmail: 'contact@jagroupservices.co.uk',
  supportPhone: '020 3834 2790',
  companyName: 'JA Group Services Ltd',
  companyAddress: 'United Kingdom',
  companyNumber: '',
  vatNumber: '',
  primaryColor: '#1B4F8A',
  accentColor: '#8a561b',
  logoUrl: '',
  faviconUrl: '',
  maintenanceMode: false,
  maintenanceTitle: 'We are making Sousa Murray Planeia even better',
  maintenanceReason: 'Planned platform maintenance',
  maintenanceMessage: 'Sousa Murray Planeia is temporarily unavailable while our team completes essential improvements.',
  maintenanceStart: '',
  maintenanceExpectedReturn: '',
  maintenanceContactText: 'Need help while we are away? Contact contact@jagroupservices.co.uk or call 020 3834 2790.',
  contactPageStatus: 'online',
  contactMaintenanceTitle: 'Contact support is temporarily unavailable',
  contactMaintenanceReason: 'Contact service maintenance',
  contactMaintenanceMessage: 'We are carrying out essential work on the Sousa Murray Planeia contact service. Please check back shortly.',
  contactMaintenanceStart: '',
  contactMaintenanceExpectedReturn: '',
  contactOfflineMessage: 'The Contact Us page is currently offline. Please use the contact details shown on this page if your enquiry cannot wait.',
  registrationEnabled: true,
  freeTrialEnabled: true,
  affiliateComingSoon: true,
  googleAnalyticsId: '',
  cookieBannerEnabled: true,
  navLinks: [
    { id: 'nl-1', label: 'Pricing', href: '/pricing', openNewTab: false },
    { id: 'nl-2', label: 'Contact', href: '/contact', openNewTab: false },
  ],
  footerLinks: [
    { id: 'fl-1', label: 'Privacy Policy',    href: '/privacy',     group: 'Legal' },
    { id: 'fl-2', label: 'Terms & Conditions', href: '/terms',       group: 'Legal' },
    { id: 'fl-3', label: 'Cookie Policy',      href: '/cookies',     group: 'Legal' },
    { id: 'fl-4', label: 'Pricing',            href: '/pricing',     group: 'Company' },
    { id: 'fl-5', label: 'Contact',            href: '/contact',     group: 'Company' },
  ],
};

const STORAGE_KEY = 'ja_admin_site_settings_v1';
const A11Y_STORAGE_KEY = 'ja_admin_a11y_settings_v1';

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiGetSettings(): Promise<Record<string, string>> {
  try {
    const res = await fetch('/api/admin/site-settings', { credentials: 'include' });
    const data = await res.json() as { success: boolean; settings?: Record<string, string> };
    if (data.success && data.settings) return data.settings;
  } catch { /* fallback */ }
  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch { /* ignore */ }
  return {};
}

async function apiSaveSettings(settings: Record<string, string>): Promise<void> {
  const response = await fetch('/api/admin/site-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ settings }),
  });
  const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
  if (!response.ok || !data.success) throw new Error(data.error || 'Settings could not be saved.');
  // Also persist to localStorage as cache
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

async function apiGetSiteStatus(): Promise<SiteConfig['siteStatus'] | null> {
  const response = await fetch('/admin/api/site-status', { credentials: 'include' });
  const data = await response.json().catch(() => ({})) as { success?: boolean; site_status?: SiteConfig['siteStatus'] };
  return response.ok && data.success && ['normal', 'coming_soon', 'maintenance'].includes(String(data.site_status))
    ? data.site_status ?? null : null;
}

async function apiSaveSiteStatus(siteStatus: SiteConfig['siteStatus']): Promise<void> {
  const response = await fetch('/admin/api/site-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ site_status: siteStatus }),
  });
  const data = await response.json().catch(() => ({})) as { success?: boolean; message?: string };
  if (!response.ok || !data.success) throw new Error(data.message || 'Site status could not be saved.');
}

function loadConfig(): SiteConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Record<string, string>;
      return settingsToConfig(s);
    }
  } catch { /* ignore */ }
  return DEFAULT_CONFIG;
}

function settingsToConfig(s: Record<string, string>): SiteConfig {
  const savedStatus = ['normal', 'coming_soon', 'maintenance'].includes(s['site_status'])
    ? s['site_status'] as SiteConfig['siteStatus']
    : s['maintenance_enabled'] === 'true' || s['maintenance_mode'] === 'true'
      ? 'maintenance'
      : s['launchgateway_enabled'] === 'true' ? 'coming_soon' : 'normal';
  return {
    ...DEFAULT_CONFIG,
    siteStatus: savedStatus,
    comingSoonHeadline: s['coming_soon_headline'] ?? DEFAULT_CONFIG.comingSoonHeadline,
    comingSoonSubtext: s['coming_soon_subtext'] ?? DEFAULT_CONFIG.comingSoonSubtext,
    comingSoonLaunchDate: s['coming_soon_launch_date'] ?? '',
    comingSoonCountdownEnabled: s['coming_soon_countdown_enabled'] === 'true',
    siteName:            s['site_name']            ?? DEFAULT_CONFIG.siteName,
    brandName:           s['brand_name']           ?? DEFAULT_CONFIG.brandName,
    tagline:             s['tagline']              ?? DEFAULT_CONFIG.tagline,
    supportEmail:        DEFAULT_CONFIG.supportEmail,
    supportPhone:        DEFAULT_CONFIG.supportPhone,
    companyName:         s['company_name']         ?? DEFAULT_CONFIG.companyName,
    companyAddress:      s['company_address']      ?? DEFAULT_CONFIG.companyAddress,
    companyNumber:       s['company_number']       ?? DEFAULT_CONFIG.companyNumber,
    vatNumber:           s['vat_number']           ?? DEFAULT_CONFIG.vatNumber,
    primaryColor:        s['primary_color']        ?? DEFAULT_CONFIG.primaryColor,
    accentColor:         s['accent_color']         ?? DEFAULT_CONFIG.accentColor,
    logoUrl:             s['logo_url']             ?? DEFAULT_CONFIG.logoUrl,
    faviconUrl:          s['favicon_url']          ?? DEFAULT_CONFIG.faviconUrl,
    maintenanceMode:     savedStatus === 'maintenance',
    maintenanceTitle:    s['maintenance_title'] ?? DEFAULT_CONFIG.maintenanceTitle,
    maintenanceReason:   s['maintenance_reason'] ?? DEFAULT_CONFIG.maintenanceReason,
    maintenanceMessage:  s['maintenance_message']  ?? DEFAULT_CONFIG.maintenanceMessage,
    maintenanceStart:    s['maintenance_start'] ?? '',
    maintenanceExpectedReturn: s['maintenance_expected_return'] ?? '',
    maintenanceContactText: s['maintenance_contact_text'] ?? DEFAULT_CONFIG.maintenanceContactText,
    contactPageStatus: ['online', 'maintenance', 'offline'].includes(s['contact_page_status'])
      ? s['contact_page_status'] as SiteConfig['contactPageStatus']
      : DEFAULT_CONFIG.contactPageStatus,
    contactMaintenanceTitle: s['contact_maintenance_title'] ?? DEFAULT_CONFIG.contactMaintenanceTitle,
    contactMaintenanceReason: s['contact_maintenance_reason'] ?? DEFAULT_CONFIG.contactMaintenanceReason,
    contactMaintenanceMessage: s['contact_maintenance_message'] ?? DEFAULT_CONFIG.contactMaintenanceMessage,
    contactMaintenanceStart: s['contact_maintenance_start'] ?? '',
    contactMaintenanceExpectedReturn: s['contact_maintenance_expected_return'] ?? '',
    contactOfflineMessage: s['contact_offline_message'] ?? DEFAULT_CONFIG.contactOfflineMessage,
    registrationEnabled: s['registration_enabled'] !== 'false',
    freeTrialEnabled:    s['free_trial_enabled']   !== 'false',
    affiliateComingSoon: s['affiliate_coming_soon'] !== 'false',
    googleAnalyticsId:   s['google_analytics_id']  ?? DEFAULT_CONFIG.googleAnalyticsId,
    cookieBannerEnabled: s['cookie_banner_enabled'] !== 'false',
    navLinks:   s['nav_links']   ? JSON.parse(s['nav_links'])   as NavLink[]   : DEFAULT_CONFIG.navLinks,
    footerLinks: s['footer_links'] ? JSON.parse(s['footer_links']) as FooterLink[] : DEFAULT_CONFIG.footerLinks,
  };
}

function configToSettings(cfg: SiteConfig): Record<string, string> {
  return {
    site_status:          cfg.siteStatus,
    maintenance_enabled: String(cfg.siteStatus === 'maintenance'),
    launchgateway_enabled: String(cfg.siteStatus === 'coming_soon'),
    coming_soon_headline: cfg.comingSoonHeadline,
    coming_soon_subtext: cfg.comingSoonSubtext,
    coming_soon_launch_date: cfg.comingSoonLaunchDate ? new Date(cfg.comingSoonLaunchDate).toISOString() : '',
    coming_soon_countdown_enabled: String(cfg.comingSoonCountdownEnabled),
    site_name:            cfg.siteName,
    brand_name:           cfg.brandName,
    tagline:              cfg.tagline,
    support_email:        DEFAULT_CONFIG.supportEmail,
    support_phone:        DEFAULT_CONFIG.supportPhone,
    company_name:         cfg.companyName,
    company_address:      cfg.companyAddress,
    company_number:       cfg.companyNumber,
    vat_number:           cfg.vatNumber,
    primary_color:        cfg.primaryColor,
    accent_color:         cfg.accentColor,
    logo_url:             cfg.logoUrl,
    favicon_url:          cfg.faviconUrl,
    maintenance_mode:     String(cfg.siteStatus === 'maintenance'),
    maintenance_title:    cfg.maintenanceTitle,
    maintenance_reason:   cfg.maintenanceReason,
    maintenance_message:  cfg.maintenanceMessage,
    maintenance_start:    cfg.maintenanceStart,
    maintenance_expected_return: cfg.maintenanceExpectedReturn,
    maintenance_contact_text: cfg.maintenanceContactText,
    contact_page_status: cfg.contactPageStatus,
    contact_maintenance_title: cfg.contactMaintenanceTitle,
    contact_maintenance_reason: cfg.contactMaintenanceReason,
    contact_maintenance_message: cfg.contactMaintenanceMessage,
    contact_maintenance_start: cfg.contactMaintenanceStart,
    contact_maintenance_expected_return: cfg.contactMaintenanceExpectedReturn,
    contact_offline_message: cfg.contactOfflineMessage,
    registration_enabled: String(cfg.registrationEnabled),
    free_trial_enabled:   String(cfg.freeTrialEnabled),
    affiliate_coming_soon: String(cfg.affiliateComingSoon),
    google_analytics_id:  cfg.googleAnalyticsId,
    cookie_banner_enabled: String(cfg.cookieBannerEnabled),
    nav_links:            JSON.stringify(cfg.navLinks),
    footer_links:         JSON.stringify(cfg.footerLinks),
  };
}

const DEFAULT_A11Y: A11yConfig = {
  enabled: true,
  position: 'bottom-right',
  featFontSize: true,
  featContrast: true,
  featMotion: true,
  featDyslexia: true,
  featLinks: true,
  featGrayscale: true,
};

function loadA11y(): A11yConfig {
  try {
    const raw = localStorage.getItem(A11Y_STORAGE_KEY);
    if (raw) return { ...DEFAULT_A11Y, ...JSON.parse(raw) as Partial<A11yConfig> };
  } catch { /* ignore */ }
  return DEFAULT_A11Y;
}

function saveA11y(cfg: A11yConfig) {
  localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(cfg));
}

// ── Toggle component ──────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        {description && <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-400">{description}</p>}
      </div>
      <button onClick={() => onChange(!checked)} className="shrink-0 mt-0.5">
        {checked
          ? <ToggleRight className="w-8 h-8 text-primary" />
          : <ToggleLeft className="w-8 h-8 text-gray-300 dark:text-slate-600" />
        }
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminSiteSettings() {

  const [cfg, setCfg]           = useState<SiteConfig>(loadConfig);
  const [a11y, setA11y]         = useState<A11yConfig>(() => loadA11y());
  const [savedMsg, setSavedMsg] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const [dirty, setDirty]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [a11ySaving, setA11ySaving] = useState(false);
  const [a11ySaved, setA11ySaved]   = useState('');

  // Load from DB on mount
  useEffect(() => {
    Promise.all([apiGetSettings(), apiGetSiteStatus().catch(() => null)]).then(([settings, status]) => {
      const loaded = Object.keys(settings).length > 0 ? settingsToConfig(settings) : DEFAULT_CONFIG;
      setCfg({ ...loaded, ...(status ? { siteStatus: status, maintenanceMode: status === 'maintenance' } : {}) });
    }).catch(() => {});
  }, []);

  function update(patch: Partial<SiteConfig>) {
    setCfg(c => ({ ...c, ...patch }));
    setDirty(true);
  }

  function updateA11y(patch: Partial<A11yConfig>) {
    setA11y(c => ({ ...c, ...patch }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveFailed(false);
    try {
      if (cfg.siteStatus === 'coming_soon' && cfg.comingSoonCountdownEnabled && !cfg.comingSoonLaunchDate) {
        throw new Error('Choose a launch date when the countdown is enabled.');
      }
      const analyticsId = cfg.googleAnalyticsId.trim().toUpperCase();
      if (analyticsId && !/^G-[A-Z0-9]{4,20}$/.test(analyticsId)) {
        throw new Error('Enter a valid Google Analytics 4 Measurement ID beginning with G-.');
      }
      if (analyticsId !== cfg.googleAnalyticsId) setCfg(current => ({ ...current, googleAnalyticsId: analyticsId }));
      await apiSaveSiteStatus(cfg.siteStatus);
      await apiSaveSettings(configToSettings({ ...cfg, googleAnalyticsId: cfg.googleAnalyticsId.trim().toUpperCase() }));
      setDirty(false);
      setSavedMsg('Settings saved successfully.');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (error) {
      setSaveFailed(true);
      setSavedMsg(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed. Please try again.');
      setTimeout(() => setSavedMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  const handleSaveA11y = useCallback(async () => {
    setA11ySaving(true);
    try {
      // Persist each key to the system-config DB via the admin API
      const keys: Array<[string, string]> = [
        ['a11y_enabled',        String(a11y.enabled)],
        ['a11y_position',       a11y.position],
        ['a11y_feat_font_size', String(a11y.featFontSize)],
        ['a11y_feat_contrast',  String(a11y.featContrast)],
        ['a11y_feat_motion',    String(a11y.featMotion)],
        ['a11y_feat_dyslexia',  String(a11y.featDyslexia)],
        ['a11y_feat_links',     String(a11y.featLinks)],
        ['a11y_feat_grayscale', String(a11y.featGrayscale)],
      ];
      await apiSaveSettings(Object.fromEntries(keys));
      saveA11y(a11y);
      setA11ySaved('Accessibility settings saved.');
      setTimeout(() => setA11ySaved(''), 3000);
    } catch {
      setA11ySaved('Failed to save. Please try again.');
    } finally {
      setA11ySaving(false);
    }
  }, [a11y]);

  // Load a11y settings from DB on mount
  useEffect(() => {
    fetch('/api/admin/system-config', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { success: boolean; config?: Record<string, string> }) => {
        if (!d.success || !d.config) return;
        const c = d.config;
        setA11y({
          enabled:      c['a11y_enabled']          !== 'false',
          position:     (c['a11y_position'] as A11yConfig['position']) ?? 'bottom-right',
          featFontSize: c['a11y_feat_font_size']   !== 'false',
          featContrast: c['a11y_feat_contrast']    !== 'false',
          featMotion:   c['a11y_feat_motion']      !== 'false',
          featDyslexia: c['a11y_feat_dyslexia']    !== 'false',
          featLinks:    c['a11y_feat_links']        !== 'false',
          featGrayscale: c['a11y_feat_grayscale']  !== 'false',
        });
      })
      .catch(() => { /* use localStorage fallback */ });
  }, []);

  // Nav links
  function addNavLink() {
    update({ navLinks: [...cfg.navLinks, { id: `nl-${Date.now()}`, label: '', href: '', openNewTab: false }] });
  }
  function updateNavLink(id: string, patch: Partial<NavLink>) {
    update({ navLinks: cfg.navLinks.map(l => l.id === id ? { ...l, ...patch } : l) });
  }
  function removeNavLink(id: string) {
    update({ navLinks: cfg.navLinks.filter(l => l.id !== id) });
  }

  // Footer links
  function addFooterLink() {
    update({ footerLinks: [...cfg.footerLinks, { id: `fl-${Date.now()}`, label: '', href: '', group: 'Company' }] });
  }
  function updateFooterLink(id: string, patch: Partial<FooterLink>) {
    update({ footerLinks: cfg.footerLinks.map(l => l.id === id ? { ...l, ...patch } : l) });
  }
  function removeFooterLink(id: string) {
    update({ footerLinks: cfg.footerLinks.filter(l => l.id !== id) });
  }

  const base = 'bg-white border-gray-200 text-gray-900 dark:bg-slate-900 dark:border-slate-800 dark:text-white';
  const muted = 'text-gray-500 dark:text-slate-400';
  const inputCls = 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500';
  const sectionCls = `rounded-xl border p-5 space-y-4 ${base}`;
  const divider = 'divide-gray-100 dark:divide-slate-800';
  const tabsCls = 'bg-gray-100 border-gray-200 dark:bg-slate-800 dark:border-slate-700';

  function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
      <div>
        <Label className={`text-xs font-medium mb-1 block ${'text-gray-700 dark:text-slate-300'}`}>{label}</Label>
        {hint && <p className={`text-[11px] mb-1.5 ${muted}`}>{hint}</p>}
        {children}
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Site Settings — Admin Portal</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <AdminLayout title="Site Settings" subtitle="Branding, navigation, contact info, feature flags, and accessibility">
        <div className="space-y-5">

          {/* Maintenance mode banner */}
          {cfg.maintenanceMode && (
            <div className={`flex items-start gap-3 rounded-xl border px-4 py-3
              ${'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-700/40 dark:text-amber-300'}`}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">Maintenance mode is currently <strong>enabled</strong>. The site is not accessible to the public.</p>
            </div>
          )}

          {savedMsg && (
            <div className={`flex items-center gap-2 text-sm rounded-lg px-4 py-2.5 border
              ${saveFailed
                ? 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-700/40'
                : 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-700/40'}`}>
              {saveFailed ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />} {savedMsg}
            </div>
          )}

          {/* Save bar */}
          <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${base}`}>
            <p className={`text-sm ${dirty ? ('text-amber-600 dark:text-amber-400') : muted}`}>
              {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
            </p>
            <Button onClick={handleSave} disabled={!dirty || saving} className="bg-primary hover:bg-primary/90 text-white gap-1.5 h-9">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save Settings'}
            </Button>
          </div>

          <Tabs defaultValue="status">
            <TabsList className={`border flex-wrap h-auto gap-1 ${tabsCls}`}>
              <TabsTrigger value="status"         className="gap-1.5 text-xs"><Globe className="w-3.5 h-3.5" /> Site Status</TabsTrigger>
              <TabsTrigger value="branding"       className="gap-1.5 text-xs"><Palette className="w-3.5 h-3.5" /> Branding</TabsTrigger>
              <TabsTrigger value="company"        className="gap-1.5 text-xs"><Building2 className="w-3.5 h-3.5" /> Company</TabsTrigger>
              <TabsTrigger value="navigation"     className="gap-1.5 text-xs"><Navigation className="w-3.5 h-3.5" /> Navigation</TabsTrigger>
              <TabsTrigger value="footer"         className="gap-1.5 text-xs"><Footprints className="w-3.5 h-3.5" /> Footer</TabsTrigger>
              <TabsTrigger value="features"       className="gap-1.5 text-xs"><ToggleLeft className="w-3.5 h-3.5" /> Features</TabsTrigger>
              <TabsTrigger value="accessibility"  className="gap-1.5 text-xs"><Accessibility className="w-3.5 h-3.5" /> Accessibility</TabsTrigger>
            </TabsList>

            {/* ── Site Status ── */}
            <TabsContent value="status" className="mt-4 space-y-4">
              <div className={sectionCls}>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Public Website Status</h3>
                  <p className={`text-xs mt-1 ${muted}`}>Choose exactly what visitors see. Administrators can continue to access this portal in every mode.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {([
                    ['normal', 'Live', 'The public Sousa Murray Planeia website is available normally.'],
                    ['coming_soon', 'Coming Soon', 'Show the launch gate while the website is prepared.'],
                    ['maintenance', 'Maintenance', 'Temporarily take the public website offline.'],
                  ] as const).map(([value, label, description]) => {
                    const selected = cfg.siteStatus === value;
                    return (
                      <button key={value} type="button" onClick={() => update({ siteStatus: value, maintenanceMode: value === 'maintenance' })}
                        className={`text-left rounded-xl border p-4 transition-all ${selected ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-slate-900">{label}</span>
                          <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${selected ? 'border-primary bg-primary' : 'border-slate-300'}`}>
                            {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">{description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {cfg.siteStatus === 'coming_soon' && (
                <div className={sectionCls}>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Coming Soon Launch Gate</h3>
                    <p className={`text-xs mt-1 ${muted}`}>These details are displayed on the public launch page.</p>
                  </div>
                  <Field label="Headline">
                    <Input value={cfg.comingSoonHeadline} onChange={e => update({ comingSoonHeadline: e.target.value })} className={`h-9 ${inputCls}`} />
                  </Field>
                  <Field label="Supporting text">
                    <Textarea value={cfg.comingSoonSubtext} onChange={e => update({ comingSoonSubtext: e.target.value })} rows={3} className={`resize-none text-sm ${inputCls}`} />
                  </Field>
                  <Toggle checked={cfg.comingSoonCountdownEnabled} onChange={v => update({ comingSoonCountdownEnabled: v })}
                    label="Show launch countdown" description="Display a live countdown to the launch date below." />
                  {cfg.comingSoonCountdownEnabled && (
                    <Field label="Launch date and time">
                      <Input type="datetime-local" value={cfg.comingSoonLaunchDate.slice(0, 16)}
                        onChange={e => update({ comingSoonLaunchDate: e.target.value })} className={`h-9 ${inputCls}`} />
                    </Field>
                  )}
                </div>
              )}

              <div className={sectionCls}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Dedicated Maintenance Page</h3>
                      <p className={`mt-1 text-xs ${muted}`}>Explain why Sousa Murray Planeia is unavailable and when customers should expect it to return.</p>
                    </div>
                    <a
                      href="/maintenance/"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center rounded-lg border border-blue-300 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/50"
                    >
                      Preview maintenance page
                    </a>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Page heading">
                      <Input value={cfg.maintenanceTitle} onChange={e => update({ maintenanceTitle: e.target.value })} className={`h-9 ${inputCls}`} />
                    </Field>
                    <Field label="Reason for maintenance">
                      <Input value={cfg.maintenanceReason} onChange={e => update({ maintenanceReason: e.target.value })} className={`h-9 ${inputCls}`} />
                    </Field>
                    <Field label="Maintenance started" hint="Displayed using each visitor's local date and time.">
                      <Input type="datetime-local" value={cfg.maintenanceStart.slice(0, 16)} onChange={e => update({ maintenanceStart: e.target.value })} className={`h-9 ${inputCls}`} />
                    </Field>
                    <Field label="Expected return" hint="Leave blank where no reliable estimate is available.">
                      <Input type="datetime-local" value={cfg.maintenanceExpectedReturn.slice(0, 16)} onChange={e => update({ maintenanceExpectedReturn: e.target.value })} className={`h-9 ${inputCls}`} />
                    </Field>
                  </div>
                  <Field label="Customer message">
                    <Textarea value={cfg.maintenanceMessage} onChange={e => update({ maintenanceMessage: e.target.value })}
                      rows={4} className={`resize-y text-sm ${inputCls}`} />
                  </Field>
                  <Field label="Contact guidance">
                    <Textarea value={cfg.maintenanceContactText} onChange={e => update({ maintenanceContactText: e.target.value })}
                      rows={2} className={`resize-y text-sm ${inputCls}`} />
                  </Field>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
                    The page uses the approved Sousa Murray Planeia logo, permanent dark styling, service-status indicator and legal links. Admin and authentication routes remain available.
                  </div>
              </div>

            </TabsContent>

            {/* ── Branding ── */}
            <TabsContent value="branding" className="mt-4 space-y-4">
              <div className={sectionCls}>
                <h3 className={`text-sm font-semibold ${'text-gray-900 dark:text-white'}`}>Platform Identity</h3>
                <p className={`text-xs ${muted}`}>The product/platform name shown in page titles, dashboards, and the browser tab.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Platform Name (Product)" hint='Shown in page titles and the browser tab — e.g. "Sousa Murray Planeia"'>
                    <Input value={cfg.siteName} onChange={e => update({ siteName: e.target.value })} className={`h-9 ${inputCls}`} />
                  </Field>
                  <Field label="Tagline">
                    <Input value={cfg.tagline} onChange={e => update({ tagline: e.target.value })} className={`h-9 ${inputCls}`} />
                  </Field>
                </div>
              </div>
              <div className={sectionCls}>
                <h3 className={`text-sm font-semibold ${'text-gray-900 dark:text-white'}`}>Brand Name</h3>
                <p className={`text-xs ${muted}`}>
                  The public-facing brand shown in the header, footer, marketing pages, and customer communications.
                  Do <strong>not</strong> include "Ltd" here — that belongs in the Company tab for legal use only.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label='Public Brand Name' hint='Used in header, footer, dashboards — e.g. "JA Group Services"'>
                    <Input value={cfg.brandName} onChange={e => update({ brandName: e.target.value })} className={`h-9 ${inputCls}`} />
                  </Field>
                </div>
                <div className={`rounded-lg border px-4 py-3 text-xs space-y-1 ${'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-700/40 dark:text-blue-300'}`}>
                  <p className="font-semibold">Brand vs Legal name — where each is used:</p>
                  <ul className="list-disc list-inside space-y-0.5 mt-1">
                    <li><strong>Brand name</strong> — header, footer, login, register, dashboards, support, marketing, emails</li>
                    <li><strong>Legal name</strong> (Company tab) — Terms &amp; Conditions, Privacy Policy, Cookie Policy, contracts, invoices, compliance</li>
                  </ul>
                </div>
              </div>
              <div className={sectionCls}>
                <h3 className={`text-sm font-semibold ${'text-gray-900 dark:text-white'}`}>Logo &amp; Favicon</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Logo URL" hint="Hosted image URL or /assets/... path">
                    <Input value={cfg.logoUrl} onChange={e => update({ logoUrl: e.target.value })} placeholder="https://…" className={`h-9 ${inputCls}`} />
                  </Field>
                  <Field label="Favicon URL">
                    <Input value={cfg.faviconUrl} onChange={e => update({ faviconUrl: e.target.value })} placeholder="https://…" className={`h-9 ${inputCls}`} />
                  </Field>
                </div>
              </div>
              <div className={sectionCls}>
                <h3 className={`text-sm font-semibold ${'text-gray-900 dark:text-white'}`}>Colours</h3>
                <p className={`text-xs ${muted}`}>These values are informational — colour changes require a code deployment.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Primary Colour">
                    <div className="flex items-center gap-3">
                      <input type="color" value={cfg.primaryColor} onChange={e => update({ primaryColor: e.target.value })} className="w-10 h-9 rounded cursor-pointer border border-gray-300 dark:border-slate-600" />
                      <Input value={cfg.primaryColor} onChange={e => update({ primaryColor: e.target.value })} className={`h-9 font-mono text-sm flex-1 ${inputCls}`} />
                    </div>
                  </Field>
                  <Field label="Accent Colour">
                    <div className="flex items-center gap-3">
                      <input type="color" value={cfg.accentColor} onChange={e => update({ accentColor: e.target.value })} className="w-10 h-9 rounded cursor-pointer border border-gray-300 dark:border-slate-600" />
                      <Input value={cfg.accentColor} onChange={e => update({ accentColor: e.target.value })} className={`h-9 font-mono text-sm flex-1 ${inputCls}`} />
                    </div>
                  </Field>
                </div>
              </div>
              <div className={sectionCls}>
                <h3 className={`text-sm font-semibold ${'text-gray-900 dark:text-white'}`}>Analytics</h3>
                <Field label="Google Analytics 4 Measurement ID" hint="Enter the Measurement ID from Google Analytics → Admin → Data streams (for example G-XXXXXXXXXX). Analytics loads only after the visitor accepts analytics cookies.">
                  <Input
                    value={cfg.googleAnalyticsId}
                    onChange={e => update({ googleAnalyticsId: e.target.value.toUpperCase().replace(/\\s/g, '') })}
                    placeholder="G-XXXXXXXXXX"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={Boolean(cfg.googleAnalyticsId && !/^G-[A-Z0-9]{4,20}$/.test(cfg.googleAnalyticsId))}
                    className={`h-9 font-mono text-sm ${inputCls}`}
                  />
                  {cfg.googleAnalyticsId ? (
                    /^G-[A-Z0-9]{4,20}$/.test(cfg.googleAnalyticsId)
                      ? <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Valid GA4 Measurement ID. Save settings to activate it.</p>
                      : <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"><AlertTriangle className="h-3.5 w-3.5" />Use a GA4 Measurement ID beginning with G-.</p>
                  ) : (
                    <p className={`mt-2 text-xs ${muted}`}>Google Analytics is currently disabled.</p>
                  )}
                </Field>
              </div>
            </TabsContent>

            {/* ── Company ── */}
            <TabsContent value="company" className="mt-4">
              <div className={sectionCls}>
                <h3 className={`text-sm font-semibold ${'text-gray-900 dark:text-white'}`}>Legal Company Information</h3>
                <p className={`text-xs ${muted}`}>
                  Used only where the registered legal entity name is required — Terms &amp; Conditions, Privacy Policy, Cookie Policy, contracts, invoices, and compliance documents.
                  For the public-facing brand name, see the <strong>Branding</strong> tab.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label='Registered Legal Name' hint='Include "Ltd" here — e.g. "JA Group Services Ltd"'>
                    <Input value={cfg.companyName} onChange={e => update({ companyName: e.target.value })} className={`h-9 ${inputCls}`} />
                  </Field>
                  <Field label="Companies House Number">
                    <Input value={cfg.companyNumber} onChange={e => update({ companyNumber: e.target.value })} placeholder="12345678" className={`h-9 font-mono text-sm ${inputCls}`} />
                  </Field>
                  <Field label="VAT Number">
                    <Input value={cfg.vatNumber} onChange={e => update({ vatNumber: e.target.value })} placeholder="GB123456789" className={`h-9 font-mono text-sm ${inputCls}`} />
                  </Field>
                  <Field label="Support Email">
                    <Input value={cfg.supportEmail} onChange={e => update({ supportEmail: e.target.value })} type="email" className={`h-9 ${inputCls}`} />
                  </Field>
                  <Field label="Support Phone">
                    <Input value={cfg.supportPhone} onChange={e => update({ supportPhone: e.target.value })} type="tel" placeholder="+44 …" className={`h-9 ${inputCls}`} />
                  </Field>
                </div>
                <Field label="Registered Address">
                  <Textarea value={cfg.companyAddress} onChange={e => update({ companyAddress: e.target.value })} rows={3} className={`resize-none text-sm ${inputCls}`} />
                </Field>
              </div>
            </TabsContent>

            {/* ── Navigation ── */}
            <TabsContent value="navigation" className="mt-4">
              <div className={sectionCls}>
                <div className="flex items-center justify-between">
                  <h3 className={`text-sm font-semibold ${'text-gray-900 dark:text-white'}`}>Header Navigation Links</h3>
                  <Button onClick={addNavLink} size="sm" variant="outline"
                    className={`gap-1.5 h-8 text-xs ${'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                    <Plus className="w-3.5 h-3.5" /> Add Link
                  </Button>
                </div>
                <div className="space-y-2">
                  {cfg.navLinks.map(link => (
                    <div key={link.id} className={`flex items-center gap-3 p-3 rounded-lg border ${'bg-gray-50 border-gray-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                      <GripVertical className={`w-4 h-4 shrink-0 ${muted}`} />
                      <Input value={link.label} onChange={e => updateNavLink(link.id, { label: e.target.value })}
                        placeholder="Label" className={`h-8 text-sm flex-1 ${inputCls}`} />
                      <Input value={link.href} onChange={e => updateNavLink(link.id, { href: e.target.value })}
                        placeholder="/path or https://…" className={`h-8 text-sm flex-1 font-mono ${inputCls}`} />
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input type="checkbox" id={`nav-newtab-${link.id}`} checked={link.openNewTab}
                          onChange={e => updateNavLink(link.id, { openNewTab: e.target.checked })}
                          className="w-3.5 h-3.5 accent-primary" />
                        <label htmlFor={`nav-newtab-${link.id}`} className={`text-[11px] ${muted}`}>New tab</label>
                      </div>
                      <button onClick={() => removeNavLink(link.id)}
                        className={`p-1 rounded transition-colors shrink-0 ${'text-gray-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400'}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {cfg.navLinks.length === 0 && (
                    <p className={`text-sm text-center py-6 ${muted}`}>No navigation links configured.</p>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ── Footer ── */}
            <TabsContent value="footer" className="mt-4">
              <div className={sectionCls}>
                <div className="flex items-center justify-between">
                  <h3 className={`text-sm font-semibold ${'text-gray-900 dark:text-white'}`}>Footer Links</h3>
                  <Button onClick={addFooterLink} size="sm" variant="outline"
                    className={`gap-1.5 h-8 text-xs ${'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                    <Plus className="w-3.5 h-3.5" /> Add Link
                  </Button>
                </div>
                <div className="space-y-2">
                  {cfg.footerLinks.map(link => (
                    <div key={link.id} className={`flex items-center gap-3 p-3 rounded-lg border ${'bg-gray-50 border-gray-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                      <GripVertical className={`w-4 h-4 shrink-0 ${muted}`} />
                      <Input value={link.label} onChange={e => updateFooterLink(link.id, { label: e.target.value })}
                        placeholder="Label" className={`h-8 text-sm flex-1 ${inputCls}`} />
                      <Input value={link.href} onChange={e => updateFooterLink(link.id, { href: e.target.value })}
                        placeholder="/path" className={`h-8 text-sm flex-1 font-mono ${inputCls}`} />
                      <Input value={link.group} onChange={e => updateFooterLink(link.id, { group: e.target.value })}
                        placeholder="Group" className={`h-8 text-sm w-28 ${inputCls}`} />
                      <button onClick={() => removeFooterLink(link.id)}
                        className={`p-1 rounded transition-colors shrink-0 ${'text-gray-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400'}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {cfg.footerLinks.length === 0 && (
                    <p className={`text-sm text-center py-6 ${muted}`}>No footer links configured.</p>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ── Features ── */}
            <TabsContent value="features" className="mt-4 space-y-4">
              <div className={`${sectionCls} divide-y ${divider}`}>
                <h3 className={`text-sm font-semibold pb-3 ${'text-gray-900 dark:text-white'}`}>Feature Flags</h3>
                <div className="py-4">
                  <Toggle checked={cfg.registrationEnabled} onChange={v => update({ registrationEnabled: v })}
                    label="User Registration" description="Allow new users to create accounts" />
                </div>
                <div className="py-4">
                  <Toggle checked={cfg.freeTrialEnabled} onChange={v => update({ freeTrialEnabled: v })}
                    label="Free Plan" description="Allow users to sign up on the free plan" />
                </div>
                <div className="py-4">
                  <Toggle checked={cfg.affiliateComingSoon} onChange={v => update({ affiliateComingSoon: v })}
                    label="Affiliate Programme — Coming Soon"
                    description="When enabled, the affiliate page shows a 'Coming Soon' banner and disables the application form" />
                </div>
                <div className="py-4">
                  <Toggle checked={cfg.cookieBannerEnabled} onChange={v => update({ cookieBannerEnabled: v })}
                    label="Cookie Banner" description="Show GDPR cookie consent banner to new visitors" />
                </div>
              </div>
              <div className={`${sectionCls} divide-y ${divider}`}>
                <h3 className={`text-sm font-semibold pb-3 ${'text-gray-900 dark:text-white'}`}>Maintenance Mode</h3>
                <div className="py-4">
                  <Toggle checked={cfg.siteStatus === 'maintenance'} onChange={v => update({ maintenanceMode: v, siteStatus: v ? 'maintenance' : 'normal' })}
                    label="Enable Maintenance Mode"
                    description="Displays a maintenance page to all non-admin visitors. Use with caution." />
                </div>
                {cfg.maintenanceMode && (
                  <div className="pt-4">
                    <Field label="Maintenance Message">
                      <Textarea value={cfg.maintenanceMessage} onChange={e => update({ maintenanceMessage: e.target.value })}
                        rows={3} className={`resize-none text-sm ${inputCls}`} />
                    </Field>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Accessibility ── */}
            <TabsContent value="accessibility" className="mt-4 space-y-4">
              {a11ySaved && (
                <div className={`flex items-center gap-2 text-sm rounded-lg px-4 py-2.5 border
                  ${a11ySaved.includes('Failed')
                    ? ('text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-700/40')
                    : ('text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-700/40')
                  }`}>
                  <CheckCircle2 className="w-4 h-4" /> {a11ySaved}
                </div>
              )}

              <div className={`${sectionCls} divide-y ${divider}`}>
                <div className="flex items-center justify-between pb-3">
                  <h3 className={`text-sm font-semibold ${'text-gray-900 dark:text-white'}`}>Accessibility Widget</h3>
                  <Button onClick={handleSaveA11y} disabled={a11ySaving} className="bg-primary hover:bg-primary/90 text-white gap-1.5 h-9">
                    <Save className="w-3.5 h-3.5" /> {a11ySaving ? 'Saving…' : 'Save Accessibility'}
                  </Button>
                </div>

                <div className="py-4">
                  <Toggle checked={a11y.enabled} onChange={v => updateA11y({ enabled: v })}
                    label="Enable Accessibility Bubble"
                    description="Show the floating accessibility widget on all public pages" />
                </div>

                {a11y.enabled && (
                  <>
                    <div className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className={`text-sm font-medium ${'text-gray-900 dark:text-white'}`}>Widget Position</p>
                          <p className={`text-xs mt-0.5 ${muted}`}>Where the bubble appears on the screen</p>
                        </div>
                        <div className="flex gap-2">
                          {(['bottom-right', 'bottom-left'] as const).map(pos => (
                            <button key={pos} onClick={() => updateA11y({ position: pos })}
                              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors
                                ${a11y.position === pos
                                  ? 'bg-primary text-white border-primary'
                                  : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                                }`}>
                              {pos === 'bottom-right' ? 'Bottom Right' : 'Bottom Left'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="py-3">
                      <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${muted}`}>Enabled Features</p>
                      <div className="space-y-3">
                        <Toggle checked={a11y.featFontSize}  onChange={v => updateA11y({ featFontSize: v })}  label="Text Size Adjustment" description="Allow users to increase or decrease text size" />
                        <Toggle checked={a11y.featContrast}  onChange={v => updateA11y({ featContrast: v })}  label="High Contrast Mode" description="Increase colour contrast for better readability" />
                        <Toggle checked={a11y.featMotion}    onChange={v => updateA11y({ featMotion: v })}    label="Reduce Motion" description="Disable animations and transitions" />
                        <Toggle checked={a11y.featDyslexia}  onChange={v => updateA11y({ featDyslexia: v })}  label="Dyslexia-Friendly Font" description="Switch to a more readable font for dyslexic users" />
                        <Toggle checked={a11y.featLinks}     onChange={v => updateA11y({ featLinks: v })}     label="Underline All Links" description="Make all hyperlinks visually distinct" />
                        <Toggle checked={a11y.featGrayscale} onChange={v => updateA11y({ featGrayscale: v })} label="Grayscale Mode" description="Remove all colour from the page" />
                      </div>
                    </div>

                    {/* Live preview */}
                    <div className="pt-4">
                      <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${muted}`}>Widget Preview</p>
                      <div className={`relative rounded-xl border overflow-hidden ${'bg-gray-50 border-gray-200 dark:bg-slate-800 dark:border-slate-700'}`}
                        style={{ height: 180 }}>
                        <div className={`absolute inset-0 flex items-center justify-center ${muted} text-sm`}>
                          Public page content area
                        </div>
                        {/* Simulated bubble */}
                        <div className={`absolute ${a11y.position === 'bottom-right' ? 'bottom-4 right-4' : 'bottom-4 left-4'}`}>
                          <div className="w-10 h-10 rounded-full bg-white border-2 border-primary flex items-center justify-center shadow-lg">
                            <Accessibility className="w-4 h-4 text-primary" />
                          </div>
                        </div>
                        {/* Simulated support chat */}
                        <div className={`absolute bottom-4 ${a11y.position === 'bottom-right' ? 'right-4' : 'right-4'}`}
                          style={{ bottom: a11y.position === 'bottom-right' ? 64 : 16, right: a11y.position === 'bottom-right' ? 16 : undefined, left: a11y.position === 'bottom-left' ? 16 : undefined }}>
                        </div>
                      </div>
                      <p className={`text-[11px] mt-2 ${muted}`}>
                        The widget stacks above the support chat bubble when both are enabled.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </TabsContent>

          </Tabs>
        </div>
      </AdminLayout>
    </>
  );
}
