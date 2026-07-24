import { jsPDF } from 'jspdf';

export type AdminManualId = 'admin-centre' | 'customer-portal' | 'public-website';

interface ManualSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  steps?: string[];
  table?: {
    headers: string[];
    rows: string[][];
    widths: number[];
  };
  note?: string;
}

interface ManualDefinition {
  title: string;
  subtitle: string;
  audience: string;
  filename: string;
  contents: string[];
  sections: ManualSection[];
}

const ADMIN_MANUAL: ManualDefinition = {
  title: 'Admin Centre Manual',
  subtitle: 'Secure operation of the Planyx administration platform',
  audience: 'Authorised Planyx administrators and support staff',
  filename: 'planyx-admin-centre-manual.pdf',
  contents: [
    'Access, security and administrator responsibilities',
    'Navigation and keyboard shortcuts',
    'Dashboard, production health and monitoring',
    'Customer CRM, enquiries and support tickets',
    'Subscription plans, Stripe and manual activation',
    'Builders, usage controls and customer permissions',
    'Website content, Contact Us and AI controls',
    'Audit, data protection and troubleshooting',
  ],
  sections: [
    {
      title: '1. Access, security and administrator responsibilities',
      bullets: [
        'Use an authorised JA Group Services Microsoft account. Never share staff credentials.',
        'Enter your own four-digit administrator PIN after Microsoft sign-in. Do not share or record the PIN in a ticket.',
        'Only use pages and actions required for your role. Admin permissions are based on least privilege.',
        'Only view or change customer information where there is a genuine business reason.',
        'Write factual and professional notes because important actions may be retained in the audit trail.',
      ],
      steps: [
        'Open the Planyx Admin Portal.',
        'Complete Microsoft sign-in with an authorised account.',
        'Enter the personal Admin Centre PIN.',
        'Confirm the correct administrator name is displayed.',
        'Sign out when the work is complete.',
      ],
      note: 'Never request a customer password, Microsoft password or full payment-card details. Use Stripe-hosted tools for payment handling.',
    },
    {
      title: '2. Navigation and keyboard shortcuts',
      paragraphs: ['Use the Admin header, All admin tools menu, breadcrumbs or the keyboard shortcut guide. Press ? on any unlocked Admin Centre page to open the guide.'],
      table: {
        headers: ['Shortcut', 'Destination', 'Typical use'],
        widths: [28, 48, 102],
        rows: [
          ['G then D', 'Dashboard', 'Admin Centre overview'],
          ['G then C', 'Customer CRM', 'Customer and account records'],
          ['G then P', 'Subscription Plans', 'Plans, prices and Stripe IDs'],
          ['G then E', 'Contact Enquiries', 'Contact Us requests'],
          ['G then B', 'Experience Builders', 'Builder controls'],
          ['G then A', 'AI Chatbot Control', 'AI and Contact Us settings'],
          ['G then S', 'Site Status & Settings', 'Website and service settings'],
          ['G then H', 'Production Health', 'Live health checks'],
          ['G then M', 'Admin Support & Manuals', 'Manuals and admin guidance'],
        ],
      },
      note: 'Shortcuts are paused while the cursor is inside an input, text area, select control or editable text field.',
    },
    {
      title: '3. Dashboard, production health and monitoring',
      bullets: [
        'Use Dashboard for a high-level view of customers, activity and items needing attention.',
        'Check Production Health and Status Centre before reporting a platform-wide incident.',
        'Use Reports and Analytics for operational patterns, not as a financial ledger.',
        'Use Audit Log to understand who changed a setting or customer record and when.',
      ],
      steps: [
        'Confirm whether the problem affects one account, one page or the whole platform.',
        'Check Production Health and Status Centre.',
        'Repeat the action in a private browser window where appropriate.',
        'Record the page, time, error wording and affected account email.',
        'Avoid changing unrelated settings during an investigation.',
      ],
    },
    {
      title: '4. Customer CRM, enquiries and support tickets',
      bullets: [
        'Search by the verified customer email before creating or changing an account.',
        'Confirm whether the account is Individual or Organisation before changing plan access.',
        'Do not store passwords, card numbers or unnecessary sensitive data in notes.',
        'Contact Enquiries contains enquiries submitted through the public Contact Us service.',
        'Support Centre manages customer tickets, priority, status, messages and staff-only notes.',
        'Mark a ticket resolved only after the issue is completed or a clear answer has been provided.',
      ],
      note: 'Safeguarding concerns must be escalated under the company safeguarding procedure. Data rights requests must use the approved Data Protection Requests process.',
    },
    {
      title: '5. Subscription plans, Stripe and manual activation',
      bullets: [
        'The Subscription Plans page controls the live plan catalogue shown to customers.',
        'Check the plan name, description, monthly price, features, account type and Stripe Price ID before saving.',
        'Use verification to confirm that each Stripe Price ID belongs to the expected live product and currency.',
        'Never copy Stripe test-mode Price IDs into production.',
      ],
      table: {
        headers: ['Route', 'Customer journey', 'Administrator check'],
        widths: [35, 72, 71],
        rows: [
          ['Website checkout', 'Customer signs in or creates an account, selects a plan and pays online.', 'Confirm Stripe processing and the subscription shown in Customer CRM.'],
          ['Manual Stripe payment', 'Staff charges the customer through Stripe using the customer email.', 'Confirm successful payment and ensure the customer registers with the same email.'],
        ],
      },
      note: 'Manual subscription claiming depends on the Stripe email matching the verified Planyx account email.',
    },
    {
      title: '6. Builders, usage controls and customer permissions',
      bullets: [
        'Enable, disable or maintain individual Experience Builders without changing unrelated services.',
        'Adjust usage tokens only where a plan entitlement or authorised correction requires it.',
        'Paid Individual plans may share read-only itineraries with the exact invited email.',
        'Editor access is reserved for eligible Together or Organisation workspaces.',
        'Customers should be able to save or export a fully formatted PDF itinerary.',
      ],
      note: 'Always confirm both the account type and plan before changing access. A plan name alone does not determine organisation editing permissions.',
    },
    {
      title: '7. Website content, Contact Us and AI controls',
      table: {
        headers: ['State', 'Visitor experience', 'Submission behaviour'],
        widths: [28, 86, 64],
        rows: [
          ['Online', 'Live Contact Us page, AI-assisted contact box and enabled contact methods.', 'New enquiries are accepted.'],
          ['Maintenance', 'Branded maintenance notice with reason and expected return.', 'Direct submissions are rejected.'],
          ['Offline', 'Branded offline notice and alternative contact details.', 'Direct submissions are rejected.'],
        ],
      },
      bullets: [
        'Use AI Chatbot Control for chatbot and Contact Us configuration.',
        'Use Site Status & Settings for service states, maintenance wording and operational settings.',
        'Use Website CMS, Website Pages and Legal Policies for approved customer-facing content.',
        'Keep public maintenance messages clear and free from unnecessary internal technical detail.',
      ],
    },
    {
      title: '8. Audit, data protection and troubleshooting',
      steps: [
        'Confirm the customer or service record.',
        'Confirm your authority and the reason for the change.',
        'Record a clear note where supported.',
        'Save once and confirm the new state after reloading.',
        'Check the audit log when independent verification is required.',
      ],
      bullets: [
        'Hard refresh the browser after a new production deployment.',
        'Check that the Admin Centre PIN session has not expired.',
        'Confirm the administrator role has permission for the page.',
        'Check Production Health before changing settings to compensate for an outage.',
        'Capture the page URL, time and error wording when escalating.',
      ],
      note: 'Do not use production customer data for testing. Use approved test accounts and tools where available.',
    },
  ],
};

