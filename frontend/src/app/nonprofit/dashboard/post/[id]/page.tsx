"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { useAuth } from "@/components/auth/AuthProvider";
import PageHeader from "@/components/layout/PageHeader";
import ProjectDetail from "@/components/projects/ProjectDetail";
import type { Project } from "@/lib/projects";

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-800",
  Draft: "bg-slate-100 text-slate-600",
  Closed: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  Active: "Live",
  Draft: "Draft",
  Closed: "Completed",
};

export default function NonprofitProjectPreview() {
  const params = useParams();
  const postId = params.id as string;
  const { user } = useAuth();
  const userId = user?.id;

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!userId) return;
    const fetchProject = async () => {
      const { data } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .eq("user_id", userId)
        .maybeSingle();

      setProject(data as Project | null);
      setLoading(false);
    };

    void fetchProject();
  }, [postId, userId]);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#F8FAFC]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#114160] border-t-transparent" />
      </div>
    );
  }

  if (!project) {
    return (
      <main className="min-h-screen bg-[#F8FAFC]">
        <PageHeader
          title="Project not found"
          subtitle="This project doesn't exist or belongs to another organization."
          backHref="/nonprofit/dashboard"
          backLabel="Back to my projects"
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        eyebrow={project.organization_name || "My Projects"}
        title={project.title}
        subtitle={project.content}
        backHref="/nonprofit/dashboard"
        backLabel="Back to my projects"
        actions={
          <Link
            href={`/nonprofit/dashboard/edit/${project.id}`}
            className="inline-flex items-center justify-center rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-[#114160] transition hover:bg-[#D3E6F2]"
          >
            Edit Project
          </Link>
        }
      />
      <ProjectDetail
        project={project}
        action={
          <div className="flex items-center justify-between rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
            <span className="text-sm font-semibold text-[#092130]">Status</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                STATUS_STYLES[project.status] ?? STATUS_STYLES.Draft
              }`}
            >
              {STATUS_LABELS[project.status] ?? project.status}
            </span>
          </div>
        }
      />
    </main>
  );
}
