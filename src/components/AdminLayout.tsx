import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAdmin } from '@/lib/admin-context';
import { hasPermission } from '@/lib/admin-types';
import AdminLayoutStable from './AdminLayoutStable';

type AdminLayoutProps = ComponentProps<typeof AdminLayoutStable>;

type AdminFooterLink = {
  label: string;
  href: string;
  section?: string;
};

const ADMIN_FOOTER_LINKS: AdminFooterLink[] = [
  { label: 'Dashboard', href: '/admin/dashboard', section: 'dashboard' },
  { label: 'Customer CRM', href: '/admin/users', section: 'customers' },
  { label: 'Gate Control Centre', href: '/admin/status', section: 'status' },
  { label: 'Partner Galleries', href: '/admin/affiliate-content', section: 'affiliate' },
  { label: 'Audit Log', href: '/admin/audit', section: 'audit' },
  { label: 'Site Settings', href: '/admin/site-settings', section: 'systemsettings' },
];

const POLICY_LINKS: AdminFooterLink[] = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Cookie Policy', href: '/cookies' },
  { label: 'Accessibility', href: '/accessibility-support' },
];

function AdminFooterLinks() {
  const { admin } = useAdmin();
  const [footer, setFooter] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setFooter(document.querySelector<HTMLElement>('.admin-portal footer'));
  }, []);

  const permittedAdminLinks = useMemo(() => ADMIN_FOOTER_LINKS.filter(link => (
    !link.section || Boolean(admin && hasPermission(admin, link.section))
  )), [admin]);

  if (!footer) return null;

  return createPortal(
    <div className="border-t border-slate-200 dark:border-slate-800">
      <div className="mx-auto grid w-full max-w-[1600px] gap-6 px-4 py-6 text-xs sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:px-8">
        <nav aria-label="Admin footer navigation">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Admin tools</p>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {permittedAdminLinks.map(link => (
              <Link
                key={link.href}
                to={link.href}
                className="font-semibold text-slate-600 transition hover:text-blue-700 hover:underline dark:text-slate-300 dark:hover:text-blue-300"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>

        <nav aria-label="Admin footer policy links" className="md:text-right">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Policies and support</p>
          <div className="flex flex-wrap gap-x-5 gap-y-3 md:justify-end">
            {POLICY_LINKS.map(link => (
              <Link
                key={link.href}
                to={link.href}
                className="font-medium text-slate-500 transition hover:text-blue-700 hover:underline dark:text-slate-400 dark:hover:text-blue-300"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </div>,
    footer,
  );
}

export default function AdminLayout(props: AdminLayoutProps) {
  return (
    <AdminLayoutStable {...props}>
      {props.children}
      <AdminFooterLinks />
    </AdminLayoutStable>
  );
}
