import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Bot, Building2, CheckCircle2, ChevronRight, Clock, Headphones,
  LifeBuoy, Loader2, Mail, MapPin, MessageSquare, Phone, Send,
  ShieldCheck, Sparkles, AlertTriangle
} from 'lucide-react';
import {
  DATA_PROTECTION_EMAIL, GROUP_CONTACT_EMAIL, GROUP_PHONE_DISPLAY, GROUP_PHONE_HREF, PLANYX_EMAIL
} from '@/lib/contact-details';

const CATEGORIES = [
  { value: 'general', label: 'General enquiry' },
  { value: 'billing', label: 'Billing & subscriptions' },
  { value: 'technical', label: 'Technical issue' },
  { value: 'planning', label: 'Experience builders & plans' },
  { value: 'account', label: 'Account & access' },
  { value: 'feedback', label: 'Feedback & suggestions' },
  { value: 'other', label: 'Other' }
];

const PRIORITIES = [
  { value: 'low', label: 'Low — general question' },
  { value: 'normal', label: 'Normal — standard request' },
  { value: 'high', label: 'High — affecting my work' },
  { value: 'urgent', label: 'Urgent — I cannot use Sousa Murray Planeia' }
];

const DEFAULT_CONTACT_SETTINGS = {
  contactPageEnabled: true,
  contactEyebrow: 'Sousa Murray Planeia intelligent support',
  contactTitle: 'How can we help?',
  contactIntroduction: 'Describe what you need and our AI-assisted contact box will organise your enquiry before you send it.',
  contactAiTitle: 'AI-assisted contact',
  contactAiDescription: 'Tell us what you need in plain English. Sousa Murray Planeia will organise the enquiry, suggest what information to include and prepare it for the correct support route.',
  contactSupportEmail: PLANYX_EMAIL,
  contactGeneralEmail: GROUP_CONTACT_EMAIL,
  contactDpoEmail: DATA_PROTECTION_EMAIL,
  contactPhoneDisplay: GROUP_PHONE_DISPLAY,
  contactPhoneHref: GROUP_PHONE_HREF,
  contactRegisteredOffice: '167–169 Great Portland Street, 5th Floor, London, W1W 5PF',
  contactCompanyDetails: 'Company number 16314179 · ICO registration ZB877370',
  contactResponseStandard: 'Usually within 2 working days',
  contactResponseTechnical: 'Prioritised by impact',
  contactResponseData: 'Handled under applicable legal timescales',
  contactResponseNote: 'Times are estimates, not guaranteed service levels. Complex enquiries may take longer. Please avoid submitting the same enquiry more than once, as duplicates can delay handling.',
  contactEmailEnabled: true,
  contactTelephoneEnabled: true
};

