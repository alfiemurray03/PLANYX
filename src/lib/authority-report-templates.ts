export type AuthorityReportType =
  | 'police-emergency'
  | 'police-non-emergency'
  | 'child-safeguarding'
  | 'adult-safeguarding'
  | 'data-breach-ico'
  | 'local-authority'
  | 'other-authority';

export type AuthorityReportUrgency = 'Emergency' | 'Urgent' | 'Routine';

export type AuthorityTemplateCategory =
  | 'Police & crime'
  | 'Safeguarding'
  | 'Data & cyber'
  | 'Council & public protection'
  | 'Government & public bodies'
  | 'Finance & consumer'
  | 'Health, education & work'
  | 'Transport & other regulators';

export interface AuthorityReportTemplate {
  id: string;
  title: string;
  shortTitle: string;
  category: AuthorityTemplateCategory;
  reportType: AuthorityReportType;
  authority: string;
  channel: string;
  urgency: AuthorityReportUrgency;
  description: string;
  useWhen: string;
  keywords: string[];
  icon: 'siren' | 'shield' | 'child' | 'adult' | 'database' | 'cyber' | 'council' | 'government' | 'tax' | 'benefits' | 'company' | 'finance' | 'consumer' | 'health' | 'education' | 'employment' | 'transport' | 'landmark';
  featured?: boolean;
}

