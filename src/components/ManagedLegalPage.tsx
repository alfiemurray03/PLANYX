import { useCallback, useEffect, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { AlertCircle, FileText, RefreshCw } from 'lucide-react';
import { useSiteSettings } from '@/lib/site-settings-context';
import { normaliseContactDetails } from '@/lib/contact-details';

interface LegalContent {
  body: string;
  effectiveDate?: string;
  version?: number | string;
  updatedAt?: string;
}

interface ManagedLegalPageProps {
  slug: string;
  title: string;
  description: string;
  privacyContacts?: boolean;
}

function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function ManagedLegalPage({
  slug,
  title,
  description,
  privacyContacts = false,
}: ManagedLegalPageProps) {
  const { siteName } = useSiteSettings();
  const [content, setContent] = useState<LegalContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setUnavailable(false);
    try {
      const response = await fetch(`/api/legal?slug=${encodeURIComponent(slug)}&t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Policy is not published');
      const data = await response.json() as { success?: boolean } & Partial<LegalContent>;
      if (!data.success || !data.body?.trim()) throw new Error('Policy is not published');
      setContent(data as LegalContent);
    } catch {
      setContent(null);
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const effectiveDate = formatDate(content?.effectiveDate);
  const meta = [
    effectiveDate ? `Effective ${effectiveDate}` : '',
    content?.version ? `Version ${content.version}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <>
      <Helmet>
        <title>{title} — {siteName}</title>
        <meta name="description" content={description} />
      </Helmet>
      <main className="min-h-screen bg-background">
        <article className="mx-auto max-w-3xl px-6 py-12 text-foreground">
          <header className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/10">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {meta && <p className="mt-1 text-sm text-muted-foreground">{meta}</p>}
            </div>
          </header>

          {loading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-8 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading the published policy…
            </div>
          ) : content ? (
            <div
              className="legal-html-body text-sm leading-relaxed text-foreground"
              dangerouslySetInnerHTML={{ __html: normaliseContactDetails(content.body, privacyContacts) }}
            />
          ) : unavailable ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                <div>
                  <h2 className="font-semibold">This policy is not currently published</h2>
                  <p className="mt-1 text-sm opacity-80">
                    No published version is available from the Admin Centre. Please try again or contact Sousa Murray Planeia.
                  </p>
                  <button type="button" onClick={() => void load()} className="mt-4 text-sm font-semibold text-blue-700 underline underline-offset-4 dark:text-blue-300">
                    Try again
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <nav className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-sm text-muted-foreground">
            <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
            <Link to="/cookies" className="hover:text-foreground">Cookie Policy</Link>
            <Link to="/acceptable-use" className="hover:text-foreground">Acceptable Use</Link>
            <Link to="/refund-policy" className="hover:text-foreground">Refund Policy</Link>
            <Link to="/complaints" className="hover:text-foreground">Complaints Policy</Link>
          </nav>
        </article>
      </main>
    </>
  );
}
