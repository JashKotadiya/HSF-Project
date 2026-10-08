import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export interface ProjectType {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  // Make these optional since they might not be in the DB yet
  organization_name?: string;
  skills_required?: string[];
  time_commitment?: string;
}

export default function ProjectCard({ project }: { project: ProjectType }) {
  const {
    id,
    title,
    description,
    organization_name = "Partner Organization",
    skills_required = ["General Support"],
    time_commitment = "Flexible",
    created_at,
  } = project;

  const timeAgo = created_at
    ? formatDistanceToNow(new Date(created_at), { addSuffix: true })
    : "Recently";

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white transition hover:shadow-md">
      <div className="flex-1 p-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
            {organization_name}
          </span>
          <span className="text-xs font-medium text-[#64748B]">{timeAgo}</span>
        </div>

        <h3 className="mb-2 text-xl font-bold text-[#092130] line-clamp-2">
          {title}
        </h3>

        <p className="mb-4 text-sm leading-relaxed text-[#475569] line-clamp-3">
          {description}
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {skills_required.slice(0, 3).map((skill, idx) => (
            <span
              key={idx}
              className="inline-flex items-center rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-xs font-medium text-[#475569]"
            >
              {skill}
            </span>
          ))}
          {skills_required.length > 3 && (
            <span className="inline-flex items-center rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-xs font-medium text-[#475569]">
              +{skills_required.length - 3} more
            </span>
          )}
          <span className="inline-flex items-center rounded-full border border-[#D3E6F2] bg-[#F8FAFC] px-2.5 py-0.5 text-xs font-medium text-[#114160]">
            {time_commitment}
          </span>
        </div>
      </div>

      <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] px-6 py-4 flex justify-end">
        <Link
          href={`/projects/${id}/apply`}
          className="inline-flex items-center justify-center rounded-md bg-[#114160] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#092130]"
        >
          View & Apply
        </Link>
      </div>
    </div>
  );
}
