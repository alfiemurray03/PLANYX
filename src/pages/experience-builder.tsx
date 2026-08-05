import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Helmet } from "@dr.pogodin/react-helmet";
import {
  ArrowLeft,
  Check,
  Clock3,
  Coins,
  Download,
  Loader2,
  Save,
  Share2,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth-context";
import type { BuilderCreditSummary, ExperienceBuilder } from "./builders-hub";
import { exportItineraryPdf } from "@/lib/itinerary-pdf";

interface Option {
  label: string;
  value: string;
  icon?: string;
}
interface Field {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: Option[];
  conditional?: { field: string; value: unknown };
  min?: number;
  max?: number;
}
interface ApiData {
  builders: ExperienceBuilder[];
  drafts?: Array<{ builder_id: string; answers: string }>;
  token_summary?: BuilderCreditSummary;
  error?: string;
}

function CreditStatus({
  summary,
  cost,
}: {
  summary: BuilderCreditSummary;
  cost: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (
    summary.unlimited_builder_use ||
    summary.usage_model === "unlimited" ||
    summary.credit_limit === null
  )
    return null;
  const resetAt = summary.five_hour_resets_at
    ? new Date(summary.five_hour_resets_at).getTime()
    : 0;
  const remainingMs = Math.max(0, resetAt - now);
  const hours = Math.floor(remainingMs / 3600000);
  const minutes = Math.floor((remainingMs % 3600000) / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  const windowRemaining = Math.max(
    0,
    Number(summary.five_hour_limit || 0) -
      Number(summary.used_last_five_hours || 0),
  );
  return (
    <aside
      className="sticky bottom-4 z-20 mt-8 rounded-2xl border border-blue-200 bg-white/95 p-4 text-slate-950 shadow-xl backdrop-blur"
      aria-label="Builder credit status"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Builder credits
            </p>
            <p className="font-bold text-slate-950">
              {Number(summary.remaining_tokens || 0).toLocaleString("en-GB")}{" "}
              remaining
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm sm:text-right">
          <div>
            <p className="text-xs text-slate-500">This builder</p>
            <p className="font-semibold text-slate-900">
              {cost.toLocaleString("en-GB")} credits
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">5-hour allowance</p>
            <p className="font-semibold text-slate-900">
              {windowRemaining.toLocaleString("en-GB")} left
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">
          <Clock3 className="h-4 w-4 text-blue-700" />
          {resetAt && remainingMs > 0
            ? `${hours}h ${minutes}m ${seconds}s`
            : "Window ready"}
        </div>
      </div>
    </aside>
  );
}

export default function ExperienceBuilderPage() {
  const { builderId } = useParams();
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [builder, setBuilder] = useState<ExperienceBuilder | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [output, setOutput] = useState<any>(null);
  const [outputId, setOutputId] = useState("");
  const [credits, setCredits] = useState<BuilderCreditSummary | null>(null);
  useEffect(() => {
    if (!isLoading && !user)
      navigate(`/sign-in?redirect=/builders/${builderId}`, { replace: true });
  }, [user, isLoading, navigate, builderId]);
  useEffect(() => {
    if (!user) return;
    fetch("/account/api/builders", { credentials: "include" })
      .then(async (r) => {
        const body = (await r.json()) as ApiData;
        if (!r.ok) throw new Error(body.error || "Builder unavailable.");
        const found = body.builders.find((b) => b.id === builderId);
        if (!found)
          throw new Error("This experience builder is not available.");
        setBuilder(found);
        setCredits(body.token_summary || null);
        const draft = body.drafts?.find((d) => d.builder_id === builderId);
        if (draft)
          try {
            setAnswers(JSON.parse(draft.answers));
          } catch {
            /* empty draft */
          }
      })
      .catch((e) => setError(e.message));
  }, [user, builderId]);
  const fields = useMemo<Field[]>(() => {
    try {
      return JSON.parse(builder?.form_schema || "[]");
    } catch {
      return [];
    }
  }, [builder]);
  const visible = fields.filter(
    (field) =>
      !field.conditional ||
      answers[field.conditional.field] === field.conditional.value,
  );
  const update = (id: string, value: unknown) =>
    setAnswers((current) => ({ ...current, [id]: value }));
  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/account/api/builders", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as any;
    if (data.token_summary) setCredits(data.token_summary);
    if (!response.ok)
      throw new Error(data.error || "The builder could not be saved.");
    return data;
  };
  const saveDraft = async () => {
    if (!builder) return;
    setBusy(true);
    setError("");
    try {
      await post({
        action: "save_draft",
        builder_id: builder.id,
        answers,
        current_step: 0,
      });
      setNotice("Draft saved.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!builder) return;
    for (const field of visible)
      if (
        field.required &&
        (answers[field.id] === undefined ||
          answers[field.id] === "" ||
          (Array.isArray(answers[field.id]) &&
            !(answers[field.id] as unknown[]).length))
      ) {
        setError(`Please complete “${field.label}”.`);
        return;
      }
    setBusy(true);
    setError("");
    try {
      const data = await post({
        action: "save_output",
        builder_id: builder.id,
        title: String(answers.plan_title || builder.name),
        fields: answers,
        request_id: crypto.randomUUID(),
      });
      const saved = data.output;
      setOutput(
        typeof saved?.output_payload === "string"
          ? JSON.parse(saved.output_payload)
          : saved?.output_payload || saved,
      );
      setOutputId(String(data.output_id || saved?.id || ""));
      setNotice("Your experience plan is ready.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (error && !builder)
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto p-8">
          <Link to="/builders" className="text-blue-700">
            ← Experience Builders
          </Link>
          <div className="mt-6 rounded-2xl bg-red-50 border border-red-200 p-5 text-red-700">
            {error}
          </div>
        </div>
      </DashboardLayout>
    );
  return (
    <>
      <Helmet>
        <title>{builder?.name || "Experience Builder"} — Sousa Murray Planeia</title>
      </Helmet>
      <DashboardLayout>
        <main className="max-w-4xl mx-auto px-6 py-10">
          <Link
            to="/builders"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"
          >
            <ArrowLeft className="w-4 h-4" />
            All experience builders
          </Link>
          {!builder ? (
            <div className="h-64 rounded-3xl bg-slate-100 animate-pulse mt-6" />
          ) : output ? (
            <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 sm:p-10 text-slate-950">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Check />
              </div>
              <h1 className="text-3xl font-bold text-slate-950 mt-5">
                {output.title}
              </h1>
              <p className="mt-3 text-slate-600 leading-relaxed">
                {output.summary}
              </p>
              <div className="mt-8 grid sm:grid-cols-2 gap-4">
                {(output.notes || []).map((note: any) => (
                  <div key={note.label} className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 capitalize">
                      {note.label}
                    </p>
                    <p className="mt-1 text-slate-900 whitespace-pre-wrap">
                      {String(note.value)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => exportItineraryPdf(output)}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </button>
                <Link
                  to={
                    outputId
                      ? `/builders?share=${encodeURIComponent(outputId)}`
                      : "/builders"
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-5 py-3 font-semibold text-blue-700"
                >
                  <Share2 className="h-4 w-4" />
                  Share itinerary
                </Link>
                <Link
                  to="/builders"
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-950"
                >
                  Plan another experience
                </Link>
                <button
                  onClick={() => setOutput(null)}
                  className="rounded-xl border border-slate-300 bg-white text-slate-950 hover:bg-slate-100 px-5 py-3 font-semibold"
                >
                  Edit this plan
                </button>
              </div>
            </section>
          ) : (
            <>
              <header className="mt-6 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-7 sm:p-9">
                <div className="text-3xl">{builder.icon || "✨"}</div>
                <h1 className="text-3xl font-bold text-slate-950 mt-4">
                  {builder.name}
                </h1>
                <p className="mt-3 text-slate-600 max-w-2xl leading-relaxed">
                  {builder.description}
                </p>
              </header>
              <form
                onSubmit={submit}
                className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-9 space-y-7 text-slate-950"
              >
                {visible.map((field) => (
                  <FieldInput
                    key={field.id}
                    field={field}
                    value={answers[field.id]}
                    update={update}
                  />
                ))}
                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700">
                    {error}
                  </div>
                )}
                {notice && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-700">
                    {notice}
                  </div>
                )}
                <div className="pt-3 flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
                  <button
                    type="button"
                    onClick={saveDraft}
                    disabled={busy}
                    className="rounded-xl border border-slate-300 bg-white text-slate-950 hover:bg-slate-100 px-5 py-3 font-semibold flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save draft
                  </button>
                  <button
                    disabled={busy}
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-7 py-3 font-semibold flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Create my plan
                  </button>
                </div>
              </form>
            </>
          )}
          {builder && credits && (
            <CreditStatus
              summary={credits}
              cost={Number(builder.token_cost || 0)}
            />
          )}
        </main>
      </DashboardLayout>
    </>
  );
}

function FieldInput({
  field,
  value,
  update,
}: {
  field: Field;
  value: unknown;
  update: (id: string, value: unknown) => void;
}) {
  const base =
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
  const label = (
    <>
      <label className="font-semibold text-slate-900">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
      {field.help && (
        <p className="text-sm text-slate-500 mt-1">{field.help}</p>
      )}
    </>
  );
  if (field.type === "long_text")
    return (
      <div>
        {label}
        <textarea
          className={`${base} mt-2 min-h-28`}
          value={String(value || "")}
          placeholder={field.placeholder}
          onChange={(e) => update(field.id, e.target.value)}
        />
      </div>
    );
  if (field.type === "yes_no")
    return (
      <fieldset>
        <legend className="font-semibold text-slate-900">{field.label}</legend>
        <div className="flex gap-3 mt-2">
          {[
            ["Yes", true],
            ["No", false],
          ].map(([text, val]) => (
            <button
              type="button"
              key={text as string}
              onClick={() => update(field.id, val)}
              className={`rounded-xl border px-5 py-3 ${value === val ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-300 bg-white text-slate-950 hover:bg-slate-100"}`}
            >
              {text as string}
            </button>
          ))}
        </div>
      </fieldset>
    );
  if (
    ["single_choice", "selectable_cards", "multiple_choice"].includes(
      field.type,
    )
  ) {
    const multi = field.type === "multiple_choice";
    const selected = multi ? (Array.isArray(value) ? value : []) : value;
    return (
      <fieldset>
        <legend className="font-semibold text-slate-900">
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </legend>
        {field.help && (
          <p className="text-sm text-slate-500 mt-1">{field.help}</p>
        )}
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {(field.options || []).map((option) => {
            const active = multi
              ? (selected as unknown[]).includes(option.value)
              : selected === option.value;
            return (
              <button
                type="button"
                key={option.value}
                onClick={() =>
                  update(
                    field.id,
                    multi
                      ? active
                        ? (selected as string[]).filter(
                            (v) => v !== option.value,
                          )
                        : [...(selected as string[]), option.value]
                      : option.value,
                  )
                }
                className={`text-left rounded-xl border px-4 py-3 ${active ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300 bg-white text-slate-950 hover:border-blue-300 hover:bg-slate-100"}`}
              >
                {option.icon && <span className="mr-2">{option.icon}</span>}
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }
  return (
    <div>
      {label}
      <input
        className={`${base} mt-2`}
        type={
          field.type === "date"
            ? "date"
            : field.type === "number"
              ? "number"
              : "text"
        }
        min={field.min}
        max={field.max}
        value={String(value || "")}
        placeholder={field.placeholder}
        onChange={(e) =>
          update(
            field.id,
            field.type === "number" ? Number(e.target.value) : e.target.value,
          )
        }
      />
    </div>
  );
}