export const AUTHORITY_REPORT_TEMPLATES: AuthorityReportTemplate[] = [
  {
    id: 'emergency-police-incident',
    title: 'Emergency police incident record',
    shortTitle: 'Emergency police',
    category: 'Police & crime',
    reportType: 'police-emergency',
    authority: 'Police / emergency services',
    channel: 'Call 999 immediately, then record the emergency reference and responding force',
    urgency: 'Emergency',
    description: 'Create the internal evidence record after emergency action has started.',
    useWhen: 'A serious offence is happening or has just happened, somebody is in immediate danger, property is at immediate risk or serious public disruption is occurring.',
    keywords: ['999', 'emergency', 'danger', 'crime', 'police', 'serious incident'],
    icon: 'siren',
    featured: true,
  },
  {
    id: 'police-101-online-report',
    title: 'Police 101 or online crime report',
    shortTitle: 'Police 101 / online',
    category: 'Police & crime',
    reportType: 'police-non-emergency',
    authority: 'Responsible territorial police force',
    channel: 'Call 101 or use the responsible police force’s official online reporting service',
    urgency: 'Routine',
    description: 'Prepare a factual report for a non-emergency crime or police matter.',
    useWhen: 'Crime, suspicious activity, antisocial behaviour, property damage or information does not require an immediate emergency response.',
    keywords: ['101', 'non emergency', 'crime', 'antisocial behaviour', 'police', 'online report'],
    icon: 'shield',
    featured: true,
  },
  {
    id: 'child-safeguarding-referral',
    title: 'Child safeguarding referral',
    shortTitle: 'Child safeguarding',
    category: 'Safeguarding',
    reportType: 'child-safeguarding',
    authority: 'Child’s responsible local authority children’s social care service',
    channel: 'Council children’s social care, safeguarding hub or MASH professional referral route; police where a crime is suspected',
    urgency: 'Urgent',
    description: 'Record concerns about abuse, neglect, exploitation, grooming or risk of harm to a person under 18.',
    useWhen: 'A child or young person may be unsafe, abused, neglected, exploited, groomed or otherwise at risk. Call 999 first for immediate danger.',
    keywords: ['child', 'young person', 'safeguarding', 'social services', 'MASH', 'abuse', 'grooming', 'neglect'],
    icon: 'child',
    featured: true,
  },
  {
    id: 'adult-safeguarding-referral',
    title: 'Adult safeguarding referral',
    shortTitle: 'Adult safeguarding',
    category: 'Safeguarding',
    reportType: 'adult-safeguarding',
    authority: 'Responsible local authority adult safeguarding team',
    channel: 'Council adult safeguarding professional referral route; police where a crime is suspected',
    urgency: 'Urgent',
    description: 'Prepare a referral about an adult with care and support needs who may be experiencing abuse, neglect or exploitation.',
    useWhen: 'An adult may be unable to protect themselves because of care and support needs, disability, illness or another vulnerability.',
    keywords: ['adult', 'safeguarding', 'care needs', 'abuse', 'neglect', 'exploitation', 'council'],
    icon: 'adult',
    featured: true,
  },
  {
    id: 'personal-data-breach-ico',
    title: 'Personal data breach and ICO assessment',
    shortTitle: 'Data breach / ICO',
    category: 'Data & cyber',
    reportType: 'data-breach-ico',
    authority: 'Information Commissioner’s Office (ICO)',
    channel: 'ICO personal data breach assessment and online reporting service; police where criminal conduct is suspected',
    urgency: 'Urgent',
    description: 'Record the breach, risk assessment, containment and decision about notifying the ICO and affected people.',
    useWhen: 'Personal data has been lost, accessed, disclosed, altered or destroyed without proper authority.',
    keywords: ['ICO', 'GDPR', 'data protection', 'personal data', 'breach', '72 hours'],
    icon: 'database',
  },
  {
    id: 'cybercrime-security-incident',
    title: 'Cybercrime or serious security incident',
    shortTitle: 'Cybercrime / security',
    category: 'Data & cyber',
    reportType: 'other-authority',
    authority: 'Police / Action Fraud / National Cyber Security Centre, as applicable',
    channel: 'Use the official police, Action Fraud or NCSC reporting route selected after incident triage',
    urgency: 'Urgent',
    description: 'Preserve security logs and prepare a report about fraud, unauthorised access, malware, account compromise or a significant cyber incident.',
    useWhen: 'Systems, accounts or data may have been compromised or cyber-enabled crime is suspected.',
    keywords: ['cyber', 'NCSC', 'Action Fraud', 'hacking', 'malware', 'account compromise', 'fraud'],
    icon: 'cyber',
  },
  {
    id: 'council-public-protection',
    title: 'Council or public protection referral',
    shortTitle: 'Council referral',
    category: 'Council & public protection',
    reportType: 'local-authority',
    authority: 'Responsible local authority service',
    channel: 'Official council professional referral form, duty team or published service contact route',
    urgency: 'Routine',
    description: 'Use for housing, licensing, environmental health, public protection, community safety or another council function.',
    useWhen: 'A matter falls within a statutory council service and is not better handled through an emergency route.',
    keywords: ['council', 'local authority', 'housing', 'licensing', 'environmental health', 'public protection'],
    icon: 'council',
  },
  {
    id: 'hmrc-tax-customs-report',
    title: 'HMRC tax, customs or revenue report',
    shortTitle: 'HMRC report',
    category: 'Government & public bodies',
    reportType: 'other-authority',
    authority: 'HM Revenue & Customs (HMRC)',
    channel: 'Relevant HMRC official reporting, disclosure or fraud referral route',
    urgency: 'Routine',
    description: 'Prepare an evidence-led report concerning tax, customs, payroll, VAT or suspected revenue fraud.',
    useWhen: 'The concern relates to taxation, customs, VAT, PAYE, National Insurance or suspected HMRC fraud.',
    keywords: ['HMRC', 'tax', 'VAT', 'PAYE', 'customs', 'revenue', 'fraud'],
    icon: 'tax',
  },
  {
    id: 'dwp-benefit-public-funds',
    title: 'DWP benefit or public-funds concern',
    shortTitle: 'DWP / benefits',
    category: 'Government & public bodies',
    reportType: 'other-authority',
    authority: 'Department for Work and Pensions (DWP)',
    channel: 'Official DWP benefit-fraud, safeguarding or departmental reporting route',
    urgency: 'Routine',
    description: 'Prepare a report concerning benefits, public funds, DWP safeguarding or suspected benefit fraud.',
    useWhen: 'The matter concerns a DWP-administered benefit, public funds or a safeguarding issue involving DWP services.',
    keywords: ['DWP', 'benefits', 'Universal Credit', 'public funds', 'benefit fraud'],
    icon: 'benefits',
  },
  {
    id: 'companies-house-company-conduct',
    title: 'Companies House or company-conduct report',
    shortTitle: 'Companies House',
    category: 'Government & public bodies',
    reportType: 'other-authority',
    authority: 'Companies House or the relevant company-law enforcement body',
    channel: 'Companies House official complaint, filing, intelligence or company-misuse reporting route',
    urgency: 'Routine',
    description: 'Record suspected false filings, company identity misuse, director information concerns or other company-register issues.',
    useWhen: 'The concern relates to the UK company register, filings, company identity or director information.',
    keywords: ['Companies House', 'company', 'director', 'filing', 'fraud', 'register'],
    icon: 'company',
  },
  {
    id: 'financial-services-fca',
    title: 'Financial services or FCA report',
    shortTitle: 'FCA / financial services',
    category: 'Finance & consumer',
    reportType: 'other-authority',
    authority: 'Financial Conduct Authority (FCA) or relevant financial regulator',
    channel: 'FCA official reporting, whistleblowing or consumer route; police or Action Fraud where crime is suspected',
    urgency: 'Routine',
    description: 'Prepare a report concerning regulated financial activity, investment concerns, payment services or misconduct.',
    useWhen: 'The concern relates to a regulated financial firm, investment, payment service, lending or financial misconduct.',
    keywords: ['FCA', 'financial', 'bank', 'payment', 'investment', 'lending', 'regulated'],
    icon: 'finance',
  },
  {
    id: 'consumer-trading-standards',
    title: 'Consumer protection or Trading Standards referral',
    shortTitle: 'Trading Standards',
    category: 'Finance & consumer',
    reportType: 'local-authority',
    authority: 'Responsible Trading Standards service / Citizens Advice consumer service',
    channel: 'Official consumer advice and Trading Standards referral route',
    urgency: 'Routine',
    description: 'Prepare a factual report concerning unfair trading, unsafe goods, misleading practices or consumer-law concerns.',
    useWhen: 'A trader, product or commercial practice may breach consumer-protection rules.',
    keywords: ['Trading Standards', 'consumer', 'unsafe goods', 'misleading', 'refund', 'trader'],
    icon: 'consumer',
  },
  {
    id: 'health-cqc-nhs',
    title: 'Health, care quality or NHS concern',
    shortTitle: 'Health / CQC / NHS',
    category: 'Health, education & work',
    reportType: 'other-authority',
    authority: 'Care Quality Commission, NHS body, professional regulator or local safeguarding authority, as applicable',
    channel: 'Official regulator, NHS complaints, safeguarding or professional-concerns route',
    urgency: 'Urgent',
    description: 'Prepare a report about care quality, unsafe practice, healthcare safeguarding or regulated health services.',
    useWhen: 'The concern relates to health or care services, patient safety, regulated care or professional conduct.',
    keywords: ['CQC', 'NHS', 'health', 'care', 'patient safety', 'medical', 'regulator'],
    icon: 'health',
  },
  {
    id: 'education-ofsted-local-authority',
    title: 'Education, school or Ofsted concern',
    shortTitle: 'Education / Ofsted',
    category: 'Health, education & work',
    reportType: 'other-authority',
    authority: 'School, responsible local authority, Department for Education or Ofsted, as applicable',
    channel: 'Official school complaint, council education, safeguarding, DfE or Ofsted route',
    urgency: 'Routine',
    description: 'Prepare a report concerning education provision, school conduct, safeguarding or regulatory standards.',
    useWhen: 'The issue concerns a school, education provider, local education function or Ofsted-regulated provision.',
    keywords: ['Ofsted', 'school', 'education', 'DfE', 'local authority', 'safeguarding'],
    icon: 'education',
  },
  {
    id: 'employment-health-safety',
    title: 'Employment or workplace safety report',
    shortTitle: 'Employment / HSE',
    category: 'Health, education & work',
    reportType: 'other-authority',
    authority: 'Health and Safety Executive, local authority, ACAS or relevant employment body',
    channel: 'Official HSE, council health-and-safety, ACAS or employment reporting route',
    urgency: 'Routine',
    description: 'Prepare a report concerning workplace safety, serious employment issues or regulatory non-compliance.',
    useWhen: 'The concern relates to workplace safety, dangerous practices, employment rights or a reportable workplace incident.',
    keywords: ['HSE', 'ACAS', 'employment', 'workplace', 'health and safety', 'RIDDOR'],
    icon: 'employment',
  },
  {
    id: 'transport-regulator',
    title: 'Transport operator or regulator report',
    shortTitle: 'Transport regulator',
    category: 'Transport & other regulators',
    reportType: 'other-authority',
    authority: 'Relevant transport operator, local transport authority, DVSA, ORR, CAA, MCA or regulator',
    channel: 'Official operator complaint, safety-reporting or regulator referral route',
    urgency: 'Routine',
    description: 'Prepare a report concerning public transport, road, rail, aviation, maritime or operator safety and compliance.',
    useWhen: 'The concern relates to a transport service, operator, licence, safety issue or statutory transport regulator.',
    keywords: ['transport', 'TfL', 'DVSA', 'ORR', 'CAA', 'rail', 'bus', 'taxi', 'aviation'],
    icon: 'transport',
  },
  {
    id: 'general-authority-regulator',
    title: 'General authority or regulator report',
    shortTitle: 'Other authority',
    category: 'Transport & other regulators',
    reportType: 'other-authority',
    authority: 'Relevant statutory authority, regulator or public body',
    channel: 'Authority-approved official reporting channel',
    urgency: 'Routine',
    description: 'Start a structured report where another authority or regulator is responsible.',
    useWhen: 'No specialist template fully matches the concern and staff need to select the correct public authority from the directory.',
    keywords: ['regulator', 'authority', 'government', 'public body', 'other'],
    icon: 'landmark',
  },
];

export const AUTHORITY_TEMPLATE_CATEGORIES: AuthorityTemplateCategory[] = [
  'Police & crime',
  'Safeguarding',
  'Data & cyber',
  'Council & public protection',
  'Government & public bodies',
  'Finance & consumer',
  'Health, education & work',
  'Transport & other regulators',
];

export function getAuthorityReportTemplate(id: string | null | undefined): AuthorityReportTemplate | null {
  const value = String(id || '').trim().toLowerCase();
  return AUTHORITY_REPORT_TEMPLATES.find(template => template.id === value) || null;
}
