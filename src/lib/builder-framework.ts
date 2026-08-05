/**
 * Shared Builder Framework — Sousa Murray Planeia
 * Central types, helpers, and constants used by all document builders.
 */

// ── Builder IDs ───────────────────────────────────────────────────────────────

export type BuilderId =
  | 'letter'
  | 'email'
  | 'invoice'
  | 'contract'
  | 'policy'
  | 'form'
  | 'report'
  | 'minutes'
  | 'proposal'
  | 'checklist';

// ── Template status ───────────────────────────────────────────────────────────

export type TemplateStatus = 'active' | 'draft' | 'retired';

// ── Plan requirement for a builder template ───────────────────────────────────

export type BuilderPlanRequired = 'free' | 'personal' | 'standard' | 'professional';

// ── The 5 approved demo templates accessible on the free plan ─────────────────
// These are the ONLY templates free/trial users may access.
// All other templates require a paid plan.

export const FREE_DEMO_TEMPLATE_IDS: string[] = [
  'letter-formal-business',   // Letter Builder — Formal Business Letter
  'email-welcome',            // Email Builder — Welcome Email
  'invoice-standard',         // Invoice Builder — Standard Invoice
  'contract-service-agreement', // Contract Builder — Service Agreement
  'policy-privacy',           // Policy Builder — Privacy Policy
];

// ── Industry / use-case tags ──────────────────────────────────────────────────

export type BuilderIndustry =
  | 'General'
  | 'Business'
  | 'Personal'
  | 'Legal'
  | 'Finance'
  | 'HR'
  | 'Property'
  | 'Education'
  | 'Charity'
  | 'Healthcare'
  | 'Construction'
  | 'Retail'
  | 'Hospitality'
  | 'IT'
  | 'Popular';

export const BUILDER_INDUSTRIES: BuilderIndustry[] = [
  'Popular', 'General', 'Business', 'Personal', 'Legal', 'Finance',
  'HR', 'Property', 'Education', 'Charity', 'Healthcare',
  'Construction', 'Retail', 'Hospitality', 'IT',
];

// ── A single field definition in a builder template ──────────────────────────

export interface BuilderField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'select' | 'number' | 'email' | 'phone' | 'toggle' | 'section_heading';
  placeholder?: string;
  defaultValue?: string;
  options?: string[];          // for select fields
  required?: boolean;
  helpText?: string;
  group?: string;              // visual grouping label
}

// ── Document layout IDs ───────────────────────────────────────────────────────

export type BuilderLayoutId =
  | 'letter'
  | 'classic-letter'
  | 'minimal-letter'
  | 'modern-letter'
  | 'org-letter'
  | 'complaint-letter'
  | 'invoice'
  | 'quote'
  | 'contract'
  | 'policy'
  | 'report'
  | 'minutes'
  | 'resolution'
  | 'form'
  | 'checklist'
  | 'proposal'
  | 'email'
  | 'certificate';

export interface BuilderLayoutDef {
  id: BuilderLayoutId;
  name: string;
  description: string;
  /** Which builder IDs this layout is most suitable for */
  suitableFor: BuilderId[];
}

