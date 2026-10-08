"use client";

import { useState } from "react";
import { getMilestones, getSkills, Project } from "@/lib/projects";

const TABS = ["Project details", "Project plan", "About the org"] as const;

function Section({ title, text }: { title: string; text?: string | null }) {
  if (!text?.trim()) return null;
  return (
    <div>
      <h3 className="mb-2 text-lg font-bold text-[#092130]">{title}</h3>
      <p className="whitespace-pre-line text-sm leading-7 text-[#475569]">{text}</p>
    </div>
  );
}

function Bullets({ text }: { text?: string | null }) {
  const lines = (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return <p className="text-sm italic text-[#94A3B8]">Not specified</p>;
  }
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-[#475569]">
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-xs font-medium text-[#475569]">
      {children}
    </span>
  );
}

/** Full project view; `action` is rendered in the sidebar (Apply, Edit, etc.). */
export default function ProjectDetail({
  project,
  action,
}: {
  project: Project;
  action?: React.ReactNode;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Project details");
  const skills = getSkills(project);
  const milestones = getMilestones(project);
  const orgName = project.organization_name || "Partner Organization";

  const hasDetails = [
    project.what_we_need,
    project.what_we_have_in_place,
    project.additional_details,
    project.how_this_will_help,
  ].some((t) => t?.trim());

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 rounded-xl border border-[#E2E8F0] bg-white">
          <div className="flex gap-6 overflow-x-auto border-b border-[#E2E8F0] px-6">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`-mb-px whitespace-nowrap border-b-2 py-4 text-sm font-semibold transition ${
                  tab === t
                    ? "border-[#114160] text-[#092130]"
                    : "border-transparent text-[#64748B] hover:text-[#092130]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="space-y-8 p-6">
            {tab === "Project details" &&
              (hasDetails ? (
                <>
                  <Section title="What we need" text={project.what_we_need} />
                  <Section title="What we have in place" text={project.what_we_have_in_place} />
                  <Section title="Additional details" text={project.additional_details} />
                  <Section title="How this will help" text={project.how_this_will_help} />
                </>
              ) : (
                <Section title="About this project" text={project.content || "No details provided yet."} />
              ))}

            {tab === "Project plan" &&
              (milestones.length === 0 ? (
                <p className="text-sm italic text-[#94A3B8]">No milestones defined yet.</p>
              ) : (
                <ol className="relative space-y-8 border-l-2 border-[#D3E6F2] pl-8">
                  {milestones.map((m, idx) => (
                    <li key={idx} className="relative">
                      <span className="absolute -left-[45px] flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#114160] bg-white text-sm font-bold text-[#114160]">
                        {idx + 1}
                      </span>
                      <h3 className="mb-2 text-base font-bold text-[#092130]">{m.title}</h3>
                      {m.details && <Bullets text={m.details} />}
                    </li>
                  ))}
                </ol>
              ))}

            {tab === "About the org" && (
              <>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#64748B]">Cause</p>
                    {project.cause ? <Chip>{project.cause}</Chip> : <p className="text-sm italic text-[#94A3B8]">Not specified</p>}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#64748B]">Posted by</p>
                    <p className="text-sm font-semibold text-[#092130]">{project.poster_name || orgName}</p>
                  </div>
                </div>
                <Section title="Our mission" text={project.org_mission} />
                {project.org_fun_fact?.trim() && (
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#EDE9FF] p-5">
                    <h3 className="mb-2 text-sm font-bold text-[#4A0E99]">Fun fact</h3>
                    <p className="whitespace-pre-line text-sm text-[#092130]">{project.org_fun_fact}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <aside className="w-full shrink-0 space-y-6 lg:sticky lg:top-24 lg:w-80">
          <div className="space-y-5 rounded-xl border border-[#E2E8F0] bg-white p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#D3E6F2] text-lg font-bold text-[#114160]">
                {orgName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-[#092130]">{orgName}</p>
                <p className="text-sm text-[#64748B]">{project.location || "Remote"}</p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#64748B]">Skills needed</p>
              <div className="flex flex-wrap gap-2">
                {skills.length > 0 ? skills.map((s) => <Chip key={s}>{s}</Chip>) : <Chip>General Support</Chip>}
              </div>
            </div>

            <p className="text-sm text-[#64748B]">
              Posted {new Date(project.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>

            {action}
          </div>

          <div className="space-y-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-6">
            <h3 className="text-base font-bold text-[#114160]">The right volunteer</h3>
            <div>
              <p className="mb-2 text-sm font-semibold text-[#092130]">Skills & experience</p>
              <Bullets text={project.volunteer_experience} />
            </div>
            <div className="border-t border-[#E2E8F0] pt-4">
              <p className="mb-2 text-sm font-semibold text-[#092130]">Availability</p>
              <Bullets text={project.volunteer_availability} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
