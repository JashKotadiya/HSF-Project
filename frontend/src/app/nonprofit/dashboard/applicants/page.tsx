"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import supabase from "@/lib/supabase";
import { useAuth } from "@/components/auth/AuthProvider";
import PageHeader from "@/components/layout/PageHeader";
import StatusBadge from "@/components/applications/StatusBadge";
import {
  Application,
  ApplicationStatus,
  RESUME_BUCKET,
  SETUP_HINT,
  STATUS_LABELS,
} from "@/lib/applications";

type ProjectSummary = { id: string; title: string };
const STATUS_FILTERS: (ApplicationStatus | "all")[] = ["all", "pending", "approved", "rejected"];

export default function ApplicantsPage() {
  return (
    <Suspense>
      <ApplicantsDashboard />
    </Suspense>
  );
}

function ApplicantsDashboard() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const userId = user?.id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState(searchParams.get("project") ?? "all");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      const { data: myProjects } = await supabase
        .from("posts")
        .select("id, title")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      const projectList = (myProjects ?? []) as ProjectSummary[];
      setProjects(projectList);

      if (projectList.length > 0) {
        const { data: apps, error: appsError } = await supabase
          .from("applications")
          .select("*")
          .in("project_id", projectList.map((p) => p.id))
          .order("created_at", { ascending: false });
        if (appsError) setError(`${appsError.message}. ${SETUP_HINT}`);
        setApplications((apps ?? []) as Application[]);
      }
      setLoading(false);
    };
    void load();
  }, [userId]);

  const projectTitles = useMemo(
    () => new Map(projects.map((p) => [p.id, p.title])),
    [projects]
  );

  const inProject = applications.filter(
    (a) => projectFilter === "all" || a.project_id === projectFilter
  );
  const term = searchTerm.toLowerCase();
  const visible = inProject.filter(
    (a) =>
      (statusFilter === "all" || a.status === statusFilter) &&
      (!term ||
        (a.applicant_name ?? "").toLowerCase().includes(term) ||
        (a.applicant_email ?? "").toLowerCase().includes(term) ||
        (projectTitles.get(a.project_id) ?? "").toLowerCase().includes(term))
  );
  const selected = applications.find((a) => a.id === selectedId) ?? null;

  const updateStatus = async (app: Application, status: ApplicationStatus) => {
    setActionError(null);
    const previous = app.status;
    setApplications((prev) => prev.map((a) => (a.id === app.id ? { ...a, status } : a)));
    const { error: updateError } = await supabase
      .from("applications")
      .update({ status })
      .eq("id", app.id);
    if (updateError) {
      setApplications((prev) => prev.map((a) => (a.id === app.id ? { ...a, status: previous } : a)));
      setActionError(`${updateError.message}. ${SETUP_HINT}`);
    }
  };

  const downloadResume = async (app: Application) => {
    setActionError(null);
    if (!app.resume_path) return;
    const { data, error: urlError } = await supabase.storage
      .from(RESUME_BUCKET)
      .createSignedUrl(app.resume_path, 60);
    if (urlError || !data) {
      setActionError(urlError?.message ?? "Couldn't open the resume.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const countFor = (status: ApplicationStatus | "all") =>
    status === "all" ? inProject.length : inProject.filter((a) => a.status === status).length;

  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        eyebrow="My Projects"
        title="Applicants"
        subtitle="Volunteers who applied to your projects. Review their answers and resumes, then approve or reject."
        backHref="/nonprofit/dashboard"
        backLabel="Back to my projects"
      />

      <div className="mx-auto max-w-7xl px-6 py-12">
        {error && (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>
        )}

        <div className="mb-6 flex flex-col gap-4 rounded-xl border border-[#E2E8F0] bg-white p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  statusFilter === s
                    ? "bg-[#114160] text-white"
                    : "bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
                }`}
              >
                {s === "all" ? "All" : STATUS_LABELS[s]} ({countFor(s)})
              </button>
            ))}
          </div>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm font-medium text-[#0F172A] outline-none focus:border-[#114160]"
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="h-96 animate-pulse rounded-xl bg-white" />
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#CBD5E1] bg-white py-20 text-center">
            <h2 className="text-lg font-semibold text-[#092130]">No projects yet</h2>
            <p className="mt-2 text-sm text-[#475569]">Create a project so volunteers can apply to it.</p>
            <Link
              href="/nonprofit/dashboard/edit/new"
              className="mt-6 rounded-md bg-[#114160] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#092130]"
            >
              + Create Project
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
            <aside className="w-full shrink-0 rounded-xl border border-[#E2E8F0] bg-white p-6 lg:sticky lg:top-24 lg:w-80">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, email, or project..."
                className="mb-4 w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
              />
              <ul className="-mx-2 space-y-1">
                {visible.map((app) => (
                  <li key={app.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(app.id)}
                      className={`w-full rounded-md border-l-4 px-3 py-3 text-left transition ${
                        selectedId === app.id
                          ? "border-[#4A0E99] bg-[#F8FAFC]"
                          : "border-transparent hover:bg-[#F8FAFC]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#092130] line-clamp-1">
                          {app.applicant_name || app.applicant_email || "Volunteer"}
                        </p>
                        <StatusBadge status={app.status} />
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-[#475569] line-clamp-1">
                        {projectTitles.get(app.project_id) ?? "Project"}
                      </p>
                    </button>
                  </li>
                ))}
                {visible.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-[#94A3B8]">No applicants here yet.</li>
                )}
              </ul>
            </aside>

            <section className="min-h-[28rem] flex-1 rounded-xl border border-[#E2E8F0] bg-white p-8">
              {!selected ? (
                <div className="flex h-full min-h-[24rem] flex-col items-center justify-center text-center">
                  <h3 className="text-lg font-semibold text-[#092130]">Select an applicant</h3>
                  <p className="mt-2 max-w-xs text-sm text-[#475569]">
                    Click a name in the list to view their answers and resume.
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#D3E6F2] text-xl font-bold text-[#114160]">
                        {(selected.applicant_name || selected.applicant_email || "V").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-[#092130]">
                          {selected.applicant_name || "Volunteer"}
                        </h2>
                        <p className="text-sm font-semibold text-[#114160]">
                          {projectTitles.get(selected.project_id) ?? "Project"}
                        </p>
                        {selected.applicant_email && (
                          <a href={`mailto:${selected.applicant_email}`} className="text-sm text-[#64748B] hover:underline">
                            {selected.applicant_email}
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={selected.status} />
                      <p className="mt-2 text-xs text-[#64748B]">
                        Applied {new Date(selected.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-[#E2E8F0] pt-6">
                    <h3 className="mb-4 text-lg font-bold text-[#092130]">Answers</h3>
                    {selected.answers?.length ? (
                      <div className="space-y-4">
                        {selected.answers.map((answer, i) => (
                          <div key={i} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                            <p className="mb-2 text-sm font-semibold text-[#092130]">{answer.q}</p>
                            <p className="whitespace-pre-line text-sm leading-6 text-[#475569]">{answer.a}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm italic text-[#94A3B8]">No answers recorded.</p>
                    )}
                  </div>

                  {actionError && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</div>
                  )}

                  <div className="flex flex-wrap gap-3 border-t border-[#E2E8F0] pt-6">
                    <button
                      type="button"
                      disabled={selected.status === "approved"}
                      onClick={() => updateStatus(selected, "approved")}
                      className="flex-1 rounded-md bg-[#114160] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#092130] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={selected.status === "rejected"}
                      onClick={() => updateStatus(selected, "rejected")}
                      className="flex-1 rounded-md border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={!selected.resume_path}
                      onClick={() => downloadResume(selected)}
                      className="flex-1 rounded-md border border-[#114160] bg-white px-5 py-2.5 text-sm font-semibold text-[#114160] transition hover:bg-[#D3E6F2] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Download Resume
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
