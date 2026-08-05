// Document types and template definitions for Sousa Murray Planeia

export type DocumentStatus = 'draft' | 'complete' | 'completed' | 'archived';
export type PlanType = 'free' | 'professional' | 'business';

export interface TemplateField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'select' | 'multiselect' | 'number' | 'email' | 'phone';
  placeholder?: string;
  required: boolean;
  options?: string[];
  helpText?: string;
  defaultValue?: string;
}

export interface TemplateSection {
  id: string;
  title: string;
  description?: string;
  fields: TemplateField[];
}

export interface DocumentTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  icon: string;
  sections: TemplateSection[];
  generateDocument: (data: Record<string, string>) => string;
  planRequired: PlanType;
  tags: string[];
  signatories?: Array<{ label: string }>; // signature boxes to render in the PDF shell
}

export type TemplateCategory =
  // Corporate & Governance
  | 'board-meeting'
  | 'director'
  | 'shareholder'
  | 'company-admin'
  // Business
  | 'business'
  | 'business-letters'
  | 'finance'
  // Contracts & Agreements
  | 'contracts'
  // HR & Employment
  | 'hr'
  // Policies & Compliance
  | 'policies'
  // Consumer
  | 'consumer'
  // Complaints
  | 'complaints'
  // Charity & Community
  | 'charity'
  // School / Youth / Training
  | 'education'
  // Property & Home
  | 'property'
  // Care & Support
  | 'care'
  // Reports
  | 'reports'
  // Forms
  | 'forms'
  // Letters
  | 'letters'
  // Personal / General
  | 'consent'
  | 'travel'
  | 'personal'
  // Legal
  | 'legal'
  // Finance & Accounting
  | 'accounting'
  // Marketing & Sales
  | 'marketing'
  // IT & Technology
  | 'it-tech'
  // Healthcare & Medical
  | 'healthcare'
  // Construction & Trades
  | 'construction'
  // Hospitality & Events
  | 'hospitality'
  // Nonprofit & Voluntary
  | 'nonprofit'
  // Real Estate
  | 'real-estate'
  // Personal Finance
  | 'personal-finance'
  // Creative & Media
  | 'creative'
  // Logistics & Supply Chain
  | 'logistics'
  // Legacy aliases kept for backward compat
  | 'company';

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  'board-meeting': 'Board Meeting',
  director: 'Director Documents',
  shareholder: 'Shareholder Documents',
  'company-admin': 'Company Administration',
  business: 'Business Documents',
  'business-letters': 'Business Contracts & Agreements',
  finance: 'Finance & Invoicing',
  contracts: 'Contracts & Agreements',
  hr: 'HR & Employment',
  policies: 'Policies & Compliance',
  consumer: 'Consumer Documents',
  complaints: 'Complaints',
  charity: 'Charity & Community',
  education: 'School, Youth & Training',
  property: 'Property & Home',
  care: 'Care & Support',
  reports: 'Reports',
  forms: 'Forms',
  letters: 'Letters',
  consent: 'Consent & Authorisation',
  travel: 'Travel',
  personal: 'Personal & General',
  legal: 'Legal',
  accounting: 'Finance & Accounting',
  marketing: 'Marketing & Sales',
  'it-tech': 'IT & Technology',
  healthcare: 'Healthcare & Medical',
  construction: 'Construction & Trades',
  hospitality: 'Hospitality & Events',
  nonprofit: 'Nonprofit & Voluntary',
  'real-estate': 'Real Estate',
  'personal-finance': 'Personal Finance',
  creative: 'Creative & Media',
  logistics: 'Logistics & Supply Chain',
  // legacy
  company: 'Company Documents',
};

export const CATEGORY_ICONS: Record<TemplateCategory, string> = {
  'board-meeting': 'Users',
  director: 'UserCheck',
  shareholder: 'TrendingUp',
  'company-admin': 'Building2',
  business: 'Briefcase',
  'business-letters': 'FileSignature',
  finance: 'Receipt',
  contracts: 'FileSignature',
  hr: 'UserCog',
  policies: 'Shield',
  consumer: 'ShoppingBag',
  complaints: 'AlertCircle',
  charity: 'Heart',
  education: 'GraduationCap',
  property: 'Home',
  care: 'HandHeart',
  reports: 'BarChart2',
  forms: 'ClipboardList',
  letters: 'Mail',
  consent: 'CheckSquare',
  travel: 'Plane',
  personal: 'FileText',
  legal: 'Scale',
  accounting: 'Calculator',
  marketing: 'Megaphone',
  'it-tech': 'Monitor',
  healthcare: 'Stethoscope',
  construction: 'HardHat',
  hospitality: 'UtensilsCrossed',
  nonprofit: 'HandHeart',
  'real-estate': 'Building',
  'personal-finance': 'PiggyBank',
  creative: 'Palette',
  logistics: 'Truck',
  company: 'Building2',
};

export interface SavedDocument {
  id: string;
  templateId: string;
  templateName: string;   // stored in fields JSON for display
  category: TemplateCategory;
  title: string;
  status: DocumentStatus;
  fields: Record<string, unknown>;  // formData stored as JSON
  content: string;                  // generated HTML
  docRef: string;
  createdAt: string;
  updatedAt: string;
  folderId?: string | null;
  version: number;
  // Legacy aliases — kept for backward compat with wizard/view pages
  formData?: Record<string, string>;
  generatedContent?: string;
}

export interface DocumentFolder {
  id: string;
  name: string;
  color?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company?: string;
  plan: PlanType;
  createdAt: string;
}
