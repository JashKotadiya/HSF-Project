import supabase from "@/lib/supabase";
import PageHeader from "@/components/layout/PageHeader";
import ProjectDetail from "@/components/projects/ProjectDetail";
import ApplyAction from "@/components/applications/ApplyAction";
import type { Project } from "@/lib/projects";

export const revalidate = 0;

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await supabase
    .from("posts")
    .select("*")
    .eq("id", id)
    .eq("status", "Active")
    .maybeSingle();
  const project = data as Project | null;

  if (!project) {
    return (
      <main className="min-h-screen bg-[#F8FAFC]">
        <PageHeader title="Project not found" subtitle="This project may have been closed or removed." backHref="/projects" backLabel="Back to projects" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        eyebrow={project.organization_name || "Partner Organization"}
        title={project.title}
        subtitle={project.content}
        backHref="/projects"
        backLabel="Back to projects"
      />
      <ProjectDetail project={project} action={<ApplyAction projectId={project.id} />} />
    </main>
  );
}
