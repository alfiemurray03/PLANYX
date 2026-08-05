import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "@dr.pogodin/react-helmet";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Compass,
  Edit3,
  Eye,
  Download,
  Loader2,
  Search,
  Share2,
  ShieldCheck,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth-context";
import {
  accountPlanEntitlements,
  type AccountPlanEntitlements,
  type AccountType,
  type SharePermission,
} from "@/lib/account-entitlements";
import {
  getAccountClassification,
  saveAccountClassification,
  type AccountClassification,
} from "@/lib/account-type-client";
import type { PlanId } from "@/lib/plan-config";
import { exportItineraryPdf } from "@/lib/itinerary-pdf";

export interface ExperienceBuilder {
  id: string;
  name: string;
  category: string;
  description: string;
  icon?: string;
  estimated_minutes?: number;
  featured?: number;
  form_schema?: string;
  token_cost?: number;
}

export interface BuilderCreditSummary {
  usage_model?: "credits" | "unlimited";
  unlimited_builder_use?: boolean;
  remaining_tokens?: number;
  used_tokens?: number;
  credit_limit?: number | null;
  five_hour_limit?: number | null;
  used_last_five_hours?: number;
  five_hour_resets_at?: string;
  token_reset_at?: string;
  plan_name?: string;
  plan_active?: boolean;
  trial_active?: boolean;
}

interface CompletedItinerary {
  id: string;
  builder_id: string;
  builder_name?: string;
  title: string;
  created_at: string;
  output_payload?: string | ItineraryDetail;
}

interface ItineraryAccess {
  id: string;
  outputId: string;
  title: string;
  builderName: string;
  ownerEmail: string;
  recipientEmail: string;
  recipientName?: string;
  permission: "view" | "edit" | "none";
  canEdit: boolean;
  createdAt: string;
}

interface BuilderData {
  builders: ExperienceBuilder[];
  drafts: Array<{
    id: string;
    builder_id: string;
    builder_name: string;
    last_saved_at: string;
  }>;
  outputs: CompletedItinerary[];
  token_summary?: BuilderCreditSummary;
  error?: string;
}

interface AccessData {
  success: boolean;
  accountType?: AccountType;
  planCode?: PlanId;
  entitlements?: AccountPlanEntitlements;
  owned?: ItineraryAccess[];
  received?: ItineraryAccess[];
  error?: string;
}

interface ItineraryDetail {
  title?: string;
  summary?: string;
  notes?: Array<{ label: string; value: string }>;
  [key: string]: unknown;
}

