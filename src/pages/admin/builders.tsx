import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import AdminLayout from '@/components/AdminLayout';
import {
  CheckCircle2,
  Compass,
  Eye,
  Layers3,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Shapes,
  Timer,
  XCircle,
} from 'lucide-react';

interface Builder {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  status: string;
  plan_inclusion: string;
  token_cost: number;
  estimated_minutes: number;
  featured: number;
  visibility: string;
  builder_type: string;
  form_schema: string;
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

function statusStyle(status: string) {
  if (status === 'Active') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'Paused') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-xs font-semibold text-foreground">{children}</span>;
}

export default function AdminBuildersPage() {
  const [builders, setBuilders] = useState<Builder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedId, setSelectedId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/admin/api?section=builders', { credentials: 'include' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Builders could not be loaded.');
      const nextBuilders = (body.platform?.builders || []) as Builder[];
      setBuilders(nextBuilders);
      setSelectedId(current => current && nextBuilders.some(builder => builder.id === current)
        ? current
        : nextBuilders[0]?.id || '');
    } catch (reason) {
      setError(errorMessage(reason, 'Builders could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(
    () => [...new Set(builders.map(builder => builder.category).filter(Boolean))].sort(),
    [builders],
  );

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return builders.filter(builder => {
      const matchesCategory = category === 'all' || builder.category === category;
      const matchesSearch = !search || [builder.name, builder.description, builder.id, builder.category]
        .join(' ')
        .toLowerCase()
        .includes(search);
      return matchesCategory && matchesSearch;
    });
  }, [builders, category, query]);

  useEffect(() => {
    if (!visible.length) return;
    if (!visible.some(builder => builder.id === selectedId)) setSelectedId(visible[0].id);
  }, [selectedId, visible]);

  const selected = builders.find(builder => builder.id === selectedId);

  function update(id: string, patch: Partial<Builder>) {
    setBuilders(current => current.map(builder => builder.id === id ? { ...builder, ...patch } : builder));
    setNotice('');
  }

  async function save(builder: Builder) {
    setSaving(builder.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/admin/api?section=builders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(builder),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Builder could not be saved.');
      setBuilders((body.platform?.builders || builders) as Builder[]);
      setNotice(`${builder.name} saved successfully.`);
    } catch (reason) {
      setError(errorMessage(reason, 'Builder could not be saved.'));
    } finally {
      setSaving('');
    }
  }

  const activeCount = builders.filter(builder => builder.status === 'Active').length;

  return (
    <AdminLayout title="Experience Builders" subtitle="Manage the guided planners available in Sousa Murray Planeia.">
      <div className="mx-auto w-full max-w-[1500px] space-y-6">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Compass className="h-4 w-4 shrink-0" />
                Professional experience catalogue
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Builder controls
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                Manage customer-visible templates, credit cost, subscription inclusion, status,
                category and trial availability from one readable workspace.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              <RefreshCw className={`h-4 w-4 shrink-0 ${loading ? 'animate-spin' : ''}`} />
              Refresh catalogue
            </button>
          </div>
        </section>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['Published catalogue', builders.length, Layers3],
            ['Active builders', activeCount, Eye],
            ['Categories', categories.length, Shapes],
          ].map(([label, value, Icon]) => {
            const StatIcon = Icon as typeof Layers3;
            return (
              <div key={String(label)} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{String(label)}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{String(value)}</p>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <StatIcon className="h-5 w-5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)]">
            <label className="relative block min-w-0">
              <span className="sr-only">Search builders</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search by builder name, ID, category or description…"
                className="min-h-11 w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label>
              <span className="sr-only">Filter by category</span>
              <select
                value={category}
                onChange={event => setCategory(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">All categories</option>
                {categories.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>
        </section>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center rounded-2xl border border-border bg-card">
            <div className="text-center">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">Loading builder catalogue…</p>
            </div>
          </div>
        ) : (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(300px,0.78fr)_minmax(0,1.55fr)]">
            <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border p-4">
                <h2 className="font-semibold text-foreground">Builder catalogue</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Showing {visible.length} of {builders.length} builders
                </p>
              </div>
              <div className="max-h-[720px] overflow-y-auto p-2" role="list" aria-label="Experience builders">
                {visible.length ? visible.map(builder => (
                  <button
                    key={builder.id}
                    type="button"
                    role="listitem"
                    onClick={() => setSelectedId(builder.id)}
                    className={`mb-1 grid w-full min-w-0 grid-cols-[44px_minmax(0,1fr)] gap-3 rounded-xl border p-3 text-left transition last:mb-0 ${selectedId === builder.id
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                      : 'border-transparent hover:border-border hover:bg-muted/60'}`}
                    aria-current={selectedId === builder.id ? 'true' : undefined}
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-xl">
                      {builder.icon || '✨'}
                    </span>
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-semibold leading-5 text-foreground">
                        {builder.name || 'Untitled builder'}
                      </span>
                      <span className="mt-1 block break-all text-[11px] leading-4 text-muted-foreground">{builder.id}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyle(builder.status)}`}>
                          {builder.status}
                        </span>
                        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                          {builder.category || 'Uncategorised'}
                        </span>
                      </span>
                    </span>
                  </button>
                )) : (
                  <div className="px-5 py-16 text-center">
                    <Search className="mx-auto h-6 w-6 text-muted-foreground" />
                    <p className="mt-3 text-sm font-semibold text-foreground">No builders found</p>
                    <p className="mt-1 text-xs text-muted-foreground">Change the search or category filter.</p>
                  </div>
                )}
              </div>
            </section>

            <section className="min-w-0 rounded-2xl border border-border bg-card shadow-sm">
              {selected ? (
                <>
                  <div className="border-b border-border p-4 sm:p-5">
                    <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_170px] sm:items-end">
                      <label className="min-w-0">
                        <FieldLabel>Builder name</FieldLabel>
                        <input
                          value={selected.name}
                          onChange={event => update(selected.id, { name: event.target.value })}
                          className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </label>
                      <label className="min-w-0">
                        <FieldLabel>Status</FieldLabel>
                        <select
                          value={selected.status}
                          onChange={event => update(selected.id, { status: event.target.value })}
                          className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        >
                          <option>Active</option>
                          <option>Paused</option>
                          <option>Archived</option>
                        </select>
                      </label>
                    </div>
                    <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">ID: {selected.id}</p>
                  </div>

                  <div className="space-y-5 p-4 sm:p-5">
                    <label className="block">
                      <FieldLabel>Customer-facing description</FieldLabel>
                      <textarea
                        value={selected.description || ''}
                        onChange={event => update(selected.id, { description: event.target.value })}
                        rows={4}
                        className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-6 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="min-w-0">
                        <FieldLabel>Category</FieldLabel>
                        <input
                          value={selected.category}
                          onChange={event => update(selected.id, { category: event.target.value })}
                          className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </label>
                      <label className="min-w-0">
                        <FieldLabel>Access</FieldLabel>
                        <select
                          value={selected.visibility}
                          onChange={event => update(selected.id, { visibility: event.target.value })}
                          className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        >
                          <option value="trial">Trial included</option>
                          <option value="paid">Paid only</option>
                        </select>
                      </label>
                      <label className="min-w-0">
                        <FieldLabel>Credit cost</FieldLabel>
                        <input
                          type="number"
                          min="0"
                          value={selected.token_cost || 0}
                          onChange={event => update(selected.id, { token_cost: Number(event.target.value) })}
                          className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm tabular-nums text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </label>
                      <label className="min-w-0">
                        <FieldLabel>Estimated completion time</FieldLabel>
                        <span className="relative block">
                          <Timer className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <input
                            type="number"
                            min="1"
                            value={selected.estimated_minutes || 10}
                            onChange={event => update(selected.id, { estimated_minutes: Number(event.target.value) })}
                            className="min-h-11 w-full rounded-xl border border-input bg-background pl-10 pr-14 text-sm tabular-nums text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">mins</span>
                        </span>
                      </label>
                    </div>

                    <label className="block min-w-0">
                      <FieldLabel>Included subscription plan IDs</FieldLabel>
                      <input
                        value={selected.plan_inclusion || ''}
                        onChange={event => update(selected.id, { plan_inclusion: event.target.value })}
                        placeholder="Separate multiple plan IDs with commas"
                        className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                      <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">
                        Enter the plan identifiers that include this builder. Use commas between multiple plans.
                      </span>
                    </label>
                  </div>

                  <div className="flex flex-col-reverse gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <p className="text-xs leading-5 text-muted-foreground">
                      Changes only become active after this builder is saved.
                    </p>
                    <button
                      type="button"
                      onClick={() => void save(selected)}
                      disabled={saving === selected.id}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      {saving === selected.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Save className="h-4 w-4" />}
                      {saving === selected.id ? 'Saving…' : 'Save builder'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex min-h-80 items-center justify-center p-8 text-center">
                  <div>
                    <Compass className="mx-auto h-7 w-7 text-muted-foreground" />
                    <p className="mt-3 text-sm font-semibold text-foreground">Select a builder</p>
                    <p className="mt-1 text-xs text-muted-foreground">Choose a builder from the catalogue to edit it.</p>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
