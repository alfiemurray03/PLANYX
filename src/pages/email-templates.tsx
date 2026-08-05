/**
 * Email Template Centre — rebuilt
 * Placeholders, variables panel, copy actions, 15 presets, export/import JSON.
 * mailto is a fallback only — reply-to removed (not a standard mailto param).
 */
import { useState, useMemo, useCallback, useRef } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Mail, Plus, Trash2, Copy, Search, Star, Archive, Edit2, Save,
  CheckCircle2, Link2, Eye, RefreshCw, Tag,
  MessageSquare, Users, Briefcase, Heart, GraduationCap, Building2,
  AlertCircle, ChevronRight, FileText, Send, Download, Upload,
  Variable, X, Info,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type EmailCategory =
  | 'general' | 'customer-service' | 'complaint-response' | 'sales'
  | 'marketing' | 'support' | 'appointment' | 'reminder' | 'follow-up'
  | 'school' | 'charity' | 'organisation' | 'internal' | 'finance' | 'custom';

interface EmailTemplate {
  id: string;
  name: string;
  category: EmailCategory;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  signature: string;
  attachmentNotes: string;
  isFavourite: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

// ── Placeholder tokens ────────────────────────────────────────────────────────

const PLACEHOLDER_TOKENS = [
  { token: '[Name]',             label: 'Name',              hint: 'Recipient name' },
  { token: '[Company]',          label: 'Company',           hint: 'Company or organisation' },
  { token: '[Date]',             label: 'Date',              hint: 'A date' },
  { token: '[Reference]',        label: 'Reference',         hint: 'Reference number' },
  { token: '[Invoice Number]',   label: 'Invoice Number',    hint: 'Invoice number' },
  { token: '[Amount]',           label: 'Amount',            hint: 'Monetary amount' },
  { token: '[Due Date]',         label: 'Due Date',          hint: 'Payment due date' },
  { token: '[Appointment Date]', label: 'Appointment Date',  hint: 'Appointment date/time' },
  { token: '[Custom Field]',     label: 'Custom Field',      hint: 'Any custom value' },
];

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: Array<{ value: EmailCategory; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'general',            label: 'General Email',          icon: Mail },
  { value: 'customer-service',   label: 'Customer Service',       icon: Users },
  { value: 'complaint-response', label: 'Complaint Response',     icon: AlertCircle },
  { value: 'sales',              label: 'Sales Email',            icon: Briefcase },
  { value: 'marketing',          label: 'Marketing Email',        icon: Tag },
  { value: 'support',            label: 'Support Email',          icon: MessageSquare },
  { value: 'appointment',        label: 'Appointment Email',      icon: CheckCircle2 },
  { value: 'reminder',           label: 'Reminder Email',         icon: RefreshCw },
  { value: 'follow-up',          label: 'Follow-Up Email',        icon: ChevronRight },
  { value: 'school',             label: 'School Email',           icon: GraduationCap },
  { value: 'charity',            label: 'Charity Email',          icon: Heart },
  { value: 'organisation',       label: 'Organisation Email',     icon: Building2 },
  { value: 'internal',           label: 'Internal Team Email',    icon: Users },
  { value: 'finance',            label: 'Finance Email',          icon: Briefcase },
  { value: 'custom',             label: 'Custom Template',        icon: FileText },
];

