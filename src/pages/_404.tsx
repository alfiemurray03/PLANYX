import { useEffect, useState } from 'react';
import { Link } from '../router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Button } from '@/components/ui/button';
import { FileSearch, Home, ArrowLeft, Loader2 } from 'lucide-react';

interface ManagedPage {
  id: string;
  path: string;
  title: string;
  html: string;
  css: string;
  seo_title: string;
  seo_description: string;
  noindex: number;
}

export default function NotFoundPage() {
  const [loading, setLoading] = useState(typeof window !== 'undefined');
  const [page, setPage] = useState<ManagedPage | null>(null);

  useEffect(() => {
    let cancelled = false;
    const path = window.location.pathname;
    fetch(`/api/website-builder?mode=page&path=${encodeURIComponent(path)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async response => ({ response, payload: await response.json().catch(() => ({})) as { success?: boolean; page?: ManagedPage } }))
      .then(({ response, payload }) => {
        if (!cancelled && response.ok && payload.success && payload.page) setPage(payload.page);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Loading page" /></div>;
  }

  if (page) {
    return (
      <>
        <Helmet>
          <title>{page.seo_title || `${page.title} — Planyx`}</title>
          {page.seo_description && <meta name="description" content={page.seo_description} />}
          <meta name="robots" content={page.noindex ? 'noindex, nofollow' : 'index, follow'} />
          {page.css && <style>{page.css}</style>}
        </Helmet>
        <div data-managed-page={page.path} dangerouslySetInnerHTML={{ __html: page.html }} />
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Page Not Found — Planyx</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
          <FileSearch className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-6xl font-bold text-foreground mb-3">404</h1>
        <h2 className="text-2xl font-semibold text-foreground mb-3">Page Not Found</h2>
        <p className="text-muted-foreground max-w-sm mb-8">Sorry, the page you're looking for doesn't exist or has been moved.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild><Link to="/"><Home className="w-4 h-4 mr-2" />Go Home</Link></Button>
          <Button variant="outline" onClick={() => window.history.back()}><ArrowLeft className="w-4 h-4 mr-2" />Go Back</Button>
        </div>
      </div>
    </>
  );
}
