/**
 * Admin — Legal Pages Manager
 * Edit Privacy Policy, Terms of Service, Cookie Policy, and other legal documents.
 * Each document has a draft/published workflow with audit trail.
 * Published content is served to the public via /api/legal/:slug
 */
import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/lib/admin-context';
import { hasWritePermission } from '@/lib/admin-types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Shield, FileText, Cookie, Scale, Save, Eye, CheckCircle2,
  AlertTriangle, RefreshCw, Clock, ExternalLink, History,
  Globe, Lock, Edit3, XCircle, Code2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type LegalStatus = 'draft' | 'published' | 'archived';

interface LegalDoc {
  slug: string;
  title: string;
  body: string;
  status: LegalStatus;
  effectiveDate: string;
  version: number;
  updatedBy: string;
  updatedAt: string;
  publishedAt?: string;
}

interface AuditEntry {
  action: string;
  adminName: string;
  timestamp: string;
  detail?: string;
}

// ── Document definitions ───────────────────────────────────────────────────────

const LEGAL_DOCS: Array<{
  slug: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  publicPath: string;
  description: string;
}> = [
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    icon: Shield,
    publicPath: '/privacy',
    description: 'How you collect, use, and protect personal data. Required under UK GDPR.',
  },
  {
    slug: 'terms-of-service',
    title: 'Terms of Service',
    icon: Scale,
    publicPath: '/terms',
    description: 'The legal agreement between you and your users governing platform use.',
  },
  {
    slug: 'cookie-policy',
    title: 'Cookie Policy',
    icon: Cookie,
    publicPath: '/cookies',
    description: 'How you use cookies and tracking technologies on the platform.',
  },
  {
    slug: 'acceptable-use',
    title: 'Acceptable Use Policy',
    icon: FileText,
    publicPath: '/acceptable-use',
    description: 'Rules governing what users may and may not do on the platform.',
  },
  {
    slug: 'complaints-policy',
    title: 'Complaints Policy',
    icon: FileText,
    publicPath: '/complaints',
    description: 'How customers can complain, expected response times and escalation stages.',
  },
  {
    slug: 'refund-policy',
    title: 'Refund Policy',
    icon: Scale,
    publicPath: '/refund-policy',
    description: 'Subscription cancellation, statutory rights, refund eligibility and third-party booking boundaries.',
  },
];

// ── Default content (fallback if DB is empty) ─────────────────────────────────

