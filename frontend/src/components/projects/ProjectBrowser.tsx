"use client";

import { useEffect, useState } from "react";
import ProjectCard from "@/components/projects/ProjectCard";
import ProjectFilters, { Filters } from "@/components/projects/ProjectFilters";
import { useAuth } from "@/components/auth/AuthProvider";
import supabase from "@/lib/supabase";
import type { ApplicationStatus } from "@/lib/applications";
import { getSkills, Project } from "@/lib/projects";
import { stringList, useCauseCategories, useVolunteerInterests } from "@/lib/interests";

type Sort = "newest" | "oldest";

const PAGE_SIZE = 12;
const FILTERS_STATE_KEY = "hsf-project-browser-filters-v2";
const DEFAULT_FILTERS: Filters = { search: "", status: "Active", causes: [], skills: [] };
type BrowserState = { scope: string; filters: Filters; sort: Sort; page: number; useMyInterests: boolean };
const defaultState = (scope: string): BrowserState => ({ scope, filters: DEFAULT_FILTERS, sort: "newest", page: 0, useMyInterests: false });

function uniqueSorted(values: (string | null | undefined)[]) {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function readStoredBrowserState(scope: string): BrowserState {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(`${FILTERS_STATE_KEY}:${scope}`) || "null");
    if (!parsed || typeof parsed !== "object") return defaultState(scope);
    return {
      scope,
      filters: {
        search: typeof parsed.filters?.search === "string" ? parsed.filters.search : "",
        status: ["Active", "Draft", "Closed", ""].includes(parsed.filters?.status) ? parsed.filters.status : "Active",
        causes: stringList(parsed.filters?.causes),
        skills: stringList(parsed.filters?.skills),
      },
      sort: parsed.sort === "oldest" ? "oldest" : "newest",
      page: Number.isSafeInteger(parsed.page) && parsed.page >= 0 && parsed.page <= 1000000 ? parsed.page : 0,
      useMyInterests: scope.startsWith("volunteer:") && parsed.useMyInterests === true,
    };
  } catch {
    return defaultState(scope);
  }
}

