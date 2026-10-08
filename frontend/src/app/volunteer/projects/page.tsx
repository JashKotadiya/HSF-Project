"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { useAuth } from "@/components/auth/AuthProvider";
import PageHeader from "@/components/layout/PageHeader";
import StatusBadge from "@/components/applications/StatusBadge";
import type { Application } from "@/lib/applications";
import type { Project } from "@/lib/projects";

type MyApplication = Pick<Application, "id" | "project_id" | "status" | "created_at"> & {
  project?: Pick<Project, "id" | "title" | "organization_name" | "location" | "status">;
};

const SECTIONS = [
  { status: "approved", title: "Current projects", empty: "You haven't been approved for a project yet." },
  { status: "pending", title: "Applications under review", empty: "No applications waiting for a decision." },
  { status: "rejected", title: "Not selected", empty: "" },
] as const;

export default function VolunteerProjectsPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<MyApplication[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      const { data: apps, error: appsError } = await supabase
        .from("applications")
        .select("id, project_id, status, created_at")
        .eq("volunteer_id", userId)
        .order("created_at", { ascending: false });

      if (appsError) {
        setError(appsError.message);
        setLoading(false);
        return;
      }

      const projectIds = [...new Set((apps ?? []).map((a) => a.project_id))];
      const { data: projects } = projectIds.length
        ? await supabase
            .from("posts")
            .select("id, title, organization_name, location, status")
            .in("id", projectIds)
        : { data: [] };

      const byId = new Map((projects ?? []).map((p) => [p.id, p]));
      setApplications(
        (apps ?? []).map((a) => ({ ...(a as MyApplication), project: byId.get(a.project_id) }))
      );
      setLoading(false);
    };
    void load();
  }, [userId]);

  const counts = {
    approved: applications.filter((a) => a.status === "approved").length,
    pending: applications.filter((a) => a.status === "pending").length,
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        title="My Projects"
        subtitle="Projects you're part of and the applications you've sent."
        actions={
          <Link
            href="/projects"
            className="inline-flex items-center justify-center rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-[#114160] transition hover:bg-[#D3E6F2]"
          >
            Browse Projects
          </Link>
        }
      >
        <div className="mt-10 grid grid-cols-2 gap-4 md:w-1/2">
          {[
            { label: "Current projects", value: counts.approved },
            { label: "Under review", value: counts.pending },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/15 bg-white/10 px-5 py-4">
              <p className="text-3xl font-extrabold">{loading ? "–" : s.value}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-[#D3E6F2]">{s.label}</p>
            </div>
          ))}
        </div>
      </PageHeader>

      <div className="mx-auto max-w-7xl space-y-10 px-6 py-12">
        {error && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Couldn&apos;t load your applications: {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-white" />
            ))}
          </div>
        ) : applications.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#CBD5E1] bg-white py-20 text-center">
            <h2 className="text-lg font-semibold text-[#092130]">You haven&apos;t applied to any projects yet</h2>
            <p className="mt-2 max-w-md text-sm text-[#475569]">
              Browse open opportunities and apply to the ones that match your skills.
            </p>
            <Link
              href="/projects"
              className="mt-6 rounded-md bg-[#114160] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#092130]"
            >
              Browse Projects
            </Link>
          </div>
        ) : (
          SECTIONS.map((section) => {
            const items = applications.filter((a) => a.status === section.status);
            if (items.length === 0 && !section.empty) return null;
            return (
              <section key={section.status}>
                <h2 className="mb-4 text-lg font-bold text-[#475569]">
                  {section.title} ({items.length})
                </h2>
                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[#CBD5E1] bg-white px-6 py-8 text-center text-sm text-[#94A3B8]">
                    {section.empty}
                  </p>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((app) => (
                      <ApplicationCard key={app.id} app={app} />
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}

function ApplicationCard({ app }: { app: MyApplication }) {
  const project = app.project;
  const isOpen = project?.status === "Active";

  return (
    <div className="flex flex-col rounded-xl border border-[#E2E8F0] bg-white transition hover:shadow-md">
      <div className="flex-1 p-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] line-clamp-1">
            {project?.organization_name || "Partner Organization"}
          </span>
          <StatusBadge status={app.status} />
        </div>
        <h3 className="mb-2 text-xl font-bold text-[#092130] line-clamp-2">
          {project?.title || "Project no longer available"}
        </h3>
        <p className="text-xs text-[#64748B]">
          Applied {new Date(app.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {project?.location ? ` · ${project.location}` : ""}
        </p>
      </div>
      <div className="flex items-center justify-between border-t border-[#E2E8F0] bg-[#F8FAFC] px-6 py-4">
        <span className="text-xs font-medium text-[#64748B]">
          {project ? (isOpen ? "Open project" : "Project closed") : "Removed"}
        </span>
        {project && isOpen && (
          <Link
            href={`/projects/${project.id}`}
            className="inline-flex items-center justify-center rounded-md bg-[#114160] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#092130]"
          >
            View Project
          </Link>
        )}
      </div>
    </div>
  );
}
