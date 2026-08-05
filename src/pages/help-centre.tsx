import { useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Bot,
  BookOpen,
  ChevronDown,
  ChevronUp,
  LifeBuoy,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface HelpArticle {
  id: string;
  category: string;
  title: string;
  summary: string;
  answer: string;
  steps: string[];
  href: string;
}

interface AssistantConfig {
  assistantName: string;
  responseTime: string;
}

const DEFAULT_CONFIG: AssistantConfig = {
  assistantName: 'Sousa Murray Planeia Support Assistant',
  responseTime: 'within 2 working days',
};

export default function PublicHelpCentrePage() {
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [config, setConfig] = useState<AssistantConfig>(DEFAULT_CONFIG);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [openArticle, setOpenArticle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/support-assistant', { credentials: 'include' })
      .then(async response => {
        const data = await response.json() as {
          success?: boolean;
          articles?: HelpArticle[];
          config?: Partial<AssistantConfig>;
          error?: string;
        };
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'The Help Centre could not be loaded.');
        }
        if (!active) return;
        setArticles(data.articles || []);
        setConfig({ ...DEFAULT_CONFIG, ...(data.config || {}) });
      })
      .catch(reason => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'The Help Centre could not be loaded.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(articles.map(article => article.category))).filter(Boolean)],
    [articles],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return articles.filter(article => {
      if (category !== 'All' && article.category !== category) return false;
      if (!term) return true;
      return `${article.title} ${article.summary} ${article.answer} ${article.category}`
        .toLowerCase()
        .includes(term);
    });
  }, [articles, category, search]);

  return (
    <>
      <Helmet>
        <title>Help Centre — Sousa Murray Planeia</title>
        <meta
          name="description"
          content="Search Sousa Murray Planeia Help Centre guidance or speak to the AI-assisted support chatbot."
        />
      </Helmet>

      <main className="min-h-screen bg-slate-50 text-slate-950">
        <section className="border-b border-slate-800 bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-200">
              <BookOpen className="h-3.5 w-3.5" />
              Sousa Murray Planeia Help Centre
            </span>
            <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">
              Find an answer or ask the support assistant
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
              Search practical guidance for accounts, Microsoft sign-in, subscriptions, builders,
              privacy and technical problems. This Help Centre is available without signing in.
            </p>
            <div className="mx-auto mt-7 max-w-2xl">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search the Help Centre…"
                  aria-label="Search the Help Centre"
                  className="h-13 border-slate-600 bg-white pl-12 text-base text-slate-950 placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl space-y-8">
            <Card className="overflow-hidden border-blue-200 bg-gradient-to-br from-blue-50 to-white">
              <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg">
                    <Bot className="h-6 w-6" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-950">Ask {config.assistantName}</h2>
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                        <Sparkles className="h-3 w-3" /> AI-assisted
                      </span>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                      Use the blue assistant button at the bottom-right of the page. It asks questions,
                      searches this Help Centre and offers to create a Contact Enquiry when self-help
                      does not resolve the issue.
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      The support team normally replies {config.responseTime} after an enquiry is submitted.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
                  className="shrink-0 bg-blue-600 text-white hover:bg-blue-700"
                >
                  <LifeBuoy className="mr-2 h-4 w-4" />
                  Use the blue chat button
                </Button>
              </CardContent>
            </Card>

            <div>
              <h2 className="text-lg font-bold text-slate-950">Browse by category</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {categories.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      category === item
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {loading && (
              <div className="flex min-h-52 items-center justify-center rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  Loading Help Centre guidance…
                </div>
              </div>
            )}

            {!loading && error && (
              <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                {error} You can still use the blue support assistant to create a Contact Enquiry.
              </div>
            )}

            {!loading && !error && filtered.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
                <Search className="mx-auto h-8 w-8 text-slate-300" />
                <h2 className="mt-3 font-semibold text-slate-900">No matching Help Centre answer</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Try a different phrase or use the support assistant to ask a guided question.
                </p>
              </div>
            )}

            {!loading && !error && filtered.length > 0 && (
              <div className="grid gap-4">
                {filtered.map(article => {
                  const expanded = openArticle === article.id;
                  return (
                    <Card key={article.id} className="overflow-hidden border-slate-200 bg-white">
                      <button
                        type="button"
                        onClick={() => setOpenArticle(expanded ? null : article.id)}
                        aria-expanded={expanded}
                        className="flex w-full items-start justify-between gap-4 p-5 text-left hover:bg-slate-50"
                      >
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600">
                            {article.category}
                          </p>
                          <h2 className="mt-1 text-base font-bold text-slate-950">{article.title}</h2>
                          <p className="mt-2 text-sm leading-relaxed text-slate-600">{article.summary}</p>
                        </div>
                        {expanded
                          ? <ChevronUp className="mt-1 h-5 w-5 shrink-0 text-slate-400" />
                          : <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-slate-400" />}
                      </button>

                      {expanded && (
                        <CardContent className="border-t border-slate-200 bg-slate-50 p-5">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                            {article.answer}
                          </p>
                          {!!article.steps?.length && (
                            <ol className="mt-4 space-y-2">
                              {article.steps.map((step, index) => (
                                <li key={`${article.id}-step-${index}`} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                                    {index + 1}
                                  </span>
                                  <span className="pt-0.5">{step}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                          <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
                            Still not resolved? Open the blue support assistant and choose <strong>No, I still need help</strong> to create a Contact Enquiry.
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