// ── 15 built-in starter templates ────────────────────────────────────────────
const STARTER_TEMPLATES: Omit<EmailTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'General Enquiry Response',
    category: 'customer-service',
    to: '', cc: '', bcc: '',
    subject: 'RE: Your Enquiry',
    body: `Dear [Name],

Thank you for getting in touch with us.

We have received your enquiry and will respond in full within [X] working days.

If your matter is urgent, please do not hesitate to contact us directly on [phone number].

Thank you for your patience.`,
    signature: 'Kind regards,\n[Your Name]\n[Job Title]\n[Company]\n[Phone] | [Email]',
    attachmentNotes: '',
    isFavourite: false, isArchived: false, tags: ['enquiry', 'response'],
  },
  {
    name: 'Complaint Acknowledgement',
    category: 'complaint-response',
    to: '', cc: '', bcc: '',
    subject: 'RE: Your Complaint — [Reference]',
    body: `Dear [Name],

Thank you for contacting us regarding your recent experience. We are sorry to hear that you have cause for complaint.

We take all complaints seriously and are committed to resolving this matter as quickly as possible.

Your complaint has been logged under reference number [Reference] and has been passed to [Name/Department] for investigation.

We aim to provide a full response within [X] working days. In the meantime, if you have any further information you would like to add, please do not hesitate to contact us.

Once again, we apologise for any inconvenience caused.`,
    signature: 'Yours sincerely,\n[Your Name]\n[Job Title]\n[Company]',
    attachmentNotes: '',
    isFavourite: true, isArchived: false, tags: ['complaint', 'acknowledgement'],
  },
  {
    name: 'Complaint Final Response',
    category: 'complaint-response',
    to: '', cc: '', bcc: '',
    subject: 'Final Response to Your Complaint — [Reference]',
    body: `Dear [Name],

Thank you for your patience while we investigated your complaint, reference [Reference], received on [Date].

Having completed our investigation, I am now in a position to provide our final response.

Summary of your complaint:
[Summarise what the customer complained about]

Our findings:
[Explain what was found during the investigation — be factual and clear]

Our decision:
[State clearly whether the complaint is upheld, partially upheld, or not upheld, and why]

[If upheld: As a result, we will [describe the remedy — refund, apology, corrective action, etc.]]

If you remain dissatisfied with our response, you have the right to refer your complaint to [relevant ombudsman / regulator] within [X] months of this letter.

We are sorry for any inconvenience caused and thank you for bringing this matter to our attention.`,
    signature: 'Yours sincerely,\n[Your Name]\n[Job Title]\n[Company]',
    attachmentNotes: '',
    isFavourite: false, isArchived: false, tags: ['complaint', 'final response'],
  },
  {
    name: 'Quote Follow-Up',
    category: 'sales',
    to: '', cc: '', bcc: '',
    subject: 'Following Up on Your Quote — [Reference]',
    body: `Dear [Name],

I hope you are well.

I am following up on the quote we sent you on [Date] for [description of goods/services], reference [Reference].

We wanted to check whether you had the opportunity to review the proposal and whether you have any questions or would like to discuss anything further.

Our quote is valid until [Date]. If you would like to proceed, or if there is anything we can adjust to better meet your requirements, please do not hesitate to get in touch.

We look forward to hearing from you.`,
    signature: 'Kind regards,\n[Your Name]\n[Job Title]\n[Company]\n[Phone] | [Email]',
    attachmentNotes: '',
    isFavourite: false, isArchived: false, tags: ['quote', 'follow-up', 'sales'],
  },
  {
    name: 'Invoice Reminder',
    category: 'finance',
    to: '', cc: '', bcc: '',
    subject: 'Invoice Reminder — [Invoice Number] Due [Due Date]',
    body: `Dear [Name],

I hope this email finds you well.

This is a friendly reminder that invoice [Invoice Number], dated [Date], for the amount of £[Amount] is due for payment on [Due Date].

If you have already arranged payment, please disregard this email and accept our thanks.

If you have any queries regarding this invoice, please do not hesitate to contact us.

Payment can be made by:
• Bank transfer to: [Bank Details]
• Online at: [Payment Link]
• Cheque payable to: [Company]`,
    signature: 'Kind regards,\n[Your Name]\n[Job Title]\n[Company]\n[Phone] | [Email]',
    attachmentNotes: 'Invoice [Invoice Number] attached',
    isFavourite: false, isArchived: false, tags: ['invoice', 'reminder', 'finance'],
  },
  {
    name: 'Overdue Payment Reminder',
    category: 'finance',
    to: '', cc: '', bcc: '',
    subject: 'OVERDUE: Invoice [Invoice Number] — Immediate Payment Required',
    body: `Dear [Name],

I am writing regarding invoice [Invoice Number], dated [Date], for £[Amount], which was due for payment on [Due Date].

Our records show that this invoice remains unpaid. This is now [X] days overdue.

We would be grateful if you could arrange payment immediately. If there is a reason for the delay, please contact us as a matter of urgency so we can discuss a resolution.

Please note that continued non-payment may result in:
• Late payment charges under the Late Payment of Commercial Debts (Interest) Act 1998
• Referral to our debt recovery team
• Legal proceedings

If you have already made payment, please disregard this notice and provide us with your payment reference so we can update our records.`,
    signature: 'Yours sincerely,\n[Your Name]\n[Job Title]\n[Company]\n[Phone] | [Email]',
    attachmentNotes: 'Copy of invoice [Invoice Number] attached',
    isFavourite: false, isArchived: false, tags: ['invoice', 'overdue', 'finance'],
  },
  {
    name: 'Appointment Confirmation',
    category: 'appointment',
    to: '', cc: '', bcc: '',
    subject: 'Appointment Confirmation — [Appointment Date]',
    body: `Dear [Name],

This email confirms your appointment with [Name/Department] on:

Date: [Appointment Date]
Time: [Time]
Location: [Address / Video Call Link]

Please arrive [X] minutes before your appointment time. If you need to cancel or rearrange, please contact us at least [X] hours in advance on [phone/email].

We look forward to seeing you.`,
    signature: 'Kind regards,\n[Your Name]\n[Company]\n[Phone] | [Email]',
    attachmentNotes: '',
    isFavourite: false, isArchived: false, tags: ['appointment', 'confirmation'],
  },
  {
    name: 'Appointment Reminder',
    category: 'appointment',
    to: '', cc: '', bcc: '',
    subject: 'Reminder: Your Appointment on [Appointment Date]',
    body: `Dear [Name],

This is a friendly reminder that you have an appointment scheduled with us:

Date: [Appointment Date]
Time: [Time]
Location: [Address / Video Call Link]

If you need to cancel or rearrange, please let us know as soon as possible by contacting us on [phone/email].

We look forward to seeing you.`,
    signature: 'Kind regards,\n[Your Name]\n[Company]\n[Phone] | [Email]',
    attachmentNotes: '',
    isFavourite: false, isArchived: false, tags: ['appointment', 'reminder'],
  },
  {
    name: 'Support Ticket Reply',
    category: 'support',
    to: '', cc: '', bcc: '',
    subject: 'RE: Your Support Request — [Reference]',
    body: `Dear [Name],

Thank you for contacting our support team. Your request has been logged under reference [Reference].

[Provide your response to the support request here. Be clear, helpful, and concise.]

If this resolves your issue, no further action is required. If you need further assistance, please reply to this email quoting your reference number [Reference].

We aim to respond to all queries within [X] working hours/days.`,
    signature: 'Kind regards,\n[Your Name]\nSupport Team\n[Company]\n[Email]',
    attachmentNotes: '',
    isFavourite: false, isArchived: false, tags: ['support', 'ticket'],
  },
  {
    name: 'School Parent Notice',
    category: 'school',
    to: '', cc: '', bcc: '',
    subject: '[School Name] — Important Notice for Parents and Carers',
    body: `Dear Parents and Carers,

I am writing to inform you of the following important matter.

[Write the notice here. Be clear and concise. Include:]
• What is happening
• When it is happening
• What action (if any) parents need to take
• Who to contact with questions

[If applicable: Please return the attached slip / complete the online form at [link] by [Date].]

Thank you for your continued support.`,
    signature: 'Kind regards,\n[Headteacher / Class Teacher Name]\n[School Name]\n[Phone] | [Email]',
    attachmentNotes: '',
    isFavourite: false, isArchived: false, tags: ['school', 'notice', 'parents'],
  },
  {
    name: 'Charity Fundraising Appeal',
    category: 'charity',
    to: '', cc: '', bcc: '',
    subject: 'Help Us Make a Difference — [Campaign Name]',
    body: `Dear [Name],

I hope this message finds you well.

I am writing on behalf of [Company] to share some exciting news about our latest campaign: [Campaign Name].

[Describe the campaign and its impact — be specific and personal]

We are asking for your support to help us reach our target of £[Amount] by [Date].

Every contribution, no matter how small, makes a real difference to the people we support.

To donate, please visit: [Donation Link]

Thank you so much for your generosity and continued support.`,
    signature: 'With warm regards,\n[Your Name]\n[Job Title]\n[Company]\nRegistered Charity No. [Reference]',
    attachmentNotes: '',
    isFavourite: false, isArchived: false, tags: ['charity', 'fundraising', 'appeal'],
  },
  {
    name: 'Donation Thank-You',
    category: 'charity',
    to: '', cc: '', bcc: '',
    subject: 'Thank You for Your Generous Donation',
    body: `Dear [Name],

On behalf of everyone at [Company], I wanted to write personally to thank you for your generous donation of £[Amount] received on [Date].

Your support means a great deal to us. Thanks to donors like you, we are able to [describe the impact — e.g. "provide meals to over 200 families each week"].

Your contribution will be put to work immediately, and we will keep you updated on the difference it makes.

If you have any questions about how your donation is being used, or if you would like to find out more about our work, please do not hesitate to get in touch.

With sincere gratitude,`,
    signature: '[Your Name]\n[Job Title]\n[Company]\nRegistered Charity No. [Reference]',
    attachmentNotes: '',
    isFavourite: false, isArchived: false, tags: ['charity', 'donation', 'thank-you'],
  },
  {
    name: 'Internal Announcement',
    category: 'internal',
    to: 'All Staff', cc: '', bcc: '',
    subject: '[ANNOUNCEMENT] [Subject]',
    body: `Dear Team,

I wanted to share an important update with you all.

[Write your announcement here. Include:]
• What is changing or happening
• When it takes effect
• What it means for the team
• Any action required

If you have any questions, please do not hesitate to speak with [Name/Department].

Thank you.`,
    signature: 'Best regards,\n[Your Name]\n[Job Title]',
    attachmentNotes: '',
    isFavourite: false, isArchived: false, tags: ['internal', 'announcement'],
  },
  {
    name: 'Sales Introduction',
    category: 'sales',
    to: '', cc: '', bcc: '',
    subject: 'Introduction — [Company]',
    body: `Dear [Name],

I hope you are well. My name is [Your Name] and I am reaching out from [Company].

We specialise in [brief description of your product/service] and I believe we could offer real value to [Recipient Company].

I would love the opportunity to have a brief conversation to explore whether there might be a good fit. Would you be available for a 15-minute call at any point this week or next?

I look forward to hearing from you.`,
    signature: 'Kind regards,\n[Your Name]\n[Job Title]\n[Company]\n[Phone] | [Email]',
    attachmentNotes: '',
    isFavourite: false, isArchived: false, tags: ['sales', 'introduction'],
  },
  {
    name: 'Follow-Up Email',
    category: 'follow-up',
    to: '', cc: '', bcc: '',
    subject: 'Following Up — [Subject]',
    body: `Dear [Name],

I hope this email finds you well.

I am following up on my previous email dated [Date] regarding [Subject]. I wanted to check whether you had the opportunity to review the information provided and whether you have any questions.

Please do not hesitate to get in touch if you require any further information or would like to discuss this further.

I look forward to hearing from you.`,
    signature: 'Kind regards,\n[Your Name]\n[Job Title]\n[Company]',
    attachmentNotes: '',
    isFavourite: false, isArchived: false, tags: ['follow-up'],
  },
];

