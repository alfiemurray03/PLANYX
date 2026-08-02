// @refresh reset
// v11 — concise public navigation for Planyx
import { Link } from 'react-router-dom';
import { Menu, X, LayoutDashboard, LogOut, User, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useBranding } from '@/lib/branding';
import { Button } from '@/components/ui/button';
import CustomerWebsitesMenu, { MobileCustomerWebsitesMenu } from '@/components/CustomerWebsitesMenu';
import ThemeToggle from '@/components/ThemeToggle';
import { useAuth } from '@/lib/auth-context';
import { useSiteSettings } from '@/lib/site-settings-context';

export default function SiteNavHeader() {
  const branding = useBranding();
  const { navLinks } = useSiteSettings();
  const { user, isLoading: loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const navGroups = [
    { label: 'Book', links: [
      { href: '/getyourguide', label: 'Get Your Guide' },
      { href: '/headout', label: 'Headout' },
    ]},
    { label: 'Plan', links: [
      { href: '/builders', label: 'Experience Builders' }, { href: '/#features', label: 'How it works' }, { href: '/pricing', label: 'Pricing' },
    ]},
    { label: 'Help', links: [
      { href: '/#faq', label: 'FAQs' }, { href: '/support', label: 'Support' }, { href: '/status', label: 'Service status' },
    ]},
  ];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const firstName = user?.firstName ?? 'Account';

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 md:h-[72px] items-center justify-between gap-4">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 flex-shrink-0 group" aria-label="Planyx — home">
            {branding.platform_logo_url ? (
              <img
                src={branding.platform_logo_url}
                alt={branding.platform_name || 'Planyx'}
                className="h-9 w-auto object-contain shrink-0 md:h-11"
              />
            ) : (
              <span className="font-extrabold text-lg tracking-tight text-foreground">
                Planyx
              </span>
            )}
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            {navGroups.map(group => <div key={group.label} className="relative group/nav">
              <button className="px-3.5 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all inline-flex items-center gap-1">{group.label}<ChevronDown className="w-3.5 h-3.5" /></button>
              <div className="absolute left-0 top-full pt-2 w-56 hidden group-hover/nav:block group-focus-within/nav:block">
                <div className="rounded-2xl border border-border bg-card shadow-xl p-2">
                  {group.links.map(link => <Link key={link.href} to={link.href} className="block px-3 py-2.5 rounded-xl text-sm text-foreground hover:bg-muted transition-colors">{link.label}</Link>)}
                </div>
              </div>
            </div>)}
            {navLinks
              .filter(link => link.label && link.href && !['/contact', '/pricing'].includes(link.href))
              .slice(0, 3)
              .map(link => link.openNewTab ? (
                <a key={link.id} href={link.href} target="_blank" rel="noopener noreferrer" className="px-3.5 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all">{link.label}</a>
              ) : (
                <Link key={link.id} to={link.href} className="px-3.5 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all">{link.label}</Link>
              ))}
            <Link to="/contact" className="px-3.5 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
              Contact
            </Link>
          </nav>

          {/* Desktop right */}
          <div className="hidden md:flex items-center gap-2.5">
            <ThemeToggle />

            {loading ? (
              <div className="h-8 w-24 rounded-xl bg-muted animate-pulse" />
            ) : user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(v => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted transition-colors text-sm font-medium text-foreground"
                  aria-expanded={dropdownOpen}
                  aria-haspopup="true"
                >
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {firstName.charAt(0).toUpperCase()}
                  </div>
                  <span className="max-w-[100px] truncate">{firstName}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-border bg-card shadow-xl py-1.5 z-50">
                    <div className="px-3 py-2 border-b border-border mb-1">
                      <p className="text-xs font-semibold text-foreground truncate">{`${user.firstName} ${user.lastName}`.trim()}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <Link to="/dashboard" onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                      <LayoutDashboard className="w-4 h-4 text-primary" /> Dashboard
                    </Link>
                    <Link to="/builders" onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                      <User className="w-4 h-4 text-primary" /> Experience Builders
                    </Link>
                    <div className="border-t border-border mt-1 pt-1">
                      <button
                        onClick={() => { setDropdownOpen(false); logout(); }}
                        className="flex items-start gap-2.5 w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        <LogOut className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>
                          <span className="block font-medium">Sign out</span>
                          <span className="block text-[10px] text-red-500/70 dark:text-red-400/70 font-normal leading-tight mt-0.5">
                            Signs you out of JA Group Services ID
                          </span>
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to="/sign-in">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground font-medium">
                    Log In
                  </Button>
                </Link>
                <Link to="/sign-in">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25 font-semibold rounded-xl px-5 transition-all duration-200 hover:shadow-blue-600/40 hover:-translate-y-px">
                    Explore Builders
                  </Button>
                </Link>
              </>
            )}

            <CustomerWebsitesMenu />
          </div>

          {/* Mobile: theme toggle + hamburger */}
          <div className="md:hidden flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setOpen(!open)}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="mobile-menu"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div id="mobile-menu" className="md:hidden border-t border-border bg-card px-4 py-4 space-y-1"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {navGroups.map(group => <div key={group.label} className="py-1"><p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>{group.links.map(link => <Link key={link.href} to={link.href} className="flex items-center px-4 py-2.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted" onClick={() => setOpen(false)}>{link.label}</Link>)}</div>)}
          {navLinks.filter(link => link.label && link.href && !['/contact', '/pricing'].includes(link.href)).map(link => (
            <Link key={link.id} to={link.href} className="flex items-center px-4 py-2.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted" onClick={() => setOpen(false)}>{link.label}</Link>
          ))}
          <Link to="/contact" className="flex items-center px-4 py-3 rounded-xl text-sm font-semibold text-foreground hover:bg-muted" onClick={() => setOpen(false)}>
            Contact
          </Link>

          <MobileCustomerWebsitesMenu onNavigate={() => setOpen(false)} />

          {!loading && (
            <div className="pt-3 border-t border-border space-y-2">
              {user ? (
                <>
                  <div className="px-4 py-2 rounded-xl bg-muted/40">
                    <p className="text-xs font-semibold text-foreground">{`${user.firstName} ${user.lastName}`.trim()}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <Link to="/dashboard" onClick={() => setOpen(false)}>
                    <Button variant="outline" className="w-full justify-start gap-2 min-h-[48px] text-sm font-medium">
                      <LayoutDashboard className="w-4 h-4" /> Dashboard
                    </Button>
                  </Link>
                  <Link to="/builders" onClick={() => setOpen(false)}>
                    <Button variant="outline" className="w-full justify-start gap-2 min-h-[48px] text-sm font-medium">
                      <User className="w-4 h-4" /> Experience Builders
                    </Button>
                  </Link>
                  <Button variant="ghost"
                    className="w-full justify-start gap-2 min-h-[52px] text-sm font-medium text-destructive hover:bg-destructive/10"
                    onClick={() => { setOpen(false); logout(); }}>
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                    <span className="text-left">
                      <span className="block">Sign out</span>
                      <span className="block text-[10px] font-normal opacity-70 leading-tight">Signs you out of JA Group Services ID</span>
                    </span>
                  </Button>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link to="/sign-in" className="w-full" onClick={() => setOpen(false)}>
                    <Button variant="outline" className="w-full min-h-[52px] text-sm font-semibold">Log In</Button>
                  </Link>
                  <Link to="/sign-in" className="w-full" onClick={() => setOpen(false)}>
                    <Button className="w-full min-h-[52px] text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25">
                      Explore Builders
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
