/** Row shape of the `posts` table, which backs every project in the app. */
export interface Project {
  id: string;
  user_id?: string;
  title: string;
  content?: string | null;
  status: "Draft" | "Active" | "Closed" | string;
  created_at: string;
  poster_name?: string | null;
  organization_name?: string | null;
  location?: string | null;
  cause?: string | null;
  skills_needed?: unknown;
  what_we_need?: string | null;
  additional_details?: string | null;
  what_we_have_in_place?: string | null;
  how_this_will_help?: string | null;
  volunteer_experience?: string | null;
  volunteer_availability?: string | null;
  milestones?: unknown;
  org_mission?: string | null;
  org_fun_fact?: string | null;
}

export interface Milestone {
  title: string;
  details?: string;
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch {
      return [value];
    }
  }
  return [];
}

export function getSkills(project: Pick<Project, "skills_needed">): string[] {
  return parseJsonArray(project.skills_needed)
    .map((s) => String(s).trim())
    .filter(Boolean);
}

export function getMilestones(project: Pick<Project, "milestones">): Milestone[] {
  return parseJsonArray(project.milestones)
    .map((m) =>
      typeof m === "string" ? { title: m } : (m as Milestone)
    )
    .filter((m) => m && m.title && m.title.trim());
}