const CUSTOMER_MANUAL: ManualDefinition = {
  title: 'Customer Portal Manual',
  subtitle: 'Using a Planyx account, subscription and planning workspace',
  audience: 'Customers, customer-support staff and authorised administrators',
  filename: 'planyx-customer-portal-manual.pdf',
  contents: [
    'Signing in and account basics',
    'Plans, subscriptions and account types',
    'Creating an itinerary with the builders',
    'Saving, exporting and sharing',
    'Organisation workspaces and invitations',
    'Settings, privacy and support',
    'Troubleshooting',
  ],
  sections: [
    {
      title: '1. Signing in and account basics',
      bullets: [
        'Open the Planyx website and select Sign in.',
        'Use the supported Microsoft or customer identity sign-in route.',
        'The verified email address links the account to subscription records.',
        'The customer dashboard shows the workspace, plan and available builders.',
      ],
      note: 'Customers who paid manually through Stripe must register with the same email used for the successful payment.',
    },
    {
      title: '2. Plans, subscriptions and account types',
      table: {
        headers: ['Plan', 'Workspace', 'Key access'],
        widths: [35, 45, 98],
        rows: [
          ['Explore', 'Individual', 'Entry-level planning access'],
          ['Plan', 'Individual', 'Expanded planning features'],
          ['Complete', 'Individual', 'Full Individual planning access'],
          ['Together', 'Organisation', 'Collaborative workspace and editor invitations'],
        ],
      },
      bullets: [
        'Individual accounts are private personal workspaces.',
        'Paid Individual plans may share an itinerary as read-only with the exact invited email.',
        'Together is the collaboration plan for organisation workspaces and editor access.',
        'A downgrade may remove editing rights or features from the previous plan.',
      ],
    },
    {
      title: '3. Creating an itinerary with the builders',
      steps: [
        'Open Builders from the customer dashboard.',
        'Choose the builder that matches the required plan or experience.',
        'Complete the guided questions with accurate dates, locations and preferences.',
        'Review the generated itinerary carefully.',
        'Save the result to the customer workspace.',
        'Return to edit or regenerate sections where available.',
      ],
      note: 'Planyx is a planning platform and not a travel agency. Customers must check bookings, opening hours, entry rules and supplier terms.',
    },
    {
      title: '4. Saving, exporting and sharing',
      bullets: [
        'Save stores the itinerary in the customer workspace.',
        'Export PDF downloads a formatted copy for a phone, computer or printing.',
        'Paid Individual accounts may invite an exact email to view an itinerary without editing.',
        'Editor access is reserved for eligible Together or Organisation workspaces.',
      ],
      note: 'Only share an itinerary with people who should see the information inside it. Remove private notes or personal data that are not needed.',
    },
    {
      title: '5. Organisation workspaces and invitations',
      bullets: [
        'Organisation workspaces keep business planning separate from an Individual account.',
        'Invitations are email-bound and should be sent to the recipient account email.',
        'Member permissions depend on the live plan entitlement.',
        'Removing a member or downgrading the workspace can remove edit access.',
      ],
    },
    {
      title: '6. Settings, privacy and support',
      bullets: [
        'Use Settings to review account details and available preferences.',
        'Use Privacy Settings for privacy choices and requests where available.',
        'Use the Help Centre for self-service guidance.',
        'Use Contact Us when a direct enquiry is needed and the service is online.',
        'Contact Us may display Maintenance or Offline status while work is completed.',
      ],
    },
    {
      title: '7. Troubleshooting',
      table: {
        headers: ['Problem', 'What to try'],
        widths: [58, 120],
        rows: [
          ['No subscription is shown', 'Confirm the account email matches the Stripe payment email. Sign out and sign in again.'],
          ['A builder is unavailable', 'Check the plan, account type and builder maintenance state.'],
          ['PDF export does not start', 'Allow downloads, use a current browser and check available device storage.'],
          ['A share link fails', 'Confirm the invited email and that the plan includes the requested sharing level.'],
          ['Contact Us is unavailable', 'Read the maintenance or offline notice and use the published alternative contact details if urgent.'],
        ],
      },
    },
  ],
};

