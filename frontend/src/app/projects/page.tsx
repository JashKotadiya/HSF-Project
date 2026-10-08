import supabase from "@/lib/supabase";
import ProjectCard, { ProjectType } from "@/components/projects/ProjectCard";
import ProjectFilters from "@/components/projects/ProjectFilters";

// Make this a dynamic server component if we want fresh data, or revalidate often
export const revalidate = 0;

export default async function ProjectsPage() {
  // Fetch active projects
  const { data: posts, error } = await supabase
    .from("posts")
    .select("*")
    .eq("status", "Active")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching projects:", error);
  }

  const projects: ProjectType[] = posts || [];

  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#092130] via-[#114160] to-[#4A0E99] px-6 py-16 text-white">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Find a Project
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/80">
            Use your skills to support nonprofits and causes you care about.
            Browse our open volunteer opportunities below.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          {/* Sidebar Filters */}
          <aside className="w-full shrink-0 lg:sticky lg:top-8 lg:w-72">
            <ProjectFilters />
          </aside>

          {/* Project List */}
          <div className="flex-1">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#092130]">
                {projects.length} {projects.length === 1 ? "Project" : "Projects"} Found
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#475569]">Sort by:</span>
                <select className="rounded-md border border-[#CBD5E1] bg-white px-3 py-1.5 text-sm font-medium text-[#0F172A] outline-none focus:border-[#114160]">
                  <option>Most Recent</option>
                  <option>Urgent Needs</option>
                </select>
              </div>
            </div>

            {projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#CBD5E1] bg-white py-24 text-center">
                <p className="text-lg font-medium text-[#092130]">No active projects right now.</p>
                <p className="mt-2 text-sm text-[#475569]">Please check back later for new opportunities.</p>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {projects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
