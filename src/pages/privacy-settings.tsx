/**
 * Privacy & Data — Customer portal page
 * Full UK GDPR Subject Access Request (SAR) flow + communication preferences.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/lib/auth-context';
import { useSiteSettings } from '@/lib/site-settings-context';
import { DATA_PROTECTION_EMAIL } from '@/lib/contact-details';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Shield, Download, Trash2, CheckCircle2, AlertCircle, Loader2,
  ExternalLink, Info, Clock, Bell, Cookie, Eye, FileText,
  ChevronRight, RefreshCw, X, AlertTriangle, Calendar,
  UserCheck, Lock, HelpCircle, ArrowRight,
} from 'lucide-react';
import { formatDistanceToNow } from '@/lib/date-utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SarRequest {
  id: number;
  uuid: string;
  requestType: string;
  notes: string | null;
  status: string;
  deadlineAt: string;
  deadlineExtendedAt: string | null;
  identityVerified: boolean;
  adminNotes: string | null;
  rejectionReason: string | null;
  processedAt: string | null;
  exportReady: string | null;
  downloadTokenExpires: string | null;
  downloadToken: string | null;
  downloadCount: number;
  exportFileSizeBytes: number | null;
  downloadAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserPreferences {
  emailNotifications: boolean;
  marketingEmails: boolean;
}

// ── Config ────────────────────────────────────────────────────────────────────

const REQUEST_TYPES = [
  {
    value: 'sar',
    label: 'Subject Access Request (SAR)',
    description: 'Request a copy of all personal data we hold about you.',
    icon: Eye,
    ukGdprArticle: 'Article 15',
  },
  {
    value: 'export',
    label: 'Data Export / Portability',
    description: 'Receive your data in a structured, machine-readable format.',
    icon: Download,
    ukGdprArticle: 'Article 20',
  },
  {
    value: 'deletion',
    label: 'Right to Erasure (Account Deletion)',
    description: 'Request permanent deletion of your account and all associated data.',
    icon: Trash2,
    ukGdprArticle: 'Article 17',
  },
  {
    value: 'rectification',
    label: 'Right to Rectification',
    description: 'Request correction of inaccurate or incomplete personal data.',
    icon: FileText,
    ukGdprArticle: 'Article 16',
  },
  {
    value: 'restriction',
    label: 'Right to Restriction of Processing',
    description: 'Request that we limit how we use your personal data.',
    icon: Lock,
    ukGdprArticle: 'Article 18',
  },
  {
    value: 'portability',
    label: 'Right to Data Portability',
    description: 'Receive your data to transfer to another service provider.',
    icon: ArrowRight,
    ukGdprArticle: 'Article 20',
  },
  {
    value: 'objection',
    label: 'Right to Object',
    description: 'Object to processing of your personal data for specific purposes.',
    icon: AlertTriangle,
    ukGdprArticle: 'Article 21',
  },
] as const;

const STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ElementType;
  description: string;
}> = {
  submitted:          { label: 'Submitted',           color: 'text-blue-700',   bgColor: 'bg-blue-50 border-blue-200',   icon: CheckCircle2,  description: 'Your request has been received and is awaiting review.' },
  in_review:          { label: 'In Review',           color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200', icon: Eye,           description: 'Our team is reviewing your request.' },
  processing:         { label: 'Processing',          color: 'text-amber-700',  bgColor: 'bg-amber-50 border-amber-200', icon: RefreshCw,     description: 'We are gathering and preparing your data.' },
  ready:              { label: 'Ready to Download',   color: 'text-green-700',  bgColor: 'bg-green-50 border-green-200', icon: Download,      description: 'Your data export is ready. Please download it using the link below.' },
  completed:          { label: 'Completed',           color: 'text-green-700',  bgColor: 'bg-green-50 border-green-200', icon: CheckCircle2,  description: 'Your request has been completed.' },
  rejected:           { label: 'Rejected',            color: 'text-red-700',    bgColor: 'bg-red-50 border-red-200',     icon: X,             description: 'Your request could not be fulfilled. See details below.' },
  unable_to_complete: { label: 'Unable to Complete',  color: 'text-orange-700', bgColor: 'bg-orange-50 border-orange-200', icon: AlertCircle, description: 'We were unable to complete your request. Please contact support.' },
};

const ACTIVE_STATUSES = ['submitted', 'in_review', 'processing'];
const TERMINAL_STATUSES = ['completed', 'rejected', 'unable_to_complete'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function PrivacySettingsPage() {
  const { user } = useAuth();
  const { siteName, brandName, companyName } = useSiteSettings();
  const supportEmail = DATA_PROTECTION_EMAIL;

  // SAR requests
  const [sarRequests, setSarRequests] = useState<SarRequest[]>([]);
  const [sarLoading, setSarLoading] = useState(true);
  const [sarError, setSarError] = useState<string | null>(null);

  // New SAR form
  const [showSarForm, setShowSarForm] = useState(false);
  const [sarType, setSarType] = useState('sar');
  const [sarNotes, setSarNotes] = useState('');
  const [sarSubmitting, setSarSubmitting] = useState(false);
  const [sarSubmitError, setSarSubmitError] = useState<string | null>(null);
  const [sarSubmitSuccess, setSarSubmitSuccess] = useState<string | null>(null);

  // Selected request detail
  const [selectedSar, setSelectedSar] = useState<SarRequest | null>(null);

  // Preferences
  const [prefs, setPrefs] = useState<UserPreferences>({ emailNotifications: true, marketingEmails: false });
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSuccess, setPrefsSuccess] = useState(false);

  // Download state
  const [downloading, setDownloading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setSarLoading(true);
    setSarError(null);
    try {
      const [sarRes, prefsRes] = await Promise.all([
        fetch('/api/user/sar', { credentials: 'include' }),
        fetch('/api/user/preferences', { credentials: 'include' }),
      ]);
      // If session expired, redirect to login
      if (sarRes.status === 401) {
        window.location.href = '/sign-in?redirect=/privacy-settings';
        return;
      }
      const sarData = await sarRes.json() as { success: boolean; requests?: SarRequest[]; error?: string };
      const prefsData = await prefsRes.json() as { success: boolean; preferences?: UserPreferences };
      if (sarData.success && sarData.requests) setSarRequests(sarData.requests);
      else if (!sarData.success) setSarError(sarData.error ?? 'Failed to load requests.');
      if (prefsData.success && prefsData.preferences) setPrefs(prefsData.preferences);
    } catch {
      setSarError('Unable to connect. Please try again.');
    } finally {
      setSarLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleSarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSarSubmitting(true);
    setSarSubmitError(null);
    try {
      const res = await fetch('/api/user/sar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestType: sarType, notes: sarNotes }),
      });
      if (res.status === 401) {
        window.location.href = '/sign-in?redirect=/privacy-settings';
        return;
      }
      const data = await res.json() as { success: boolean; message?: string; error?: string; code?: string };
      if (data.success) {
        setSarSubmitSuccess(data.message ?? 'Your request has been submitted.');
        setSarNotes('');
        setShowSarForm(false);
        void loadData();
      } else if (data.code === 'RATE_LIMITED') {
        setSarSubmitError('You already have 2 active requests being processed. Please wait for them to complete before submitting a new one.');
      } else if (data.code === 'DUPLICATE_REQUEST') {
        setSarSubmitError(data.error ?? 'You already have an active request of this type.');
      } else {
        setSarSubmitError(data.error ?? 'Failed to submit. Please try again.');
      }
    } catch {
      setSarSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setSarSubmitting(false);
    }
  };

  const handleDownload = async (sar: SarRequest) => {
    if (!sar.downloadToken) {
      alert('Download link is not available or has expired. Please contact support.');
      return;
    }
    setDownloading(sar.uuid);
    try {
      const res = await fetch(`/api/user/sar/${sar.uuid}/download?token=${encodeURIComponent(sar.downloadToken)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Sousa Murray Planeia-Data-Export-${sar.uuid.slice(0, 8).toUpperCase()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        void loadData(); // refresh to update download count
      } else {
        const err = await res.json() as { error?: string };
        alert(err.error ?? 'Download failed. Please try again.');
      }
    } catch {
      alert('Download failed. Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  const savePrefs = async (updated: UserPreferences) => {
    setPrefsSaving(true);
    setPrefsSuccess(false);
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updated),
      });
      const data = await res.json() as { success: boolean };
      if (data.success) {
        setPrefs(updated);
        setPrefsSuccess(true);
        setTimeout(() => setPrefsSuccess(false), 3000);
      }
    } catch { /* silent */ }
    finally { setPrefsSaving(false); }
  };

  const activeRequests = sarRequests.filter(r => ACTIVE_STATUSES.includes(r.status));
  const completedRequests = sarRequests.filter(r => TERMINAL_STATUSES.includes(r.status));
  const readyRequests = sarRequests.filter(r => r.status === 'ready');

  const selectedType = REQUEST_TYPES.find(t => t.value === sarType);

  return (
    <>
      <Helmet>
        <title>Privacy &amp; Data — {siteName}</title>
        <meta name="description" content="Manage your privacy preferences and exercise your UK GDPR data rights." />
        <meta name="robots" content="noindex" />
      </Helmet>

      <DashboardLayout>
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" aria-hidden="true" />
              Privacy &amp; Data
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your privacy preferences and exercise your rights under UK GDPR.
            </p>
          </div>

          {/* Success banner */}
          {sarSubmitSuccess && (
            <Alert className="border-green-200 bg-green-50" role="status">
              <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
              <AlertDescription className="text-green-700">{sarSubmitSuccess}</AlertDescription>
            </Alert>
          )}

          {/* Ready to download banner */}
          {readyRequests.length > 0 && (
            <Alert className="border-green-200 bg-green-50" role="status">
              <Download className="h-4 w-4 text-green-600" aria-hidden="true" />
              <AlertDescription className="text-green-700">
                <strong>Your data export is ready.</strong> Click on the request below to download your data.
              </AlertDescription>
            </Alert>
          )}

          {/* ── Communication Preferences ─────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" aria-hidden="true" />
                Communication Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {prefsSuccess && (
                <Alert className="border-green-200 bg-green-50 py-2" role="status">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
                  <AlertDescription className="text-green-700 text-xs">Preferences saved.</AlertDescription>
                </Alert>
              )}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <Label htmlFor="email-notifications" className="text-sm font-medium">Email Notifications</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Account updates, document activity, and support ticket replies.
                  </p>
                </div>
                <Switch
                  id="email-notifications"
                  checked={prefs.emailNotifications}
                  onCheckedChange={v => void savePrefs({ ...prefs, emailNotifications: v })}
                  disabled={prefsSaving}
                  aria-label="Toggle email notifications"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <Label htmlFor="marketing-emails" className="text-sm font-medium">Marketing Emails</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Product updates, new features, and promotional offers. You can unsubscribe at any time.
                  </p>
                </div>
                <Switch
                  id="marketing-emails"
                  checked={prefs.marketingEmails}
                  onCheckedChange={v => void savePrefs({ ...prefs, marketingEmails: v })}
                  disabled={prefsSaving}
                  aria-label="Toggle marketing emails"
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Your Data Rights ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="w-4 h-4 text-primary" aria-hidden="true" />
                    Your Data Rights (UK GDPR)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Under UK GDPR, you have the right to access, export, correct, and request deletion of your personal data.
                    We will respond to all requests within <strong>30 days</strong> as required by law.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => { setShowSarForm(true); setSarSubmitSuccess(null); setSarSubmitError(null); }}
                  className="gap-2 shrink-0"
                  aria-label="Submit a new data rights request"
                >
                  <FileText className="w-4 h-4" aria-hidden="true" />
                  New Request
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Privacy notice */}
              <Alert className="border-blue-200 bg-blue-50">
                <Info className="h-4 w-4 text-blue-600 shrink-0" aria-hidden="true" />
                <AlertDescription className="text-blue-700 text-xs">
                  <strong>Identity verification:</strong> We may need to verify your identity before releasing personal data.
                  This is to protect your privacy and ensure we only release data to the correct person.
                  You will be contacted at <strong>{user?.email}</strong> if verification is required.
                </AlertDescription>
              </Alert>

              {/* New SAR form */}
              {showSarForm && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Submit a Data Rights Request</CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => setShowSarForm(false)}
                        aria-label="Close form">
                        <X className="w-4 h-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={(e) => void handleSarSubmit(e)} aria-label="Data rights request form">
                      {sarSubmitError && (
                        <Alert variant="destructive" className="mb-4" role="alert">
                          <AlertCircle className="h-4 w-4" aria-hidden="true" />
                          <AlertDescription>{sarSubmitError}</AlertDescription>
                        </Alert>
                      )}

                      {/* Request type selector */}
                      <div className="mb-4">
                        <Label className="text-sm font-medium mb-2 block">
                          What type of request would you like to make?
                          <span className="text-destructive ml-1" aria-hidden="true">*</span>
                        </Label>
                        <div className="grid grid-cols-1 gap-2">
                          {REQUEST_TYPES.map(type => {
                            const Icon = type.icon;
                            const isSelected = sarType === type.value;
                            return (
                              <button
                                key={type.value}
                                type="button"
                                onClick={() => setSarType(type.value)}
                                className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                                  isSelected
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border hover:border-primary/40 hover:bg-muted/50'
                                }`}
                                aria-pressed={isSelected}
                                aria-label={`Select: ${type.label}`}
                              >
                                <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                                      {type.label}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                      {type.ukGdprArticle}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                                </div>
                                {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Deletion warning */}
                      {sarType === 'deletion' && (
                        <Alert variant="destructive" className="mb-4">
                          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                          <AlertDescription>
                            <strong>This will permanently delete your account and all data.</strong> This action cannot be undone.
                            Your account will remain active until the deletion is processed (within 30 days).
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Notes */}
                      <div className="mb-4">
                        <Label htmlFor="sar-notes" className="text-sm font-medium">
                          Additional notes <span className="text-muted-foreground font-normal">(optional)</span>
                        </Label>
                        <Textarea
                          id="sar-notes"
                          value={sarNotes}
                          onChange={e => setSarNotes(e.target.value)}
                          placeholder="Any additional information or specific data you are requesting..."
                          rows={3}
                          className="mt-1 resize-none text-sm"
                          maxLength={2000}
                          aria-describedby="sar-notes-hint"
                        />
                        <p id="sar-notes-hint" className="text-xs text-muted-foreground mt-1">
                          {sarNotes.length}/2000 characters
                        </p>
                      </div>

                      {/* UK GDPR notice */}
                      <div className="bg-muted/50 rounded-lg p-3 mb-4 text-xs text-muted-foreground space-y-1">
                        <p className="font-medium text-foreground">Before you submit:</p>
                        <ul className="space-y-1 list-disc list-inside">
                          <li>We will respond within <strong>30 calendar days</strong> as required by UK GDPR.</li>
                          <li>We may need to <strong>verify your identity</strong> before releasing data.</li>
                          <li>You will be notified at <strong>{user?.email}</strong> when your request is processed.</li>
                          <li>You can submit a maximum of 2 active requests at a time.</li>
                        </ul>
                      </div>

                      <div className="flex gap-3 justify-end">
                        <Button type="button" variant="outline" onClick={() => setShowSarForm(false)} disabled={sarSubmitting}>
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={sarSubmitting}
                          variant={sarType === 'deletion' ? 'destructive' : 'default'}
                          className="gap-2"
                        >
                          {sarSubmitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <FileText className="w-4 h-4" aria-hidden="true" />}
                          {sarSubmitting ? 'Submitting…' : 'Submit Request'}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}

              {/* Request list */}
              {sarLoading ? (
                <div className="flex items-center justify-center py-8" aria-live="polite">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-hidden="true" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading requests…</span>
                </div>
              ) : sarError ? (
                <Alert variant="destructive" role="alert">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  <AlertDescription>{sarError}</AlertDescription>
                </Alert>
              ) : sarRequests.length === 0 ? (
                <div className="text-center py-8">
                  <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">No data rights requests yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use the "New Request" button above to exercise your UK GDPR rights.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeRequests.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-2">Active Requests ({activeRequests.length})</p>
                      <div className="space-y-2">
                        {activeRequests.map(sar => (
                          <SarRequestCard key={sar.id} sar={sar} onOpen={() => setSelectedSar(sar)} />
                        ))}
                      </div>
                    </div>
                  )}
                  {readyRequests.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-2">Ready to Download ({readyRequests.length})</p>
                      <div className="space-y-2">
                        {readyRequests.map(sar => (
                          <SarRequestCard key={sar.id} sar={sar} onOpen={() => setSelectedSar(sar)}
                            onDownload={() => void handleDownload(sar)}
                            downloading={downloading === sar.uuid}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {completedRequests.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-2">Completed / Closed ({completedRequests.length})</p>
                      <div className="space-y-2">
                        {completedRequests.map(sar => (
                          <SarRequestCard key={sar.id} sar={sar} onOpen={() => setSelectedSar(sar)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Cookie Preferences ────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cookie className="w-4 h-4 text-primary" aria-hidden="true" />
                Cookie Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                We use cookies to keep you signed in and improve your experience.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Essential Cookies</p>
                    <p className="text-[10px] text-muted-foreground">Required for login and security. Cannot be disabled.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
                  <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Analytics Cookies</p>
                    <p className="text-[10px] text-muted-foreground">Help us understand how the platform is used.</p>
                  </div>
                </div>
              </div>
              <Link to="/cookies" className="inline-flex items-center gap-1 text-xs text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded">
                View full Cookie Policy <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </Link>
            </CardContent>
          </Card>

          {/* ── Data Processing Info ──────────────────────────────────────────── */}
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-2">How We Process Your Data</h3>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {[
                  'We only collect data necessary to provide the service.',
                  'Your documents are stored securely and never shared with third parties.',
                  'We use Microsoft Entra for authentication — we do not store your Microsoft password.',
                  `Data controller: ${companyName}. Contact: ${supportEmail}`,
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* ── Legal Links ───────────────────────────────────────────────────── */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Legal Documents</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Privacy Policy', href: '/privacy' },
                  { label: 'Terms of Service', href: '/terms' },
                  { label: 'Cookie Policy', href: '/cookies' },
                ].map(link => (
                  <Link key={link.href} to={link.href}
                    className="flex items-center gap-2 p-3 rounded-lg border hover:border-primary/40 hover:bg-muted/50 transition-colors text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                    {link.label}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>
      </DashboardLayout>

      {/* SAR detail dialog */}
      <Dialog open={!!selectedSar} onOpenChange={open => { if (!open) setSelectedSar(null); }}>
        <DialogContent className="max-w-lg w-full">
          {selectedSar && (
            <SarDetailPanel
              sar={selectedSar}
              onClose={() => setSelectedSar(null)}
              onDownload={() => void handleDownload(selectedSar)}
              downloading={downloading === selectedSar.uuid}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SarRequestCard({
  sar,
  onOpen,
  onDownload,
  downloading,
}: {
  sar: SarRequest;
  onOpen: () => void;
  onDownload?: () => void;
  downloading?: boolean;
}) {
  const cfg = STATUS_CONFIG[sar.status] ?? STATUS_CONFIG.submitted;
  const Icon = cfg.icon;
  const typeInfo = REQUEST_TYPES.find(t => t.value === sar.requestType);
  const TypeIcon = typeInfo?.icon ?? FileText;

  const deadline = sar.deadlineExtendedAt ?? sar.deadlineAt;
  const daysRemaining = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const isOverdue = daysRemaining < 0 && !TERMINAL_STATUSES.includes(sar.status);
  const isUrgent = daysRemaining >= 0 && daysRemaining <= 5 && !TERMINAL_STATUSES.includes(sar.status);

  return (
    <div className={`rounded-lg border p-4 ${cfg.bgColor}`}>
      <div className="flex items-start gap-3">
        <TypeIcon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">
                {typeInfo?.label ?? sar.requestType}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${cfg.bgColor} ${cfg.color}`}>
                  <Icon className="w-2.5 h-2.5" aria-hidden="true" />
                  {cfg.label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Ref: {sar.uuid.slice(0, 8).toUpperCase()}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(sar.createdAt)} ago
                </span>
              </div>
            </div>
            <button
              onClick={onOpen}
              className="text-xs text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded shrink-0"
              aria-label={`View details for ${typeInfo?.label ?? sar.requestType} request`}
            >
              Details
            </button>
          </div>

          {/* Deadline */}
          {!TERMINAL_STATUSES.includes(sar.status) && (
            <div className={`flex items-center gap-1 mt-2 text-xs ${isOverdue ? 'text-red-600' : isUrgent ? 'text-amber-600' : 'text-muted-foreground'}`}>
              <Calendar className="w-3 h-3" aria-hidden="true" />
              {isOverdue
                ? `Overdue by ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) !== 1 ? 's' : ''}`
                : `Deadline: ${new Date(deadline).toLocaleDateString('en-GB')} (${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining)`
              }
            </div>
          )}

          {/* Identity verification status */}
          {sar.identityVerified && (
            <div className="flex items-center gap-1 mt-1 text-xs text-green-600">
              <UserCheck className="w-3 h-3" aria-hidden="true" />
              Identity verified
            </div>
          )}

          {/* Download button for ready requests */}
          {sar.status === 'ready' && sar.downloadAvailable && onDownload && (
            <Button
              size="sm"
              className="mt-3 gap-2"
              onClick={e => { e.stopPropagation(); onDownload(); }}
              disabled={downloading}
              aria-label="Download your data export"
            >
              {downloading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                : <Download className="w-3.5 h-3.5" aria-hidden="true" />
              }
              {downloading ? 'Downloading…' : 'Download My Data'}
            </Button>
          )}

          {/* Token expired notice */}
          {sar.status === 'ready' && !sar.downloadAvailable && (
            <p className="text-xs text-amber-600 mt-2">
              Download link has expired. Please contact support to request a new one.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SarDetailPanel({
  sar,
  onClose,
  onDownload,
  downloading,
}: {
  sar: SarRequest;
  onClose: () => void;
  onDownload: () => void;
  downloading: boolean;
}) {
  const cfg = STATUS_CONFIG[sar.status] ?? STATUS_CONFIG.submitted;
  const Icon = cfg.icon;
  const typeInfo = REQUEST_TYPES.find(t => t.value === sar.requestType);

  const deadline = sar.deadlineExtendedAt ?? sar.deadlineAt;
  const daysRemaining = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const isOverdue = daysRemaining < 0 && !TERMINAL_STATUSES.includes(sar.status);

  // Progress steps
  const steps = ['submitted', 'in_review', 'processing', 'ready', 'completed'];
  const currentStep = steps.indexOf(sar.status);
  const progressPct = sar.status === 'rejected' || sar.status === 'unable_to_complete'
    ? 100
    : Math.max(0, Math.min(100, (currentStep / (steps.length - 1)) * 100));

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-base font-semibold pr-8">
          {typeInfo?.label ?? sar.requestType}
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          Reference: <strong>{sar.uuid.slice(0, 8).toUpperCase()}</strong> · Submitted {formatDistanceToNow(sar.createdAt)} ago
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 mt-2">
        {/* Status */}
        <div className={`flex items-start gap-3 p-3 rounded-lg border ${cfg.bgColor}`}>
          <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.color}`} aria-hidden="true" />
          <div>
            <p className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{cfg.description}</p>
          </div>
        </div>

        {/* Progress bar (for non-terminal statuses) */}
        {!TERMINAL_STATUSES.includes(sar.status) && (
          <div>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>Submitted</span>
              <span>In Review</span>
              <span>Processing</span>
              <span>Ready</span>
              <span>Complete</span>
            </div>
            <Progress value={progressPct} className="h-1.5" aria-label={`Request progress: ${cfg.label}`} />
          </div>
        )}

        {/* Deadline */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-muted/50 rounded-lg p-3 border">
            <p className="text-muted-foreground mb-0.5">Submitted</p>
            <p className="font-medium text-foreground">{new Date(sar.createdAt).toLocaleDateString('en-GB')}</p>
          </div>
          <div className={`rounded-lg p-3 border ${isOverdue ? 'bg-red-50 border-red-200' : 'bg-muted/50'}`}>
            <p className="text-muted-foreground mb-0.5">
              {sar.deadlineExtendedAt ? 'Extended Deadline' : 'UK GDPR Deadline'}
            </p>
            <p className={`font-medium ${isOverdue ? 'text-red-600' : 'text-foreground'}`}>
              {new Date(deadline).toLocaleDateString('en-GB')}
              {!TERMINAL_STATUSES.includes(sar.status) && (
                <span className="ml-1 text-muted-foreground font-normal">
                  ({isOverdue ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d left`})
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Identity verification */}
        <div className={`flex items-center gap-2 p-3 rounded-lg border text-xs ${sar.identityVerified ? 'bg-green-50 border-green-200' : 'bg-muted/50'}`}>
          <UserCheck className={`w-4 h-4 shrink-0 ${sar.identityVerified ? 'text-green-600' : 'text-muted-foreground'}`} aria-hidden="true" />
          <div>
            <p className={`font-medium ${sar.identityVerified ? 'text-green-700' : 'text-foreground'}`}>
              Identity Verification: {sar.identityVerified ? 'Verified' : 'Pending'}
            </p>
            {!sar.identityVerified && (
              <p className="text-muted-foreground">We may contact you to verify your identity before releasing data.</p>
            )}
          </div>
        </div>

        {/* Notes submitted */}
        {sar.notes && (
          <div className="bg-muted/50 rounded-lg p-3 border">
            <p className="text-xs font-medium text-foreground mb-1">Your Notes</p>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{sar.notes}</p>
          </div>
        )}

        {/* Admin notes (visible to customer) */}
        {sar.adminNotes && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs font-medium text-blue-700 mb-1">Message from Support Team</p>
            <p className="text-xs text-blue-600 whitespace-pre-wrap">{sar.adminNotes}</p>
          </div>
        )}

        {/* Rejection reason */}
        {sar.rejectionReason && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs font-medium text-red-700 mb-1">Reason</p>
            <p className="text-xs text-red-600 whitespace-pre-wrap">{sar.rejectionReason}</p>
          </div>
        )}

        {/* Download section */}
        {sar.status === 'ready' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Download className="w-5 h-5 text-green-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-700">Your Data Export is Ready</p>
                {sar.exportFileSizeBytes && (
                  <p className="text-xs text-green-600 mt-0.5">
                    File size: {Math.round(sar.exportFileSizeBytes / 1024)}KB
                  </p>
                )}
                {sar.downloadTokenExpires && (
                  <p className="text-xs text-green-600">
                    Download link expires: {new Date(sar.downloadTokenExpires).toLocaleString('en-GB')}
                  </p>
                )}
                {sar.downloadCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Downloaded {sar.downloadCount} time{sar.downloadCount !== 1 ? 's' : ''}
                  </p>
                )}
                {sar.downloadAvailable ? (
                  <Button
                    className="mt-3 gap-2"
                    onClick={onDownload}
                    disabled={downloading}
                    aria-label="Download your data export ZIP file"
                  >
                    {downloading
                      ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      : <Download className="w-4 h-4" aria-hidden="true" />
                    }
                    {downloading ? 'Downloading…' : 'Download My Data (ZIP)'}
                  </Button>
                ) : (
                  <p className="text-xs text-amber-600 mt-2">
                    Download link has expired. Please contact {supportEmail} to request a new one.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Contact support */}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 border">
          <p className="font-medium text-foreground mb-1">Need help with this request?</p>
          <p>
            Contact us at{' '}
            <a href={`mailto:${supportEmail}`} className="text-primary hover:underline">
              {supportEmail}
            </a>
            {' '}quoting reference <strong>{sar.uuid.slice(0, 8).toUpperCase()}</strong>.
          </p>
        </div>
      </div>
    </>
  );
}