// ── Mailto generator (no reply-to — not a standard mailto param) ──────────────
function buildMailto(to: string, subject: string, body: string, cc: string, bcc: string): string {
  const params: string[] = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body)    params.push(`body=${encodeURIComponent(body)}`);
  if (cc)      params.push(`cc=${encodeURIComponent(cc)}`);
  if (bcc)     params.push(`bcc=${encodeURIComponent(bcc)}`);
  const base = `mailto:${encodeURIComponent(to || '')}`;
  return params.length ? `${base}?${params.join('&')}` : base;
}

// ── Placeholder resolution ────────────────────────────────────────────────────
function resolvePlaceholders(text: string, vars: Record<string, string>): string {
  let out = text;
  for (const [token, value] of Object.entries(vars)) {
    if (value.trim()) {
      out = out.split(token).join(value);
    }
  }
  return out;
}

function findMissingPlaceholders(text: string, vars: Record<string, string>): string[] {
  const missing: string[] = [];
  for (const { token } of PLACEHOLDER_TOKENS) {
    if (text.includes(token) && !vars[token]?.trim()) {
      missing.push(token);
    }
  }
  // Also find any [Custom] style tokens not in the standard list
  const customMatches = text.match(/\[[^\]]+\]/g) ?? [];
  for (const m of customMatches) {
    if (!PLACEHOLDER_TOKENS.find(p => p.token === m) && !vars[m]?.trim() && !missing.includes(m)) {
      missing.push(m);
    }
  }
  return missing;
}