export default function BuildersHubPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<BuilderData | null>(null);
  const [classification, setClassification] =
    useState<AccountClassification | null>(null);
  const [accessData, setAccessData] = useState<AccessData | null>(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<ExperienceBuilder | null>(null);

  const [accountChoice, setAccountChoice] = useState<AccountType>("individual");
  const [organisationName, setOrganisationName] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [showAccountEditor, setShowAccountEditor] = useState(false);

  const [shareOutput, setShareOutput] = useState<CompletedItinerary | null>(
    null,
  );
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [sharePermission, setSharePermission] =
    useState<SharePermission>("view");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [shareError, setShareError] = useState("");

  const [openAccess, setOpenAccess] = useState<ItineraryAccess | null>(null);
  const [itinerary, setItinerary] = useState<ItineraryDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editNotes, setEditNotes] = useState<
    Array<{ label: string; value: string }>
  >([]);

  useEffect(() => {
    if (!isLoading && !user)
      navigate("/sign-in?redirect=/builders", { replace: true });
  }, [user, isLoading, navigate]);

  async function loadAccess() {
    try {
      const response = await fetch("/account/api/itinerary-access", {
        credentials: "include",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = (await response.json()) as AccessData;
      if (response.ok && body.success) setAccessData(body);
    } catch {
      /* sharing is supplementary to builders */
    }
  }

  useEffect(() => {
    if (!user) return;
    setError("");
    Promise.all([
      fetch("/account/api/builders", {
        credentials: "include",
        headers: { Accept: "application/json" },
      }).then(async (response) => {
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json"))
          throw new Error(
            "The builder service returned an invalid response. Please refresh and try again.",
          );
        const body = (await response.json()) as BuilderData;
        if (!response.ok)
          throw new Error(
            body.error || "Experience builders could not be loaded.",
          );
        return body;
      }),
      getAccountClassification(),
    ])
      .then(([builderData, account]) => {
        setData(builderData);
        setClassification(account);
        setAccountChoice(account.accountType);
        setOrganisationName(account.organisationName);
        setCategory(
          (current) => current || builderData.builders[0]?.category || "",
        );
        void loadAccess();
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Experience builders could not be loaded.",
        ),
      );
  }, [user]);

  const plan = (accessData?.planCode || user?.plan || "free") as PlanId;
  const entitlements = useMemo(
    () =>
      accessData?.entitlements ||
      accountPlanEntitlements(
        classification?.accountType || "individual",
        plan,
      ),
    [accessData, classification, plan],
  );
  const categories = useMemo(
    () => [
      ...new Set((data?.builders || []).map((builder) => builder.category)),
    ],
    [data],
  );
  const visibleBuilders = useMemo(
    () =>
      (data?.builders || []).filter(
        (builder) =>
          (!category || builder.category === category) &&
          `${builder.name} ${builder.description}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [data, category, query],
  );

  async function saveAccountType() {
    setAccountError("");
    if (accountChoice === "organisation" && !organisationName.trim()) {
      setAccountError("Enter the organisation name.");
      return;
    }
    setAccountSaving(true);
    const result = await saveAccountClassification(
      accountChoice,
      organisationName,
    );
    setAccountSaving(false);
    if (!result.success || !result.classification) {
      setAccountError(result.error || "The workspace type could not be saved.");
      return;
    }
    setClassification(result.classification);
    setShowAccountEditor(false);
    setShareOutput(null);
    setOpenAccess(null);
    await loadAccess();
  }

  async function createAccess() {
    if (!shareOutput) return;
    setShareBusy(true);
    setShareError("");
    setShareMessage("");
    try {
      const response = await fetch("/account/api/itinerary-access", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          outputId: shareOutput.id,
          recipientEmail,
          recipientName,
          permission: sharePermission,
        }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json"))
        throw new Error(
          "The sharing service returned an invalid response. Please refresh and try again.",
        );
      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        permissionNotice?: string;
      };
      if (!response.ok || !body.success)
        throw new Error(body.error || "The invitation could not be created.");
      setShareMessage(body.permissionNotice || "Access granted.");
      setRecipientEmail("");
      setRecipientName("");
      setSharePermission("view");
      await loadAccess();
    } catch (reason) {
      setShareError(
        reason instanceof Error
          ? reason.message
          : "The invitation could not be created.",
      );
    } finally {
      setShareBusy(false);
    }
  }

  useEffect(() => {
    const requestedOutput = searchParams.get("share");
    if (!requestedOutput || !data?.outputs?.length) return;
    const selected = data.outputs.find((item) => item.id === requestedOutput);
    if (selected) setShareOutput(selected);
    setSearchParams({}, { replace: true });
  }, [data, searchParams, setSearchParams]);

  function outputItinerary(output: CompletedItinerary): ItineraryDetail {
    if (output.output_payload && typeof output.output_payload === "object")
      return output.output_payload;
    try {
      return JSON.parse(
        String(output.output_payload || "{}"),
      ) as ItineraryDetail;
    } catch {
      return { title: output.title, summary: "", notes: [] };
    }
  }

  async function revokeAccess(id: string) {
    await fetch("/account/api/itinerary-access", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke", id }),
    }).catch(() => null);
    await loadAccess();
  }

  async function openReceived(access: ItineraryAccess) {
    setDetailBusy(true);
    setOpenAccess(access);
    setItinerary(null);
    try {
      const response = await fetch(
        `/account/api/itinerary-access?id=${encodeURIComponent(access.id)}`,
        { credentials: "include", cache: "no-store" },
      );
      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        access?: ItineraryAccess;
        itinerary?: ItineraryDetail;
      };
      if (!response.ok || !body.success || !body.itinerary || !body.access)
        throw new Error(body.error || "The itinerary could not be opened.");
      setOpenAccess(body.access);
      setItinerary(body.itinerary);
      setEditTitle(String(body.itinerary.title || body.access.title || ""));
      setEditSummary(String(body.itinerary.summary || ""));
      setEditNotes(
        Array.isArray(body.itinerary.notes)
          ? body.itinerary.notes.map((note) => ({
              label: String(note.label || ""),
              value: String(note.value || ""),
            }))
          : [],
      );
    } catch (reason) {
      setShareError(
        reason instanceof Error
          ? reason.message
          : "The itinerary could not be opened.",
      );
    } finally {
      setDetailBusy(false);
    }
  }

  async function saveCollaborativeEdit() {
    if (!openAccess?.canEdit) return;
    setDetailBusy(true);
    try {
      const response = await fetch("/account/api/itinerary-access", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: openAccess.id,
          title: editTitle,
          summary: editSummary,
          notes: editNotes,
        }),
      });
      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        itinerary?: ItineraryDetail;
      };
      if (!response.ok || !body.success)
        throw new Error(body.error || "The itinerary could not be saved.");
      setItinerary(body.itinerary || null);
      setShareMessage("The shared itinerary was updated.");
    } catch (reason) {
      setShareError(
        reason instanceof Error
          ? reason.message
          : "The itinerary could not be saved.",
      );
    } finally {
      setDetailBusy(false);
    }
  }

  if (classification && !classification.explicitlySelected) {
    return (
      <>
        <Helmet>
          <title>Choose your workspace — Sousa Murray Planeia</title>
        </Helmet>
        <DashboardLayout>
          <main className="mx-auto max-w-3xl px-6 py-12">
            <WorkspaceSelector
              accountChoice={accountChoice}
              setAccountChoice={setAccountChoice}
              organisationName={organisationName}
              setOrganisationName={setOrganisationName}
              saving={accountSaving}
              error={accountError}
              onSave={saveAccountType}
            />
          </main>
        </DashboardLayout>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Experience Builders — Sousa Murray Planeia</title>
        <meta
          name="description"
          content="Build practical plans for days out, occasions, activities, trips and accessible experiences."
        />
      </Helmet>
      <DashboardLayout>
        <main className="mx-auto max-w-7xl space-y-10 px-6 py-10">
          <section className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-7 sm:p-9">
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div className="max-w-2xl">
                <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
                  {entitlements.isOrganisation ? (
                    <Building2 className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                  {entitlements.workspaceLabel}
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                  Professional experience builder studio
                </h1>
                <p className="mt-3 leading-relaxed text-slate-600">
                  {entitlements.isOrganisation
                    ? `Planning for ${classification?.organisationName || "your organisation"}. Organisation work stays separate from individual customer plans.`
                    : "Your private individual planning workspace. Organisation features and business invitations are kept separate."}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="min-w-56 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Your access
                  </p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {data?.token_summary?.plan_name || "Sousa Murray Planeia"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAccountEditor((value) => !value)}
                  className="text-sm font-semibold text-blue-700 hover:underline"
                >
                  Change workspace type
                </button>
              </div>
            </div>
          </section>

          {showAccountEditor && (
            <WorkspaceSelector
              accountChoice={accountChoice}
              setAccountChoice={setAccountChoice}
              organisationName={organisationName}
              setOrganisationName={setOrganisationName}
              saving={accountSaving}
              error={accountError}
              onSave={saveAccountType}
              compact
            />
          )}
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
              {error}
            </div>
          )}
          {shareError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
              {shareError}
            </div>
          )}
          {shareMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-700">
              {shareMessage}
            </div>
          )}
          {!data && !error && (
            <div className="grid gap-5 md:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-48 animate-pulse rounded-2xl bg-slate-100"
                />
              ))}
            </div>
          )}

          {data && (
            <section className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)_320px]">
              <aside className="rounded-2xl border border-slate-200 bg-white p-3 lg:sticky lg:top-24">
                <p className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Categories
                </p>
                {categories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setCategory(item);
                      setPreview(null);
                    }}
                    className={`w-full rounded-xl px-3 py-3 text-left text-sm font-semibold ${category === item ? "bg-blue-600 text-white" : "bg-white text-slate-800 hover:bg-slate-100"}`}
                  >
                    <span className="block">{item}</span>
                    <span
                      className={`mt-1 block text-xs ${category === item ? "text-blue-100" : "text-slate-500"}`}
                    >
                      {
                        data.builders.filter(
                          (builder) => builder.category === item,
                        ).length
                      }{" "}
                      templates
                    </span>
                  </button>
                ))}
              </aside>
              <div className="min-w-0 space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search this category…"
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-slate-950"
                  />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-950">
                    {category}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {visibleBuilders.length} professional templates
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {visibleBuilders.map((builder) => (
                    <button
                      type="button"
                      key={builder.id}
                      onClick={() => setPreview(builder)}
                      className={`rounded-2xl border bg-white p-5 text-left text-slate-950 transition-all hover:border-blue-400 hover:shadow-md ${preview?.id === builder.id ? "border-blue-600 ring-2 ring-blue-100" : "border-slate-200"}`}
                    >
                      <div className="flex justify-between">
                        <span className="text-2xl">{builder.icon || "✨"}</span>
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock3 className="h-3.5 w-3.5" />
                          {builder.estimated_minutes || 10} min
                        </span>
                      </div>
                      <h3 className="mt-4 font-bold text-slate-950">
                        {builder.name}
                      </h3>
                      <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                        {builder.description}
                      </p>
                      <span className="mt-4 inline-flex text-sm font-semibold text-blue-700">
                        Preview template
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <aside className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-950 lg:sticky lg:top-24">
                {preview ? (
                  <>
                    <div className="text-3xl">{preview.icon || "✨"}</div>
                    <p className="mt-4 text-xs font-bold uppercase tracking-wide text-blue-700">
                      Template preview
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-slate-950">
                      {preview.name}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">
                      {preview.description}
                    </p>
                    <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">
                        This builder covers
                      </p>
                      <ul className="mt-2 space-y-1">
                        <li>• Priorities and preferences</li>
                        <li>• Timings and practical planning</li>
                        <li>• Budget and accessibility needs</li>
                        <li>• Contingencies and next steps</li>
                      </ul>
                    </div>
                    <Link
                      to={`/builders/${preview.id}`}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
                    >
                      Open builder <ArrowRight className="h-4 w-4" />
                    </Link>
                  </>
                ) : (
                  <div className="py-12 text-center">
                    <Compass className="mx-auto h-9 w-9 text-blue-600" />
                    <h2 className="mt-4 font-bold text-slate-950">
                      Select a template
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      Choose a builder from the gallery to preview it here
                      before starting.
                    </p>
                  </div>
                )}
              </aside>
            </section>
          )}

          {(data?.drafts?.length || 0) > 0 && (
            <section>
              <h2 className="mb-4 text-xl font-bold text-slate-950">
                Continue planning
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {data!.drafts.slice(0, 4).map((draft) => (
                  <Link
                    key={draft.id}
                    to={`/builders/${draft.builder_id}`}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-300"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {draft.builder_name}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Draft saved{" "}
                        {new Date(draft.last_saved_at).toLocaleDateString(
                          "en-GB",
                        )}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-blue-600" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {(data?.outputs?.length || 0) > 0 && (
            <section>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-950">
                    {entitlements.isOrganisation
                      ? "Organisation itineraries"
                      : "My completed itineraries"}
                  </h2>
                  <p className="text-sm text-slate-500">
                    Download a formatted copy or securely invite someone using
                    their email address.
                  </p>
                </div>
                {entitlements.organisationMemberWorkspace && (
                  <Link
                    to="/org/members"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700"
                  >
                    <Users className="h-4 w-4" />
                    Manage organisation members
                  </Link>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {data!.outputs.slice(0, 12).map((output) => (
                  <article
                    key={output.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {output.title}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {output.builder_name || "Experience plan"} ·{" "}
                        {new Date(output.created_at).toLocaleDateString(
                          "en-GB",
                        )}
                      </p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          exportItineraryPdf(outputItinerary(output))
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800"
                      >
                        <Download className="h-4 w-4" />
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShareOutput(output);
                          setShareMessage("");
                          setShareError("");
                        }}
                        disabled={!entitlements.canShareItineraries}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Share2 className="h-4 w-4" />
                        Share
                      </button>
                    </div>
                    {!entitlements.canShareItineraries && (
                      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Activate Explore, Plan, Complete or Together to invite
                        viewers. PDF export remains available.
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {shareOutput &&
            entitlements.isIndividual &&
            entitlements.canShareItineraries && (
              <IndividualSharePanel
                output={shareOutput}
                recipientName={recipientName}
                recipientEmail={recipientEmail}
                busy={shareBusy}
                onRecipientName={setRecipientName}
                onRecipientEmail={setRecipientEmail}
                onClose={() => setShareOutput(null)}
                onInvite={() => void createAccess()}
              />
            )}

          {shareOutput && entitlements.isOrganisation && (
            <section className="rounded-3xl border border-blue-200 bg-blue-50/50 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                    Invite access
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">
                    {shareOutput.title}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {entitlements.canInviteEditors
                      ? "Together allows read-only or editing access."
                      : "Your current plan permits read-only viewing only."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShareOutput(null)}
                  aria-label="Close invite panel"
                >
                  <X className="h-5 w-5 text-slate-500" />
                </button>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-800">
                  Recipient name
                  <input
                    value={recipientName}
                    onChange={(event) => setRecipientName(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal"
                    placeholder="Optional"
                  />
                </label>
                <label className="text-sm font-semibold text-slate-800">
                  Recipient email
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(event) => setRecipientEmail(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal"
                    placeholder="name@example.com"
                  />
                </label>
              </div>
              <fieldset className="mt-4">
                <legend className="text-sm font-semibold text-slate-800">
                  Permission
                </legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setSharePermission("view")}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${sharePermission === "view" ? "border-blue-600 bg-white text-blue-700" : "border-slate-300 bg-white text-slate-700"}`}
                  >
                    <Eye className="h-4 w-4" />
                    Read-only
                  </button>
                  {entitlements.canInviteEditors && (
                    <button
                      type="button"
                      onClick={() => setSharePermission("edit")}
                      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${sharePermission === "edit" ? "border-blue-600 bg-white text-blue-700" : "border-slate-300 bg-white text-slate-700"}`}
                    >
                      <Edit3 className="h-4 w-4" />
                      Can edit
                    </button>
                  )}
                </div>
              </fieldset>
              <button
                type="button"
                onClick={createAccess}
                disabled={shareBusy || !recipientEmail}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {shareBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Invite signed-in user
              </button>
            </section>
          )}

          {(accessData?.owned?.length || 0) > 0 && (
              <section>
                <h2 className="mb-4 text-xl font-bold text-slate-950">
                  People with access
                </h2>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="divide-y divide-slate-100">
                    {accessData!.owned!.map((access) => (
                      <div
                        key={access.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-4"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">
                            {access.title}
                          </p>
                          <p className="text-sm text-slate-500">
                            {access.recipientName || access.recipientEmail} ·{" "}
                            {access.permission === "edit"
                              ? "Can edit"
                              : "Read-only"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void revokeAccess(access.id)}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove access
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
          )}

          {(accessData?.received?.length || 0) > 0 && (
            <section>
              <div className="mb-4">
                <h2 className="text-xl font-bold text-slate-950">
                  Shared with me
                </h2>
                <p className="text-sm text-slate-500">
                  Itineraries shared with your exact signed-in email address.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {accessData!.received!.map((access) => (
                  <button
                    type="button"
                    key={access.id}
                    onClick={() => void openReceived(access)}
                    className="rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-blue-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {access.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          From {access.ownerEmail}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${access.canEdit ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"}`}
                      >
                        {access.canEdit ? "Can edit" : "Read-only"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {openAccess && (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                    Shared itinerary
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">
                    {editTitle || openAccess.title}
                  </h2>
                  <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                    {openAccess.canEdit ? (
                      <>
                        <Edit3 className="h-4 w-4" />
                        Together collaboration — editing allowed
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4" />
                        Read-only — changes are blocked
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpenAccess(null);
                    setItinerary(null);
                  }}
                  aria-label="Close shared itinerary"
                >
                  <X className="h-5 w-5 text-slate-500" />
                </button>
              </div>
              {detailBusy && !itinerary ? (
                <div className="py-12 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : (
                itinerary && (
                  <div className="mt-6 space-y-5">
                    {openAccess.canEdit ? (
                      <>
                        <label className="block text-sm font-semibold text-slate-800">
                          Title
                          <input
                            value={editTitle}
                            onChange={(event) =>
                              setEditTitle(event.target.value)
                            }
                            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
                          />
                        </label>
                        <label className="block text-sm font-semibold text-slate-800">
                          Summary
                          <textarea
                            value={editSummary}
                            onChange={(event) =>
                              setEditSummary(event.target.value)
                            }
                            className="mt-2 min-h-28 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
                          />
                        </label>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {editNotes.map((note, index) => (
                            <div
                              key={`${note.label}-${index}`}
                              className="rounded-xl border border-slate-200 p-4"
                            >
                              <input
                                aria-label={`Note ${index + 1} label`}
                                value={note.label}
                                onChange={(event) =>
                                  setEditNotes((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, label: event.target.value }
                                        : item,
                                    ),
                                  )
                                }
                                className="w-full border-0 p-0 text-xs font-semibold uppercase tracking-wide text-slate-500"
                              />
                              <textarea
                                aria-label={`Note ${index + 1} value`}
                                value={note.value}
                                onChange={(event) =>
                                  setEditNotes((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, value: event.target.value }
                                        : item,
                                    ),
                                  )
                                }
                                className="mt-2 min-h-20 w-full rounded-lg border border-slate-200 p-2 text-slate-900"
                              />
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={saveCollaborativeEdit}
                          disabled={detailBusy}
                          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white"
                        >
                          {detailBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          Save shared itinerary
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 leading-relaxed text-slate-700">
                          {String(itinerary.summary || "")}
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {(itinerary.notes || []).map((note, index) => (
                            <div
                              key={`${note.label}-${index}`}
                              className="rounded-xl bg-slate-50 p-4"
                            >
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {note.label}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-slate-900">
                                {note.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )
              )}
            </section>
          )}
        </main>
      </DashboardLayout>
    </>
  );
}

function WorkspaceSelector({
  accountChoice,
  setAccountChoice,
  organisationName,
  setOrganisationName,
  saving,
  error,
  onSave,
  compact = false,
}: {
  accountChoice: AccountType;
  setAccountChoice: (value: AccountType) => void;
  organisationName: string;
  setOrganisationName: (value: string) => void;
  saving: boolean;
  error: string;
  onSave: () => void;
  compact?: boolean;
}) {
  return (
    <section
      className={`rounded-3xl border border-slate-200 bg-white ${compact ? "p-6" : "p-7 sm:p-10"}`}
    >
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
          Workspace setup
        </p>
        <h1
          className={`${compact ? "text-2xl" : "text-3xl"} mt-2 font-bold text-slate-950`}
        >
          Are you planning as an individual or an organisation?
        </h1>
        <p className="mt-3 text-slate-600">
          Choose explicitly. Sousa Murray Planeia will never classify you as a
          business merely because a company name appears in your Microsoft
          profile.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setAccountChoice("individual")}
            className={`rounded-2xl border-2 p-5 text-left ${accountChoice === "individual" ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}
          >
            <User className="h-6 w-6 text-blue-700" />
            <h2 className="mt-3 font-bold text-slate-950">Individual</h2>
            <p className="mt-1 text-sm text-slate-600">
              Private personal plans. No organisation sharing controls.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setAccountChoice("organisation")}
            className={`rounded-2xl border-2 p-5 text-left ${accountChoice === "organisation" ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}
          >
            <Building2 className="h-6 w-6 text-blue-700" />
            <h2 className="mt-3 font-bold text-slate-950">Organisation</h2>
            <p className="mt-1 text-sm text-slate-600">
              Business workspace with plan-controlled itinerary invitations.
            </p>
          </button>
        </div>
        {accountChoice === "organisation" && (
          <label className="mt-5 block text-sm font-semibold text-slate-800">
            Organisation name
            <input
              value={organisationName}
              onChange={(event) => setOrganisationName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
              placeholder="Organisation or business name"
            />
          </label>
        )}
        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : accountChoice === "organisation" ? (
            <Building2 className="h-4 w-4" />
          ) : (
            <User className="h-4 w-4" />
          )}
          Save{" "}
          {accountChoice === "organisation" ? "Organisation" : "Individual"}{" "}
          workspace
        </button>
      </div>
    </section>
  );
}

function IndividualSharePanel({
  output,
  recipientName,
  recipientEmail,
  busy,
  onRecipientName,
  onRecipientEmail,
  onClose,
  onInvite,
}: {
  output: CompletedItinerary;
  recipientName: string;
  recipientEmail: string;
  busy: boolean;
  onRecipientName: (value: string) => void;
  onRecipientEmail: (value: string) => void;
  onClose: () => void;
  onInvite: () => void;
}) {
  return (
    <section className="rounded-3xl border border-blue-200 bg-blue-50/50 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
            Share itinerary
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">
            {output.title}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Invite anyone by email. They must sign in using that exact address
            before they can view the itinerary.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close share panel">
          <X className="h-5 w-5 text-slate-500" />
        </button>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-800">
          Recipient name
          <input
            value={recipientName}
            onChange={(event) => onRecipientName(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal"
            placeholder="Optional"
          />
        </label>
        <label className="text-sm font-semibold text-slate-800">
          Recipient email
          <input
            type="email"
            value={recipientEmail}
            onChange={(event) => onRecipientEmail(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal"
            placeholder="name@example.com"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={onInvite}
        disabled={busy || !recipientEmail}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
        Invite to view
      </button>
    </section>
  );
}
