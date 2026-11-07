"use client";

import { useEffect, useMemo, useState } from "react";
import ProjectCard from "@/components/projects/ProjectCard";
import ProjectFilters, { Filters } from "@/components/projects/ProjectFilters";
import { useAuth } from "@/components/auth/AuthProvider";
import supabase from "@/lib/supabase";
import type { ApplicationStatus } from "@/lib/applications";
import { getSkills, Project } from "@/lib/projects";

type Sort = "newest" | "oldest";

const PAGE_SIZE = 12;
const FILTERS_STATE_KEY = "hsf-project-browser-filters-v1";
const DEFAULT_FILTERS: Filters = { search: "", status: "Active", causes: [], skills: [] };

function uniqueSorted(values: (string | null | undefined)[]) {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueSorted(value.map((entry) => String(entry || "")));
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return uniqueSorted(parsed.map((entry) => String(entry || "")));
      }
    } catch {
      return uniqueSorted(value.split(","));
    }
  }
  return [];
}

function isDefaultFilters(filters: Filters) {
  return (
    filters.search.trim() === "" &&
    filters.status === "Active" &&
    filters.causes.length === 0 &&
    filters.skills.length === 0
  );
}

function readStoredBrowserState(): {
  filters: Filters;
  sort: Sort;
  page: number;
  useMyInterests: boolean;
} {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return { filters: DEFAULT_FILTERS, sort: "newest", page: 0, useMyInterests: false };
  }
  const stored = window.sessionStorage.getItem(FILTERS_STATE_KEY);
  if (!stored) {
    return { filters: DEFAULT_FILTERS, sort: "newest", page: 0, useMyInterests: false };
  }
  try {
    const parsed = JSON.parse(stored) as {
      filters?: Filters;
      sort?: Sort;
      page?: number;
      useMyInterests?: boolean;
    };
    return {
      filters: parsed.filters
        ? {
            search: parsed.filters.search ?? "",
            status: parsed.filters.status ?? "Active",
            causes: Array.isArray(parsed.filters.causes) ? parsed.filters.causes : [],
            skills: Array.isArray(parsed.filters.skills) ? parsed.filters.skills : [],
          }
        : DEFAULT_FILTERS,
      sort: parsed.sort === "oldest" ? "oldest" : "newest",
      page: typeof parsed.page === "number" && parsed.page >= 0 ? parsed.page : 0,
      useMyInterests: typeof parsed.useMyInterests === "boolean" ? parsed.useMyInterests : false,
    };
  } catch {
    window.sessionStorage.removeItem(FILTERS_STATE_KEY);
    return { filters: DEFAULT_FILTERS, sort: "newest", page: 0, useMyInterests: false };
  }
}

