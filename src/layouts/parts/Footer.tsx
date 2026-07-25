import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useBranding } from '@/lib/branding';
import { openInstallModal } from '@/components/InstallAppModal';
import { GROUP_CONTACT_EMAIL, GROUP_PHONE_DISPLAY, GROUP_PHONE_HREF, PLANYX_EMAIL } from '@/lib/contact-details';
import { useSiteSettings } from '@/lib/site-settings-context';

export interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

export const DEFAULT_FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: 'Discover',
    links: [
      { label: 'Activities', href: '/activities' },
      { label: 'Experiences', href: '/experiences' },
      { label: 'Headout', href: '/headout' },
      { label: 'GetYourGuide', href: '/getyourguide' },
    ],
  },
  {
    heading: 'Product',
    links: [
      { label: 'Experience Builders', href: '/builders' },
      { label: 'How It Works', href: '/#features' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Install App', href: '__install__' },
    ],
  },
  {
    heading: 'Support',
    links: [
      { label: '16+ Safety & Safeguarding', href: '/safety' },
      { label: 'Contact Us', href: '/contact' },
      { label: 'Contact Support', href: '/support' },
      { label: 'Service Status', href: '/status' },
      { label: 'Accessibility', href: '/accessibility-support' },
      { label: 'JA Group Services Ltd', href: 'https://jagroupservices.co.uk', external: true },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms of Service',    href: '/terms' },
      { label: 'Privacy Policy',      href: '/privacy' },
      { label: 'Cookie Policy',       href: '/cookies' },
      { label: 'Complaints Policy',   href: '/complaints' },
      { label: 'Acceptable Use',      href: '/acceptable-use' },
      { label: 'Refund Policy',       href: '/refund-policy' },
    ],
  },
];

function InstallAppLink({ label }: { label: string }) {
  return (
    <button
      onClick={openInstallModal}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
    >
      {label}
    </button>
  );
}

function FooterLinkItem({ link }: { link: FooterLink }) {
  if (link.href === '__install__') return <InstallAppLink label={link.label} />;
  if (link.external || link.href.startsWith('http')) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
      >
        {link.label} <ExternalLink className="w-3 h-3 shrink-0" />
      </a>
    );
  }
  return <Link to={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{link.label}</Link>;
}

export default function Footer() {
  const branding = useBranding();
  const { footerLinks } = useSiteSettings();
  const year = new Date().getFullYear();

  const managedColumns = footerLinks.reduce<FooterColumn[]>((columns, link) => {
    if (!link.label || !link.href) return columns;
    const heading = link.group || 'Links';
    const existing = columns.find(column => column.heading === heading);
    if (existing) existing.links.push({ label: link.label, href: link.href });
    else columns.push({ heading, links: [{ label: link.label, href: link.href }] });
    return columns;
  }, []);
  const columns: FooterColumn[] = managedColumns.length ? managedColumns : DEFAULT_FOOTER_COLUMNS;

  return (
    <footer className="border-t border-border bg-card" role="contentinfo">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 py-12 lg:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,2.1fr)] gap-12 lg:gap-16 xl:gap-20">
          <div className="max-w-sm">
            <Link to="/" className="inline-block mb-4">
              {branding.platform_logo_url ? (
                <img src={branding.platform_logo_url} alt={branding.platform_name || 'Planyx'} className="h-9 w-auto object-contain" />
              ) : (
                <span className="font-extrabold text-lg text-foreground">Planyx</span>
              )}
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              {branding.platform_description || 'Build destination, itinerary, experience, accessibility and practical travel plans with Planyx.'}
            </p>
            <Link to="/safety" className="mb-3 inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">Strictly 16+ · Young-person safeguards</Link>
            {branding.support_email && (
              <a href={`mailto:${PLANYX_EMAIL}`} className="text-sm text-primary hover:underline transition-colors font-medium leading-relaxed inline-block max-w-full break-words">{PLANYX_EMAIL}</a>
            )}
            <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <a href={`mailto:${GROUP_CONTACT_EMAIL}`} className="block hover:text-foreground transition-colors">{GROUP_CONTACT_EMAIL}</a>
              <a href={GROUP_PHONE_HREF} className="block hover:text-foreground transition-colors">{GROUP_PHONE_DISPLAY}</a>
            </div>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-10 xl:gap-x-10">
            {columns.map((col) => (
              <div key={col.heading} className="min-w-0">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">{col.heading}</h4>
                <ul className="space-y-3">
                  {col.links.map((link) => <li key={link.href + link.label}><FooterLinkItem link={link} /></li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border mt-10 pt-6 space-y-2">
          <p className="text-sm text-muted-foreground">© {year} {branding.platform_name || 'Planyx'}. All rights reserved.{branding.footer_tagline ? ` ${branding.footer_tagline}.` : ''}</p>
          <p className="text-xs font-semibold text-muted-foreground">Planyx customer accounts are available only to people aged 16 or over. Young people aged 16–17 receive enhanced privacy and safeguarding defaults.</p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">Planyx is a service brand operated by JA Group Services Ltd, a company registered in England and Wales. The service provides guided discovery, experience and practical planning tools and support.</p>
          <p className="text-xs text-muted-foreground">Third-party bookings, availability, prices, refunds and provider terms remain the responsibility of the relevant provider.</p>
        </div>
      </div>
    </footer>
  );
}
