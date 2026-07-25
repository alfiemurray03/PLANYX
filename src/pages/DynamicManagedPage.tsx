import { useEffect, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import Website from '@/layouts/Website';
import ProdNotFoundPage from '@/pages/_404';

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

export default function DynamicManagedPage() {
  const [page, setPage] = useState<ManagedPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    fetch(`/api/website-builder?mode=page&path=${encodeURIComponent(window.location.pathname)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async response => ({ response, payload: await response.json().catch(() => ({})) as { success?: boolean; page?: ManagedPage } }))
      .then(({ response, payload }) => {
        if (cancelled) return;
        if (!response.ok || !payload.success || !payload.page) {
          setMissing(true);
          return;
        }
        setPage(payload.page);
      })
      .catch(() => !cancelled && setMissing(true))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Website>
        <main className="mx-auto flex min-h-[55vh] max-w-7xl items-center justify-center px-6 py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-label="Loading page" />
        </main>
      </Website>
    );
  }

  if (missing || !page) return <ProdNotFoundPage />;

  return (
    <Website>
      <Helmet>
        <title>{page.seo_title || `${page.title} — Planyx`}</title>
        {page.seo_description && <meta name="description" content={page.seo_description} />}
        {page.noindex ? <meta name="robots" content="noindex, nofollow" /> : <meta name="robots" content="index, follow" />}
        {page.css && <style>{page.css}</style>}
      </Helmet>
      <div data-managed-page={page.path} dangerouslySetInnerHTML={{ __html: page.html }} />
    </Website>
  );
}