const DEFAULT_CONTENT: Record<string, string> = {
  'privacy-policy': `This Privacy Policy explains how JA Group Services ("we", "us", "our") operates Sousa Murray Planeia. This Privacy Policy explains how we collect, use, store, and protect your personal data when you use our platform. We are committed to handling your data in accordance with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.

1. Data Controller
JA Group Services is the data controller for personal data collected through Sousa Murray Planeia. If you have questions about how we handle your data, contact our Data Protection Officer at dpo@jagroupservices.co.uk.

2. Data We Collect
Account data: When you register, we collect your name, email address, and authentication credentials.
Profile data: You may optionally provide additional profile information such as your organisation name.
Document data: Documents you create, including their content and metadata, are stored on our servers.
Usage data: We collect information about how you use the platform for service improvement.
Technical data: We collect standard server logs including IP addresses, browser type, and access times.

3. How We Use Your Data
- To provide and operate the Sousa Murray Planeia service.
- To manage your account and authenticate your sessions.
- To store and retrieve your documents.
- To send transactional emails (account confirmations, notifications).
- To detect and prevent fraud, abuse, and security incidents.
- To comply with legal obligations.

4. Legal Basis for Processing
Contract: Processing necessary to provide the service you have signed up for.
Legitimate interests: Security monitoring, fraud prevention, and service improvement.
Consent: Marketing emails — you may withdraw consent at any time from your account settings.
Legal obligation: Where we are required to process data to comply with applicable law.

5. Data Retention
We retain your account data and documents for as long as your account is active. If you delete your account, we will delete your personal data within 30 days, except where we are required to retain it for legal or regulatory purposes.

6. Your Rights
Under UK GDPR, you have the right to access, rectify, erase, restrict, port, and object to processing of your personal data. To exercise any of these rights, contact dpo@jagroupservices.co.uk.

7. Contact
For any privacy-related queries, contact dpo@jagroupservices.co.uk.`,

  'terms-of-service': `These Terms and Conditions govern your access to and use of Sousa Murray Planeia, operated by JA Group Services Ltd (company number 16314179). By registering an account, starting a trial or using the platform, you agree to these terms.

1. The Service
Sousa Murray Planeia provides guided builders, destination discovery and personalised planning outputs. It is not a travel agent, tour operator, package organiser, insurer, booking provider or regulated adviser. Customers must check provider terms, prices, availability, accessibility and suitability.

2. Eligibility
You must be at least 18 years old to use Sousa Murray Planeia.

3. Accounts
You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.

4. Subscriptions, Trials & Billing
Explore Plan, Plan Plan, Complete Plan and Together Plan are monthly subscriptions with a 30-day trial for eligible new customers. They renew automatically unless cancelled. Credit allowances and rolling five-hour limits shown at purchase form part of the plan description. Statutory cancellation and refund rights are not affected.

5. Acceptable Use
You agree not to use Sousa Murray Planeia to create fraudulent, misleading, or illegal documents, or to violate any applicable law or regulation.

6. Your Content
You retain ownership of all content you create using Sousa Murray Planeia.

7. Governing Law
These Terms are governed by the laws of England and Wales.

8. Contact
If you have questions about these Terms, contact contact@jagroupservices.co.uk.`,

  'complaints-policy': `Sousa Murray Planeia is operated by JA Group Services Ltd. Complaints may be submitted through the Support Centre or to contact@jagroupservices.co.uk.

1. Acknowledgement
We normally acknowledge a complaint within two working days.

2. Stage 1
We aim to provide a substantive response within ten working days. If we need longer, we will explain why and provide an updated date.

3. Stage 2
Customers may request a senior review within 14 days of the Stage 1 response. We aim to issue a final response within a further ten working days.

4. Provider complaints
Complaints about a Headout, GetYourGuide or other third-party booking should normally be directed to the provider that supplied and fulfilled the booking.

5. Rights
This procedure does not remove statutory consumer or data-protection rights. Privacy complaints may also be raised with the Information Commissioner's Office.`,

  'cookie-policy': `This Cookie Policy explains how Sousa Murray Planeia uses cookies and similar tracking technologies on our website.

1. What Are Cookies
Cookies are small text files placed on your device when you visit a website.

2. Cookies We Use
Session cookie (ja_session): A strictly necessary httpOnly cookie used to authenticate your account. This cookie is required for the service to function.

We do not use advertising cookies, third-party tracking cookies, or analytics cookies that track you across other websites.

3. Managing Cookies
You can control cookies through your browser settings. Disabling the session cookie will prevent you from logging in to the platform.

4. Contact
For questions about our cookie use, contact dpo@jagroupservices.co.uk.`,

  'acceptable-use': `This Acceptable Use Policy governs what users may and may not do on Sousa Murray Planeia.

1. Permitted Use
You may use Sousa Murray Planeia to create legitimate business and personal documents for lawful purposes.

2. Prohibited Use
You must not use Sousa Murray Planeia to:
- Create fraudulent, misleading, or illegal documents
- Infringe any third-party intellectual property rights
- Attempt to gain unauthorised access to the platform
- Transmit malware, spam, or harmful code
- Violate any applicable law or regulation

3. Enforcement
We reserve the right to suspend or terminate accounts that violate this policy.

4. Contact
To report a violation, contact contact@jagroupservices.co.uk.`,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function statusBadge(status: LegalStatus) {
  if (status === 'published') return (
    <Badge variant="outline" className="text-[10px] text-green-700 dark:text-green-400 border-green-300 dark:border-green-800/40 bg-green-50 dark:bg-green-950/30">
      <Globe className="w-2.5 h-2.5 mr-1" /> Published
    </Badge>
  );
  if (status === 'draft') return (
    <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30">
      <Edit3 className="w-2.5 h-2.5 mr-1" /> Draft
    </Badge>
  );
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      <Lock className="w-2.5 h-2.5 mr-1" /> Archived
    </Badge>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminLegalPage() {
  const { admin } = useAdmin();
  const canWrite = hasWritePermission(admin);

  const [docs, setDocs] = useState<Record<string, LegalDoc>>({});
  const [audit, setAudit] = useState<Record<string, AuditEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(LEGAL_DOCS[0].slug);
  const [publishConfirm, setPublishConfirm] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [editorMode, setEditorMode] = useState<'code' | 'preview'>('code');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/legal', { credentials: 'include' });
      const data = await res.json() as { success: boolean; docs?: LegalDoc[]; audit?: Record<string, AuditEntry[]> };
      if (data.success && data.docs) {
        const map: Record<string, LegalDoc> = {};
        for (const d of data.docs) map[d.slug] = d;
        // Fill in defaults for any missing docs
        for (const def of LEGAL_DOCS) {
          if (!map[def.slug]) {
            map[def.slug] = {
              slug: def.slug,
              title: def.title,
              body: DEFAULT_CONTENT[def.slug] ?? '',
              status: 'draft',
              effectiveDate: new Date().toISOString().split('T')[0],
              version: 1,
              updatedBy: 'System',
              updatedAt: new Date().toISOString(),
            };
          }
        }
        setDocs(map);
        if (data.audit) setAudit(data.audit);
      } else {
        // Fallback to defaults
        const map: Record<string, LegalDoc> = {};
        for (const def of LEGAL_DOCS) {
          map[def.slug] = {
            slug: def.slug,
            title: def.title,
            body: DEFAULT_CONTENT[def.slug] ?? '',
            status: 'draft',
            effectiveDate: new Date().toISOString().split('T')[0],
            version: 1,
            updatedBy: 'System',
            updatedAt: new Date().toISOString(),
          };
        }
        setDocs(map);
      }
    } catch {
      setError('Failed to load legal documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateDoc(slug: string, field: keyof LegalDoc, value: string) {
    setDocs(prev => ({ ...prev, [slug]: { ...prev[slug], [field]: value } }));
  }

  async function saveDraft(slug: string) {
    if (!canWrite) return;
    setSaving(slug);
    setError(null);
    try {
      const doc = docs[slug];
      const res = await fetch('/api/admin/legal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...doc, action: 'save_draft' }),
      });
      const data = await res.json() as { success: boolean; doc?: LegalDoc; error?: string };
      if (data.success && data.doc) {
        setDocs(prev => ({ ...prev, [slug]: data.doc! }));
        setSaved(slug);
        setTimeout(() => setSaved(null), 2500);
      } else {
        setError(data.error ?? 'Save failed.');
      }
    } catch {
      setError('Save failed. Please try again.');
    } finally {
      setSaving(null);
    }
  }

  async function publishDoc(slug: string) {
    if (!canWrite) return;
    setSaving(slug);
    setError(null);
    try {
      const doc = docs[slug];
      const res = await fetch('/api/admin/legal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...doc, action: 'publish' }),
      });
      const data = await res.json() as { success: boolean; doc?: LegalDoc; error?: string };
      if (data.success && data.doc) {
        setDocs(prev => ({ ...prev, [slug]: data.doc! }));
        setSaved(slug);
        setTimeout(() => setSaved(null), 2500);
        await load(); // refresh audit trail
      } else {
        setError(data.error ?? 'Publish failed.');
      }
    } catch {
      setError('Publish failed. Please try again.');
    } finally {
      setSaving(null);
      setPublishConfirm(null);
    }
  }

  const currentDef = LEGAL_DOCS.find(d => d.slug === activeTab)!;
  const currentDoc = docs[activeTab];

  return (
    <>
      <Helmet>
        <title>Legal Pages — Admin Portal</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <AdminLayout title="Legal Pages" subtitle="Manage Privacy Policy, Terms of Service, Cookie Policy, and other legal documents">

        {/* Publish confirm dialog */}
        <AlertDialog open={!!publishConfirm} onOpenChange={() => setPublishConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publish this document?</AlertDialogTitle>
              <AlertDialogDescription>
                This will make the current draft live and visible to all users on the public website.
                The previous published version will be replaced. This action is logged in the audit trail.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => publishConfirm && publishDoc(publishConfirm)}>
                Publish Now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
            <XCircle className="w-4 h-4 shrink-0" /> {error}
            <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        {/* Info banner */}
        <div className="mb-5 flex items-start gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="text-xs text-foreground">
            <strong>Important:</strong> Legal documents must be reviewed by a qualified legal professional before publishing.
            Saving a draft does not make it live — you must explicitly click <strong>Publish</strong> to update the public-facing page.
            All publish actions are logged in the audit trail.
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <div className="flex gap-5 flex-col lg:flex-row">
            {/* Left: doc selector */}
            <div className="lg:w-56 shrink-0">
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {LEGAL_DOCS.map((def, idx) => {
                  const Icon = def.icon;
                  const doc = docs[def.slug];
                  const isActive = activeTab === def.slug;
                  return (
                    <div key={def.slug}>
                      {idx > 0 && <Separator />}
                      <button
                        onClick={() => setActiveTab(def.slug)}
                        className={`w-full text-left px-3 py-3 transition-colors flex items-start gap-2.5 ${
                          isActive ? 'bg-primary/5 border-l-2 border-primary' : 'hover:bg-muted/40'
                        }`}
                      >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div className="min-w-0">
                          <p className={`text-xs font-semibold truncate ${isActive ? 'text-primary' : 'text-foreground'}`}>
                            {def.title}
                          </p>
                          {doc && (
                            <div className="mt-1">
                              {statusBadge(doc.status)}
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Quick links */}
              <div className="mt-3 space-y-1">
                {LEGAL_DOCS.map(def => (
                  <a
                    key={def.slug}
                    href={def.publicPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View {def.title}
                  </a>
                ))}
              </div>
            </div>

            {/* Right: editor */}
            {currentDoc && (
              <div className="flex-1 min-w-0">
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  {/* Header */}
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <currentDef.icon className="w-5 h-5 text-primary shrink-0" />
                      <div>
                        <h2 className="text-sm font-bold text-foreground">{currentDef.title}</h2>
                        <p className="text-xs text-muted-foreground">{currentDef.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(currentDoc.status)}
                      <span className="text-xs text-muted-foreground">v{currentDoc.version}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => setShowAudit(v => !v)}
                      >
                        <History className="w-3.5 h-3.5" />
                        {showAudit ? 'Hide' : 'Audit Trail'}
                      </Button>
                    </div>
                  </div>

                  {/* Audit trail */}
                  {showAudit && (
                    <div className="px-5 py-3 bg-muted/30 border-b border-border">
                      <h3 className="text-xs font-semibold text-foreground mb-2">Audit Trail</h3>
                      {(audit[activeTab] ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">No audit entries yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {(audit[activeTab] ?? []).map((entry, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <Clock className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                              <span className="text-muted-foreground">{fmtDate(entry.timestamp)}</span>
                              <span className="font-medium text-foreground">{entry.action}</span>
                              <span className="text-muted-foreground">by {entry.adminName}</span>
                              {entry.detail && <span className="text-muted-foreground">— {entry.detail}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Form */}
                  <div className="p-5 space-y-4">
                    {/* Metadata row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="effective-date" className="text-xs text-muted-foreground mb-1 block">
                          Effective Date
                        </Label>
                        <Input
                          id="effective-date"
                          type="date"
                          value={currentDoc.effectiveDate}
                          onChange={e => updateDoc(activeTab, 'effectiveDate', e.target.value)}
                          disabled={!canWrite}
                          className="text-sm h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Last Updated</Label>
                        <p className="text-xs text-muted-foreground pt-2">
                          {fmtDate(currentDoc.updatedAt)} by {currentDoc.updatedBy}
                        </p>
                      </div>
                    </div>

                    {/* Body editor */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label htmlFor="doc-body" className="text-xs text-muted-foreground">
                          Document Content
                        </Label>
                        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
                          <button
                            onClick={() => setEditorMode('code')}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs transition-colors ${
                              editorMode === 'code'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <Code2 className="w-3 h-3" /> HTML
                          </button>
                          <button
                            onClick={() => setEditorMode('preview')}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs transition-colors ${
                              editorMode === 'preview'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <Eye className="w-3 h-3" /> Preview
                          </button>
                        </div>
                      </div>

                      {editorMode === 'code' ? (
                        <>
                          <Textarea
                            id="doc-body"
                            value={currentDoc.body}
                            onChange={e => updateDoc(activeTab, 'body', e.target.value)}
                            disabled={!canWrite}
                            rows={28}
                            className="font-mono text-xs leading-relaxed resize-y"
                            placeholder="Enter HTML or plain text content here..."
                            spellCheck={false}
                          />
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {currentDoc.body.length.toLocaleString()} characters · {currentDoc.body.split('\n').length} lines ·{' '}
                            <span className="text-blue-600 dark:text-blue-400">HTML tags are supported and will render on the public page</span>
                          </p>
                        </>
                      ) : (
                        <div
                          className="legal-html-body min-h-[400px] rounded-md border border-border bg-background p-5 text-sm text-foreground leading-relaxed overflow-auto"
                          dangerouslySetInnerHTML={{ __html: currentDoc.body || '<p style="color:var(--muted-foreground);font-style:italic">Nothing to preview yet.</p>' }}
                        />
                      )}
                    </div>

                    {/* Actions */}
                    {canWrite ? (
                      <div className="flex items-center justify-between pt-2 border-t border-border flex-wrap gap-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => saveDraft(activeTab)}
                            disabled={saving === activeTab}
                          >
                            {saving === activeTab ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : saved === activeTab ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                            ) : (
                              <Save className="w-3.5 h-3.5" />
                            )}
                            {saved === activeTab ? 'Saved' : 'Save Draft'}
                          </Button>
                          <a
                            href={currentDef.publicPath}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="ghost" size="sm" className="gap-1.5">
                              <Eye className="w-3.5 h-3.5" /> Preview
                            </Button>
                          </a>
                        </div>
                        <div className="flex items-center gap-2">
                          {currentDoc.status === 'published' && (
                            <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              Live since {currentDoc.publishedAt ? fmtDate(currentDoc.publishedAt) : 'unknown'}
                            </p>
                          )}
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={() => setPublishConfirm(activeTab)}
                            disabled={saving === activeTab}
                          >
                            <Globe className="w-3.5 h-3.5" />
                            {currentDoc.status === 'published' ? 'Re-publish' : 'Publish'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
                        <Lock className="w-3.5 h-3.5" />
                        You have read-only access to legal documents.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </AdminLayout>
    </>
  );
}
