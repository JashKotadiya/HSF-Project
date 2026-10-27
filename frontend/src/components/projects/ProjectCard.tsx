import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { getSkills, Project } from "@/lib/projects";
import StatusBadge from "@/components/applications/StatusBadge";
import type { ApplicationStatus } from "@/lib/applications";

export default function ProjectCard({ project, applicationStatus, checkingApplication, applicationError }: {
  project: Project;
  applicationStatus?: ApplicationStatus;
  checkingApplication?: boolean;
  applicationError?: boolean;
}) {
  const { id, title, content, cause, location, created_at } = project;
  const organizationName = project.organization_name || "Partner Organization";
  const skills = getSkills(project);

  const timeAgo = created_at
    ? formatDistanceToNow(new Date(created_at), { addSuffix: true })
    : "Recently";

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white transition hover:shadow-md">
      <div className="flex-1 p-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {project.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={project.logo_url} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] line-clamp-1">
              {organizationName}
            </span>
          </div>
          <span className="shrink-0 text-xs font-medium text-[#64748B]">{timeAgo}</span>
        </div>

        <h3 className="mb-2 text-xl font-bold text-[#092130] line-clamp-2">{title}</h3>

        {applicationStatus && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs font-medium text-[#475569]">Your application</span>
            <StatusBadge status={applicationStatus} />
          </div>
        )}
        {checkingApplication && (
          <p role="status" className="mb-4 text-xs text-[#64748B]">Checking your application...</p>
        )}

        <p className="mb-4 text-sm leading-relaxed text-[#475569] line-clamp-3">
          {content || "No description provided yet."}
        </p>

        <div className="flex flex-wrap gap-2">
          {skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-xs font-medium text-[#475569]"
            >
              {skill}
            </span>
          ))}
          {skills.length > 3 && (
            <span className="inline-flex items-center rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-xs font-medium text-[#475569]">
              +{skills.length - 3} more
            </span>
          )}
          {cause && (
            <span className="inline-flex items-center rounded-full border border-[#D3E6F2] bg-[#F8FAFC] px-2.5 py-0.5 text-xs font-medium text-[#114160]">
              {cause}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[#E2E8F0] bg-[#F8FAFC] px-6 py-4">
        <span className="text-xs font-medium text-[#64748B]">{location || "Remote"}</span>
        <Link
          href={applicationStatus ? "/volunteer/projects" : `/projects/${id}`}
          className="inline-flex items-center justify-center rounded-md bg-[#114160] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#092130]"
        >
          {applicationStatus ? "View My Application" : checkingApplication || applicationError ? "View Details" : "View & Apply"}
        </Link>
      </div>
    </div>
  );
}