export default function ContactPage() {
  const { user } = useAuth();
  const [contactSettings, setContactSettings] = useState(DEFAULT_CONTACT_SETTINGS);
  const [showForm, setShowForm] = useState(false);
  const [aiEnquiry, setAiEnquiry] = useState('');
  const [aiGuidance, setAiGuidance] = useState<null | {
    category: string;
    priority: string;
    heading: string;
    advice: string;
  }>(null);
  const [form, setForm] = useState({
    name: user ? `${user.firstName} ${user.lastName}`.trim() : '',
    email: user?.email ?? '',
    subject: '',
    message: '',
    category: 'general',
    priority: 'normal'
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [ticketReference, setTicketReference] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/support-assistant', { credentials: 'include' })
      .then((response) => response.json())
      .then((data: { success?: boolean; config?: Partial<typeof DEFAULT_CONTACT_SETTINGS> }) => {
        if (data.success && data.config) setContactSettings((current) => ({ ...current, ...data.config }));
      })
      .catch(() => {
        // Safe published defaults keep the contact page available if settings cannot be loaded.
      });
  }, []);

  function update(field: string, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function analyseEnquiry() {
    const text = aiEnquiry.trim().toLowerCase();
    if (!text) {
      setError('Please briefly describe what you need help with.');
      return;
    }

    setError('');
    let category = 'general';
    let priority = 'normal';
    let heading = 'General enquiry';
    let advice = 'Our team can review this and direct it to the right person.';

    if (/payment|charged|charge|invoice|refund|subscription|billing|cancel/.test(text)) {
      category = 'billing';
      heading = 'Billing and subscription support';
      advice = 'Include the date, amount and the email address connected to your Sousa Murray Planeia account. Never include full card details.';
    } else if (/sign in|login|password|account|access|verification|code/.test(text)) {
      category = 'account';
      heading = 'Account and access support';
      advice = 'Tell us the email address used for the account and copy any error message shown. Never send us your password.';
    } else if (/save|error|broken|not working|failed|network|export|pdf|share/.test(text)) {
      category = 'technical';
      priority = 'high';
      heading = 'Technical support';
      advice = 'Include the page or builder affected, your device/browser and the exact error message. A screenshot can also help.';
    } else if (/builder|itinerary|plan|experience|activity|destination/.test(text)) {
      category = 'planning';
      heading = 'Planning and builder help';
      advice = 'Tell us which builder or itinerary you are using and what you are trying to create.';
    } else if (/data|privacy|personal information|subject access|delete my data/.test(text)) {
      heading = 'Data protection enquiry';
      advice = 'For privacy rights or personal-data matters, contact our Data Protection Officer directly at ' + contactSettings.contactDpoEmail + '.';
    }

    if (/urgent|cannot use|can't use|locked out|charged twice|duplicate charge/.test(text)) {
      priority = 'urgent';
    }

    setAiGuidance({ category, priority, heading, advice });
  }

  function prepareEnquiry() {
    if (!aiGuidance) return;
    setForm((current) => ({
      ...current,
      category: aiGuidance.category,
      priority: aiGuidance.priority,
      subject: aiGuidance.heading,
      message: aiEnquiry
    }));
    setShowForm(true);
    window.setTimeout(() => document.getElementById('support-request-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!form.name.trim() || !form.email.trim() || !form.subject.trim() || !form.message.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/support/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form)
      });
      const data = (await response.json()) as { success: boolean; ticketReference?: string; error?: string };
      if (data.success && data.ticketReference) {
        setTicketReference(data.ticketReference);
        setSuccess(true);
      }
      else setError(data.error ?? 'We could not submit your request. Please try again.');
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Helmet>
        <title>Help & Contact — Sousa Murray Planeia</title>
        <meta
          name="description"
          content="Get quick answers from Sousa Murray Planeia AI or contact the Sousa Murray Planeia support team."
        />
      </Helmet>

      <main className="min-h-screen bg-background">
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,hsl(var(--primary)/0.20),transparent_32%),radial-gradient(circle_at_85%_20%,rgb(124_58_237/0.16),transparent_30%)]" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary mb-5">
                <Sparkles className="w-3.5 h-3.5" />
                {contactSettings.contactEyebrow}
              </div>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-foreground">
                {contactSettings.contactTitle}
              </h1>
              <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
                {contactSettings.contactIntroduction}
              </p>
            </div>

            <div className="mt-10 max-w-4xl mx-auto rounded-[28px] border border-primary/20 bg-card/95 shadow-2xl shadow-primary/10 overflow-hidden backdrop-blur">
              <div className="grid lg:grid-cols-[0.8fr_1.2fr]">
                <div className="p-6 sm:p-9 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white">
                  <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center">
                    <Bot className="w-7 h-7" />
                  </div>
                  <h2 className="mt-5 text-2xl font-bold">{contactSettings.contactAiTitle}</h2>
                  <p className="mt-3 text-sm text-blue-50 leading-relaxed">
                    {contactSettings.contactAiDescription}
                  </p>
                  <div className="mt-6 rounded-xl border border-white/20 bg-white/10 p-4 text-xs text-blue-50">
                    This does not open the chatbot or send anything automatically. You stay in control
                    and review the completed contact form before submitting it.
                  </div>
                </div>

                <div className="p-6 sm:p-9">
                  <Label htmlFor="ai-enquiry" className="text-base font-bold text-foreground">
                    What can we help you with?
                  </Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Include what you were trying to do and what went wrong.
                  </p>
                  <Textarea
                    id="ai-enquiry"
                    value={aiEnquiry}
                    onChange={(event) => {
                      setAiEnquiry(event.target.value);
                      setAiGuidance(null);
                    }}
                    placeholder="For example: I was charged twice for my subscription and need help checking the payments…"
                    className="mt-4 min-h-[130px] resize-y"
                  />
                  <Button type="button" onClick={analyseEnquiry} className="mt-4 w-full sm:w-auto gap-2">
                    <Sparkles className="w-4 h-4" />
                    Help prepare my enquiry
                  </Button>

                  {aiGuidance && (
                    <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-5">
                      <p className="text-xs font-bold uppercase tracking-wide text-primary">Suggested route</p>
                      <h3 className="mt-1 font-bold text-foreground">{aiGuidance.heading}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">{aiGuidance.advice}</p>
                      <Button type="button" variant="outline" onClick={prepareEnquiry} className="mt-4 gap-2">
                        <MessageSquare className="w-4 h-4" />
                        Continue to contact form
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="text-center mb-8">
            <p className="text-sm font-semibold text-primary">Prefer a person?</p>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-foreground">Contact the support team</h2>
            <p className="mt-2 text-sm text-muted-foreground">Choose the easiest way to reach us.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {contactSettings.contactPageEnabled && <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-2xl border border-border bg-card p-6 text-left hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-lg transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="mt-4 font-bold text-foreground">Send a support request</h3>
              <p className="mt-1 text-sm text-muted-foreground">Tell us what happened using our secure form.</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                Open form <ChevronRight className="w-4 h-4" />
              </span>
            </button>}

            {contactSettings.contactEmailEnabled && <a
              href={`mailto:${contactSettings.contactSupportEmail}`}
              className="rounded-2xl border border-border bg-card p-6 hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-lg transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="mt-4 font-bold text-foreground">Email Sousa Murray Planeia</h3>
              <p className="mt-1 text-sm text-muted-foreground">Accounts, subscriptions, technical help and account deletion.</p>
              <span className="mt-4 block text-sm font-semibold text-primary break-all">{contactSettings.contactSupportEmail}</span>
            </a>}

            {contactSettings.contactTelephoneEnabled && <a
              href={contactSettings.contactPhoneHref}
              className="rounded-2xl border border-border bg-card p-6 hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-lg transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-500">
                <Phone className="w-5 h-5" />
              </div>
              <h3 className="mt-4 font-bold text-foreground">Call JA Group Services</h3>
              <p className="mt-1 text-sm text-muted-foreground">For general company enquiries and telephone assistance.</p>
              <span className="mt-4 block text-sm font-semibold text-primary">{contactSettings.contactPhoneDisplay}</span>
            </a>}
          </div>

          {showForm && contactSettings.contactPageEnabled && (
            <div className="mt-8 max-w-4xl mx-auto">
              {success ? (
                <div className="rounded-3xl border border-emerald-500/20 bg-card p-10 text-center shadow-lg">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>
                  <h2 className="mt-5 text-2xl font-bold text-foreground">Your ticket has been created</h2>
                  <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                    We have received your enquiry and routed it to the Sousa Murray Planeia support team.
                  </p>
                  <div className="mt-5 mx-auto max-w-sm rounded-2xl border border-primary/20 bg-primary/5 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Your ticket number</p>
                    <p className="mt-2 text-2xl font-black tracking-wide text-foreground" aria-live="polite">{ticketReference}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Keep this number. If you call us on {contactSettings.contactPhoneDisplay}, quote it so we can identify your enquiry.
                    </p>
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Our reply will be sent to <strong className="text-foreground">{form.email}</strong>.
                  </p>
                  <Button
                    className="mt-6"
                    onClick={() => {
                      setSuccess(false);
                      setTicketReference('');
                      setForm((current) => ({ ...current, subject: '', message: '' }));
                    }}
                  >
                    Send another request
                  </Button>
                </div>
              ) : (
                <form id="support-request-form" onSubmit={handleSubmit} className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-xl shadow-primary/5 scroll-mt-24">
                  <div className="flex items-start justify-between gap-4 mb-7">
                    <div>
                      <div className="flex items-center gap-2 text-primary">
                        <Headphones className="w-5 h-5" />
                        <span className="text-xs font-bold uppercase tracking-wide">Human support</span>
                      </div>
                      <h2 className="mt-2 text-2xl font-bold text-foreground">Tell us what you need</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Include what you expected, what happened and any error message you saw.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="text-sm font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Close
                    </button>
                  </div>

                  {error && (
                    <Alert variant="destructive" className="mb-5">
                      <AlertTriangle className="w-4 h-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="grid sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full name *</Label>
                      <Input id="name" value={form.name} onChange={(e) => update('name', e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email address *</Label>
                      <Input id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">What is this about?</Label>
                      <Select value={form.category} onValueChange={(value) => update('category', value)}>
                        <SelectTrigger id="category"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((category) => (
                            <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="priority">How much is it affecting you?</Label>
                      <Select value={form.priority} onValueChange={(value) => update('priority', value)}>
                        <SelectTrigger id="priority"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map((priority) => (
                            <SelectItem key={priority.value} value={priority.value}>{priority.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2">
                    <Label htmlFor="subject">Subject *</Label>
                    <Input
                      id="subject"
                      value={form.subject}
                      onChange={(e) => update('subject', e.target.value)}
                      placeholder="A short summary of the problem"
                      required
                    />
                  </div>

                  <div className="mt-5 space-y-2">
                    <Label htmlFor="message">What happened? *</Label>
                    <Textarea
                      id="message"
                      value={form.message}
                      onChange={(e) => update('message', e.target.value)}
                      placeholder="Describe the issue, what you were trying to do and any error message shown…"
                      className="min-h-[150px]"
                      required
                    />
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-border pt-5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      Your enquiry will receive a ticket number and be routed securely to our support team.
                    </div>
                    <Button type="submit" disabled={submitting} className="gap-2">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {submitting ? 'Sending…' : 'Send request'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          <div className="mt-12 grid lg:grid-cols-[1.05fr_0.95fr] gap-6">
            <div className="rounded-3xl border border-border bg-card p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary">What happens next</p>
                  <h2 className="text-xl font-bold text-foreground">Response times</h2>
                </div>
              </div>
              <div className="mt-6 space-y-4 text-sm">
                <div className="flex justify-between gap-4 border-b border-border pb-3">
                  <span className="font-medium text-foreground">Online support requests</span>
                  <span className="text-right text-muted-foreground">{contactSettings.contactResponseStandard}</span>
                </div>
                <div className="flex justify-between gap-4 border-b border-border pb-3">
                  <span className="font-medium text-foreground">Account or technical issues</span>
                  <span className="text-right text-muted-foreground">{contactSettings.contactResponseTechnical}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="font-medium text-foreground">Data protection requests</span>
                  <span className="text-right text-muted-foreground">{contactSettings.contactResponseData}</span>
                </div>
              </div>
              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                {contactSettings.contactResponseNote}
              </p>
            </div>

            <div className="rounded-3xl border border-border bg-muted/30 p-6 sm:p-8">
              <p className="text-sm font-semibold text-primary">Full contact details</p>
              <h2 className="mt-1 text-xl font-bold text-foreground">JA Group Services Ltd</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Sousa Murray Planeia is operated by JA Group Services Ltd, registered in England and Wales.
              </p>
              <div className="mt-6 space-y-4 text-sm">
                {contactSettings.contactTelephoneEnabled && <a href={contactSettings.contactPhoneHref} className="flex gap-3 hover:text-primary">
                  <Phone className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <span><strong className="block text-foreground">Telephone</strong>{contactSettings.contactPhoneDisplay}</span>
                </a>}
                {contactSettings.contactEmailEnabled && <a href={'mailto:' + contactSettings.contactSupportEmail} className="flex gap-3 hover:text-primary">
                  <Mail className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <span className="min-w-0"><strong className="block text-foreground">Sousa Murray Planeia support</strong><span className="break-all">{contactSettings.contactSupportEmail}</span></span>
                </a>}
                <a href={'mailto:' + contactSettings.contactDpoEmail} className="flex gap-3 hover:text-primary">
                  <ShieldCheck className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <span className="min-w-0"><strong className="block text-foreground">Data Protection Officer</strong><span className="break-all">{contactSettings.contactDpoEmail}</span></span>
                </a>
                <div className="flex gap-3">
                  <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <span><strong className="block text-foreground">Registered office</strong>{contactSettings.contactRegisteredOffice}</span>
                </div>
                <div className="flex gap-3">
                  <Building2 className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <span><strong className="block text-foreground">Company details</strong>{contactSettings.contactCompanyDetails}</span>
                </div>
              </div>
              <p className="mt-5 text-xs text-muted-foreground">
                Telephone availability may vary. Please use the secure form or email for account-specific
                matters so we can keep a written record of your request.
              </p>
            </div>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <LifeBuoy className="w-4 h-4" />
              General JA Group Services enquiries:
            </div>
            <a href={`mailto:${contactSettings.contactGeneralEmail}`} className="font-semibold text-primary hover:underline">
              {contactSettings.contactGeneralEmail}
            </a>
            <span className="hidden sm:inline">•</span>
            <Link to="/privacy" className="hover:text-foreground hover:underline">Privacy</Link>
          </div>
        </section>
      </main>
    </>
  );
}
