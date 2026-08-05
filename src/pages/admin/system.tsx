import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdmin } from '@/lib/admin-context';
import { useFeatureConfig } from '@/lib/feature-config-context';
import {
  Settings, Mail, Shield, ToggleLeft, AlertTriangle,
  Save, RefreshCw, Palette, CheckCircle2, CreditCard, XCircle,
  ExternalLink, AlertCircle,
} from 'lucide-react';

interface FeatureToggle {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  role?: string;
}

const DEFAULT_TOGGLES: FeatureToggle[] = [
  { id: 'registration',     label: 'User Registration',          description: 'Allow new users to register on the platform',                enabled: true },
  { id: 'payments',         label: 'Payments & Billing',         description: 'Enable Stripe payments and billing. When OFF, all billing pages show "Coming Soon" and no charges are made.',  enabled: false, role: 'PlatformOwner' },
  { id: 'pdf_export',       label: 'PDF Export',                 description: 'Enable PDF document export for all users',                   enabled: true },
  { id: 'word_export',      label: 'Word Export',                description: 'Enable Word (RTF) document export',                          enabled: true },
  { id: 'new_templates',    label: 'New Template Notifications', description: 'Notify users when new templates are added',                  enabled: true },
  { id: 'usage_analytics',  label: 'Usage Analytics',            description: 'Collect anonymised usage data for platform improvement',     enabled: true },
  { id: 'maintenance',      label: 'Maintenance Mode',           description: 'Take the platform offline for maintenance',                  enabled: false, role: 'PlatformOwner' },
  { id: 'debug_mode',       label: 'Debug Mode',                 description: 'Enable verbose error logging',                               enabled: false, role: 'PlatformOwner' },
];

const DEFAULT_GENERAL: Record<string, string> = {
  platform_name:  'Sousa Murray Planeia',
  platform_url:   'https://planyx.com',
  support_email:  'contact@jagroupservices.co.uk',
  company_name:   'JA Group Services',
  timezone:       'Europe/London',
  currency:       'GBP (£)',
};

const DEFAULT_EMAIL: Record<string, string> = {
  smtp_host:   'smtp.planyx.com',
  smtp_port:   '587',
  smtp_user:   'noreply@planyx.com',
  from_name:   'Sousa Murray Planeia',
  from_email:  'noreply@planyx.com',
};

const DEFAULT_SECURITY: Record<string, string> = {
  session_timeout:       '60',
  max_login_attempts:    '5',
  lockout_duration:      '30',
  password_min_length:   '8',
  admin_session_timeout: '30',
};

const DEFAULT_BRANDING: Record<string, string> = {
  brand_name:      'Sousa Murray Planeia',
  brand_tagline:   'Professional Document Creation',
  primary_color:   '#1B4F8A',
  secondary_color: '#1e1b8a',
};

const STRIPE_PRICE_SLOTS = [
  { key: 'personal',     configKey: 'stripe_price_personal_override',     label: 'Explore Plan' },
  { key: 'standard',     configKey: 'stripe_price_standard_override',     label: 'Plan Plan' },
  { key: 'professional', configKey: 'stripe_price_professional_override', label: 'Complete Plan' },
  { key: 'org_starter',  configKey: 'stripe_price_org_starter_override',  label: 'Together Plan' },
] as const;

const DEFAULT_STRIPE_PRICES: Record<string, string> = {
  stripe_price_personal_override: 'price_1TtxPrDZzb3r6Q3cIViE64O4',
  stripe_price_standard_override: 'price_1TtxPyDZzb3r6Q3cg9hcgXeA',
  stripe_price_professional_override: 'price_1TtxQ5DZzb3r6Q3c0XxvHRDY',
  stripe_price_org_starter_override: 'price_1TtxQDDZzb3r6Q3cI8rCEJwJ',
};

type StripePriceKey = typeof STRIPE_PRICE_SLOTS[number]['key'];

