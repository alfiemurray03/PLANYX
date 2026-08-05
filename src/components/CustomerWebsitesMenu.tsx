import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const customerWebsites = [
  { name: 'JA Group Services', href: 'https://jagroupservices.co.uk/' },
  { name: 'Sousa Murray Profiles', href: 'https://sousamurrayprofiles.jagroupservices.co.uk/' },
  { name: 'Sousa Murray Planeia', href: 'https://sousamurrayplaneia.jagroupservices.co.uk/' },
  { name: 'Sousa Murray Domains', href: 'https://sousamurraydomains.jagroupservices.co.uk/' },
  { name: 'Sousa Murray eLearning', href: 'https://sousamurrayelearning.jagroupservices.co.uk/' },
];

export default function CustomerWebsitesMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Our Websites
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-[70] mt-2 w-56 rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
          {customerWebsites.map((website) => (
            <a
              key={website.href}
              href={website.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:bg-muted focus:outline-none"
            >
              {website.name}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function MobileCustomerWebsitesMenu({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <details className="group my-1 rounded-2xl border border-border bg-muted/40 p-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-foreground">
        Our Websites
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pt-1">
        {customerWebsites.map((website) => (
          <a
            key={website.href}
            href={website.href}
            onClick={onNavigate}
            className="flex min-h-11 items-center rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {website.name}
          </a>
        ))}
      </div>
    </details>
  );
}
