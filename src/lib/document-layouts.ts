/**
 * Sousa Murray Planeia — Document Layout System
 * 14 professional layout styles.
 *
 * BRANDING POLICY:
 * - No hardcoded platform branding (no "JA Group Services", no "Sousa Murray Planeia")
 * - All header fields (ref, date, version, status) are optional — only shown when
 *   the caller passes showRef/showDate/showVersion/showStatus = true
 * - Disclaimer is opt-in via showDisclaimer = true
 * - If no branding is provided the header renders with no logo/name
 */

export type LayoutId =
  | 'corporate'
  | 'business'
  | 'executive'
  | 'formal'
  | 'modern'
  | 'minimal'
  | 'report'
  | 'contract'
  | 'policy'
  | 'board'
  | 'charity'
  | 'education'
  | 'certificate'
  | 'letter';

export interface LayoutDefinition {
  id: LayoutId;
  name: string;
  description: string;
  preview: string; // Tailwind bg class for swatch
}

export const LAYOUTS: LayoutDefinition[] = [
  { id: 'corporate',   name: 'Corporate',     description: 'Bold header with accent bar, structured sections, professional table styling.',   preview: 'bg-blue-700'    },
  { id: 'business',    name: 'Business',      description: 'Clean two-column header, subtle borders, ideal for proposals and agreements.',     preview: 'bg-slate-700'   },
  { id: 'executive',   name: 'Executive',     description: 'Premium dark header band, serif body, gold accent lines for senior documents.',    preview: 'bg-gray-900'    },
  { id: 'formal',      name: 'Formal',        description: 'Traditional centred title, ruled sections, classic serif typography.',             preview: 'bg-stone-700'   },
  { id: 'modern',      name: 'Modern',        description: 'Clean sans-serif, coloured left border on sections, minimal decoration.',          preview: 'bg-indigo-600'  },
  { id: 'minimal',     name: 'Minimal',       description: 'Pure white, light grey dividers, maximum readability, no colour accents.',         preview: 'bg-gray-400'    },
  { id: 'report',      name: 'Report',        description: 'Data-focused layout with prominent table styling and numbered sections.',           preview: 'bg-teal-700'    },
  { id: 'contract',    name: 'Contract',      description: 'Legal-style numbered clauses, parties block, formal signature section.',           preview: 'bg-zinc-800'    },
  { id: 'policy',      name: 'Policy',        description: 'Version-controlled header, policy number, review date, compliance-ready.',         preview: 'bg-blue-900'    },
  { id: 'board',       name: 'Board Meeting', description: 'Agenda-style layout with attendees block, action items, and resolution sections.', preview: 'bg-purple-800'  },
  { id: 'charity',     name: 'Charity',       description: 'Warm, approachable layout with soft colours, suitable for community documents.',   preview: 'bg-emerald-700' },
  { id: 'education',   name: 'Education',     description: 'Bright, structured layout for school and training documents.',                     preview: 'bg-orange-600'  },
  { id: 'certificate', name: 'Certificate',   description: 'Centred, decorative border, formal certificate presentation.',                     preview: 'bg-amber-600'   },
  { id: 'letter',      name: 'Letter',        description: 'Traditional letter format with sender/recipient blocks and date line.',             preview: 'bg-rose-700'    },
];

// ── Branding config ────────────────────────────────────────────────────────────

export interface BrandingConfig {
  orgName?: string;
  tagline?: string;
  logoUrl?: string;
  primaryColour?: string;
  accentColour?: string;
  fontFamily?: 'serif' | 'sans' | 'mono';
  showLogo?: boolean;
  showOrgName?: boolean;
  footerText?: string;
}

// ── Header visibility flags ────────────────────────────────────────────────────
// All default to FALSE so nothing is forced on users.

export interface HeaderFlags {
  showRef?: boolean;
  showDate?: boolean;
  showVersion?: boolean;
  showStatus?: boolean;
  showDisclaimer?: boolean;
}

// ── Render options ─────────────────────────────────────────────────────────────

export interface DocumentRenderOptions {
  layout: LayoutId;
  title: string;
  docRef?: string;
  date?: string;
  version?: string;
  status?: string;
  body: string;
  signatories?: Array<{ label: string }>;
  branding?: BrandingConfig;
  flags?: HeaderFlags;
}

// ── Colour / font helpers ──────────────────────────────────────────────────────