export default function ProjectBrowser({ projects }: { projects: Project[] }) {
  const { user, role, loading: authLoading } = useAuth();
  const userId = user?.id;
  const initialStoredState = readStoredBrowserState();
  const [filters, setFilters] = useState<Filters>(initialStoredState.filters);
  const [sort, setSort] = useState<Sort>(initialStoredState.sort);
  const [page, setPage] = useState(initialStoredState.page);
  const [savedInterests, setSavedInterests] = useState<string[]>([]);
  const [useMyInterests, setUseMyInterests] = useState(initialStoredState.useMyInterests);
  const [visible, setVisible] = useState<Project[]>(projects.slice(0, PAGE_SIZE));
  const [hasNextPage, setHasNextPage] = useState(projects.length > PAGE_SIZE);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [applicationState, setApplicationState] = useState<{
    userId: string;
    statuses: Record<string, ApplicationStatus>;
    error: boolean;
  } | null>(null);
  const [applicationRetry, setApplicationRetry] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    window.sessionStorage.setItem(
      FILTERS_STATE_KEY,
      JSON.stringify({ filters, sort, page, useMyInterests })
    );
  }, [filters, sort, page, useMyInterests]);

  useEffect(() => {
    if (authLoading || !userId || role !== "volunteer") return;

    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (cancelled || !data) return;

      const profile = data as Record<string, unknown>;
      const interests = uniqueSorted([
        ...parseStringList(profile.cause_areas),
        ...parseStringList(profile.cause_interests),
        ...parseStringList(profile.interests),
        ...parseStringList(profile.interest_areas),
        ...parseStringList(profile.preferred_causes),
      ]);
      setSavedInterests(interests);
      if (interests.length === 0) setUseMyInterests(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, role]);

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
    const refresh = () => {
      void load();
    };
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [userId, role, authLoading, applicationRetry]);

  const ownApplications = !authLoading && role === "volunteer" && applicationState?.userId === userId
    ? applicationState : null;
  const checkingApplications = authLoading || (!!userId && role === "volunteer" && !ownApplications);

  const causeOptions = useMemo(
    () => uniqueSorted([...projects.map((p) => p.cause), ...visible.map((p) => p.cause)]),
    [projects, visible]
  );
  const skillOptions = useMemo(
    () => uniqueSorted([...projects.flatMap((p) => getSkills(p)), ...visible.flatMap((p) => getSkills(p))]),
    [projects, visible]
  );

  useEffect(() => {
    let cancelled = false;
    const selectedCauses = uniqueSorted([
      ...filters.causes,
      ...(useMyInterests ? savedInterests : []),
    ]);

    const args = {
      p_keyword: filters.search.trim() || null,
      p_status: filters.status.trim() || null,
      p_tech_stack: filters.skills.length > 0 ? filters.skills : null,
      p_causes: selectedCauses.length > 0 ? selectedCauses : null,
      p_limit: PAGE_SIZE + 1,
      p_offset: page * PAGE_SIZE,
    };

    const search = async () => {
      setLoadingProjects(true);
      setProjectsError(false);

      const run = async (withCauses: boolean) => {
        const withoutCauses = {
          p_keyword: args.p_keyword,
          p_status: args.p_status,
          p_tech_stack: args.p_tech_stack,
          p_limit: args.p_limit,
          p_offset: args.p_offset,
        };
        return withCauses
          ? supabase.rpc("search_projects", args)
          : supabase.rpc("search_projects", withoutCauses);
      };

      let response = await run(true);
      let usedCauseFilterInRpc = true;

      if (
        response.error &&
        typeof response.error.message === "string" &&
        response.error.message.includes("search_projects") &&
        response.error.message.includes("function")
      ) {
        response = await run(false);
        usedCauseFilterInRpc = false;
      }

      if (cancelled) return;

      if (response.error) {
        setProjectsError(true);
        setLoadingProjects(false);
        return;
      }

      let rows = (response.data as Project[] | null) ?? [];
      if (!usedCauseFilterInRpc && selectedCauses.length > 0) {
        rows = rows.filter((project) => selectedCauses.includes(project.cause?.trim() ?? ""));
      }
      setVisible(rows.slice(0, PAGE_SIZE));
      setHasNextPage(rows.length > PAGE_SIZE);
      setLoadingProjects(false);
    };

    void search();
    return () => {
      cancelled = true;
    };
  }, [filters, page, retry, useMyInterests, savedInterests]);

  const sortedVisible = useMemo(() => {
    return [...visible].sort((a, b) => {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sort === "newest" ? diff : -diff;
    });
  }, [visible, sort]);

  const onFiltersChange = (next: Filters) => {
    setFilters(next);
    setPage(0);
    if (isDefaultFilters(next)) {
      setUseMyInterests(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-72">
        <ProjectFilters
          filters={filters}
          onChange={onFiltersChange}
          causeOptions={causeOptions}
          skillOptions={skillOptions}
          canUseMyInterests={!authLoading && role === "volunteer"}
          useMyInterests={useMyInterests}
          onToggleUseMyInterests={() => {
            if (savedInterests.length === 0) return;
            setUseMyInterests((value) => !value);
            setPage(0);
          }}
          savedInterests={savedInterests}
        />
      </aside>

      <div className="flex-1">
        {ownApplications?.error && (
          <div role="alert" className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Couldn&apos;t load your application statuses. You can still view project details.
            <button type="button" onClick={() => setApplicationRetry((value) => value + 1)} className="ml-2 font-semibold underline">
              Retry
            </button>
          </div>
        )}

        {projectsError && (
          <div role="alert" className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Couldn&apos;t load projects for the selected filters.
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-2 font-semibold underline">
              Retry
            </button>
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-[#092130]">
              {loadingProjects ? "Loading projects..." : `${sortedVisible.length} ${sortedVisible.length === 1 ? "Project" : "Projects"} Found`}
            </h2>
            {useMyInterests && savedInterests.length > 0 && (
              <p className="mt-1 text-xs text-[#475569]">Filtering with your saved interests: {savedInterests.join(", ")}</p>
            )}
          </div>
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

        {loadingProjects ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-xl bg-white" />
            ))}
          </div>
        ) : sortedVisible.length === 0 ? (
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
          <>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {sortedVisible.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  applicationStatus={ownApplications?.statuses[project.id]}
                  checkingApplication={checkingApplications}
                  applicationError={ownApplications?.error}
                />
              ))}
            </div>

            {(page > 0 || hasNextPage) && (
              <div className="mt-8 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                  disabled={page === 0}
                  className="rounded-md border border-[#CBD5E1] bg-white px-3 py-1.5 text-sm font-semibold text-[#114160] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((value) => value + 1)}
                  disabled={!hasNextPage}
                  className="rounded-md border border-[#114160] bg-[#114160] px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
