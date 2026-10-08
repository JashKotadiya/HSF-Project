import supabase from "@/lib/supabase";
import ApplicationForm from "@/components/application/ApplicationForm";
import PageHeader from "@/components/layout/PageHeader";

export const revalidate = 0;

export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: project } = await supabase
    .from("posts")
    .select("id, title, content, organization_name")
    .eq("id", id)
    .eq("status", "Active")
    .maybeSingle();

  if (!project) {
    return (
      <main className="min-h-screen bg-[#F8FAFC]">
        <PageHeader
          title="This project isn't accepting applications"
          subtitle="It may have been closed or removed."
          backHref="/projects"
          backLabel="Back to projects"
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        eyebrow={project.organization_name || "Apply to Project"}
        title={`Apply: ${project.title}`}
        subtitle="Answer a few short questions and upload your resume."
        backHref={`/projects/${id}`}
        backLabel="Back to project"
      />
      <div className="mx-auto max-w-4xl px-6 py-12">
        <ApplicationForm
          projectId={id}
          projectTitle={project.title}
          projectSummary={project.content ?? undefined}
        />
      </div>
    </main>
  );
}