export default function ProjectBrowser({ projects }: { projects: Project[] }) {
  const { user, role, loading: authLoading } = useAuth();
  const userId = user?.id;
  const scope = authLoading ? "" : userId ? `${role}:${userId}` : "guest";
  const [browser, setBrowser] = useState<BrowserState>(() => defaultState(""));
  const ready = !!scope && browser.scope === scope;
  const { filters, sort, page } = ready ? browser : defaultState(scope);
  const interests = useVolunteerInterests(!authLoading && role === "volunteer" ? userId : undefined);
  const categories = useCauseCategories();
  const savedInterests = interests.interests;
  const useMyInterests = ready && role === "volunteer" && browser.useMyInterests;
  const [results, setResults] = useState<{ key: string; rows: Project[]; hasNext: boolean; error: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const [applicationState, setApplicationState] = useState<{
    userId: string;
    statuses: Record<string, ApplicationStatus>;
    error: boolean;
  } | null>(null);
  const [applicationRetry, setApplicationRetry] = useState(0);

  useEffect(() => {
    // Restore after hydration, and isolate persisted preferences per account.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize browser-only storage after hydration.
    if (scope) setBrowser(readStoredBrowserState(scope));
  }, [scope]);
  useEffect(() => {
    if (!ready) return;
    try { window.sessionStorage.setItem(`${FILTERS_STATE_KEY}:${scope}`, JSON.stringify(browser)); } catch { /* Browsing works without storage. */ }
  }, [browser, scope, ready]);

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

  const requestKey = JSON.stringify({
    scope, filters, sort, page, retry,
    causes: uniqueSorted([
      ...filters.causes,
      ...(useMyInterests ? savedInterests : []),
    ]),
  });
  const waitingForInterests = useMyInterests && interests.loading;
  const interestSearchError = useMyInterests && interests.error;
  useEffect(() => {
    if (!ready || waitingForInterests || interestSearchError) return;
    let cancelled = false;
    const request = JSON.parse(requestKey);
    const args = {
      p_keyword: request.filters.search.trim() || null,
      p_status: request.filters.status.trim() || null,
      p_tech_stack: request.filters.skills.length > 0 ? request.filters.skills : null,
      p_causes: request.causes.length > 0 ? request.causes : null,
      p_sort: request.sort,
      p_limit: PAGE_SIZE + 1,
      p_offset: request.page * PAGE_SIZE,
    };
    const search = async () => {
      try {
        const { data, error } = await supabase.rpc("search_projects", args);
        if (error) throw error;
        if (cancelled) return;
        const rows = (data as Project[] | null) ?? [];
        setResults({ key: requestKey, rows: rows.slice(0, PAGE_SIZE), hasNext: rows.length > PAGE_SIZE, error: false });
      } catch {
        if (!cancelled) setResults({ key: requestKey, rows: [], hasNext: false, error: true });
      }
    };
    void search();
    return () => { cancelled = true; };
  }, [requestKey, ready, waitingForInterests, interestSearchError]);
  const currentResults = ready && !waitingForInterests && !interestSearchError && results?.key === requestKey ? results : null;
  const visible = currentResults?.rows ?? [];
  const hasNextPage = currentResults?.hasNext ?? false;
  const projectsError = currentResults?.error ?? false;
  const loadingProjects = !interestSearchError && (!ready || waitingForInterests || !currentResults);
  const causeOptions = uniqueSorted([...categories.categories, ...projects.map(project => project.cause), ...visible.map(project => project.cause), ...filters.causes, ...savedInterests]);
  const skillOptions = uniqueSorted([...projects.flatMap(getSkills), ...visible.flatMap(getSkills), ...filters.skills]);

  const onFiltersChange = (next: Filters) => {
    setBrowser(current => ({ ...current, filters: next, page: 0 }));
  };

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-72">
        <ProjectFilters
          filters={filters}
          onChange={onFiltersChange}
          onClear={() => setBrowser(current => ({ ...current, filters: DEFAULT_FILTERS, page: 0, useMyInterests: false }))}
          causeOptions={causeOptions}
          skillOptions={skillOptions}
          canUseMyInterests={!authLoading && !!userId && role === "volunteer"}
          useMyInterests={useMyInterests}
          onToggleUseMyInterests={() => {
            setBrowser(current => ({ ...current, useMyInterests: !current.useMyInterests, page: 0 }));
          }}
          savedInterests={savedInterests}
          interestsLoading={interests.loading}
          interestsError={interests.error}
          onRetryInterests={interests.retry}
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
              {loadingProjects ? "Loading projects..." : projectsError || interestSearchError ? "Projects unavailable" : `${visible.length} ${visible.length === 1 ? "project" : "projects"} on this page`}
            </h2>
            {useMyInterests && savedInterests.length > 0 && (
              <p className="mt-1 text-xs text-[#475569]">Filtering with your saved interests: {savedInterests.join(", ")}</p>
            )}
          </div>
          <label className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#475569]">Sort by:</span>
            <select
              value={sort}
              onChange={(e) => setBrowser(current => ({ ...current, sort: e.target.value as Sort, page: 0 }))}
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
        ) : projectsError || interestSearchError ? null : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#CBD5E1] bg-white py-24 text-center">
            <p className="text-lg font-medium text-[#092130]">
              No projects match your filters.
            </p>
            <p className="mt-2 text-sm text-[#475569]">
              Try a different search or clear some filters.
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
        {!loadingProjects && (page > 0 || hasNextPage) && (
          <div className="mt-8 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setBrowser(current => ({ ...current, page: Math.max(0, current.page - 1) }))}
              disabled={page === 0}
              className="rounded-md border border-[#CBD5E1] bg-white px-3 py-1.5 text-sm font-semibold text-[#114160] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-[#475569]">Page {page + 1}</span>
            <button
              type="button"
              onClick={() => setBrowser(current => ({ ...current, page: current.page + 1 }))}
              disabled={!hasNextPage}
              className="rounded-md border border-[#114160] bg-[#114160] px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