function primary(b?: BrandingConfig) { return b?.primaryColour ?? '#1B4F8A'; }
function accent(b?: BrandingConfig)  { return b?.accentColour  ?? '#1e1b8a'; }
function fontStack(b?: BrandingConfig) {
  if (b?.fontFamily === 'sans') return "'Arial', Helvetica, sans-serif";
  if (b?.fontFamily === 'mono') return "'Courier New', Courier, monospace";
  return "'Times New Roman', Times, Georgia, serif";
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function signaturesHtml(signatories: Array<{ label: string }>, col: string): string {
  if (!signatories.length) return '';
  return `<section class="pdf-signatures">
    <h3 style="color:${col}">Signatures</h3>
    <div class="pdf-sig-grid${signatories.length === 1 ? ' single' : ''}">
      ${signatories.map(s => `
        <div class="signature-box">
          <p class="sig-label" style="color:${col}">${s.label}</p>
          <div class="signature-line"></div>
          <p class="sig-field">Name: <span>&nbsp;</span></p>
          <p class="sig-field">Date: <span>&nbsp;</span></p>
        </div>`).join('')}
    </div>
  </section>`;
}

/** Disclaimer — only rendered when flags.showDisclaimer === true */
function disclaimerHtml(flags?: HeaderFlags): string {
  if (!flags?.showDisclaimer) return '';
  return `<div class="pdf-disclaimer">
    This document is intended as a starting point only and does not constitute legal advice.
    Users are responsible for ensuring this document is suitable for their specific circumstances.
  </div>`;
}

/**
 * Build the meta block (ref / date / version / status) respecting flags.
 * Returns empty string if nothing is enabled.
 */
function metaLines(opts: DocumentRenderOptions, col: string, style = ''): string {
  const f = opts.flags ?? {};
  const lines: string[] = [];
  if (f.showRef     && opts.docRef)  lines.push(`<p style="${style}"><strong style="color:${col}">Ref:</strong> ${opts.docRef}</p>`);
  if (f.showDate    && opts.date)    lines.push(`<p style="${style}"><strong style="color:${col}">Date:</strong> ${opts.date}</p>`);
  if (f.showVersion && opts.version) lines.push(`<p style="${style}"><strong style="color:${col}">Version:</strong> ${opts.version}</p>`);
  if (f.showStatus  && opts.status)  lines.push(`<p style="${style}"><strong style="color:${col}">Status:</strong> <span class="pdf-status-badge ${(opts.status ?? '').toLowerCase()}">${opts.status}</span></p>`);
  return lines.join('');
}

function metaLinesPlain(opts: DocumentRenderOptions, style = ''): string {
  const f = opts.flags ?? {};
  const parts: string[] = [];
  if (f.showRef     && opts.docRef)  parts.push(`<span style="${style}"><strong>Ref:</strong> ${opts.docRef}</span>`);
  if (f.showDate    && opts.date)    parts.push(`<span style="${style}"><strong>Date:</strong> ${opts.date}</span>`);
  if (f.showVersion && opts.version) parts.push(`<span style="${style}"><strong>Version:</strong> ${opts.version}</span>`);
  return parts.join('');
}

/**
 * Branding header block — logo + org name.
 * Returns empty string if no branding is configured.
 */
function brandingHeader(opts: DocumentRenderOptions): string {
  const b = opts.branding;
  const col = primary(b);
  const orgName = b?.orgName?.trim() ?? '';
  const tagline  = b?.tagline?.trim()  ?? '';
  const logoUrl  = b?.logoUrl?.trim()  ?? '';
  const showLogo = b?.showLogo !== false;
  const showOrg  = b?.showOrgName !== false;

  // Nothing to show
  if (!orgName && !logoUrl) return '';

  const logoBlock = logoUrl && showLogo
    ? `<img src="${logoUrl}" alt="${orgName}" style="height:52px;width:auto;object-fit:contain;flex-shrink:0;" />`
    : (orgName && showOrg)
      ? `<div style="width:52px;height:52px;background:${col};border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-size:22px;font-weight:900;font-family:Arial,sans-serif;flex-shrink:0;">${orgName.charAt(0).toUpperCase()}</div>`
      : '';

  const nameBlock = (orgName && showOrg)
    ? `<div class="pdf-company">
        <h1 style="color:${col}">${orgName}</h1>
        ${tagline ? `<p>${tagline}</p>` : ''}
      </div>`
    : '';

  return `${logoBlock}${nameBlock}`;
}

/** Footer text — uses user-supplied footerText or empty */
function footerHtml(opts: DocumentRenderOptions, accentCol?: string): string {
  const text = opts.branding?.footerText?.trim() ?? '';
  const ref  = (opts.flags?.showRef && opts.docRef) ? opts.docRef : '';
  const borderCol = accentCol ?? '#e5e7eb';
  if (!text && !ref) return `<footer class="pdf-footer" style="border-top-color:${borderCol};"></footer>`;
  return `<footer class="pdf-footer" style="border-top-color:${borderCol};">
    <p>${text}</p>
    ${ref ? `<p class="page-num">${ref}</p>` : ''}
  </footer>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT RENDERERS
// ═══════════════════════════════════════════════════════════════════════════════

function renderCorporate(opts: DocumentRenderOptions): string {
  const col  = primary(opts.branding);
  const font = fontStack(opts.branding);
  const bh   = brandingHeader(opts);
  const meta = metaLines(opts, col, 'font-size:8pt;color:#374151;margin:0 0 2px 0;font-family:Arial,sans-serif;');
  const hasHeader = bh || meta;
  return `<article class="pdf-page" style="font-family:${font}">
  ${hasHeader ? `<header class="pdf-header" style="border-bottom-color:${col}">
    ${bh}
    ${meta ? `<div class="pdf-meta">${meta}</div>` : ''}
  </header>` : ''}
  <section class="pdf-title" style="background:${col}"><h2>${opts.title}</h2></section>
  ${opts.body}
  ${signaturesHtml(opts.signatories ?? [], col)}
  ${disclaimerHtml(opts.flags)}
  ${footerHtml(opts, col)}
</article>`;
}

function renderBusiness(opts: DocumentRenderOptions): string {
  const col  = primary(opts.branding);
  const acc  = accent(opts.branding);
  const font = fontStack(opts.branding);
  const bh   = brandingHeader(opts);
  const meta = metaLines(opts, col, 'font-size:8pt;color:#374151;margin:0 0 2px 0;font-family:Arial,sans-serif;');
  const hasHeader = bh || meta;
  return `<article class="pdf-page" style="font-family:${font}">
  ${hasHeader ? `<header style="display:grid;grid-template-columns:1fr auto;align-items:flex-start;gap:16px;padding-bottom:12px;border-bottom:2px solid ${col};margin-bottom:20px;">
    <div style="display:flex;align-items:center;gap:14px;">${bh}</div>
    ${meta ? `<div style="text-align:right;font-family:Arial,sans-serif;">${meta}</div>` : ''}
  </header>` : ''}
  <div style="background:#f8f9fb;border-left:4px solid ${acc};padding:10px 16px;margin-bottom:20px;border-radius:0 4px 4px 0;">
    <h2 style="font-size:13pt;font-weight:700;color:${col};margin:0;font-family:Arial,sans-serif;">${opts.title}</h2>
  </div>
  ${opts.body}
  ${signaturesHtml(opts.signatories ?? [], col)}
  ${disclaimerHtml(opts.flags)}
  ${footerHtml(opts, col)}
</article>`;
}

function renderExecutive(opts: DocumentRenderOptions): string {
  const col  = primary(opts.branding);
  const font = fontStack(opts.branding);
  const orgName = opts.branding?.orgName?.trim() ?? '';
  const tagline = opts.branding?.tagline?.trim() ?? '';
  const f = opts.flags ?? {};
  const hasHeader = orgName || (f.showDate && opts.date) || (f.showRef && opts.docRef);
  return `<article class="pdf-page" style="font-family:${font}">
  ${hasHeader ? `<header style="background:#1a1a2e;color:white;padding:18px 20px;margin:-20mm -18mm 24px -18mm;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:16px;">
    ${orgName ? `<div style="width:48px;height:48px;background:${col};border-radius:4px;display:flex;align-items:center;justify-content:center;color:white;font-size:20px;font-weight:900;font-family:Arial,sans-serif;flex-shrink:0;">${orgName.charAt(0).toUpperCase()}</div>` : '<div></div>'}
    <div>
      ${orgName ? `<p style="font-size:13pt;font-weight:700;margin:0;font-family:Arial,sans-serif;letter-spacing:0.5px;">${orgName}</p>` : ''}
      ${tagline ? `<p style="font-size:8pt;color:rgba(255,255,255,0.6);margin:2px 0 0 0;font-family:Arial,sans-serif;">${tagline}</p>` : ''}
    </div>
    <div style="text-align:right;font-family:Arial,sans-serif;">
      ${f.showDate    && opts.date    ? `<p style="font-size:8pt;color:rgba(255,255,255,0.7);margin:0 0 2px 0;">${opts.date}</p>` : ''}
      ${f.showRef     && opts.docRef  ? `<p style="font-size:8pt;color:rgba(255,255,255,0.7);margin:0;">${opts.docRef}</p>` : ''}
    </div>
  </header>` : ''}
  <div style="border-bottom:3px solid #c9a84c;padding-bottom:12px;margin-bottom:20px;">
    <h2 style="font-size:15pt;font-weight:700;color:#1a1a2e;margin:0 0 4px 0;font-family:Arial,sans-serif;letter-spacing:0.3px;">${opts.title}</h2>
    ${(f.showVersion && opts.version) || (f.showStatus && opts.status) ? `<p style="font-size:8.5pt;color:#6b7280;margin:0;font-family:Arial,sans-serif;">${f.showVersion && opts.version ? `Version ${opts.version}` : ''}${f.showVersion && opts.version && f.showStatus && opts.status ? ' &bull; ' : ''}${f.showStatus && opts.status ? `<span class="pdf-status-badge ${(opts.status ?? '').toLowerCase()}">${opts.status}</span>` : ''}</p>` : ''}
  </div>
  ${opts.body}
  ${signaturesHtml(opts.signatories ?? [], '#c9a84c')}
  ${disclaimerHtml(opts.flags)}
  ${footerHtml(opts, '#c9a84c')}
</article>`;
}

function renderFormal(opts: DocumentRenderOptions): string {
  const col  = primary(opts.branding);
  const font = fontStack(opts.branding);
  const orgName = opts.branding?.orgName?.trim() ?? '';
  const tagline = opts.branding?.tagline?.trim() ?? '';
  const metaSpans = metaLinesPlain(opts, 'font-size:8pt;color:#374151;font-family:Arial,sans-serif;');
  const hasHeader = orgName || metaSpans;
  return `<article class="pdf-page" style="font-family:${font}">
  ${hasHeader ? `<header style="text-align:center;padding-bottom:16px;border-bottom:2px solid #1a1a1a;margin-bottom:20px;">
    ${orgName ? `<p style="font-size:13pt;font-weight:700;color:${col};margin:0 0 4px 0;font-family:Arial,sans-serif;">${orgName}</p>` : ''}
    ${tagline ? `<p style="font-size:9pt;color:#6b7280;margin:0 0 8px 0;font-family:Arial,sans-serif;">${tagline}</p>` : ''}
    ${metaSpans ? `<div style="font-size:8pt;color:#374151;font-family:Arial,sans-serif;display:flex;justify-content:center;gap:20px;flex-wrap:wrap;">${metaSpans}</div>` : ''}
  </header>` : ''}
  <div style="text-align:center;margin-bottom:24px;">
    <h2 style="font-size:14pt;font-weight:700;color:#1a1a1a;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:1px;">${opts.title}</h2>
    <div style="width:60px;height:3px;background:${col};margin:0 auto;"></div>
  </div>
  ${opts.body}
  ${signaturesHtml(opts.signatories ?? [], col)}
  ${disclaimerHtml(opts.flags)}
  ${footerHtml(opts)}
</article>`;
}

function renderModern(opts: DocumentRenderOptions): string {
  const col  = primary(opts.branding);
  const font = "'Arial', Helvetica, sans-serif";
  const bh   = brandingHeader(opts);
  const f    = opts.flags ?? {};
  const rightMeta = [
    f.showDate    && opts.date    ? `<p style="margin:0 0 2px 0;">${opts.date}</p>` : '',
    f.showRef     && opts.docRef  ? `<p style="margin:0 0 2px 0;">${opts.docRef}</p>` : '',
    f.showStatus  && opts.status  ? `<span class="pdf-status-badge ${(opts.status ?? '').toLowerCase()}">${opts.status}</span>` : '',
  ].filter(Boolean).join('');
  const hasHeader = bh || rightMeta;
  return `<article class="pdf-page" style="font-family:${font}">
  ${hasHeader ? `<header style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:14px;border-bottom:3px solid ${col};margin-bottom:20px;">
    <div style="display:flex;align-items:center;gap:12px;">${bh}</div>
    ${rightMeta ? `<div style="text-align:right;font-size:8pt;color:#6b7280;">${rightMeta}</div>` : ''}
  </header>` : ''}
  <h2 style="font-size:16pt;font-weight:800;color:${col};margin:0 0 20px 0;letter-spacing:-0.3px;">${opts.title}</h2>
  ${opts.body}
  ${signaturesHtml(opts.signatories ?? [], col)}
  ${disclaimerHtml(opts.flags)}
  ${footerHtml(opts, col)}
</article>`;
}

function renderMinimal(opts: DocumentRenderOptions): string {
  const font    = "'Arial', Helvetica, sans-serif";
  const orgName = opts.branding?.orgName?.trim() ?? '';
  const tagline = opts.branding?.tagline?.trim() ?? '';
  const f       = opts.flags ?? {};
  const rightMeta = [
    f.showDate && opts.date   ? `<p style="margin:0 0 2px 0;">${opts.date}</p>` : '',
    f.showRef  && opts.docRef ? `<p style="margin:0;">${opts.docRef}</p>` : '',
  ].filter(Boolean).join('');
  const hasHeader = orgName || rightMeta;
  return `<article class="pdf-page" style="font-family:${font}">
  ${hasHeader ? `<header style="padding-bottom:12px;border-bottom:1px solid #e5e7eb;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end;">
    <div>
      ${orgName ? `<p style="font-size:11pt;font-weight:600;color:#111827;margin:0;">${orgName}</p>` : ''}
      ${tagline ? `<p style="font-size:8pt;color:#9ca3af;margin:2px 0 0 0;">${tagline}</p>` : ''}
    </div>
    ${rightMeta ? `<div style="text-align:right;font-size:8pt;color:#9ca3af;">${rightMeta}</div>` : ''}
  </header>` : ''}
  <h2 style="font-size:14pt;font-weight:700;color:#111827;margin:0 0 20px 0;">${opts.title}</h2>
  ${opts.body}
  ${signaturesHtml(opts.signatories ?? [], '#374151')}
  ${disclaimerHtml(opts.flags)}
  ${footerHtml(opts, '#e5e7eb')}
</article>`;
}

function renderReport(opts: DocumentRenderOptions): string {
  const col     = primary(opts.branding);
  const font    = "'Arial', Helvetica, sans-serif";
  const orgName = opts.branding?.orgName?.trim() ?? '';
  const tagline = opts.branding?.tagline?.trim() ?? '';
  const f       = opts.flags ?? {};
  const hasHeader = orgName || (f.showDate && opts.date) || (f.showRef && opts.docRef);
  return `<article class="pdf-page" style="font-family:${font}">
  ${hasHeader ? `<header style="background:${col};color:white;padding:16px 20px;margin:-20mm -18mm 0 -18mm;display:flex;align-items:center;justify-content:space-between;gap:16px;">
    <div>
      ${orgName ? `<p style="font-size:12pt;font-weight:700;margin:0;">${orgName}</p>` : ''}
      ${tagline ? `<p style="font-size:8pt;color:rgba(255,255,255,0.7);margin:2px 0 0 0;">${tagline}</p>` : ''}
    </div>
    <div style="text-align:right;font-size:8pt;color:rgba(255,255,255,0.8);">
      ${f.showDate && opts.date   ? `<p style="margin:0 0 2px 0;">${opts.date}</p>` : ''}
      ${f.showRef  && opts.docRef ? `<p style="margin:0;">${opts.docRef}</p>` : ''}
    </div>
  </header>` : ''}
  <div style="background:#f0f4fa;padding:14px 20px;margin:0 -18mm 20px -18mm;border-bottom:2px solid #dde1e8;">
    <h2 style="font-size:13pt;font-weight:700;color:#1a1a1a;margin:0 0 4px 0;">${opts.title}</h2>
    ${(f.showVersion && opts.version) || (f.showStatus && opts.status) ? `<p style="font-size:8pt;color:#6b7280;margin:0;">${f.showVersion && opts.version ? `Version ${opts.version}` : ''}${f.showVersion && opts.version && f.showStatus && opts.status ? ' &bull; ' : ''}${f.showStatus && opts.status ? `<span class="pdf-status-badge ${(opts.status ?? '').toLowerCase()}">${opts.status}</span>` : ''}</p>` : ''}
  </div>
  ${opts.body}
  ${signaturesHtml(opts.signatories ?? [], col)}
  ${disclaimerHtml(opts.flags)}
  ${footerHtml(opts, col)}
</article>`;
}

function renderContract(opts: DocumentRenderOptions): string {
  const col     = primary(opts.branding);
  const font    = fontStack(opts.branding);
  const orgName = opts.branding?.orgName?.trim() ?? '';
  const f       = opts.flags ?? {};
  const metaItems = [
    f.showDate    && opts.date    ? `Date: ${opts.date}` : '',
    f.showRef     && opts.docRef  ? `Ref: ${opts.docRef}` : '',
    f.showVersion && opts.version ? `Version: ${opts.version}` : '',
  ].filter(Boolean);
  const hasHeader = orgName || metaItems.length > 0;
  return `<article class="pdf-page" style="font-family:${font}">
  ${hasHeader ? `<header style="text-align:center;padding-bottom:14px;border-bottom:3px double #1a1a1a;margin-bottom:20px;">
    ${orgName ? `<p style="font-size:12pt;font-weight:700;color:${col};margin:0 0 4px 0;font-family:Arial,sans-serif;">${orgName}</p>` : ''}
    <h2 style="font-size:14pt;font-weight:700;color:#1a1a1a;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.8px;">${opts.title}</h2>
    ${metaItems.length ? `<div style="font-size:8pt;color:#374151;font-family:Arial,sans-serif;display:flex;justify-content:center;gap:16px;flex-wrap:wrap;">${metaItems.map(i => `<span>${i}</span>`).join('')}</div>` : ''}
  </header>` : `<h2 style="font-size:14pt;font-weight:700;color:#1a1a1a;margin:0 0 20px 0;text-transform:uppercase;letter-spacing:0.8px;text-align:center;">${opts.title}</h2>`}
  ${opts.body}
  ${signaturesHtml(opts.signatories ?? [], col)}
  ${disclaimerHtml(opts.flags)}
  ${footerHtml(opts)}
</article>`;
}

function renderPolicy(opts: DocumentRenderOptions): string {
  const col     = primary(opts.branding);
  const font    = "'Arial', Helvetica, sans-serif";
  const orgName = opts.branding?.orgName?.trim() ?? '';
  const f       = opts.flags ?? {};
  const metaBox = [
    f.showRef     && opts.docRef  ? `<p style="margin:0 0 2px 0;"><strong style="color:${col}">Policy Ref:</strong> ${opts.docRef}</p>` : '',
    f.showDate    && opts.date    ? `<p style="margin:0 0 2px 0;"><strong style="color:${col}">Issue Date:</strong> ${opts.date}</p>` : '',
    f.showVersion && opts.version ? `<p style="margin:0 0 2px 0;"><strong style="color:${col}">Version:</strong> ${opts.version}</p>` : '',
    f.showStatus  && opts.status  ? `<p style="margin:0;"><span class="pdf-status-badge ${(opts.status ?? '').toLowerCase()}">${opts.status}</span></p>` : '',
  ].filter(Boolean).join('');
  const hasHeader = orgName || metaBox;
  return `<article class="pdf-page" style="font-family:${font}">
  ${hasHeader ? `<header style="display:grid;grid-template-columns:1fr auto;gap:16px;padding-bottom:12px;border-bottom:3px solid ${col};margin-bottom:20px;">
    <div>
      ${orgName ? `<p style="font-size:12pt;font-weight:700;color:${col};margin:0 0 2px 0;">${orgName}</p>` : ''}
      <h2 style="font-size:13pt;font-weight:700;color:#1a1a1a;margin:0;">${opts.title}</h2>
    </div>
    ${metaBox ? `<div style="background:#f0f4fa;border:1px solid #dde1e8;border-radius:4px;padding:8px 12px;font-size:8pt;color:#374151;text-align:right;min-width:140px;">${metaBox}</div>` : ''}
  </header>` : `<h2 style="font-size:13pt;font-weight:700;color:#1a1a1a;margin:0 0 20px 0;border-bottom:3px solid ${col};padding-bottom:10px;">${opts.title}</h2>`}
  ${opts.body}
  ${signaturesHtml(opts.signatories ?? [], col)}
  ${disclaimerHtml(opts.flags)}
  ${footerHtml(opts, col)}
</article>`;
}

function renderBoard(opts: DocumentRenderOptions): string {
  const col     = primary(opts.branding);
  const font    = "'Arial', Helvetica, sans-serif";
  const orgName = opts.branding?.orgName?.trim() ?? '';
  const f       = opts.flags ?? {};
  const hasHeader = orgName || (f.showDate && opts.date) || (f.showRef && opts.docRef);
  return `<article class="pdf-page" style="font-family:${font}">
  ${hasHeader ? `<header style="background:#1a1a2e;color:white;padding:14px 20px;margin:-20mm -18mm 20px -18mm;display:flex;align-items:center;justify-content:space-between;gap:16px;">
    <div>
      ${orgName ? `<p style="font-size:11pt;font-weight:700;margin:0;">${orgName}</p>` : ''}
    </div>
    <div style="text-align:right;font-size:8pt;color:rgba(255,255,255,0.7);">
      ${f.showDate && opts.date   ? `<p style="margin:0 0 2px 0;">${opts.date}</p>` : ''}
      ${f.showRef  && opts.docRef ? `<p style="margin:0;">${opts.docRef}</p>` : ''}
    </div>
  </header>` : ''}
  <div style="border-left:5px solid ${col};padding:8px 14px;margin-bottom:20px;background:#f8f9fb;">
    <h2 style="font-size:13pt;font-weight:700;color:#1a1a1a;margin:0 0 4px 0;">${opts.title}</h2>
    ${(f.showVersion && opts.version) || (f.showStatus && opts.status) ? `<p style="font-size:8pt;color:#6b7280;margin:0;">${f.showVersion && opts.version ? `Version ${opts.version}` : ''}${f.showVersion && opts.version && f.showStatus && opts.status ? ' &bull; ' : ''}${f.showStatus && opts.status ? `<span class="pdf-status-badge ${(opts.status ?? '').toLowerCase()}">${opts.status}</span>` : ''}</p>` : ''}
  </div>
  ${opts.body}
  ${signaturesHtml(opts.signatories ?? [], col)}
  ${disclaimerHtml(opts.flags)}
  ${footerHtml(opts, col)}
</article>`;
}

function renderCharity(opts: DocumentRenderOptions): string {
  const col     = opts.branding?.primaryColour ?? '#059669';
  const font    = "'Arial', Helvetica, sans-serif";
  const orgName = opts.branding?.orgName?.trim() ?? '';
  const tagline = opts.branding?.tagline?.trim() ?? '';
  const f       = opts.flags ?? {};
  const rightMeta = [
    f.showDate && opts.date   ? `<p style="margin:0 0 2px 0;">${opts.date}</p>` : '',
    f.showRef  && opts.docRef ? `<p style="margin:0;">${opts.docRef}</p>` : '',
  ].filter(Boolean).join('');
  const hasHeader = orgName || rightMeta;
  return `<article class="pdf-page" style="font-family:${font}">
  ${hasHeader ? `<header style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:12px;border-bottom:3px solid ${col};margin-bottom:20px;">
    <div style="display:flex;align-items:center;gap:12px;">
      ${orgName ? `<div style="width:48px;height:48px;background:${col};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:20px;font-weight:900;flex-shrink:0;">${orgName.charAt(0).toUpperCase()}</div>` : ''}
      <div>
        ${orgName ? `<p style="font-size:12pt;font-weight:700;color:${col};margin:0;">${orgName}</p>` : ''}
        ${tagline ? `<p style="font-size:8pt;color:#6b7280;margin:2px 0 0 0;">${tagline}</p>` : ''}
      </div>
    </div>
    ${rightMeta ? `<div style="text-align:right;font-size:8pt;color:#6b7280;">${rightMeta}</div>` : ''}
  </header>` : ''}
  <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
    <h2 style="font-size:13pt;font-weight:700;color:${col};margin:0;">${opts.title}</h2>
  </div>
  ${opts.body}
  ${signaturesHtml(opts.signatories ?? [], col)}
  ${disclaimerHtml(opts.flags)}
  ${footerHtml(opts, col)}
</article>`;
}

function renderEducation(opts: DocumentRenderOptions): string {
  const col     = opts.branding?.primaryColour ?? '#ea580c';
  const font    = "'Arial', Helvetica, sans-serif";
  const orgName = opts.branding?.orgName?.trim() ?? '';
  const tagline = opts.branding?.tagline?.trim() ?? '';
  const f       = opts.flags ?? {};
  const hasHeader = orgName || (f.showDate && opts.date) || (f.showRef && opts.docRef);
  return `<article class="pdf-page" style="font-family:${font}">
  ${hasHeader ? `<header style="background:${col};color:white;padding:14px 20px;margin:-20mm -18mm 20px -18mm;display:flex;align-items:center;justify-content:space-between;gap:16px;">
    <div>
      ${orgName ? `<p style="font-size:12pt;font-weight:700;margin:0;">${orgName}</p>` : ''}
      ${tagline ? `<p style="font-size:8pt;color:rgba(255,255,255,0.8);margin:2px 0 0 0;">${tagline}</p>` : ''}
    </div>
    <div style="text-align:right;font-size:8pt;color:rgba(255,255,255,0.8);">
      ${f.showDate && opts.date   ? `<p style="margin:0 0 2px 0;">${opts.date}</p>` : ''}
      ${f.showRef  && opts.docRef ? `<p style="margin:0;">${opts.docRef}</p>` : ''}
    </div>
  </header>` : ''}
  <h2 style="font-size:14pt;font-weight:700;color:${col};margin:0 0 4px 0;">${opts.title}</h2>
  <div style="width:40px;height:3px;background:${col};margin-bottom:20px;border-radius:2px;"></div>
  ${opts.body}
  ${signaturesHtml(opts.signatories ?? [], col)}
  ${disclaimerHtml(opts.flags)}
  ${footerHtml(opts, col)}
</article>`;
}

function renderCertificate(opts: DocumentRenderOptions): string {
  const col     = opts.branding?.primaryColour ?? '#b45309';
  const font    = fontStack(opts.branding);
  const orgName = opts.branding?.orgName?.trim() ?? '';
  const f       = opts.flags ?? {};
  const subLine = [
    f.showDate && opts.date   ? opts.date   : '',
    f.showRef  && opts.docRef ? opts.docRef : '',
  ].filter(Boolean).join(' &bull; ');
  return `<article class="pdf-page" style="font-family:${font};border:8px double ${col};padding:24mm 22mm;">
  <div style="text-align:center;margin-bottom:24px;">
    ${orgName ? `<p style="font-size:11pt;font-weight:700;color:${col};margin:0 0 4px 0;font-family:Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;">${orgName}</p>` : ''}
    <div style="width:80px;height:2px;background:${col};margin:8px auto;"></div>
    <h2 style="font-size:20pt;font-weight:700;color:#1a1a1a;margin:12px 0;letter-spacing:0.5px;">${opts.title}</h2>
    <div style="width:80px;height:2px;background:${col};margin:8px auto 16px;"></div>
    ${subLine ? `<p style="font-size:8.5pt;color:#6b7280;margin:0;font-family:Arial,sans-serif;">${subLine}</p>` : ''}
  </div>
  ${opts.body}
  ${signaturesHtml(opts.signatories ?? [], col)}
  ${disclaimerHtml(opts.flags)}
  ${footerHtml(opts, col)}
</article>`;
}

function renderLetter(opts: DocumentRenderOptions): string {
  const col     = primary(opts.branding);
  const font    = fontStack(opts.branding);
  const orgName = opts.branding?.orgName?.trim() ?? '';
  const tagline = opts.branding?.tagline?.trim() ?? '';
  const logoUrl = opts.branding?.logoUrl?.trim() ?? '';
  const showLogo    = opts.branding?.showLogo !== false;
  const showOrgName = opts.branding?.showOrgName !== false;
  const footerText  = opts.branding?.footerText?.trim() ?? '';
  const f = opts.flags ?? {};

  // ── Letterhead header ──────────────────────────────────────────────────────
  const hasLetterhead = (showLogo && logoUrl) || (showOrgName && orgName);

  const logoHtml = showLogo && logoUrl
    ? `<img src="${logoUrl}" alt="${orgName || 'Logo'}" style="height:56px;width:auto;max-width:180px;object-fit:contain;display:block;" />`
    : (showOrgName && orgName)
      ? `<div style="width:52px;height:52px;background:${col};border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-size:20px;font-weight:900;font-family:Arial,sans-serif;flex-shrink:0;">${orgName.charAt(0).toUpperCase()}</div>`
      : '';

  const orgHtml = showOrgName && orgName
    ? `<div style="display:flex;flex-direction:column;justify-content:center;">
        <p style="font-size:15pt;font-weight:800;color:${col};margin:0 0 2px 0;font-family:Arial,Helvetica,sans-serif;letter-spacing:0.2px;line-height:1.1;">${orgName}</p>
        ${tagline ? `<p style="font-size:8.5pt;color:#6b7280;margin:0;font-family:Arial,sans-serif;">${tagline}</p>` : ''}
      </div>`
    : '';

  const refDateHtml = [
    f.showDate && opts.date   ? `<p style="margin:0 0 2px 0;font-size:8.5pt;color:#374151;font-family:Arial,sans-serif;"><strong style="color:${col};">Date:</strong> ${opts.date}</p>` : '',
    f.showRef  && opts.docRef ? `<p style="margin:0;font-size:8pt;color:#9ca3af;font-family:Arial,sans-serif;">Ref: ${opts.docRef}</p>` : '',
  ].filter(Boolean).join('');

  const letterheadHtml = hasLetterhead ? `
  <!-- Letterhead -->
  <header style="display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;margin-bottom:0;border-bottom:3px solid ${col};">
    <div style="display:flex;align-items:center;gap:14px;">
      ${logoHtml}
      ${orgHtml}
    </div>
    ${refDateHtml ? `<div style="text-align:right;">${refDateHtml}</div>` : ''}
  </header>
  <!-- Thin accent line under letterhead -->
  <div style="height:1px;background:${col}20;margin-bottom:28px;"></div>
  ` : '';

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerContent = footerText || orgName;
  const footerHtml = footerContent ? `
  <footer style="margin-top:36px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
    <p style="font-size:7.5pt;color:#9ca3af;margin:0;font-family:Arial,sans-serif;">${footerText || orgName}</p>
    ${f.showRef && opts.docRef ? `<p style="font-size:7.5pt;color:#9ca3af;margin:0;font-family:Arial,sans-serif;">${opts.docRef}</p>` : ''}
  </footer>` : '';

  return `<article class="pdf-page" style="font-family:${font}">
  ${letterheadHtml}
  ${opts.body}
  ${signaturesHtml(opts.signatories ?? [], col)}
  ${disclaimerHtml(opts.flags)}
  ${footerHtml}
</article>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN RENDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

const RENDERERS: Record<LayoutId, (opts: DocumentRenderOptions) => string> = {
  corporate:   renderCorporate,
  business:    renderBusiness,
  executive:   renderExecutive,
  formal:      renderFormal,
  modern:      renderModern,
  minimal:     renderMinimal,
  report:      renderReport,
  contract:    renderContract,
  policy:      renderPolicy,
  board:       renderBoard,
  charity:     renderCharity,
  education:   renderEducation,
  certificate: renderCertificate,
  letter:      renderLetter,
};

export function renderDocument(opts: DocumentRenderOptions): string {
  const renderer = RENDERERS[opts.layout] ?? renderCorporate;
  return renderer(opts);
}

export function getLayout(id: LayoutId): LayoutDefinition | undefined {
  return LAYOUTS.find(l => l.id === id);
}

export const DEFAULT_LAYOUT: LayoutId = 'corporate';
