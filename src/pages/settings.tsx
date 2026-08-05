import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/lib/auth-context';
import { useTheme, type ThemeMode } from '@/lib/theme-context';
import { useSiteSettings } from '@/lib/site-settings-context';
import { useFeatureConfig } from '@/lib/feature-config-context';
import { updateUserProfile, getDocuments } from '@/lib/document-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  CheckCircle2, User, Lock, CreditCard, Bell, Shield,
  AlertTriangle, TrendingUp, FileText, Clock,
  ArrowRight, Loader2, ExternalLink, Star, Zap, Building2,
  Sun, Moon, Monitor, Palette, Receipt, Download, XCircle,
} from 'lucide-react';

const PLAN_LIMITS: Record<string, number> = {
  free: 0, personal: 3, standard: 5, professional: 10,
  org_starter: 10, org_growth: 10, org_professional: 10,
  organisation: 10, business: 10,
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Free Plan', personal: 'Explore Plan', standard: 'Plan Plan', professional: 'Complete Plan',
  org_starter: 'Together Plan',
};

const planBadgeColors: Record<string, string> = {
  free: 'bg-muted text-muted-foreground',
  personal: 'bg-emerald-500/10 text-emerald-600',
  professional: 'bg-primary/10 text-primary',
  business: 'bg-accent/10 text-accent',
  standard: 'bg-blue-500/10 text-blue-600',
  organisation: 'bg-purple-500/10 text-purple-600',
  org_starter: 'bg-purple-500/10 text-purple-600',
  org_growth: 'bg-purple-500/10 text-purple-700',
  org_professional: 'bg-purple-500/10 text-purple-800',
};

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const { siteName, supportEmail } = useSiteSettings();
  const { config: featureConfig } = useFeatureConfig();
  const paymentsEnabled = featureConfig.payments;

  // Profile
  const [profile, setProfile] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    company: user?.company || '',
    phone: user?.phone || '', preferredLanguage: user?.preferredLanguage || '',
    officeLocation: user?.officeLocation || '', city: user?.city || '', county: user?.county || '',
    country: user?.country || '', postcode: user?.postcode || '', streetAddress: user?.streetAddress || '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password — removed (OIDC-only auth, no password management needed)

  // Notifications
  const [notifPrefs, setNotifPrefs] = useState({ emailNotifications: true, marketingEmails: false });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifMsg, setNotifMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Usage stats
  const [docCount, setDocCount] = useState<number | null>(null);
  const [draftCount, setDraftCount] = useState<number | null>(null);
  const [supportPin, setSupportPin] = useState<{ id: string; active_pin: string; expires_at: string } | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinMessage, setPinMessage] = useState('');

  async function loadSupportPin(generate = false) {
    setPinLoading(true); setPinMessage('');
    try {
      const response = await fetch('/account/api/pins', generate ? { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'generate' }) } : { headers: { Accept: 'application/json' }, credentials: 'include' });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(response.status === 401 ? 'Please sign in again to view your Support PIN.' : 'The Support PIN service returned an invalid response. Please refresh the page and try again.');
      }
      const data = await response.json() as { pins?: Array<{ id: string; active_pin: string; expires_at: string }>; id?: string; pin?: string; expiresAt?: string; error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not load your Support PIN.');
      const pin = generate ? { id: data.id || '', active_pin: data.pin || '', expires_at: data.expiresAt || '' } : data.pins?.[0];
      if (!pin?.active_pin) throw new Error('Could not display your Support PIN.');
      setSupportPin(pin);
      if (generate) setPinMessage('A new single-use Support PIN has been generated.');
    } catch (reason) { setPinMessage(reason instanceof Error ? reason.message : 'Could not load your Support PIN.'); }
    finally { setPinLoading(false); }
  }

  useEffect(() => {
    if (user) setProfile({
      firstName: user.firstName || '', lastName: user.lastName || '', company: user.company || '',
      phone: user.phone || '', preferredLanguage: user.preferredLanguage || '', officeLocation: user.officeLocation || '',
      city: user.city || '', county: user.county || '', country: user.country || '', postcode: user.postcode || '',
      streetAddress: user.streetAddress || '',
    });
  }, [user]);

  useEffect(() => {
    // Load notification preferences
    fetch('/api/user/preferences', { credentials: 'include' })
      .then(r => r.json() as Promise<{ success: boolean; preferences?: { emailNotifications: boolean; marketingEmails: boolean } }>)
      .then(d => { if (d.success && d.preferences) setNotifPrefs(d.preferences); })
      .catch(() => {});

    // Load document counts
    getDocuments().then(docs => {
      setDocCount(docs.length);
      setDraftCount(docs.filter(d => d.status === 'draft').length);
    }).catch(() => {});
  }, []);

  useEffect(() => { if (user?.email) void loadSupportPin(); }, [user?.email]);

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const saved = await updateUserProfile({
        firstName: profile.firstName, lastName: profile.lastName, company: profile.company,
        phone: profile.phone, preferredLanguage: profile.preferredLanguage, officeLocation: profile.officeLocation,
        city: profile.city, county: profile.county, country: profile.country, postcode: profile.postcode,
        streetAddress: profile.streetAddress,
      });
      if (!saved) throw new Error('Profile update was rejected.');
      await refreshUser();
      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
    } catch {
      setProfileMsg({ type: 'error', text: 'Failed to update profile. Please try again.' });
    } finally {
      setProfileSaving(false);
      setTimeout(() => setProfileMsg(null), 4000);
    }
  }

  async function handleNotifSave() {
    setNotifSaving(true);
    setNotifMsg(null);
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifPrefs),
        credentials: 'include',
      });
      const data = await res.json() as { success: boolean };
      if (data.success) {
        setNotifMsg({ type: 'success', text: 'Notification preferences saved.' });
      } else {
        setNotifMsg({ type: 'error', text: 'Failed to save preferences.' });
      }
    } catch {
      setNotifMsg({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setNotifSaving(false);
      setTimeout(() => setNotifMsg(null), 3000);
    }
  }

  const plan = user?.plan ?? 'free';
  const limit = PLAN_LIMITS[plan] ?? 5;
  const usagePct = docCount !== null ? Math.min(100, Math.round((docCount / limit) * 100)) : 0;
  const planBadgeColor = planBadgeColors[plan] ?? planBadgeColors['free'];

  return (
    <>
      <Helmet>
        <title>Settings — {siteName}</title>
      </Helmet>
      <DashboardLayout>
        <div className="p-6 max-w-3xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage your profile, security, and preferences</p>
          </div>

          <Tabs defaultValue={searchParams.get('tab') === 'security' ? 'security' : 'profile'} className="space-y-6">
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="profile" className="gap-1.5 text-xs sm:text-sm">
                <User className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Profile</span>
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-1.5 text-xs sm:text-sm">
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Security</span>
              </TabsTrigger>
              <TabsTrigger value="appearance" className="gap-1.5 text-xs sm:text-sm">
                <Palette className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Appearance</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-1.5 text-xs sm:text-sm">
                <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Notifications</span>
              </TabsTrigger>
              <TabsTrigger value="subscription" className="gap-1.5 text-xs sm:text-sm">
                <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Subscription</span>
              </TabsTrigger>
              <TabsTrigger value="billing" className="gap-1.5 text-xs sm:text-sm">
                <Receipt className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Billing</span>
              </TabsTrigger>
            </TabsList>

            {/* ── Profile Tab ── */}
            <TabsContent value="profile" className="space-y-5">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    Profile Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleProfileSave} className="space-y-4">
                    {profileMsg && (
                      <Alert className={profileMsg.type === 'success' ? 'border-green-200 bg-green-50' : 'border-destructive/30 bg-destructive/5'}>
                        {profileMsg.type === 'success'
                          ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                          : <AlertTriangle className="w-4 h-4 text-destructive" />}
                        <AlertDescription className={profileMsg.type === 'success' ? 'text-green-800' : 'text-destructive'}>
                          {profileMsg.text}
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          value={profile.firstName}
                          onChange={(e) => setProfile(p => ({ ...p, firstName: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          value={profile.lastName}
                          onChange={(e) => setProfile(p => ({ ...p, lastName: e.target.value }))}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input id="email" value={user?.email || ''} disabled className="bg-muted" />
                      <p className="text-xs text-muted-foreground">Email address cannot be changed. Contact support if you need to update it.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company">Organisation / Company Name</Label>
                      <Input
                        id="company"
                        value={profile.company}
                        onChange={(e) => setProfile(p => ({ ...p, company: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="phone">Mobile Phone</Label>
                        <Input id="phone" type="tel" value={profile.phone} onChange={(e) => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="Optional" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="preferredLanguage">Preferred Language</Label>
                        <Input id="preferredLanguage" value={profile.preferredLanguage} onChange={(e) => setProfile(p => ({ ...p, preferredLanguage: e.target.value }))} placeholder="e.g. en-GB" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="streetAddress">Street Address</Label>
                      <Input id="streetAddress" value={profile.streetAddress} onChange={(e) => setProfile(p => ({ ...p, streetAddress: e.target.value }))} placeholder="Optional" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="city">Town / City</Label>
                        <Input id="city" value={profile.city} onChange={(e) => setProfile(p => ({ ...p, city: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="county">County / Region</Label>
                        <Input id="county" value={profile.county} onChange={(e) => setProfile(p => ({ ...p, county: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="postcode">Postcode</Label>
                        <Input id="postcode" value={profile.postcode} onChange={(e) => setProfile(p => ({ ...p, postcode: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="country">Country</Label>
                        <Input id="country" value={profile.country} onChange={(e) => setProfile(p => ({ ...p, country: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="officeLocation">Office Location</Label>
                      <Input id="officeLocation" value={profile.officeLocation} onChange={(e) => setProfile(p => ({ ...p, officeLocation: e.target.value }))} placeholder="Optional" />
                      <p className="text-xs text-muted-foreground">Supported details are also synchronised to your JA Group Services ID profile in Microsoft Entra.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Account Type</Label>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">{user?.usageType ?? 'both'}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {user?.usageType === 'personal' ? 'Personal use' : user?.usageType === 'business' ? 'Business use' : 'Personal & business use'}
                        </span>
                      </div>
                    </div>
                    <Button type="submit" disabled={profileSaving}>
                      {profileSaving ? 'Saving…' : 'Save Changes'}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Usage stats */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Usage Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-2xl font-bold text-foreground">{docCount ?? '—'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Total Documents</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-2xl font-bold text-foreground">{draftCount ?? '—'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Drafts</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-2xl font-bold text-foreground">
                        {docCount !== null && draftCount !== null ? docCount - draftCount : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Completed</p>
                    </div>
                  </div>
                  {limit < 9999 && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-muted-foreground">Document limit</span>
                        <span className="text-sm font-medium text-foreground">{docCount ?? 0} / {limit}</span>
                      </div>
                      <Progress value={usagePct} className={`h-2 ${usagePct >= 80 ? '[&>div]:bg-amber-500' : ''}`} />
                      {usagePct >= 80 && (
                        <p className="text-xs text-amber-700 mt-1.5">
                          Approaching limit.{' '}
                          <Link to="/pricing" className="font-semibold underline">Upgrade your plan</Link> for more documents.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'long' }) : '—'}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Security Tab ── */}
            <TabsContent value="security" className="space-y-5">
              <Card className="border-primary/30">
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Lock className="w-4 h-4 text-primary" />Support identity PIN</CardTitle></CardHeader>
                <CardContent className="space-y-4"><p className="text-sm text-muted-foreground">If you ask the chatbot to transfer you to a human, enter this Sousa Murray Planeia Support PIN. It is visible by design, expires after 10 minutes, and can be used only once.</p><div className="rounded-xl border bg-muted/30 p-4 text-center"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your current Support PIN</p><p className="mt-2 font-mono text-3xl font-bold tracking-[0.35em] text-foreground" aria-live="polite">{pinLoading ? 'Loading…' : supportPin?.active_pin || 'Unavailable'}</p>{supportPin?.expires_at && <p className="mt-2 text-xs text-muted-foreground">Expires {new Date(supportPin.expires_at).toLocaleString('en-GB')}</p>}</div>{pinMessage && <p className="text-xs text-muted-foreground" role="status">{pinMessage}</p>}<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void loadSupportPin()} disabled={pinLoading}>Refresh</Button><Button type="button" onClick={() => void loadSupportPin(true)} disabled={pinLoading}>{pinLoading ? 'Generating…' : 'Generate new PIN'}</Button></div><p className="text-xs text-muted-foreground">Never share your Microsoft sign-in code, password, card number or CVV. Support will only request this PIN during a human-support handover.</p></CardContent>
              </Card>
              {/* OIDC auth info */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    Authentication
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
                    <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Secured with Microsoft Entra</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Your account uses enterprise-grade authentication via Microsoft. No password is stored — sign-in is handled securely by Microsoft.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">Signed-in email</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{user?.email ?? '—'}</p>
                    </div>
                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Verified</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Managed by your Microsoft account settings</p>
                    </div>
                    <Badge variant="outline" className="text-muted-foreground">Via Microsoft</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">Active Sessions</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Manage where you're signed in</p>
                    </div>
                    <Badge variant="outline" className="text-muted-foreground">Coming soon</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Danger zone */}
              <Card className="border-destructive/30">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base text-destructive flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Danger Zone
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Permanently delete your account and all associated documents. This action cannot be undone and all data will be lost.
                  </p>
                  <Button variant="destructive" size="sm" disabled>
                    Delete Account
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">Account deletion requires contacting support at <a href={`mailto:${supportEmail}`} className="underline">{supportEmail}</a>.</p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Appearance Tab ── */}
            <TabsContent value="appearance" className="space-y-5">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="w-4 h-4 text-primary" aria-hidden="true" />
                    Display Theme
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Choose how {siteName} looks to you. Your preference is saved automatically.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Theme selection">
                    {([
                      { value: 'light',  label: 'Light',          icon: Sun,     desc: 'Always use the light theme' },
                      { value: 'dark',   label: 'Dark',           icon: Moon,    desc: 'Always use the dark theme' },
                      { value: 'system', label: 'System Default', icon: Monitor, desc: 'Match your device setting' },
                    ] as { value: ThemeMode; label: string; icon: React.ElementType; desc: string }[]).map(opt => {
                      const Icon = opt.icon;
                      const selected = theme === opt.value;
                      return (
                        <button
                          key={opt.value}
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setTheme(opt.value)}
                          className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                            selected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/40 hover:bg-muted/50'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                            <Icon className="w-5 h-5" aria-hidden="true" />
                          </div>
                          <div>
                            <p className={`text-sm font-semibold ${selected ? 'text-primary' : 'text-foreground'}`}>{opt.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                          </div>
                          {selected && (
                            <CheckCircle2 className="w-4 h-4 text-primary" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your theme preference is saved to your account and will apply across all your devices when signed in.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Notifications Tab ── */}
            <TabsContent value="notifications" className="space-y-5">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bell className="w-4 h-4 text-primary" />
                    Notification Preferences
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {notifMsg && (
                    <Alert className={notifMsg.type === 'success' ? 'border-green-200 bg-green-50' : 'border-destructive/30 bg-destructive/5'}>
                      {notifMsg.type === 'success'
                        ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                        : <AlertTriangle className="w-4 h-4 text-destructive" />}
                      <AlertDescription className={notifMsg.type === 'success' ? 'text-green-800' : 'text-destructive'}>
                        {notifMsg.text}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="emailNotif" className="text-sm font-medium cursor-pointer">Email Notifications</Label>
                        <p className="text-xs text-muted-foreground">Receive important account and security notifications by email</p>
                      </div>
                      <Switch
                        id="emailNotif"
                        checked={notifPrefs.emailNotifications}
                        onCheckedChange={(v) => setNotifPrefs(p => ({ ...p, emailNotifications: v }))}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="marketingEmails" className="text-sm font-medium cursor-pointer">Marketing Emails</Label>
                        <p className="text-xs text-muted-foreground">Receive product updates, tips, and promotional offers</p>
                      </div>
                      <Switch
                        id="marketingEmails"
                        checked={notifPrefs.marketingEmails}
                        onCheckedChange={(v) => setNotifPrefs(p => ({ ...p, marketingEmails: v }))}
                      />
                    </div>
                  </div>

                  <Button onClick={handleNotifSave} disabled={notifSaving}>
                    {notifSaving ? 'Saving…' : 'Save Preferences'}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    In-App Notifications
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">
                    In-app notifications appear in the notification bell in the top bar. They include password reset updates, system announcements, and account activity.
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/dashboard">View Notifications</Link>
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Subscription Tab ── */}
            <TabsContent value="subscription" className="space-y-5">
              <SubscriptionTab user={user} plan={plan} planBadgeColor={planBadgeColor} />
            </TabsContent>

            {/* ── Billing Tab ── */}
            <TabsContent value="billing" className="space-y-5">
              <BillingTab plan={plan} planIsLifetime={user?.planIsLifetime ?? false} />
            </TabsContent>
          </Tabs>
        </div>
      </DashboardLayout>
    </>
  );
}

function SubscriptionTab({ user, plan, planBadgeColor }: { user: ReturnType<typeof useAuth>['user']; plan: string; planBadgeColor: string }) {
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const limit = PLAN_LIMITS[plan] ?? 0;

  const PLAN_FEATURES: Record<string, string[]> = {
    free:         ['Browse the builder catalogue', 'Start an eligible free trial'],
    personal:     ['350,000 credits each billing period', '150,000 credits per rolling 5 hours', 'Essential builders', '3 saved drafts', '14-day retention'],
    standard:     ['750,000 credits each billing period', '300,000 credits per rolling 5 hours', 'All published builders', '5 saved drafts', '14-day retention'],
    professional: ['1,500,000 credits each billing period', '600,000 credits per rolling 5 hours', 'All published builders', '10 saved drafts', '30-day retention'],
    org_starter:  ['Unlimited builder credits', 'All published builders', '10 saved drafts', '30-day retention', 'Group-focused planning'],
  };

  const UPGRADE_PLANS = [
    { id: 'personal',         name: 'Explore Plan',          price: '£5.99/mo',  icon: Clock,     trial: true,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { id: 'standard',         name: 'Plan Plan',             price: '£7.99/mo',  icon: Zap,       trial: true,  color: 'text-blue-600',   bg: 'bg-blue-50' },
    { id: 'professional',     name: 'Complete Plan',         price: '£14.99/mo', icon: Star,      trial: true,  color: 'text-primary',    bg: 'bg-primary/10', highlight: true },
    { id: 'org_starter',      name: 'Together Plan',         price: '£39.99/mo', icon: Building2, trial: true, color: 'text-purple-600', bg: 'bg-purple-50' },
  ].filter(p => {
    const order = ['free', 'personal', 'standard', 'professional', 'org_starter'];
    return order.indexOf(p.id) > order.indexOf(plan);
  });

  async function openPortal() {
    setError('');
    setPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      const data = await res.json() as { success: boolean; url?: string; error?: string };
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? 'Unable to open billing portal. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setPortalLoading(false);
    }
  }

  async function startCheckout(planId: string) {
    setError('');
    setCheckoutLoading(planId);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json() as { success: boolean; url?: string; error?: string };
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? 'Unable to start checkout. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setCheckoutLoading(null);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Current plan card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold text-foreground">{PLAN_LABELS[plan] ?? plan}</p>
                {user?.planIsLifetime && (
                  <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-[10px]">★ Lifetime</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {plan === 'free'
                  ? 'Free plan — upgrade to unlock more features'
                  : user?.planIsLifetime
                    ? 'Lifetime access — no recurring billing'
                    : `Active ${PLAN_LABELS[plan]} subscription`}
              </p>
              {user?.planExpiresAt && !user.planIsLifetime && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Renews {new Date(user.planExpiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
            <Badge className={`capitalize text-sm px-3 py-1 shrink-0 ${planBadgeColor}`}>{PLAN_LABELS[plan] ?? plan}</Badge>
          </div>

          {/* Plan features */}
          <div className="bg-muted/40 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">What's included</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {(PLAN_FEATURES[plan] ?? []).map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <span className="text-foreground">{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Document usage */}
          <div className="bg-muted/40 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Saved drafts</span>
              <span className="font-medium">{limit === 0 ? 'Not available' : `${limit} drafts`}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Draft retention</span>
              <span className="font-medium">
                {plan === 'free' ? 'No saving' : (plan === 'standard' || plan === 'personal') ? '14 days' : '30 days'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Template access</span>
              <span className="font-medium">
                {plan === 'free' ? '1 demo template'
                  : plan === 'standard' ? 'Free + Standard'
                  : plan === 'professional' ? 'Free + Standard + Professional'
                  : 'All templates'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Custom branding</span>
              <span className="font-medium">{plan === 'free' ? 'Not included' : 'Included'}</span>
            </div>
            {limit === 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                Free plan users cannot save drafts. Export your documents immediately after creating them.
              </p>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {plan !== 'free' && !user?.planIsLifetime && (
              <Button
                variant="outline"
                onClick={openPortal}
                disabled={portalLoading}
                className="gap-2"
              >
                {portalLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Opening…</>
                  : <><ExternalLink className="w-4 h-4" />Manage Billing</>}
              </Button>
            )}
            <Button asChild variant={plan === 'free' ? 'default' : 'outline'}>
              <Link to="/pricing">
                {plan === 'free' ? 'Upgrade Plan' : 'View All Plans'}
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Link>
            </Button>
          </div>
          {plan !== 'free' && !user?.planIsLifetime && (
            <p className="text-xs text-muted-foreground">
              To cancel your subscription, use the <button onClick={openPortal} className="underline hover:text-foreground transition-colors">billing portal</button> or{' '}
              <Link to="/contact" className="underline hover:text-foreground transition-colors">contact support</Link>.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Upgrade options */}
      {UPGRADE_PLANS.length > 0 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Upgrade your plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {UPGRADE_PLANS.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-4 rounded-xl border ${
                    (p as { highlight?: boolean }).highlight ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${p.bg}`}>
                      <Icon className={`w-4 h-4 ${p.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{p.name}</p>
                        {(p as { highlight?: boolean }).highlight && (
                          <Badge className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0">Popular</Badge>
                        )}
                        {p.trial && (
                          <Badge className="bg-green-100 text-green-800 border-green-200 text-[9px] px-1.5 py-0">30-day trial</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{p.price}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={(p as { highlight?: boolean }).highlight ? 'default' : 'outline'}
                    disabled={checkoutLoading === p.id}
                    onClick={() => startCheckout(p.id)}
                    className="gap-1.5 shrink-0"
                  >
                    {checkoutLoading === p.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : p.trial ? 'Try Free' : 'Upgrade'}
                  </Button>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground text-center pt-1">
              <Link to="/pricing" className="underline hover:text-foreground transition-colors">Compare all plans in detail</Link>
            </p>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

interface StripeInvoice {
  id: string;
  number: string | null;
  status: string | null;
  amountPaid: number;
  amountDue: number;
  currency: string;
  created: number;
  periodStart: number;
  periodEnd: number;
  pdfUrl: string | null;
  hostedUrl: string | null;
  description: string | null;
  lines: Array<{ description: string | null; amount: number; currency: string }>;
}

function BillingTab({ plan, planIsLifetime }: { plan: string; planIsLifetime: boolean }) {
  const [invoices, setInvoices] = useState<StripeInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const { supportEmail } = useSiteSettings();

  useEffect(() => {
    fetch('/account/billing', { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(r => r.json() as Promise<{ success: boolean; invoices?: StripeInvoice[]; error?: string }>)
      .then(d => {
        if (d.success) setInvoices(d.invoices ?? []);
        else setInvoicesError(d.error ?? 'Failed to load billing history.');
      })
      .catch(() => setInvoicesError('Unable to load billing history.'))
      .finally(() => setInvoicesLoading(false));
  }, []);

  async function openPortal() {
    setPortalError('');
    setPortalLoading(true);
    try {
      const res = await fetch('/account/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      const data = await res.json() as { success: boolean; url?: string; error?: string };
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setPortalError(data.error ?? 'Unable to open billing portal. Please try again.');
      }
    } catch {
      setPortalError('Network error. Please try again.');
    } finally {
      setPortalLoading(false);
    }
  }

  async function confirmCancel() {
    setCancelError('');
    setCancelLoading(true);
    try {
      // Open Stripe portal — the portal handles cancellation
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      const data = await res.json() as { success: boolean; url?: string; error?: string };
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setCancelError(data.error ?? 'Unable to open cancellation portal. Please contact support.');
        setShowCancelConfirm(false);
      }
    } catch {
      setCancelError('Network error. Please try again.');
      setShowCancelConfirm(false);
    } finally {
      setCancelLoading(false);
    }
  }

  function formatAmount(amount: number, currency: string) {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100);
  }

  function formatDate(unix: number) {
    return new Date(unix * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  const hasPaidPlan = plan !== 'free' && !planIsLifetime;

  return (
    <div className="space-y-5">
      {/* Manage billing */}
      {hasPaidPlan && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              Manage Billing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Update your payment method, download invoices, or manage your subscription through the secure Stripe billing portal.
            </p>
            {portalError && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>{portalError}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={openPortal} disabled={portalLoading} className="gap-2">
                {portalLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Opening…</>
                  : <><ExternalLink className="w-4 h-4" />Open Billing Portal</>}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The billing portal is provided by Stripe and opens in the same window. You can update payment methods, view invoices, and manage your subscription there.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Cancel subscription */}
      {hasPaidPlan && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <XCircle className="w-4 h-4" />
              Cancel Subscription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You can cancel your subscription at any time. Your access will continue until the end of your current billing period.
            </p>
            {cancelError && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>{cancelError}</AlertDescription>
              </Alert>
            )}
            {cancelSuccess && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Your cancellation has been processed. You'll retain access until the end of your billing period.
                </AlertDescription>
              </Alert>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowCancelConfirm(true)}
              disabled={cancelSuccess}
            >
              Cancel Subscription
            </Button>
            <p className="text-xs text-muted-foreground">
              Need help? <a href={`mailto:${supportEmail}`} className="underline hover:text-foreground transition-colors">Contact support</a> and we'll assist you.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Invoice history */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            Billing History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading billing history…
            </div>
          ) : invoicesError ? (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>{invoicesError}</AlertDescription>
            </Alert>
          ) : invoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No billing history yet.</p>
              {plan === 'free' && (
                <p className="text-xs mt-1">
                  <Link to="/pricing" className="underline hover:text-foreground transition-colors">Upgrade to a paid plan</Link> to see invoices here.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map(inv => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20 gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {inv.number ?? inv.id.slice(-8).toUpperCase()}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          inv.status === 'paid'
                            ? 'text-green-700 border-green-200 bg-green-50 text-[10px]'
                            : inv.status === 'open'
                              ? 'text-amber-700 border-amber-200 bg-amber-50 text-[10px]'
                              : 'text-muted-foreground text-[10px]'
                        }
                      >
                        {inv.status ?? 'unknown'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(inv.created)}
                      {inv.periodStart && inv.periodEnd && (
                        <> · {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}</>
                      )}
                    </p>
                    {inv.lines[0]?.description && (
                      <p className="text-xs text-muted-foreground truncate">{inv.lines[0].description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-foreground">
                      {formatAmount(inv.amountPaid || inv.amountDue, inv.currency)}
                    </span>
                    {inv.pdfUrl && (
                      <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0">
                        <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" title="Download PDF">
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                    )}
                    {inv.hostedUrl && (
                      <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0">
                        <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" title="View invoice">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel confirmation dialog */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll be taken to the Stripe billing portal to confirm the cancellation. Your access will continue until the end of your current billing period — you won't be charged again after that.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelLoading}>Keep my plan</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              disabled={cancelLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Processing…</> : 'Continue to cancel'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── PasswordStrength ───────────────────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '8+ characters', pass: password.length >= 8 },
    { label: 'Uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'Number', pass: /\d/.test(password) },
    { label: 'Special character', pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.pass).length;
  const strengthLabel = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][score];
  const strengthColor = ['bg-red-500', 'bg-red-400', 'bg-amber-400', 'bg-blue-500', 'bg-green-500'][score];

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < score ? strengthColor : 'bg-muted'}`} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Strength: <span className="font-medium text-foreground">{strengthLabel}</span>
      </p>
    </div>
  );
}
