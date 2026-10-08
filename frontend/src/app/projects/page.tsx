import supabase from "@/lib/supabase";
import PageHeader from "@/components/layout/PageHeader";
import ProjectBrowser from "@/components/projects/ProjectBrowser";
import type { Project } from "@/lib/projects";

export const revalidate = 0;

export default async function ProjectsPage() {
  const { data: posts, error } = await supabase
    .from("posts")
    .select("*")
    .eq("status", "Active")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching projects:", error);
  }

  const projects: Project[] = posts || [];

  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        title="Find a Project"
        subtitle="Use your skills to support nonprofits and causes you care about. Browse our open volunteer opportunities below."
      />

      <div className="mx-auto max-w-7xl px-6 py-12">
        {error && (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Couldn&apos;t load projects right now. Please refresh the page.
          </div>
        )}
        <ProjectBrowser projects={projects} />
      </div>
    </main>
  );
}
