import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle,
  CheckCircle2,
  Globe2,
  ImageIcon,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Save,
  Sun,
  Upload,
} from 'lucide-react';
import {
  applyBrowserBranding,
  defaultBrowserBranding,
  getCachedBrowserBranding,
  normaliseBrowserBranding,
} from '@/lib/browser-branding';
import { useAdminTheme, type AdminTheme } from '@/lib/admin-theme-context';

interface BrandingForm {
  browserTabName: string;
  adminTabName: string;
  faviconUrl: string;
}

const MAX_FAVICON_BYTES = 256 * 1024;
const FAVICON_TYPES = new Set([
  'image/png',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/svg+xml',
]);

async function getSettings(): Promise<Record<string, string>> {
  const response = await fetch('/api/admin/site-settings', { credentials: 'include' });
  const data = await response.json().catch(() => ({})) as {
    success?: boolean;
    settings?: Record<string, string>;
    error?: string;
  };
  if (!response.ok || !data.success) throw new Error(data.error || 'Branding settings could not be loaded.');
  return data.settings || {};
}

async function saveSettings(settings: Record<string, string>): Promise<void> {
  const response = await fetch('/api/admin/site-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ settings }),
  });
  const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
  if (!response.ok || !data.success) throw new Error(data.error || 'Branding settings could not be saved.');
}

function readFavicon(file: File): Promise<string> {
  if (!FAVICON_TYPES.has(file.type)) {
    return Promise.reject(new Error('Use a PNG, WebP, ICO or SVG favicon file.'));
  }
  if (file.size > MAX_FAVICON_BYTES) {
    return Promise.reject(new Error('The favicon must be 256 KB or smaller.'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('The favicon file could not be read.'));
    reader.readAsDataURL(file);
  });
}

const themeOptions: Array<{ value: AdminTheme; label: string; description: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', description: 'White portal canvas and light controls.', icon: Sun },
  { value: 'dark', label: 'Dark', description: 'Dark sidebar, header, pages, cards, tables and forms.', icon: Moon },
  { value: 'system', label: 'System', description: 'Follow this device’s appearance preference.', icon: Monitor },
];

