"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProjectCard from "@/components/projects/ProjectCard";
import { useAuth } from "@/components/auth/AuthProvider";
import supabase from "@/lib/supabase";
import type { ApplicationStatus } from "@/lib/applications";
import {
  RECOMMENDATION_PAGE_SIZE,
  type RecommendationSignals,
  type RecommendedProject,
} from "@/lib/recommendations";

export default function RecommendedProjects({
  applicationStatuses,
  checkingApplications,
  applicationError,
}: {
  applicationStatuses?: Record<string, ApplicationStatus>;
  checkingApplications?: boolean;
  applicationError?: boolean;
}) {
  const { user, role, loading: authLoading } = useAuth();
  const userId = user?.id;
  const enabled = !authLoading && role === "volunteer" && !!userId;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    userId: string;
    rows: RecommendedProject[];
    signals: RecommendationSignals | null;
    loading: boolean;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    let latest = 0;
    const load = async () => {
      const request = ++latest;
      setState((current) =>
        current?.userId === userId
          ? { ...current, loading: true, error: null }
          : { userId, rows: [], signals: null, loading: true, error: null },
      );
      try {
        const [recommendations, signals] = await Promise.all([
          supabase.rpc("recommend_projects", {
            p_limit: RECOMMENDATION_PAGE_SIZE,
            p_offset: 0,
          }),
          supabase.rpc("get_my_recommendation_signals"),
        ]);
        if (recommendations.error) throw recommendations.error;
        if (signals.error) throw signals.error;
        if (cancelled || request !== latest) return;
        const signalRow = Array.isArray(signals.data) ? signals.data[0] : signals.data;
        setState({
          userId,
          rows: ((recommendations.data as RecommendedProject[] | null) ?? []).map((row) => ({
            ...row,
            score: Number(row.score ?? 0),
            cause_score: Number(row.cause_score ?? 0),
            skill_score: Number(row.skill_score ?? 0),
            peer_score: Number(row.peer_score ?? 0),
            reasons: Array.isArray(row.reasons) ? row.reasons : [],
          })),
          signals: (signalRow as RecommendationSignals | null) ?? null,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (cancelled || request !== latest) return;
        const missing =
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error.code === "PGRST202" || error.code === "42883");
        setState({
          userId,
          rows: [],
          signals: null,
          loading: false,
          error: missing
            ? "Recommendations are not available yet. Please try again after the matching SQL is applied."
            : "Couldn't load recommendations. Please try again.",
        });
      }
    };
    void load();
    const refresh = () => {
      const visible =
        typeof document === "undefined" || document.visibilityState === "visible";
      if (visible) void load();
    };
    window.addEventListener("focus", refresh);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", refresh);
    }
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", refresh);
      }
    };
  }, [enabled, userId, revision]);

  if (!enabled) return null;
  const current = state?.userId === userId ? state : null;
  const loading = !current || current.loading;
  const rows = current?.rows ?? [];
  const signals = current?.signals;
  const error = current?.error;

  return (
    <section aria-label="Recommended for you" className="mb-10 rounded-xl border border-[#E2E8F0] bg-white p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#092130]">Recommended for you</h2>
          <p className="mt-1 text-sm text-[#475569]">
            Ranked with your interests, skills, and similar-profile participation — not ordinary search results.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRevision((value) => value + 1)}
          className="text-sm font-semibold text-[#114160] underline"
        >
          Refresh
        </button>
      </div>

      {signals?.cold_start && (
        <div className="mb-4 rounded-md border border-[#DBEAFE] bg-[#EFF6FF] p-3 text-sm text-[#1E3A8A]">
          Add skills and cause interests on your{" "}
          <Link href="/volunteer/profile" className="font-semibold underline">
            profile
          </Link>{" "}
          so recommendations can personalize beyond the general Active listing order.
        </div>
      )}

      {loading && <p role="status" className="text-sm text-[#64748B]">Loading recommendations...</p>}

      {error && (
        <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{error}</p>
          <button type="button" onClick={() => setRevision((value) => value + 1)} className="mt-2 font-semibold underline">
            Retry recommendations
          </button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-[#475569]">
          No personalized openings right now. Browse all Active projects below, or update your profile interests.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((project) => (
            <div key={project.id} className="flex flex-col gap-2">
              <ProjectCard
                project={project}
                applicationStatus={applicationStatuses?.[project.id]}
                checkingApplication={checkingApplications}
                applicationError={applicationError}
              />
              <ul className="space-y-1 px-1">
                {project.reasons.map((reason) => (
                  <li key={reason} className="text-xs text-[#475569]">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