// ── Storage helpers ───────────────────────────────────────────────────────────
const STORAGE_KEY = 'ja-email-templates-v2';

function loadTemplates(): EmailTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as EmailTemplate[];
  } catch { /* ignore */ }
  const seeded = STARTER_TEMPLATES.map((t, i) => ({
    ...t,
    id: `starter-${i}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

function saveTemplates(templates: EmailTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

function newTemplate(): EmailTemplate {
  return {
    id: `tpl-${Date.now()}`,
    name: 'New Email Template',
    category: 'general',
    to: '', cc: '', bcc: '',
    subject: '',
    body: '',
    signature: '',
    attachmentNotes: '',
    isFavourite: false,
    isArchived: false,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Category icon helper ──────────────────────────────────────────────────────
function CategoryIcon({ category, className }: { category: EmailCategory; className?: string }) {
  const cat = CATEGORIES.find(c => c.value === category);
  if (!cat) return <Mail className={className} />;
  const Icon = cat.icon;
  return <Icon className={className} />;
}

// ── Copy button helper ────────────────────────────────────────────────────────
function CopyBtn({ text, label, successLabel = 'Copied!' }: { text: string; label: string; successLabel?: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={handleCopy}
      className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded hover:bg-slate-700">
      {copied ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {copied ? successLabel : label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Main page ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
export default function EmailTemplatesPage() {
  const [templates, setTemplates]       = useState<EmailTemplate[]>(() => loadTemplates());
  const [selected, setSelected]         = useState<EmailTemplate | null>(null);
  const [editing, setEditing]           = useState<EmailTemplate | null>(null);
  const [search, setSearch]             = useState('');
  const [catFilter, setCatFilter]       = useState<EmailCategory | 'all' | 'favourites' | 'archived'>('all');
  const [tab, setTab]                   = useState<'edit' | 'preview' | 'variables' | 'mailto'>('edit');
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null);
  const [savedMsg, setSavedMsg]         = useState('');
  const [copiedMailto, setCopiedMailto] = useState(false);

  // Variables panel state
  const [vars, setVars] = useState<Record<string, string>>({});

  const importRef = useRef<HTMLInputElement>(null);

  const persist = useCallback((next: EmailTemplate[]) => {
    setTemplates(next);
    saveTemplates(next);
  }, []);

  // Filtered list
  const filtered = useMemo(() => {
    let list = templates;
    if (catFilter === 'favourites') list = list.filter(t => t.isFavourite);
    else if (catFilter === 'archived') list = list.filter(t => t.isArchived);
    else if (catFilter !== 'all') list = list.filter(t => t.category === catFilter && !t.isArchived);
    else list = list.filter(t => !t.isArchived);

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q))
      );
    }
    return list;
  }, [templates, catFilter, search]);

  function handleNew() {
    const t = newTemplate();
    persist([t, ...templates]);
    setEditing(t);
    setSelected(t);
    setTab('edit');
    setVars({});
  }

  function handleSelect(t: EmailTemplate) {
    setSelected(t);
    setEditing({ ...t });
    setTab('edit');
    setVars({});
  }

  function handleSave() {
    if (!editing) return;
    const updated = { ...editing, updatedAt: new Date().toISOString() };
    persist(templates.map(t => t.id === updated.id ? updated : t));
    setSelected(updated);
    setSavedMsg('Saved.');
    setTimeout(() => setSavedMsg(''), 2000);
  }

  function handleSend() {
    if (!editing) return;
    const fullBody = editing.body + (editing.signature ? '\n\n' + editing.signature : '');
    const mailto = buildMailto(editing.to, editing.subject, fullBody, editing.cc, editing.bcc);
    window.location.href = mailto;
  }

  function handleDuplicate(t: EmailTemplate) {
    const copy: EmailTemplate = {
      ...t,
      id: `tpl-${Date.now()}`,
      name: `${t.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    persist([copy, ...templates]);
    handleSelect(copy);
  }

  function handleToggleFavourite(id: string) {
    persist(templates.map(t => t.id === id ? { ...t, isFavourite: !t.isFavourite } : t));
    if (editing?.id === id) setEditing(e => e ? { ...e, isFavourite: !e.isFavourite } : e);
  }

  function handleArchive(id: string) {
    persist(templates.map(t => t.id === id ? { ...t, isArchived: !t.isArchived } : t));
    if (selected?.id === id) { setSelected(null); setEditing(null); }
  }

  function handleDelete() {
    if (!deleteTarget) return;
    persist(templates.filter(t => t.id !== deleteTarget.id));
    if (selected?.id === deleteTarget.id) { setSelected(null); setEditing(null); }
    setDeleteTarget(null);
  }

  // Export all templates as JSON
  function handleExport() {
    const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-templates-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Import templates from JSON
  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string) as EmailTemplate[];
        if (!Array.isArray(imported)) return;
        // Merge: skip duplicates by id
        const existingIds = new Set(templates.map(t => t.id));
        const fresh = imported.filter(t => !existingIds.has(t.id));
        persist([...fresh, ...templates]);
        setSavedMsg(`Imported ${fresh.length} template(s).`);
        setTimeout(() => setSavedMsg(''), 3000);
      } catch { /* ignore bad JSON */ }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const mailtoLink = useMemo(() => {
    if (!editing) return '';
    return buildMailto(editing.to, editing.subject, editing.body + (editing.signature ? '\n\n' + editing.signature : ''), editing.cc, editing.bcc);
  }, [editing]);

  function handleCopyMailto() {
    void navigator.clipboard.writeText(mailtoLink).then(() => {
      setCopiedMailto(true);
      setTimeout(() => setCopiedMailto(false), 2000);
    });
  }

  // Resolved preview text (with variables applied)
  const resolvedBody = useMemo(() => {
    if (!editing) return '';
    return resolvePlaceholders(editing.body, vars);
  }, [editing, vars]);

  const resolvedSubject = useMemo(() => {
    if (!editing) return '';
    return resolvePlaceholders(editing.subject, vars);
  }, [editing, vars]);

  const resolvedSignature = useMemo(() => {
    if (!editing) return '';
    return resolvePlaceholders(editing.signature, vars);
  }, [editing, vars]);

  const missingPlaceholders = useMemo(() => {
    if (!editing) return [];
    return findMissingPlaceholders(editing.subject + ' ' + editing.body + ' ' + editing.signature, vars);
  }, [editing, vars]);

  // All tokens found in the current template
  const templateTokens = useMemo(() => {
    if (!editing) return [];
    const text = editing.subject + ' ' + editing.body + ' ' + editing.signature;
    const found = new Set<string>();
    for (const { token } of PLACEHOLDER_TOKENS) {
      if (text.includes(token)) found.add(token);
    }
    const customMatches = text.match(/\[[^\]]+\]/g) ?? [];
    for (const m of customMatches) found.add(m);
    return Array.from(found);
  }, [editing]);

  const favCount = templates.filter(t => t.isFavourite && !t.isArchived).length;
  const arcCount = templates.filter(t => t.isArchived).length;

  return (
    <>
      <Helmet>
        <title>Email Template Centre — Sousa Murray Planeia</title>
        <meta name="description" content="Create, edit, and manage professional UK email templates with placeholder support and mailto link generation." />
      </Helmet>
      <DashboardLayout>
        <div className="flex h-full min-h-screen bg-slate-950">

          {/* ── Sidebar: template list ── */}
          <div className="w-72 shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                    <Mail className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <h1 className="text-sm font-semibold text-white">Email Templates</h1>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={handleExport} title="Export all templates as JSON"
                    className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-slate-700 transition-colors">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => importRef.current?.click()} title="Import templates from JSON"
                    className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-slate-700 transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                  </button>
                  <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
                  <Button size="sm" onClick={handleNew}
                    className="bg-blue-600 hover:bg-blue-500 text-white h-7 w-7 p-0 ml-1">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <Input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search templates…"
                  className="pl-8 h-8 bg-slate-800 border-slate-600 text-white text-xs placeholder:text-slate-500" />
              </div>
            </div>

            {/* Category filter chips */}
            <div className="px-3 py-2 border-b border-slate-800 overflow-x-auto">
              <div className="flex gap-1 min-w-max">
                {[
                  { value: 'all',        label: 'All' },
                  { value: 'favourites', label: `★ ${favCount}` },
                  { value: 'archived',   label: `Arc ${arcCount}` },
                ].map(f => (
                  <button key={f.value} onClick={() => setCatFilter(f.value as typeof catFilter)}
                    className={`text-[10px] px-2 py-1 rounded whitespace-nowrap transition-colors ${catFilter === f.value ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category list */}
            <div className="px-2 py-2 border-b border-slate-800 overflow-y-auto max-h-40">
              <div className="space-y-0.5">
                {CATEGORIES.map(cat => {
                  const count = templates.filter(t => t.category === cat.value && !t.isArchived).length;
                  if (count === 0) return null;
                  return (
                    <button key={cat.value} onClick={() => setCatFilter(cat.value)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${catFilter === cat.value ? 'bg-blue-900/30 text-blue-300' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                      <cat.icon className="w-3 h-3 shrink-0" />
                      <span className="text-[10px] flex-1 truncate">{cat.label}</span>
                      <span className="text-[9px] text-slate-600">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Template list */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <Mail className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">No templates found.</p>
                  <Button size="sm" onClick={handleNew} className="mt-3 bg-blue-600 hover:bg-blue-500 text-white text-xs h-7 gap-1">
                    <Plus className="w-3 h-3" /> New Template
                  </Button>
                </div>
              ) : filtered.map(t => (
                <button key={t.id} onClick={() => handleSelect(t)}
                  className={`w-full text-left px-3 py-2.5 border-b border-slate-800/50 transition-colors ${selected?.id === t.id ? 'bg-blue-900/20 border-l-2 border-l-blue-500' : 'hover:bg-slate-800/50'}`}>
                  <div className="flex items-start gap-2">
                    <CategoryIcon category={t.category} className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-white truncate flex-1">{t.name}</p>
                        {t.isFavourite && <Star className="w-3 h-3 text-amber-400 shrink-0 fill-amber-400" />}
                      </div>
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">{t.subject || '(no subject)'}</p>
                      <p className="text-[9px] text-slate-600 mt-0.5">
                        {CATEGORIES.find(c => c.value === t.category)?.label}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Main editor area ── */}
          {editing ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Editor toolbar */}
              <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/50 shrink-0 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <CategoryIcon category={editing.category} className="w-4 h-4 text-blue-400 shrink-0" />
                  <Input value={editing.name} onChange={e => setEditing(ed => ed ? { ...ed, name: e.target.value } : ed)}
                    className="h-7 bg-transparent border-0 text-white text-sm font-semibold p-0 focus-visible:ring-0 w-64" />
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  {savedMsg && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{savedMsg}</span>}
                  <button onClick={() => handleToggleFavourite(editing.id)}
                    className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${editing.isFavourite ? 'text-amber-400' : 'text-slate-500 hover:text-amber-400'}`}
                    title={editing.isFavourite ? 'Remove from favourites' : 'Add to favourites'}>
                    <Star className={`w-4 h-4 ${editing.isFavourite ? 'fill-amber-400' : ''}`} />
                  </button>
                  <button onClick={() => handleDuplicate(editing)}
                    className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-slate-700 transition-colors" title="Duplicate template">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleArchive(editing.id)}
                    className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-slate-700 transition-colors" title={editing.isArchived ? 'Unarchive' : 'Archive'}>
                    <Archive className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteTarget(editing)}
                    className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700 transition-colors" title="Delete template">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <Button size="sm" onClick={handleSave}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-7 gap-1.5">
                    <Save className="w-3.5 h-3.5" /> Save
                  </Button>
                  <Button size="sm" onClick={handleSend}
                    className="bg-green-700 hover:bg-green-600 text-white text-xs h-7 gap-1.5">
                    <Send className="w-3.5 h-3.5" /> Open in Email Client
                  </Button>
                </div>
              </div>

              {/* Tabs */}
              <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} className="flex-1 flex flex-col min-h-0">
                <div className="px-4 pt-2 border-b border-slate-800 shrink-0">
                  <TabsList className="bg-slate-800 border border-slate-700 h-7">
                    <TabsTrigger value="edit"      className="text-xs h-5 data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400 gap-1"><Edit2 className="w-3 h-3" />Edit</TabsTrigger>
                    <TabsTrigger value="variables" className="text-xs h-5 data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400 gap-1 relative">
                      <Variable className="w-3 h-3" />Variables
                      {missingPlaceholders.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-[8px] text-white flex items-center justify-center font-bold">
                          {missingPlaceholders.length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="preview"   className="text-xs h-5 data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400 gap-1"><Eye className="w-3 h-3" />Preview</TabsTrigger>
                    <TabsTrigger value="mailto"    className="text-xs h-5 data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400 gap-1"><Link2 className="w-3 h-3" />Mailto</TabsTrigger>
                  </TabsList>
                </div>

                {/* ── Edit tab ── */}
                <TabsContent value="edit" className="flex-1 overflow-y-auto p-5 mt-0">
                  <div className="max-w-3xl space-y-5">
                    {/* Category + Tags */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-slate-400 block mb-1">Category</Label>
                        <Select value={editing.category} onValueChange={v => setEditing(ed => ed ? { ...ed, category: v as EmailCategory } : ed)}>
                          <SelectTrigger className="bg-slate-800 border-slate-600 text-white text-sm h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700 max-h-64">
                            {CATEGORIES.map(c => (
                              <SelectItem key={c.value} value={c.value} className="text-slate-300 focus:text-white focus:bg-slate-700 text-xs">{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-400 block mb-1">Tags (comma-separated)</Label>
                        <Input value={editing.tags.join(', ')}
                          onChange={e => setEditing(ed => ed ? { ...ed, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) } : ed)}
                          placeholder="e.g. complaint, urgent" className="h-8 bg-slate-800 border-slate-600 text-white text-sm" />
                      </div>
                    </div>

                    {/* Address fields — no reply-to (not a standard mailto param) */}
                    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-3">
                      <p className="text-xs font-semibold text-white mb-2">Address Fields</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-[10px] text-slate-400">To</Label>
                          <Input value={editing.to} onChange={e => setEditing(ed => ed ? { ...ed, to: e.target.value } : ed)}
                            placeholder="recipient@example.co.uk" className="mt-1 h-8 bg-slate-800 border-slate-600 text-white text-sm" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-400">CC</Label>
                          <Input value={editing.cc} onChange={e => setEditing(ed => ed ? { ...ed, cc: e.target.value } : ed)}
                            placeholder="cc@example.co.uk" className="mt-1 h-8 bg-slate-800 border-slate-600 text-white text-sm" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-400">BCC</Label>
                          <Input value={editing.bcc} onChange={e => setEditing(ed => ed ? { ...ed, bcc: e.target.value } : ed)}
                            placeholder="bcc@example.co.uk" className="mt-1 h-8 bg-slate-800 border-slate-600 text-white text-sm" />
                        </div>
                      </div>
                    </div>

                    {/* Subject */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-slate-400">Subject</Label>
                        <CopyBtn text={editing.subject} label="Copy subject" />
                      </div>
                      <Input value={editing.subject} onChange={e => setEditing(ed => ed ? { ...ed, subject: e.target.value } : ed)}
                        placeholder="Email subject line" className="bg-slate-800 border-slate-600 text-white text-sm" />
                    </div>

                    {/* Placeholder tokens */}
                    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400 font-medium mb-2 flex items-center gap-1">
                        <Variable className="w-3 h-3" /> Insert placeholder tokens
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {PLACEHOLDER_TOKENS.map(({ token }) => (
                          <button key={token}
                            onClick={() => setEditing(ed => ed ? { ...ed, body: ed.body + token } : ed)}
                            className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-blue-300 hover:bg-slate-600 border border-slate-600 font-mono">
                            {token}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Body */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-slate-400">Message Body</Label>
                        <div className="flex items-center gap-1">
                          <CopyBtn text={editing.body} label="Copy body" />
                          <CopyBtn text={editing.body + (editing.signature ? '\n\n' + editing.signature : '')} label="Copy full email" />
                        </div>
                      </div>
                      <Textarea value={editing.body} onChange={e => setEditing(ed => ed ? { ...ed, body: e.target.value } : ed)}
                        rows={14} placeholder="Write your email body here. Use [Name], [Date], [Reference] as placeholders."
                        className="bg-slate-800 border-slate-600 text-white text-sm resize-none font-mono leading-relaxed" />
                    </div>

                    {/* Signature */}
                    <div>
                      <Label className="text-xs text-slate-400 block mb-1">Signature</Label>
                      <Textarea value={editing.signature} onChange={e => setEditing(ed => ed ? { ...ed, signature: e.target.value } : ed)}
                        rows={5} placeholder="Kind regards,&#10;[Your Name]&#10;[Job Title]&#10;[Company]"
                        className="bg-slate-800 border-slate-600 text-white text-sm resize-none" />
                    </div>

                    {/* Attachments */}
                    <div>
                      <Label className="text-xs text-slate-400 block mb-1">Attachment Notes</Label>
                      <Input value={editing.attachmentNotes} onChange={e => setEditing(ed => ed ? { ...ed, attachmentNotes: e.target.value } : ed)}
                        placeholder="e.g. Invoice PDF attached" className="bg-slate-800 border-slate-600 text-white text-sm" />
                    </div>
                  </div>
                </TabsContent>

                {/* ── Variables tab ── */}
                <TabsContent value="variables" className="flex-1 overflow-y-auto p-5 mt-0">
                  <div className="max-w-2xl space-y-5">
                    <div>
                      <h2 className="text-sm font-semibold text-white mb-1">Variables Panel</h2>
                      <p className="text-xs text-slate-400">Enter values for each placeholder. The Preview tab will show the email with all placeholders replaced.</p>
                    </div>

                    {missingPlaceholders.length > 0 && (
                      <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-2.5 text-xs text-amber-300">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium mb-1">Missing values for {missingPlaceholders.length} placeholder{missingPlaceholders.length !== 1 ? 's' : ''}:</p>
                          <div className="flex flex-wrap gap-1">
                            {missingPlaceholders.map(p => (
                              <span key={p} className="font-mono text-[10px] bg-amber-900/40 px-1.5 py-0.5 rounded">{p}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {templateTokens.length === 0 ? (
                      <div className="text-center py-10">
                        <Variable className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                        <p className="text-xs text-slate-500">No placeholders found in this template.</p>
                        <p className="text-[10px] text-slate-600 mt-1">Add tokens like [Name] or [Date] to the body to use this panel.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {templateTokens.map(token => {
                          const meta = PLACEHOLDER_TOKENS.find(p => p.token === token);
                          const isMissing = missingPlaceholders.includes(token);
                          return (
                            <div key={token} className={`bg-slate-900 border rounded-lg p-3 ${isMissing ? 'border-amber-700/50' : 'border-slate-700'}`}>
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[10px] text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-600">{token}</span>
                                  {meta && <span className="text-[10px] text-slate-500">{meta.hint}</span>}
                                </div>
                                {isMissing && <span className="text-[9px] text-amber-400 font-medium">Required</span>}
                              </div>
                              <Input
                                value={vars[token] ?? ''}
                                onChange={e => setVars(v => ({ ...v, [token]: e.target.value }))}
                                placeholder={`Value for ${token}`}
                                className="h-8 bg-slate-800 border-slate-600 text-white text-sm"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {templateTokens.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline"
                          onClick={() => setVars({})}
                          className="border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700 text-xs h-8 gap-1.5">
                          <X className="w-3.5 h-3.5" /> Clear All Values
                        </Button>
                        <Button size="sm" onClick={() => setTab('preview')}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8 gap-1.5">
                          <Eye className="w-3.5 h-3.5" /> Preview with Values
                        </Button>
                      </div>
                    )}

                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-xs text-slate-400">
                      <Info className="w-3.5 h-3.5 inline mr-1 text-blue-400" />
                      Values entered here are only used for preview. They are not saved with the template. The original template always keeps its placeholder tokens.
                    </div>
                  </div>
                </TabsContent>

                {/* ── Preview tab ── */}
                <TabsContent value="preview" className="flex-1 overflow-y-auto p-8 mt-0 bg-gray-50">
                  <div className="max-w-2xl mx-auto">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        {missingPlaceholders.length > 0 && (
                          <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {missingPlaceholders.length} placeholder{missingPlaceholders.length !== 1 ? 's' : ''} not filled
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <CopyBtn text={resolvedSubject} label="Copy subject" />
                        <CopyBtn text={resolvedBody} label="Copy body" />
                        <CopyBtn text={resolvedBody + (resolvedSignature ? '\n\n' + resolvedSignature : '')} label="Copy full email" />
                        <Button size="sm" onClick={handleSend}
                          className="bg-green-700 hover:bg-green-600 text-white text-xs h-8 gap-1.5">
                          <Send className="w-3.5 h-3.5" /> Open in Email Client
                        </Button>
                      </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                      {/* Email header */}
                      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                        {editing.to  && <p className="text-xs text-gray-600 mb-1"><span className="font-semibold w-12 inline-block">To:</span> {editing.to}</p>}
                        {editing.cc  && <p className="text-xs text-gray-600 mb-1"><span className="font-semibold w-12 inline-block">CC:</span> {editing.cc}</p>}
                        {editing.bcc && <p className="text-xs text-gray-600 mb-1"><span className="font-semibold w-12 inline-block">BCC:</span> {editing.bcc}</p>}
                        <p className="text-sm font-semibold text-gray-900 mt-2">
                          {resolvedSubject || '(no subject)'}
                          {resolvedSubject !== editing.subject && (
                            <span className="ml-2 text-[10px] font-normal text-green-600 bg-green-50 px-1.5 py-0.5 rounded">placeholders filled</span>
                          )}
                        </p>
                      </div>
                      {/* Body */}
                      <div className="px-6 py-5">
                        <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                          {resolvedBody.split(/(\[[^\]]+\])/).map((part, i) => {
                            const isMissing = /^\[[^\]]+\]$/.test(part) && missingPlaceholders.includes(part);
                            return isMissing
                              ? <mark key={i} className="bg-amber-100 text-amber-800 rounded px-0.5">{part}</mark>
                              : <span key={i}>{part}</span>;
                          })}
                        </pre>
                        {resolvedSignature && (
                          <>
                            <hr className="my-4 border-gray-200" />
                            <pre className="text-xs text-gray-500 whitespace-pre-wrap font-sans">{resolvedSignature}</pre>
                          </>
                        )}
                        {editing.attachmentNotes && (
                          <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded px-3 py-2 border border-gray-200">
                            <span>📎</span> {editing.attachmentNotes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* ── Mailto tab ── */}
                <TabsContent value="mailto" className="flex-1 overflow-y-auto p-5 mt-0">
                  <div className="max-w-2xl space-y-5">
                    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-semibold text-white">Mailto Link Generator</p>
                          <p className="text-xs text-slate-400 mt-0.5">Generate a mailto: link you can use on websites or copy to clipboard.</p>
                        </div>
                        <Button size="sm" onClick={handleCopyMailto}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8 gap-1.5">
                          {copiedMailto ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedMailto ? 'Copied!' : 'Copy Link'}
                        </Button>
                      </div>
                      <div className="bg-slate-950 rounded border border-slate-700 p-3">
                        <p className="text-[10px] font-mono text-green-300 break-all leading-relaxed">{mailtoLink || 'mailto:'}</p>
                      </div>
                    </div>

                    {/* Mailto variants */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-white">Common Mailto Formats</p>
                      {[
                        { label: 'Email only',                   link: `mailto:${editing.to || 'name@example.co.uk'}` },
                        { label: 'Email + Subject',              link: `mailto:${editing.to || 'name@example.co.uk'}?subject=${encodeURIComponent(editing.subject || 'Subject')}` },
                        { label: 'Email + Subject + Body',       link: buildMailto(editing.to || 'name@example.co.uk', editing.subject, editing.body, '', '') },
                        { label: 'Full (To, CC, BCC, Subject, Body)', link: mailtoLink },
                      ].map(v => (
                        <div key={v.label} className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-white">{v.label}</p>
                            <button onClick={() => void navigator.clipboard.writeText(v.link)}
                              className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                              <Copy className="w-3 h-3" /> Copy
                            </button>
                          </div>
                          <p className="text-[10px] font-mono text-slate-400 break-all">{v.link.length > 120 ? v.link.slice(0, 120) + '…' : v.link}</p>
                          <a href={v.link} className="mt-2 inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300">
                            <Mail className="w-3 h-3" /> Test in email client
                          </a>
                        </div>
                      ))}
                    </div>

                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-xs text-slate-400">
                      <p className="font-medium text-slate-300 mb-1">Note on reply-to</p>
                      <p><code className="text-blue-300">reply-to</code> is not a standard mailto: parameter and is not supported by most email clients. To set a reply-to address, configure it in your email client or sending service instead.</p>
                    </div>

                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-xs text-slate-400">
                      <p className="font-medium text-slate-300 mb-1">How to use mailto links</p>
                      <p>Copy a mailto link and use it as the <code className="text-blue-300">href</code> on a button or link on your website. When clicked, it opens the visitor's email client with the fields pre-filled.</p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                <Mail className="w-8 h-8 text-slate-600" />
              </div>
              <h2 className="text-base font-semibold text-white mb-2">Email Template Centre</h2>
              <p className="text-sm text-slate-400 max-w-sm mb-6">Select a template from the list to edit it, or create a new one. All templates are saved locally in your browser.</p>
              <div className="flex items-center gap-3">
                <Button onClick={handleNew} className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5">
                  <Plus className="w-4 h-4" /> Create New Template
                </Button>
                <Button variant="outline" onClick={handleExport}
                  className="border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700 gap-1.5">
                  <Download className="w-4 h-4" /> Export Templates
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Delete confirm */}
        <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete template?</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to permanently delete <strong className="text-white">{deleteTarget?.name}</strong>? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-500 text-white gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardLayout>
    </>
  );
}