export default function AdminBrandingPage() {
  const cached = getCachedBrowserBranding();
  const { theme, resolvedTheme, setTheme } = useAdminTheme();
  const [form, setForm] = useState<BrandingForm>(cached);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getSettings()
      .then(settings => {
        if (!active) return;
        const next = normaliseBrowserBranding({
          browserTabName: settings.browser_tab_name,
          adminTabName: settings.admin_tab_name,
          faviconUrl: settings.favicon_url,
        });
        setForm(next);
        applyBrowserBranding(next);
      })
      .catch(reason => {
        if (active) setError(reason instanceof Error ? reason.message : 'Branding settings could not be loaded.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const previewTitle = useMemo(() => form.browserTabName.trim() || defaultBrowserBranding.browserTabName, [form.browserTabName]);

  function update<K extends keyof BrandingForm>(key: K, value: BrandingForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
    setMessage('');
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      const faviconUrl = await readFavicon(file);
      update('faviconUrl', faviconUrl);
      applyBrowserBranding({ ...form, faviconUrl });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The favicon could not be used.');
    }
  }

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const branding = normaliseBrowserBranding(form);
      await saveSettings({
        browser_tab_name: branding.browserTabName,
        admin_tab_name: branding.adminTabName,
        favicon_url: branding.faviconUrl,
        admin_theme_mode: theme,
      });
      setForm(branding);
      applyBrowserBranding(branding);
      setMessage('Browser branding and Admin appearance have been saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The settings could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  function resetBranding() {
    const defaults = { ...defaultBrowserBranding };
    setForm(defaults);
    applyBrowserBranding(defaults);
    setMessage('Default values restored locally. Select Save changes to publish them.');
    setError('');
  }

  return (
    <AdminLayout title="Branding & Appearance">
      <div className="mx-auto w-full max-w-6xl space-y-6 pb-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-500/20">
              <Palette className="h-5 w-5 text-blue-700 dark:text-blue-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Branding & Appearance</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Control browser-tab branding and the complete Admin Portal appearance.</p>
            </div>
          </div>
          <Button onClick={() => void save()} disabled={loading || saving}>
            <Save className="mr-2 h-4 w-4" />{saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>

        {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        {message && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{message}</AlertDescription></Alert>}

        <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
          <div className="space-y-6">
            <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3"><Globe2 className="h-5 w-5 text-blue-600 dark:text-blue-400" /><div><h2 className="font-semibold text-slate-950 dark:text-white">Browser tab names</h2><p className="text-sm text-slate-500 dark:text-slate-400">These labels are shown in browser tabs and window titles.</p></div></div>
              </CardHeader>
              <CardContent className="space-y-5 p-5">
                <div className="space-y-2">
                  <Label htmlFor="browser-tab-name">Public website tab name</Label>
                  <Input id="browser-tab-name" value={form.browserTabName} maxLength={90} onChange={event => update('browserTabName', event.target.value)} disabled={loading} />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Used for customer and public Sousa Murray Planeia pages.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-tab-name">Admin Portal tab name</Label>
                  <Input id="admin-tab-name" value={form.adminTabName} maxLength={90} onChange={event => update('adminTabName', event.target.value)} disabled={loading} />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Used exactly as entered for every Admin Centre browser tab.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3"><ImageIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" /><div><h2 className="font-semibold text-slate-950 dark:text-white">Browser favicon</h2><p className="text-sm text-slate-500 dark:text-slate-400">This changes only the small icon displayed in the browser tab.</p></div></div>
              </CardHeader>
              <CardContent className="space-y-5 p-5">
                <div className="space-y-2">
                  <Label htmlFor="favicon-url">Favicon URL or saved image data</Label>
                  <Input id="favicon-url" value={form.faviconUrl} onChange={event => update('faviconUrl', event.target.value)} disabled={loading} placeholder="/favicon.svg or https://…" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" asChild>
                    <label className="cursor-pointer"><Upload className="mr-2 h-4 w-4" />Upload favicon<input className="sr-only" type="file" accept=".png,.webp,.ico,.svg,image/png,image/webp,image/x-icon,image/vnd.microsoft.icon,image/svg+xml" onChange={event => void handleFile(event)} /></label>
                  </Button>
                  <Button type="button" variant="outline" onClick={resetBranding}><RotateCcw className="mr-2 h-4 w-4" />Restore defaults</Button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">PNG, WebP, ICO or SVG. Maximum file size: 256 KB. Uploading does not change any visible website logo.</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800">
                <h2 className="font-semibold text-slate-950 dark:text-white">Admin Portal appearance</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">The selected mode applies to the complete portal shell and every administration section.</p>
              </CardHeader>
              <CardContent className="grid gap-3 p-5 md:grid-cols-3">
                {themeOptions.map(option => {
                  const Icon = option.icon;
                  const selected = theme === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTheme(option.value)}
                      className={`rounded-xl border p-4 text-left transition ${selected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:bg-blue-500/15' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'}`}
                      aria-pressed={selected}
                    >
                      <Icon className={`mb-3 h-5 w-5 ${selected ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`} />
                      <p className="font-semibold text-slate-900 dark:text-white">{option.label}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{option.description}</p>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="sticky top-20 border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800"><h2 className="font-semibold text-slate-950 dark:text-white">Live preview</h2></CardHeader>
              <CardContent className="space-y-5 p-5">
                <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-100 shadow-sm dark:border-slate-600 dark:bg-slate-800">
                  <div className="flex items-center gap-2 border-b border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                      <img src={form.faviconUrl || defaultBrowserBranding.faviconUrl} alt="" className="h-4 w-4 object-contain" onError={event => { event.currentTarget.src = defaultBrowserBranding.faviconUrl; }} />
                    </div>
                    <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{previewTitle}</span>
                    <span className="ml-auto text-slate-400">×</span>
                  </div>
                  <div className="h-20 bg-slate-50 dark:bg-slate-900" />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Current Admin mode</p>
                  <p className="mt-1 text-lg font-bold capitalize text-slate-950 dark:text-white">{theme} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">({resolvedTheme})</span></p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Sidebar, top bar, page canvas, cards, tables, forms, drawers and mobile navigation all follow this mode.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