interface PriceVerifyResult {
  set: boolean;
  valid: boolean;
  label: string;
  id?: string;
  product?: string;
  amount?: number;
  currency?: string;
  interval?: string;
  active?: boolean;
  error?: string;
}

// Plan limits defaults — match plan-config.ts
const DEFAULT_PLAN_LIMITS: Record<string, string> = {
  // Draft limits
  limit_drafts_free:             '0',
  limit_drafts_personal:         '3',
  limit_drafts_standard:         '5',
  limit_drafts_professional:     '10',
  limit_drafts_org_starter:      '10',
  // Retention days (0 = no saving)
  retention_days_personal:         '14',
  retention_days_standard:         '14',
  retention_days_professional:     '30',
  retention_days_org_starter:      '30',
  credit_limit_personal: '350000', five_hour_limit_personal: '150000',
  credit_limit_standard: '750000', five_hour_limit_standard: '300000',
  credit_limit_professional: '1500000', five_hour_limit_professional: '600000',
  credit_limit_org_starter: 'unlimited', five_hour_limit_org_starter: 'unlimited',
};

function adminHeaders(): Record<string, string> {
  const token = localStorage.getItem('admin_session_token');
  return token
    ? { 'x-admin-token': token, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export default function AdminSystem() {
  const { admin } = useAdmin();
  const { refresh: refreshFeatureConfig } = useFeatureConfig();
  const [toggles, setToggles]           = useState<FeatureToggle[]>(DEFAULT_TOGGLES);
  const [general, setGeneral]           = useState<Record<string, string>>(DEFAULT_GENERAL);
  const [email, setEmail]               = useState<Record<string, string>>(DEFAULT_EMAIL);
  const [security, setSecurity]         = useState<Record<string, string>>(DEFAULT_SECURITY);
  const [branding, setBranding]         = useState<Record<string, string>>(DEFAULT_BRANDING);
  const [planLimits, setPlanLimits]     = useState<Record<string, string>>(DEFAULT_PLAN_LIMITS);
  const [stripePrices, setStripePrices] = useState<Record<string, string>>(DEFAULT_STRIPE_PRICES);
  const [stripeStatus, setStripeStatus] = useState<Record<string, unknown> | null>(null);
  const [stripeVerifying, setStripeVerifying] = useState(false);
  const [verifyResults, setVerifyResults]     = useState<Record<string, PriceVerifyResult> | null>(null);
  const [savedTab, setSavedTab]         = useState<string | null>(null);
  const [errorTab, setErrorTab]         = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system-config', {
        headers: adminHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      if (!data.success) return;
      const cfg: Record<string, string> = data.config;

      // Merge DB values over defaults
      setGeneral(prev => ({ ...prev, ...Object.fromEntries(Object.keys(DEFAULT_GENERAL).filter(k => cfg[k]).map(k => [k, cfg[k]])) }));
      setEmail(prev => ({ ...prev, ...Object.fromEntries(Object.keys(DEFAULT_EMAIL).filter(k => cfg[k]).map(k => [k, cfg[k]])) }));
      setSecurity(prev => ({ ...prev, ...Object.fromEntries(Object.keys(DEFAULT_SECURITY).filter(k => cfg[k]).map(k => [k, cfg[k]])) }));
      setBranding(prev => ({ ...prev, ...Object.fromEntries(Object.keys(DEFAULT_BRANDING).filter(k => cfg[k]).map(k => [k, cfg[k]])) }));
      setPlanLimits(prev => ({ ...prev, ...Object.fromEntries(Object.keys(DEFAULT_PLAN_LIMITS).filter(k => cfg[k]).map(k => [k, cfg[k]])) }));

      // Stripe price overrides — load any that are set in DB
      const stripeOverrides: Record<string, string> = {};
      for (const slot of STRIPE_PRICE_SLOTS) {
        if (cfg[slot.configKey]) stripeOverrides[slot.configKey] = cfg[slot.configKey];
      }
      setStripePrices({ ...DEFAULT_STRIPE_PRICES, ...stripeOverrides });

      // Toggles
      setToggles(prev => prev.map(t => ({
        ...t,
        enabled: cfg[`toggle_${t.id}`] !== undefined ? cfg[`toggle_${t.id}`] === 'true' : t.enabled,
      })));
    } catch (e) {
      console.error('system-config.load', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(tab: string, config: Record<string, string>) {
    try {
      const res = await fetch('/api/admin/system-config', {
        method: 'POST',
        headers: adminHeaders(),
        credentials: 'include',
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (data.success) {
        setSavedTab(tab);
        setErrorTab(null);
        setTimeout(() => setSavedTab(null), 2500);
        // Refresh public feature config so the whole app picks up changes
        await refreshFeatureConfig();
      } else {
        setErrorTab(tab);
        setTimeout(() => setErrorTab(null), 3000);
      }
    } catch (e) {
      console.error('system-config.save', e);
      setErrorTab(tab);
      setTimeout(() => setErrorTab(null), 3000);
    }
  }

  function handleToggle(id: string) {
    setToggles(prev => prev.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  }

  async function saveToggles() {
    const config: Record<string, string> = {};
    for (const t of toggles) config[`toggle_${t.id}`] = String(t.enabled);
    await save('features', config);
  }

  async function saveStripePrices() {
    await save('stripe', stripePrices);
  }

  async function verifyPrices() {
    setStripeVerifying(true);
    setVerifyResults(null);
    try {
      const res = await fetch('/api/admin/stripe/verify-prices', {
        method: 'POST',
        headers: adminHeaders(),
        credentials: 'include',
      });
      const data = await res.json() as { success: boolean; prices?: Record<string, PriceVerifyResult>; error?: string };
      if (data.success && data.prices) {
        setVerifyResults(data.prices);
      } else {
        setVerifyResults(null);
      }
    } catch {
      setVerifyResults(null);
    } finally {
      setStripeVerifying(false);
    }
  }

  async function loadStripeStatus() {
    try {
      const res = await fetch('/api/admin/stripe/status', {
        headers: adminHeaders(),
        credentials: 'include',
      });
      const data = await res.json() as { success: boolean; status?: Record<string, unknown> };
      if (data.success && data.status) setStripeStatus(data.status);
    } catch { /* non-fatal */ }
  }

  function SaveBtn({ tab, onClick }: { tab: string; onClick: () => void }) {
    const done  = savedTab === tab;
    const error = errorTab === tab;
    return (
      <Button size="sm" onClick={onClick} className={`gap-1.5 ${error ? 'bg-destructive hover:bg-destructive' : ''}`}>
        {done  ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</>
        : error ? <><XCircle className="w-3.5 h-3.5" /> Error</>
        : <><Save className="w-3.5 h-3.5" /> Save Changes</>}
      </Button>
    );
  }

  function FieldGroup({
    fields,
    values,
    onChange,
  }: {
    fields: { id: string; label: string }[];
    values: Record<string, string>;
    onChange: (id: string, val: string) => void;
  }) {
    return (
      <>
        {fields.map((f) => (
          <div key={f.id} className="grid grid-cols-3 gap-4 items-center">
            <Label htmlFor={f.id} className="text-muted-foreground text-xs">{f.label}</Label>
            <Input
              id={f.id}
              value={values[f.id] ?? ''}
              onChange={(e) => onChange(f.id, e.target.value)}
              className="col-span-2 text-sm"
            />
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>System Configuration — Admin Portal</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <AdminLayout title="System Configuration" subtitle="Platform settings, feature toggles, and global defaults">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <Tabs defaultValue="general">
            <TabsList className="bg-muted border border-border mb-5 flex-wrap h-auto gap-1 p-1">
              {[
                { value: 'general',     label: 'General',         icon: Settings },
                { value: 'plan-limits', label: 'Plan Limits',     icon: CreditCard },
                { value: 'email',       label: 'Email',           icon: Mail },
                { value: 'security',    label: 'Security',        icon: Shield },
                { value: 'features',    label: 'Feature Toggles', icon: ToggleLeft },
                { value: 'stripe',      label: 'Stripe',          icon: CreditCard },
                { value: 'branding',    label: 'Branding',        icon: Palette },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground gap-1.5 text-xs"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {/* General */}
            <TabsContent value="general">
              <Card className="bg-card border-border">
                <CardHeader className="pb-3 pt-4 px-4">
                  <h3 className="text-sm font-semibold text-foreground">Platform Settings</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Core platform identity and contact information. Saved to the database.</p>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-4">
                  <FieldGroup
                    fields={[
                      { id: 'platform_name', label: 'Platform Name' },
                      { id: 'platform_url',  label: 'Platform URL' },
                      { id: 'support_email', label: 'Support Email' },
                      { id: 'company_name',  label: 'Operating Company' },
                      { id: 'timezone',      label: 'Platform Timezone' },
                      { id: 'currency',      label: 'Default Currency' },
                    ]}
                    values={general}
                    onChange={(id, val) => setGeneral(prev => ({ ...prev, [id]: val }))}
                  />
                  <div className="pt-3 border-t border-border flex justify-end">
                    <SaveBtn tab="general" onClick={() => save('general', general)} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Plan Limits */}
            <TabsContent value="plan-limits">
              <div className="space-y-4">
                <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground">
                    These values are stored in the database and enforced by the builder service. Invalid or missing values safely fall back to the deployed plan defaults.
                  </p>
                </div>

                {/* Draft limits */}
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3 pt-4 px-4">
                    <h3 className="text-sm font-semibold text-foreground">Draft Limits</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Maximum number of saved drafts per plan. 0 = no saving allowed.</p>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-4">
                    <FieldGroup
                      fields={[
                        { id: 'limit_drafts_free',             label: 'Free (max drafts)' },
                        { id: 'limit_drafts_personal',         label: 'Explore Plan (max drafts)' },
                        { id: 'limit_drafts_standard',         label: 'Plan Plan (max drafts)' },
                        { id: 'limit_drafts_professional',     label: 'Complete Plan (max drafts)' },
                        { id: 'limit_drafts_org_starter',      label: 'Together Plan (max drafts)' },
                      ]}
                      values={planLimits}
                      onChange={(id, val) => setPlanLimits(prev => ({ ...prev, [id]: val }))}
                    />
                  </CardContent>
                </Card>

                {/* Retention periods */}
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3 pt-4 px-4">
                    <h3 className="text-sm font-semibold text-foreground">Draft Retention Periods</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Days before a draft is automatically and permanently deleted. Maximum: 30 days.</p>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-4">
                    <FieldGroup
                      fields={[
                        { id: 'retention_days_personal',         label: 'Explore Plan (days)' },
                        { id: 'retention_days_standard',         label: 'Plan Plan (days)' },
                        { id: 'retention_days_professional',     label: 'Complete Plan (days)' },
                        { id: 'retention_days_org_starter',      label: 'Together Plan (days)' },
                      ]}
                      values={planLimits}
                      onChange={(id, val) => setPlanLimits(prev => ({ ...prev, [id]: val }))}
                    />
                  </CardContent>
                </Card>

                {/* Credit allowances */}
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3 pt-4 px-4">
                    <h3 className="text-sm font-semibold text-foreground">Billing-period Credit Allowances</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Credits available per Stripe billing period. Use “unlimited” only for Together Plan.</p>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-4">
                    <FieldGroup
                      fields={[
                        { id: 'credit_limit_personal', label: 'Explore Plan credits' },
                        { id: 'credit_limit_standard', label: 'Plan Plan credits' },
                        { id: 'credit_limit_professional', label: 'Complete Plan credits' },
                        { id: 'credit_limit_org_starter', label: 'Together Plan credits' },
                      ]}
                      values={planLimits}
                      onChange={(id, val) => setPlanLimits(prev => ({ ...prev, [id]: val }))}
                    />
                  </CardContent>
                </Card>

                {/* Rolling limits */}
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3 pt-4 px-4">
                    <h3 className="text-sm font-semibold text-foreground">Rolling Five-hour Credit Limits</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Maximum usage during any rolling five-hour window.</p>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-4">
                    <FieldGroup
                      fields={[
                        { id: 'five_hour_limit_personal', label: 'Explore Plan / 5 hours' },
                        { id: 'five_hour_limit_standard', label: 'Plan Plan / 5 hours' },
                        { id: 'five_hour_limit_professional', label: 'Complete Plan / 5 hours' },
                        { id: 'five_hour_limit_org_starter', label: 'Together Plan / 5 hours' },
                      ]}
                      values={planLimits}
                      onChange={(id, val) => setPlanLimits(prev => ({ ...prev, [id]: val }))}
                    />
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <SaveBtn tab="plan-limits" onClick={() => save('plan-limits', planLimits)} />
                </div>
              </div>
            </TabsContent>

            {/* Email */}
            <TabsContent value="email">              <Card className="bg-card border-border">
                <CardHeader className="pb-3 pt-4 px-4">
                  <h3 className="text-sm font-semibold text-foreground">Email Configuration</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">SMTP settings for transactional email delivery.</p>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-4">
                  <FieldGroup
                    fields={[
                      { id: 'smtp_host',  label: 'SMTP Host' },
                      { id: 'smtp_port',  label: 'SMTP Port' },
                      { id: 'smtp_user',  label: 'SMTP Username' },
                      { id: 'from_name',  label: 'From Name' },
                      { id: 'from_email', label: 'From Email' },
                    ]}
                    values={email}
                    onChange={(id, val) => setEmail(prev => ({ ...prev, [id]: val }))}
                  />
                  <div className="pt-3 border-t border-border flex justify-between">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Mail className="w-3.5 h-3.5" /> Send Test Email
                    </Button>
                    <SaveBtn tab="email" onClick={() => save('email', email)} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security */}
            <TabsContent value="security">
              <Card className="bg-card border-border">
                <CardHeader className="pb-3 pt-4 px-4">
                  <h3 className="text-sm font-semibold text-foreground">Security Settings</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Session timeouts, login limits, and password policy.</p>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-4">
                  <FieldGroup
                    fields={[
                      { id: 'session_timeout',       label: 'Session Timeout (minutes)' },
                      { id: 'max_login_attempts',    label: 'Max Login Attempts' },
                      { id: 'lockout_duration',      label: 'Lockout Duration (minutes)' },
                      { id: 'password_min_length',   label: 'Min Password Length' },
                      { id: 'admin_session_timeout', label: 'Admin Session Timeout (minutes)' },
                    ]}
                    values={security}
                    onChange={(id, val) => setSecurity(prev => ({ ...prev, [id]: val }))}
                  />
                  <div className="pt-3 border-t border-border flex justify-end">
                    <SaveBtn tab="security" onClick={() => save('security', security)} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Feature toggles */}
            <TabsContent value="features">
              <Card className="bg-card border-border">
                <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Feature Toggles</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Enable or disable platform features. Changes are saved to the database and take effect immediately across the whole platform.</p>
                  </div>
                  <SaveBtn tab="features" onClick={saveToggles} />
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-1">
                  {toggles.map((toggle) => {
                    // Role-gate: PlatformOwner-restricted toggles require PlatformOwner or SystemAdministrator
                    const adminRoles: string[] = admin?.roles ?? [];
                    const isRestricted = toggle.role === 'PlatformOwner';
                    const canEdit = !isRestricted
                      || admin?.isSystemAdministrator === true
                      || adminRoles.includes('PlatformOwner')
                      || adminRoles.includes('SystemAdministrator')
                      || adminRoles.length === 0; // no roles configured → full access
                    return (
                      <div key={toggle.id} className={`flex items-center justify-between py-3 border-b border-border/50 last:border-0 ${!canEdit ? 'opacity-50' : ''}`}>
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm text-foreground font-medium">{toggle.label}</p>
                            {toggle.role && (
                              <Badge variant="outline" className="text-[9px] text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30">
                                {toggle.role === 'PlatformOwner' ? 'Platform Owner+' : toggle.role}
                              </Badge>
                            )}
                            {toggle.enabled ? (
                              <Badge variant="outline" className="text-[9px] text-green-700 dark:text-green-400 border-green-300 dark:border-green-800/40 bg-green-50 dark:bg-green-950/30">
                                ON
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] text-muted-foreground">
                                OFF
                              </Badge>
                            )}
                            {toggle.id === 'maintenance' && toggle.enabled && (
                              <Badge variant="outline" className="text-[9px] text-red-700 dark:text-red-400 border-red-300 dark:border-red-800/40 bg-red-50 dark:bg-red-950/30 animate-pulse">
                                ACTIVE — USERS BLOCKED
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{toggle.description}</p>
                          {!canEdit && (
                            <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">Requires Platform Owner or System Administrator role</p>
                          )}
                        </div>
                        <Switch
                          checked={toggle.enabled}
                          onCheckedChange={() => canEdit && handleToggle(toggle.id)}
                          disabled={!canEdit}
                          className="shrink-0"
                        />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {toggles.find((t) => t.id === 'maintenance')?.enabled && (
                <div className="mt-4 flex items-start gap-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">Maintenance Mode is Active</p>
                    <p className="text-xs text-muted-foreground mt-0.5">The platform is currently offline for normal users. All API calls return 503. Admin portal remains accessible. Disable maintenance mode to restore user access.</p>
                  </div>
                </div>
              )}
              {!toggles.find((t) => t.id === 'payments')?.enabled && (
                <div className="mt-4 flex items-start gap-3 bg-muted/50 border border-border rounded-xl px-4 py-3">
                  <CreditCard className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Payments are currently OFF</p>
                    <p className="text-xs text-muted-foreground mt-0.5">All billing and subscription pages show "Coming Soon" to customers. No Stripe charges will be made. Enable the Payments toggle above when you are ready to accept payments.</p>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Stripe */}
            <TabsContent value="stripe">
              <div className="space-y-4">
                {/* Info banner */}
                <div className="flex items-start gap-3 bg-muted border border-border rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="text-xs text-foreground">
                    <strong>Price ID overrides</strong> — Enter a Stripe Price ID here to override the value set in Secrets. Leave blank to use the Secret value.
                    Price IDs look like <code className="bg-muted-foreground/10 px-1 rounded font-mono">price_1ABC...</code>.
                    Find them in your{' '}
                    <a href="https://dashboard.stripe.com/prices" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline inline-flex items-center gap-0.5">
                      Stripe Dashboard <ExternalLink className="w-3 h-3" />
                    </a>.
                  </div>
                </div>

                {/* Price ID overrides */}
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Stripe Price IDs</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        DB overrides take priority over Secrets. Use this to update price IDs without redeploying.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => { loadStripeStatus(); verifyPrices(); }}
                        disabled={stripeVerifying}
                      >
                        {stripeVerifying
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Verify All
                      </Button>
                      <SaveBtn tab="stripe" onClick={saveStripePrices} />
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    {STRIPE_PRICE_SLOTS.map(slot => {
                      const result = verifyResults?.[slot.key];
                      return (
                        <div key={slot.key} className="space-y-1">
                          <div className="grid grid-cols-3 gap-4 items-center">
                            <Label htmlFor={slot.configKey} className="text-muted-foreground text-xs">
                              {slot.label}
                            </Label>
                            <div className="col-span-2 flex items-center gap-2">
                              <Input
                                id={slot.configKey}
                                value={stripePrices[slot.configKey] ?? ''}
                                onChange={e => setStripePrices(prev => ({ ...prev, [slot.configKey]: e.target.value }))}
                                placeholder="price_... (leave blank to use Secret)"
                                className="text-sm font-mono h-8 flex-1"
                              />
                              {result && (
                                result.valid
                                  ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                                  : <XCircle className="w-4 h-4 text-destructive shrink-0" />
                              )}
                            </div>
                          </div>
                          {result && (
                            <div className="ml-[calc(33.333%+1rem)] text-[10px]">
                              {result.valid ? (
                                <span className="text-green-600 dark:text-green-400">
                                  ✓ {result.product} · {result.currency} {result.amount != null ? (result.amount / 100).toFixed(2) : '?'}/{result.interval}
                                  {result.active === false && <span className="text-amber-600 ml-1">(inactive)</span>}
                                </span>
                              ) : (
                                <span className="text-destructive">✗ {result.error ?? 'Invalid price ID'}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Stripe connection status */}
                {stripeStatus && (() => {
                  const st = stripeStatus as {
                    stripeConnected: boolean;
                    isLiveMode: boolean;
                    lastError: string | null;
                    subscriptionStats: Record<string, number> | null;
                  };
                  return (
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <h3 className="text-sm font-semibold text-foreground">Connection Status</h3>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        {st.stripeConnected
                          ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                          : <XCircle className="w-4 h-4 text-destructive" />}
                        <span className="text-foreground font-medium">
                          {st.stripeConnected ? 'Connected to Stripe' : 'Not connected'}
                        </span>
                        {st.isLiveMode
                          ? <Badge variant="outline" className="text-[9px] text-green-700 dark:text-green-400 border-green-300 dark:border-green-800/40 bg-green-50 dark:bg-green-950/30">LIVE</Badge>
                          : <Badge variant="outline" className="text-[9px] text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30">TEST</Badge>}
                      </div>
                      {st.lastError && (
                        <p className="text-xs text-destructive">{st.lastError}</p>
                      )}
                      {st.subscriptionStats && (
                        <div className="flex gap-4 text-xs text-muted-foreground pt-1">
                          {Object.entries(st.subscriptionStats).map(([k, v]) => (
                            <span key={k}><strong className="text-foreground">{v}</strong> {k}</span>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  );
                })()}

                {!stripeStatus && (
                  <div className="text-center py-4">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={loadStripeStatus}>
                      <RefreshCw className="w-3.5 h-3.5" /> Load Connection Status
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Branding */}
            <TabsContent value="branding">
              <Card className="bg-card border-border">
                <CardHeader className="pb-3 pt-4 px-4">
                  <h3 className="text-sm font-semibold text-foreground">Platform Branding</h3>
                  <p className="text-xs text-muted-foreground mt-1">These settings control the platform's own branding. Separate from user document branding.</p>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-4">
                  <FieldGroup
                    fields={[
                      { id: 'brand_name',      label: 'Brand Name' },
                      { id: 'brand_tagline',   label: 'Tagline' },
                      { id: 'primary_color',   label: 'Primary Colour' },
                      { id: 'secondary_color', label: 'Secondary Colour' },
                    ]}
                    values={branding}
                    onChange={(id, val) => setBranding(prev => ({ ...prev, [id]: val }))}
                  />
                  {/* Colour preview */}
                  <div className="flex gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-lg border border-slate-600"
                        style={{ background: branding.primary_color }}
                      />
                      <span className="text-xs text-muted-foreground">Primary</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-lg border border-slate-600"
                        style={{ background: branding.secondary_color }}
                      />
                      <span className="text-xs text-muted-foreground">Secondary</span>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-border flex justify-end">
                    <SaveBtn tab="branding" onClick={() => save('branding', branding)} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </AdminLayout>
    </>
  );
}
