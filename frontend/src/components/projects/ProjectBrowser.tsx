"use client";

import { useMemo, useState } from "react";
import ProjectCard from "@/components/projects/ProjectCard";
import ProjectFilters, { Filters } from "@/components/projects/ProjectFilters";
import { getSkills, Project } from "@/lib/projects";

type Sort = "newest" | "oldest";

function uniqueSorted(values: (string | null | undefined)[]) {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))].sort((a, b) =>
    a.localeCompare(b)
  );
}

export default function ProjectBrowser({ projects }: { projects: Project[] }) {
  const [filters, setFilters] = useState<Filters>({ search: "", causes: [], skills: [] });
  const [sort, setSort] = useState<Sort>("newest");

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
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
