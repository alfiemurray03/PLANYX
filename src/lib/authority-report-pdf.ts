import { jsPDF } from 'jspdf';

export interface AuthorityReportPdfData {
  reference: string;
  report_type: string;
  authority_name?: string;
  authority_channel?: string;
  urgency: string;
  status: string;
  linked_session_reference?: string;
  linked_user_email?: string;
  linked_user_name?: string;
  linked_user_type?: string;
  subject_name?: string;
  subject_date_of_birth?: string;
  incident_datetime?: string;
  incident_location?: string;
  summary?: string;
  narrative?: string;
  risk_details?: string;
  people_involved?: string;
  evidence_summary?: string;
  immediate_actions?: string;
  safeguarding_actions?: string;
  data_categories?: string;
  individuals_affected?: string;
  containment_actions?: string;
  external_reference?: string;
  submitted_at?: string;
  submitted_by?: string;
  assigned_admin?: string;
  internal_notes?: string;
  staff_declaration?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

const REPORT_TITLES: Record<string, string> = {
  'police-emergency': 'Emergency Police Incident Record',
  'police-non-emergency': 'Police 101 / Online Reporting Pack',
  'child-safeguarding': 'Child Safeguarding Referral Record',
  'adult-safeguarding': 'Adult Safeguarding Referral Record',
  'data-breach-ico': 'Personal Data Breach Assessment & ICO Report Pack',
  'local-authority': 'Local Authority Referral Record',
  'other-authority': 'Authority / Regulator Report Record',
};

function displayDate(value?: string): string {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-GB');
}

function safeFilename(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function downloadAuthorityReportPdf(report: AuthorityReportPdfData): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  function footer(): void {
    const page = doc.getNumberOfPages();
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Planyx Authority Reporting Centre · ${report.reference}`, margin, pageHeight - 9);
    doc.text(`Page ${page}`, pageWidth - margin, pageHeight - 9, { align: 'right' });
  }

  function newPage(): void {
    footer();
    doc.addPage();
    y = 18;
  }

  function ensureSpace(height: number): void {
    if (y + height > pageHeight - 18) newPage();
  }

  function heading(title: string): void {
    ensureSpace(14);
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 64, 175);
    doc.text(title, margin + 4, y + 6.5);
    y += 14;
  }

  function paragraph(value?: string): void {
    const text = String(value || '').trim() || 'Not recorded';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    const lines = doc.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      ensureSpace(6);
      doc.text(line, margin, y);
      y += 5;
    }
    y += 2;
  }

  function field(label: string, value?: string): void {
    ensureSpace(11);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(label.toUpperCase(), margin, y);
    y += 4.5;
    paragraph(value);
  }

  const title = REPORT_TITLES[report.report_type] || REPORT_TITLES['other-authority'];
  doc.setFillColor(29, 78, 216);
  doc.rect(0, 0, pageWidth, 48, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Planyx', margin, 18);
  doc.setFontSize(15);
  doc.text(title, margin, 29);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Internal evidence and reporting preparation record', margin, 37);
  y = 59;

  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 32, 3, 3, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.text(report.reference || 'Reference pending', margin + 5, y + 9);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Urgency: ${report.urgency || 'Not recorded'}`, margin + 5, y + 17);
  doc.text(`Status: ${report.status || 'Not recorded'}`, margin + 5, y + 24);
  doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pageWidth - margin - 5, y + 17, { align: 'right' });
  doc.text('Operated by JA Group Services Ltd', pageWidth - margin - 5, y + 24, { align: 'right' });
  y += 41;

  heading('Authority and submission route');
  field('Authority', report.authority_name);
  field('Intended or used reporting channel', report.authority_channel);
  field('External authority reference', report.external_reference);
  field('Submitted at', displayDate(report.submitted_at));
  field('Submitted by', report.submitted_by);

  heading('Linked Planyx records');
  field('Session reference', report.linked_session_reference);
  field('Linked person', [report.linked_user_name, report.linked_user_email].filter(Boolean).join(' · '));
  field('Record type', report.linked_user_type);

  heading('Person or subject of concern');
  field('Name', report.subject_name);
  field('Date of birth', report.subject_date_of_birth);

  heading('Incident or concern');
  field('Date and time', displayDate(report.incident_datetime));
  field('Location', report.incident_location);
  field('Summary', report.summary);
  field('Factual chronology / narrative', report.narrative);
  field('Risk and immediate danger', report.risk_details);
  field('People involved or witnesses', report.people_involved);

  heading('Evidence and action taken');
  field('Evidence preserved', report.evidence_summary);
  field('Immediate actions', report.immediate_actions);
  field('Safeguarding actions', report.safeguarding_actions);

  if (report.report_type === 'data-breach-ico') {
    heading('Personal data breach assessment');
    field('Categories of personal data', report.data_categories);
    field('Individuals affected', report.individuals_affected);
    field('Containment and mitigation', report.containment_actions);
  }

  heading('Administration and declaration');
  field('Assigned administrator', report.assigned_admin);
  field('Internal notes', report.internal_notes);
  field('Staff declaration', report.staff_declaration);
  field('Created by', report.created_by);
  field('Created at', displayDate(report.created_at));
  field('Last updated', displayDate(report.updated_at));

  ensureSpace(30);
  doc.setFillColor(255, 247, 237);
  doc.roundedRect(margin, y, contentWidth, 24, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(154, 52, 18);
  doc.text('IMPORTANT', margin + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const notice = doc.splitTextToSize(
    'This PDF is an internal preparation and evidence record. It does not itself notify the police, emergency services, a local authority, the ICO or any other regulator. Staff must use the correct official reporting channel and record the external reference above.',
    contentWidth - 8,
  );
  doc.text(notice, margin + 4, y + 12);

  footer();
  doc.save(`${safeFilename(report.reference || 'planyx-authority-report')}.pdf`);
}