const WEBSITE_MANUAL: ManualDefinition = {
  title: 'Public Website Manual',
  subtitle: 'Understanding the customer-facing Planyx website and service pages',
  audience: 'Customers, administrators, content staff and support staff',
  filename: 'planyx-public-website-manual.pdf',
  contents: [
    'Website purpose and navigation',
    'Plans, pricing and sign-in',
    'Contact Us, Help Centre and service status',
    'Website content and partner discovery',
    'Legal, privacy, cookies and accessibility',
    'Public website troubleshooting',
  ],
  sections: [
    {
      title: '1. Website purpose and navigation',
      bullets: [
        'The public website explains Planyx, its planning tools, subscriptions and customer access.',
        'Customers can discover destinations, activities and experiences before signing in.',
        'The public website and Customer Portal use the same Planyx brand but serve different purposes.',
        'The website is not a travel agency and does not replace supplier confirmations or official travel advice.',
      ],
    },
    {
      title: '2. Plans, pricing and sign-in',
      bullets: [
        'Plans and Pricing display the current live subscription catalogue.',
        'Customers should review plan features and account type before checkout.',
        'Website checkout creates or links the account and activates the subscription after Stripe confirmation.',
        'Customers charged manually through Stripe should register with the same payment email.',
      ],
      note: 'The live Plans page is the customer-facing source for current prices. Historical material should not override the live catalogue.',
    },
    {
      title: '3. Contact Us, Help Centre and service status',
      table: {
        headers: ['Service', 'Purpose'],
        widths: [50, 128],
        rows: [
          ['Help Centre', 'Self-service answers and approved guidance.'],
          ['Contact Us', 'Direct enquiries through the AI-assisted contact box and enabled methods.'],
          ['Maintenance mode', 'Shows a public notice while Contact Us work is completed.'],
          ['Offline mode', 'Removes the enquiry form and displays alternative contact information.'],
        ],
      },
      bullets: [
        'Contact Us can be controlled independently from the rest of the website.',
        'Maintenance and Offline modes block direct enquiry submissions.',
        'Public messages should be clear, factual and suitable for customers.',
      ],
    },
    {
      title: '4. Website content and partner discovery',
      bullets: [
        'Destination and discovery pages help customers explore planning ideas.',
        'Partner discovery may link to external providers such as Headout or GetYourGuide.',
        'External purchases are subject to provider terms, availability and payment processes.',
        'Website CMS and Website Pages control approved customer-facing content.',
        'Branding changes should use the approved Planyx logo, colours and positioning line.',
      ],
      note: 'Where Planyx may receive an affiliate benefit, content should remain clear that the booking or purchase is completed with the external provider.',
    },
    {
      title: '5. Legal, privacy, cookies and accessibility',
      bullets: [
        'Terms of Service explain the rules for using Planyx.',
        'Privacy information explains how personal data is used and the available rights.',
        'Cookie controls allow customers to manage non-essential technologies.',
        'Complaints and Refund policies explain the relevant company processes.',
        'Accessibility controls may support font size, contrast, reduced motion and dyslexia-friendly presentation.',
      ],
    },
    {
      title: '6. Public website troubleshooting',
      table: {
        headers: ['Symptom', 'Action'],
        widths: [62, 116],
        rows: [
          ['A page looks old after deployment', 'Hard refresh and confirm the browser is loading the newest application bundle.'],
          ['A link opens the wrong page', 'Record the URL, time and expected destination and report it through Admin Support.'],
          ['Plans show the wrong price', 'Check the Admin plan editor and Stripe Price ID verification.'],
          ['Contact Us ignores its status', 'Confirm the saved state and test in a signed-out private browser window.'],
          ['The website is difficult to read', 'Open accessibility controls and select the required display support.'],
        ],
      },
    },
  ],
};