export const BUILDER_LAYOUTS: BuilderLayoutDef[] = [
  { id: 'letter',          name: 'Classic UK Letter',    description: 'Traditional UK formal letter — sender top-right, recipient left, no coloured header.',  suitableFor: ['letter'] },
  { id: 'classic-letter',  name: 'Classic UK Letter',    description: 'Traditional UK formal letter — sender top-right, recipient left, no coloured header.',  suitableFor: ['letter'] },
  { id: 'minimal-letter',  name: 'Minimal Plain Letter', description: 'Plain black text, no colours or logo. Suitable for legal, council, GP, bank letters.',  suitableFor: ['letter'] },
  { id: 'modern-letter',   name: 'Modern Business Letter',description: 'Clean letter with thin accent line and optional logo. Professional and printable.',    suitableFor: ['letter'] },
  { id: 'org-letter',      name: 'Organisation Letter',  description: 'Optional logo, org header, footer, company number. Branding is user-controlled.',       suitableFor: ['letter'] },
  { id: 'complaint-letter',name: 'Complaint Letter',     description: 'Formal complaint layout with strong reference/subject block. Clean and professional.',  suitableFor: ['letter'] },
  { id: 'email',        name: 'Email Template',      description: 'Email-style layout with subject line and message body.',                suitableFor: ['email'] },
  { id: 'invoice',      name: 'Invoice',             description: 'Professional invoice with line-item table, totals, and bank details.',  suitableFor: ['invoice'] },
  { id: 'quote',        name: 'Quote / Estimate',    description: 'Quotation layout with itemised pricing and validity period.',           suitableFor: ['invoice'] },
  { id: 'contract',     name: 'Contract / Agreement',description: 'Legal-style numbered clauses, parties block, signature section.',      suitableFor: ['contract'] },
  { id: 'policy',       name: 'Policy Document',     description: 'Version-controlled header, policy number, review date.',               suitableFor: ['policy'] },
  { id: 'report',       name: 'Report',              description: 'Data-focused layout with numbered sections and summary box.',           suitableFor: ['report'] },
  { id: 'minutes',      name: 'Meeting Minutes',     description: 'Agenda-style with attendees block, action items, and decisions.',      suitableFor: ['minutes'] },
  { id: 'resolution',   name: 'Resolution',          description: 'Formal resolution layout with WHEREAS/RESOLVED clauses.',              suitableFor: ['minutes'] },
  { id: 'form',         name: 'Form',                description: 'Form layout with labelled input fields and submission block.',         suitableFor: ['form'] },
  { id: 'checklist',    name: 'Checklist',           description: 'Checkbox-style checklist with sections and sign-off block.',           suitableFor: ['checklist'] },
  { id: 'proposal',     name: 'Proposal',            description: 'Business proposal with cover section, sections, and call to action.',  suitableFor: ['proposal'] },
  { id: 'certificate',  name: 'Certificate',         description: 'Centred decorative certificate with border and formal presentation.',  suitableFor: ['checklist', 'form'] },
];

/** Default layout for each builder type */
export const BUILDER_DEFAULT_LAYOUT: Record<BuilderId, BuilderLayoutId> = {
  letter:    'letter',
  email:     'email',
  invoice:   'invoice',
  contract:  'contract',
  policy:    'policy',
  report:    'report',
  minutes:   'minutes',
  proposal:  'proposal',
  form:      'form',
  checklist: 'checklist',
};

// ── A builder template definition ────────────────────────────────────────────

export interface BuilderTemplate {
  id: string;
  builderId: BuilderId;
  name: string;
  description: string;
  category: string;
  /** Industry/use-case tags for cross-builder filtering */
  industries?: BuilderIndustry[];
  /** Whether this is a popular/featured template */
  popular?: boolean;
  planRequired: BuilderPlanRequired;
  status: TemplateStatus;
  fields: BuilderField[];
  /** Handlebars-style body template — {{field_id}} tokens replaced at render */
  bodyTemplate: string;
  /** Optional CSS accent colour override */
  accentColor?: string;
  /** Whether this template supports branding (logo, colour) */
  supportsBranding?: boolean;
  /** Whether this template should show a page header (date, ref, etc.) */
  showDocHeader?: boolean;
  /** Sort order within category */
  order?: number;
  /** Default layout for this template — overrides builder default */
  defaultLayout?: BuilderLayoutId;
}

// ── A saved builder document ──────────────────────────────────────────────────

export interface BuilderDocument {
  id: string;           // uuid
  builderId: BuilderId;
  templateId: string;
  title: string;
  fields: Record<string, string>;
  brandColor?: string;
  logoUrl?: string;
  layoutId?: BuilderLayoutId;
  status: 'draft' | 'final' | 'archived';
  createdAt: string;
  updatedAt: string;
}

// ── Render helpers ────────────────────────────────────────────────────────────

/** Replace {{token}} placeholders in a template string with field values */
export function renderTemplate(template: string, fields: Record<string, string>): string {
  // Replace tokens: if the field value is non-empty use it, otherwise replace with empty string
  // so that optional fields don't leave "[fieldname]" placeholders in the output.
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = fields[key];
    return (val !== undefined && val !== null && String(val).trim() !== '') ? String(val) : '';
  });
}

/** Format a date string as UK long date (e.g. "10 June 2026").
 *  Handles YYYY-MM-DD safely without UTC timezone shift. */
export function fmtDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    // Parse YYYY-MM-DD as local date to avoid UTC midnight → previous day shift
    const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim());
    const d = isoDate
      ? new Date(`${dateStr.trim()}T00:00:00`)
      : new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return dateStr; }
}

