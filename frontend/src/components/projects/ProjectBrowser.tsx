"use client";

import { useEffect, useMemo, useState } from "react";
import ProjectCard from "@/components/projects/ProjectCard";
import ProjectFilters, { Filters } from "@/components/projects/ProjectFilters";
import { useAuth } from "@/components/auth/AuthProvider";
import supabase from "@/lib/supabase";
import type { ApplicationStatus } from "@/lib/applications";
import { getSkills, Project } from "@/lib/projects";

type Sort = "newest" | "oldest";

function uniqueSorted(values: (string | null | undefined)[]) {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))].sort((a, b) =>
    a.localeCompare(b)
  );
}

export default function ProjectBrowser({ projects }: { projects: Project[] }) {
  const { user, role, loading: authLoading } = useAuth();
  const userId = user?.id;
  const [filters, setFilters] = useState<Filters>({ search: "", causes: [], skills: [] });
  const [sort, setSort] = useState<Sort>("newest");
  const [applicationState, setApplicationState] = useState<{
    userId: string;
    statuses: Record<string, ApplicationStatus>;
    error: boolean;
  } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (authLoading || !userId || role !== "volunteer") return;
    let cancelled = false;
    let latestRequest = 0;
    const load = async () => {
      const request = ++latestRequest;
      try {
        const { data, error } = await supabase
          .from("applications")
          .select("project_id, status")
          .eq("volunteer_id", userId);
        if (error) throw error;
        const statuses: Record<string, ApplicationStatus> = {};
        for (const application of data ?? []) {
          if (["pending", "approved", "rejected"].includes(application.status)) {
            statuses[application.project_id] = application.status as ApplicationStatus;
          }
        }
        if (!cancelled && request === latestRequest) {
          setApplicationState({ userId, statuses, error: false });
        }
      } catch {
        if (!cancelled && request === latestRequest) {
          setApplicationState({ userId, statuses: {}, error: true });
        }
      }
    };
    void load();
    // Refresh decisions when returning from another browser tab or window.
    const refresh = () => { void load(); };
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [userId, role, authLoading, retry]);

  const ownApplications = !authLoading && role === "volunteer" && applicationState?.userId === userId
    ? applicationState : null;
  const checkingApplications = authLoading || (!!userId && role === "volunteer" && !ownApplications);

  const causeOptions = useMemo(() => uniqueSorted(projects.map((p) => p.cause)), [projects]);
  const skillOptions = useMemo(() => uniqueSorted(projects.flatMap((p) => getSkills(p))), [projects]);

  const visible = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    const matches = projects.filter((p) => {
      const skills = getSkills(p);
      if (filters.causes.length > 0 && !filters.causes.includes(p.cause?.trim() ?? "")) return false;
      if (filters.skills.length > 0 && !filters.skills.some((s) => skills.includes(s))) return false;
      if (!term) return true;
      return [p.title, p.content, p.organization_name, p.cause, p.location, ...skills]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
    return matches.sort((a, b) => {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sort === "newest" ? diff : -diff;
    });
  }, [projects, filters, sort]);

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-72">
        <ProjectFilters
          filters={filters}
          onChange={setFilters}
          causeOptions={causeOptions}
          skillOptions={skillOptions}
        />
      </aside>

      <div className="flex-1">
        {ownApplications?.error && (
          <div role="alert" className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Couldn&apos;t load your application statuses. You can still view project details.
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-2 font-semibold underline">
              Retry
            </button>
          </div>
        )}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#092130]">
            {visible.length} {visible.length === 1 ? "Project" : "Projects"} Found
          </h2>
          <label className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#475569]">Sort by:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="rounded-md border border-[#CBD5E1] bg-white px-3 py-1.5 text-sm font-medium text-[#0F172A] outline-none focus:border-[#114160]"
            >
              <option value="newest">Most Recent</option>
              <option value="oldest">Oldest</option>
            </select>
          </label>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#CBD5E1] bg-white py-24 text-center">
            <p className="text-lg font-medium text-[#092130]">
              {projects.length === 0 ? "No active projects right now." : "No projects match your filters."}
            </p>
            <p className="mt-2 text-sm text-[#475569]">
              {projects.length === 0
                ? "Please check back later for new opportunities."
                : "Try a different search or clear some filters."}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                applicationStatus={ownApplications?.statuses[project.id]}
                checkingApplication={checkingApplications}
                applicationError={ownApplications?.error}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