const MANUALS: Record<AdminManualId, ManualDefinition> = {
  'admin-centre': ADMIN_MANUAL,
  'customer-portal': CUSTOMER_MANUAL,
  'public-website': WEBSITE_MANUAL,
};

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 16;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const NAVY = [11, 23, 45] as const;
const BLUE = [37, 99, 235] as const;
const CYAN = [6, 182, 212] as const;
const VIOLET = [124, 58, 237] as const;
const GREY = [71, 85, 105] as const;
const LIGHT_GREY = [241, 245, 249] as const;

function createRenderer(pdf: jsPDF) {
  let y = 18;

  const addPage = () => {
    pdf.addPage();
    y = 18;
  };

  const ensureSpace = (height: number) => {
    if (y + height > PAGE_HEIGHT - 19) addPage();
  };

  const text = (value: string, options: { size?: number; bold?: boolean; colour?: readonly [number, number, number]; indent?: number; gap?: number } = {}) => {
    const size = options.size ?? 10;
    const indent = options.indent ?? 0;
    const width = CONTENT_WIDTH - indent;
    pdf.setFont('helvetica', options.bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    const colour = options.colour ?? GREY;
    pdf.setTextColor(colour[0], colour[1], colour[2]);
    const lines = pdf.splitTextToSize(value, width);
    const lineHeight = size * 0.42;
    ensureSpace(lines.length * lineHeight + (options.gap ?? 2));
    pdf.text(lines, MARGIN + indent, y);
    y += lines.length * lineHeight + (options.gap ?? 2);
  };

  const heading = (value: string) => {
    ensureSpace(16);
    y += 4;
    text(value, { size: 16, bold: true, colour: NAVY, gap: 4 });
  };

  const bullet = (value: string) => {
    const size = 9.6;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
    const lines = pdf.splitTextToSize(value, CONTENT_WIDTH - 9);
    const lineHeight = size * 0.42;
    ensureSpace(lines.length * lineHeight + 2);
    pdf.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
    pdf.circle(MARGIN + 1.5, y - 1.1, 0.8, 'F');
    pdf.text(lines, MARGIN + 6, y);
    y += lines.length * lineHeight + 2;
  };

  const numberedStep = (value: string, index: number) => {
    const size = 9.6;
    const prefix = `${index}.`;
    const lines = pdf.splitTextToSize(value, CONTENT_WIDTH - 12);
    const lineHeight = size * 0.42;
    ensureSpace(lines.length * lineHeight + 2);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(size);
    pdf.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
    pdf.text(prefix, MARGIN, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
    pdf.text(lines, MARGIN + 8, y);
    y += lines.length * lineHeight + 2;
  };

  const note = (value: string) => {
    const lines = pdf.splitTextToSize(value, CONTENT_WIDTH - 12);
    const height = Math.max(14, lines.length * 4.2 + 8);
    ensureSpace(height + 4);
    pdf.setFillColor(239, 246, 255);
    pdf.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 2, 2, 'F');
    pdf.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
    pdf.rect(MARGIN, y, 2.2, height, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.7);
    pdf.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    pdf.text('Important', MARGIN + 6, y + 5.3);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
    pdf.text(lines, MARGIN + 6, y + 10);
    y += height + 4;
  };

  const table = (headers: string[], rows: string[][], widths: number[]) => {
    const rowPadding = 2.5;
    const fontSize = 7.8;
    const renderHeader = () => {
      const headerLines = headers.map((header, index) => pdf.splitTextToSize(header, widths[index] - rowPadding * 2));
      const headerHeight = Math.max(...headerLines.map(lines => lines.length)) * 3.5 + rowPadding * 2;
      ensureSpace(headerHeight + 8);
      let x = MARGIN;
      pdf.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
      pdf.rect(MARGIN, y, widths.reduce((sum, width) => sum + width, 0), headerHeight, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(fontSize);
      pdf.setTextColor(255, 255, 255);
      headerLines.forEach((lines, index) => {
        pdf.text(lines, x + rowPadding, y + rowPadding + 2.7);
        x += widths[index];
      });
      y += headerHeight;
    };

    y += 2;
    renderHeader();
    rows.forEach((row, rowIndex) => {
      const cells = row.map((value, index) => pdf.splitTextToSize(value, widths[index] - rowPadding * 2));
      const rowHeight = Math.max(...cells.map(lines => lines.length)) * 3.5 + rowPadding * 2;
      if (y + rowHeight > PAGE_HEIGHT - 19) {
        addPage();
        renderHeader();
      }
      if (rowIndex % 2 === 0) {
        pdf.setFillColor(LIGHT_GREY[0], LIGHT_GREY[1], LIGHT_GREY[2]);
        pdf.rect(MARGIN, y, widths.reduce((sum, width) => sum + width, 0), rowHeight, 'F');
      }
      let x = MARGIN;
      pdf.setDrawColor(203, 213, 225);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(fontSize);
      pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
      cells.forEach((lines, index) => {
        pdf.rect(x, y, widths[index], rowHeight);
        pdf.text(lines, x + rowPadding, y + rowPadding + 2.7);
        x += widths[index];
      });
      y += rowHeight;
    });
    y += 4;
  };

  return { addPage, text, heading, bullet, numberedStep, note, table, getY: () => y, setY: (value: number) => { y = value; } };
}

function drawCover(pdf: jsPDF, manual: ManualDefinition) {
  pdf.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
  pdf.rect(0, 0, 52.5, 5, 'F');
  pdf.setFillColor(CYAN[0], CYAN[1], CYAN[2]);
  pdf.rect(52.5, 0, 52.5, 5, 'F');
  pdf.setFillColor(VIOLET[0], VIOLET[1], VIOLET[2]);
  pdf.rect(105, 0, 52.5, 5, 'F');
  pdf.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.rect(157.5, 0, 52.5, 5, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
  pdf.setFontSize(28);
  pdf.text('Planyx', PAGE_WIDTH / 2, 55, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
  pdf.setFontSize(10);
  pdf.text('Build experiences. Create memories.', PAGE_WIDTH / 2, 64, { align: 'center' });

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.setFontSize(23);
  const titleLines = pdf.splitTextToSize(manual.title, 165);
  pdf.text(titleLines, PAGE_WIDTH / 2, 100, { align: 'center' });

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
  pdf.setFontSize(11);
  const subtitleLines = pdf.splitTextToSize(manual.subtitle, 165);
  pdf.text(subtitleLines, PAGE_WIDTH / 2, 119, { align: 'center' });

  const boxY = 143;
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(203, 213, 225);
  pdf.roundedRect(25, boxY, 160, 42, 2, 2, 'FD');
  pdf.setFontSize(9);
  pdf.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Audience', 32, boxY + 10);
  pdf.text('Document status', 32, boxY + 22);
  pdf.text('Owner', 32, boxY + 34);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
  pdf.text(pdf.splitTextToSize(manual.audience, 105), 72, boxY + 10);
  pdf.text('Version 1.0 - July 2026', 72, boxY + 22);
  pdf.text('JA Group Services Ltd - Planyx', 72, boxY + 34);

  pdf.setFillColor(239, 246, 255);
  pdf.roundedRect(25, 198, 160, 34, 2, 2, 'F');
  pdf.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
  pdf.rect(25, 198, 2.5, 34, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.text('Document use', 32, 207);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
  const useText = 'Use this manual alongside the live Planyx platform. Security, privacy and billing decisions must follow current Admin Centre controls and company policies.';
  pdf.text(pdf.splitTextToSize(useText, 145), 32, 214);
}

function drawContents(pdf: jsPDF, manual: ManualDefinition) {
  pdf.addPage();
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.setFontSize(22);
  pdf.text('Contents', MARGIN, 24);
  pdf.setFontSize(10.5);
  let y = 40;
  manual.contents.forEach((item, index) => {
    pdf.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
    pdf.text(`${index + 1}.`, MARGIN, y);
    pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
    const lines = pdf.splitTextToSize(item, CONTENT_WIDTH - 10);
    pdf.text(lines, MARGIN + 9, y);
    y += lines.length * 5 + 4;
  });
}

function addHeaderAndFooters(pdf: jsPDF, title: string) {
  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    pdf.setPage(page);
    if (page > 1) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
      pdf.text('Planyx', MARGIN, 9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      pdf.text(` | ${title}`, MARGIN + 12, 9);
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Page ${page} of ${total}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 8, { align: 'right' });
  }
}

export function createAdminManualPdf(id: AdminManualId) {
  const manual = MANUALS[id];
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({
    title: manual.title,
    subject: manual.subtitle,
    author: 'JA Group Services Ltd - Planyx',
    creator: 'Planyx Admin Centre',
  });

  drawCover(pdf, manual);
  drawContents(pdf, manual);
  pdf.addPage();
  const renderer = createRenderer(pdf);

  manual.sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0 && renderer.getY() > 245) renderer.addPage();
    renderer.heading(section.title);
    section.paragraphs?.forEach(paragraph => renderer.text(paragraph));
    section.bullets?.forEach(item => renderer.bullet(item));
    section.steps?.forEach((step, index) => renderer.numberedStep(step, index + 1));
    if (section.table) renderer.table(section.table.headers, section.table.rows, section.table.widths);
    if (section.note) renderer.note(section.note);
  });

  renderer.heading('Support contacts');
  renderer.text('Email: planyx@jagroupservices.co.uk');
  renderer.text('JA Group Services switchboard: 020 3834 2790');
  renderer.text('Business WhatsApp/mobile: +44 7886 158834');

  addHeaderAndFooters(pdf, manual.title);
  return {
    blob: pdf.output('blob'),
    filename: manual.filename,
    title: manual.title,
    pageCount: pdf.getNumberOfPages(),
  };
}