/** Today as YYYY-MM-DD */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Builder metadata (for nav, admin, etc.) ───────────────────────────────────

export interface BuilderMeta {
  id: BuilderId;
  label: string;
  description: string;
  icon: string;         // lucide icon name
  href: string;
  color: string;        // tailwind bg class
  textColor: string;    // tailwind text class
}

export const BUILDER_META: BuilderMeta[] = [
  { id: 'letter',    label: 'Letter Builder',    description: 'Formal letters, complaints, notices, cover letters',    icon: 'PenLine',       href: '/letter-builder',    color: 'bg-blue-50',    textColor: 'text-blue-700' },
  { id: 'email',     label: 'Email Builder',     description: 'Support replies, reminders, sales, internal emails',    icon: 'Mail',          href: '/email-builder',     color: 'bg-violet-50',  textColor: 'text-violet-700' },
  { id: 'invoice',   label: 'Invoice Builder',   description: 'Invoices, VAT, pro forma, credit notes, quotes',        icon: 'Receipt',       href: '/invoice-builder',   color: 'bg-amber-50',   textColor: 'text-amber-700' },
  { id: 'contract',  label: 'Contract Builder',    description: 'Service agreements, NDAs, contractor agreements',       icon: 'FileSignature', href: '/contract-builder',  color: 'bg-red-50',     textColor: 'text-red-700' },
  { id: 'policy',    label: 'Policy Builder',      description: 'Privacy, cookie, complaints, H&S, safeguarding',        icon: 'Shield',        href: '/policy-builder',    color: 'bg-green-50',   textColor: 'text-green-700' },
  { id: 'form',      label: 'Form Builder',        description: 'Booking, consent, feedback, incident, onboarding',      icon: 'ClipboardList', href: '/form-builder',      color: 'bg-cyan-50',    textColor: 'text-cyan-700' },
  { id: 'report',    label: 'Report Builder',      description: 'Incident, audit, inspection, risk assessment, monthly', icon: 'BarChart2',     href: '/report-builder',    color: 'bg-orange-50',  textColor: 'text-orange-700' },
  { id: 'minutes',   label: 'Minutes Builder',     description: 'Meeting minutes, board minutes, resolutions',           icon: 'Users',         href: '/minutes-builder',   color: 'bg-teal-50',    textColor: 'text-teal-700' },
  { id: 'proposal',  label: 'Proposal Builder',    description: 'Business proposals, grants, tenders, sponsorships',     icon: 'Briefcase',     href: '/proposal-builder',  color: 'bg-pink-50',    textColor: 'text-pink-700' },
  { id: 'checklist', label: 'Checklist Builder',   description: 'Onboarding, compliance, H&S, property, event',         icon: 'CheckSquare',   href: '/checklist-builder', color: 'bg-lime-50',    textColor: 'text-lime-700' },
];

// ── Category definitions per builder ─────────────────────────────────────────

export const BUILDER_CATEGORIES: Record<BuilderId, string[]> = {
  letter:    ['Business', 'Complaints', 'HR & Employment', 'Property & Housing', 'School & Education', 'Charity & Voluntary', 'Personal', 'Legal', 'Cover Letters', 'Supplier & Procurement', 'Customer Service', 'Debt & Finance', 'Apology & Resolution', 'Follow-up & Chasing', 'Notices & Announcements', 'Resignation & Leaving'],
  email:     ['Customer Service', 'Complaints', 'Finance & Billing', 'Sales & Marketing', 'Internal', 'School & Education', 'Charity & Voluntary', 'Onboarding', 'Follow-up & Chasing', 'HR & Employment', 'Supplier & Procurement', 'Appointments & Reminders', 'Overdue & Debt', 'IT & Technical', 'Property', 'Healthcare'],
  invoice:   ['Standard Invoice', 'VAT Invoice', 'Non-VAT Invoice', 'Pro Forma', 'Deposit', 'Recurring', 'Credit Note', 'Receipt', 'Quote & Estimate', 'Statement', 'Payment Request', 'Retainer'],
  contract:  ['Service Agreement', 'Contractor', 'NDA', 'Supplier', 'Client Agreement', 'Tenancy-Style', 'Partnership', 'Freelance', 'Subcontractor', 'Consultancy', 'Website & Digital'],
  policy:    ['Privacy & Data', 'Website Policies', 'HR Policies', 'Health & Safety', 'Safeguarding', 'Complaints', 'Finance', 'Remote Working', 'Social Media', 'Whistleblowing'],
  form:      ['Booking & Registration', 'Consent', 'Feedback', 'Incident & Accident', 'Onboarding', 'Application', 'Internal Request', 'Inspection', 'Medical & Care', 'Survey'],
  report:    ['Incident', 'Monthly & Quarterly', 'Audit & Inspection', 'Risk Assessment', 'Project Update', 'Client Report', 'Finance Report', 'Compliance Report', 'Board Report'],
  minutes:   ['Meeting Agenda', 'Meeting Minutes', 'Board Minutes', 'Trustee Minutes', 'Shareholder Resolutions', 'Director Resolutions', 'Decision Log', 'Action Log'],
  proposal:  ['Business Proposal', 'Service Proposal', 'Project Proposal', 'Grant Proposal', 'Sponsorship', 'Tender Response', 'Sales Proposal', 'Partnership Proposal'],
  checklist: ['Onboarding', 'Compliance', 'Property Inspection', 'Health & Safety', 'Event', 'Training', 'Due Diligence', 'Launch', 'IT & Security', 'Audit'],
};

// ── Reusable standard letter fields (shared across many letter templates) ─────

export const STANDARD_LETTER_FIELDS = [
  { id: 'sender_name',       label: 'Your Name / Organisation',   type: 'text'     as const, required: true },
  { id: 'sender_address',    label: 'Your Address',               type: 'textarea' as const, placeholder: 'Street, City, Postcode' },
  { id: 'sender_email',      label: 'Your Email',                 type: 'email'    as const },
  { id: 'sender_phone',      label: 'Your Phone',                 type: 'phone'    as const },
  { id: 'letter_date',       label: 'Date',                       type: 'date'     as const, required: true },
  { id: 'recipient_name',    label: 'Recipient Name',             type: 'text'     as const, required: true },
  { id: 'recipient_title',   label: 'Recipient Title / Role',     type: 'text'     as const },
  { id: 'recipient_org',     label: 'Recipient Organisation',     type: 'text'     as const },
  { id: 'recipient_address', label: 'Recipient Address',          type: 'textarea' as const },
  { id: 'reference',         label: 'Reference (optional)',       type: 'text'     as const, placeholder: 'e.g. Ref: 2026-001' },
  { id: 'subject',           label: 'Subject',                    type: 'text'     as const, required: true },
  { id: 'salutation',        label: 'Salutation',                 type: 'text'     as const, defaultValue: 'Dear' },
  { id: 'closing',           label: 'Closing',                    type: 'text'     as const, defaultValue: 'Yours sincerely,' },
  { id: 'signatory_name',    label: 'Signatory Name',             type: 'text'     as const },
  { id: 'signatory_title',   label: 'Signatory Title',            type: 'text'     as const },
];

export const STANDARD_LETTER_BODY = `{{sender_name}}
{{sender_address}}
{{sender_email}}
{{sender_phone}}

{{letter_date}}

{{recipient_name}}
{{recipient_title}}
{{recipient_org}}
{{recipient_address}}

{{reference}}

**{{subject}}**

{{salutation}} {{recipient_name}},

{{body}}

{{closing}}

{{signatory_name}}
{{signatory_title}}`;

// ── Reusable standard email fields ────────────────────────────────────────────

export const STANDARD_EMAIL_FIELDS = [
  { id: 'org_name',       label: 'Your Organisation',    type: 'text'     as const, required: true },
  { id: 'sender_name',    label: 'Sender Name',          type: 'text'     as const },
  { id: 'sender_title',   label: 'Sender Title',         type: 'text'     as const },
  { id: 'sender_email',   label: 'Sender Email',         type: 'email'    as const },
  { id: 'recipient_name', label: 'Recipient Name',       type: 'text'     as const, defaultValue: '[Name]' },
  { id: 'subject',        label: 'Email Subject',        type: 'text'     as const, required: true },
  { id: 'greeting',       label: 'Greeting',             type: 'text'     as const, defaultValue: 'Dear [Name],' },
  { id: 'body',           label: 'Main Message',         type: 'textarea' as const, required: true },
  { id: 'closing',        label: 'Closing',              type: 'text'     as const, defaultValue: 'Kind regards,' },
  { id: 'disclaimer',     label: 'Disclaimer (optional)',type: 'textarea' as const },
];
