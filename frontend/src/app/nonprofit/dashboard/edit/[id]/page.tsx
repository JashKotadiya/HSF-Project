"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { waitForClientSession } from "@/lib/auth-session";
import { normalizeRoleFromUser } from "@/lib/roles";

export default function EditPost() {
  const router = useRouter();
  const params = useParams();
  const postId = params.id as string;
  const isNew = postId === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"Draft" | "Active" | "Closed">("Draft");
  const [posterName, setPosterName] = useState("");

  const [orgName, setOrgName] = useState("");
  const [location, setLocation] = useState("");
  const [cause, setCause] = useState("");
  const [skills, setSkills] = useState<string[]>([""]);

  const [whatWeNeed, setWhatWeNeed] = useState("");
  const [additionalDetails, setAdditionalDetails] = useState("");
  const [whatWeHave, setWhatWeHave] = useState("");
  const [howThisHelps, setHowThisHelps] = useState("");

  const [volExperience, setVolExperience] = useState("");
  const [volAvailability, setVolAvailability] = useState("");

  const [orgMission, setOrgMission] = useState("");
  const [orgFunFact, setOrgFunFact] = useState("");

  const [milestones, setMilestones] = useState<{ title: string; details: string }[]>([
    { title: "", details: "" },
  ]);

  useEffect(() => {
    const fetchAuthAndPost = async () => {
      const session = await waitForClientSession();

      if (!session) {
        router.push("/");
        return;
      }

      // Route Protection
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();
      const role = normalizeRoleFromUser(profile, session.user);
      if (role === "volunteer") {
        router.push("/volunteer/dashboard");
        return;
      }

      setUserId(session.user.id);

      if (isNew) return;

      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .single();

      if (data) {
        setTitle(data.title || "");
        setContent(data.content || "");
        setStatus(data.status || "Draft");
        setPosterName(data.poster_name || "");
        setOrgName(data.organization_name || "");
        setLocation(data.location || "");
        setCause(data.cause || "");
        setSkills(data.skills_needed || [""]);
        setWhatWeNeed(data.what_we_need || "");
        setAdditionalDetails(data.additional_details || "");
        setWhatWeHave(data.what_we_have_in_place || "");
        setHowThisHelps(data.how_this_will_help || "");
        setVolExperience(data.volunteer_experience || "");
        setVolAvailability(data.volunteer_availability || "");
        setOrgMission(data.org_mission || "");
        setOrgFunFact(data.org_fun_fact || "");

        if (data.milestones && Array.isArray(data.milestones) && data.milestones.length > 0) {
          setMilestones(data.milestones);
        }
      }
      setLoading(false);
    };

    fetchAuthAndPost();
  }, [postId, isNew, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const cleanSkills = skills.filter((s) => s.trim() !== "");
    const cleanMilestones = milestones.filter((m) => m.title.trim() !== "");

    const payload = {
      title,
      content,
      status,
      poster_name: posterName,
      organization_name: orgName,
      location,
      cause,
      skills_needed: cleanSkills,
      what_we_need: whatWeNeed,
      additional_details: additionalDetails,
      what_we_have_in_place: whatWeHave,
      how_this_will_help: howThisHelps,
      volunteer_experience: volExperience,
      volunteer_availability: volAvailability,
      milestones: cleanMilestones,
      org_mission: orgMission,
      org_fun_fact: orgFunFact,
    };

    if (isNew) {
      const { error } = await supabase.from("posts").insert({
        user_id: userId,
        ...payload,
      });
      if (!error) router.push("/nonprofit/dashboard");
      else console.error("Error creating:", error);
    } else {
      const { error } = await supabase
        .from("posts")
        .update(payload)
        .eq("id", postId);
      if (!error) router.push(`/nonprofit/dashboard`);
      else console.error("Error updating:", error);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#114160] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#092130]">
            {isNew ? "Create New Project" : "Edit Project Details"}
          </h1>
          <p className="mt-2 text-sm text-[#475569]">
            Fill out the details below to publish your volunteer opportunity.
          </p>
        </div>

        <form
          onSubmit={handleSave}
          className="space-y-8 rounded-xl border border-[#E2E8F0] bg-white p-8 shadow-sm"
        >
          {/* Basic Information */}
          <section>
            <h2 className="mb-4 text-lg font-bold text-[#092130] border-b border-[#E2E8F0] pb-2">
              Basic Information
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-[#092130]">
                  Project Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-[#092130]">
                  High-level Description
                </label>
                <textarea
                  rows={3}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full resize-none rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-[#092130]">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
                >
                  <option value="Draft">Draft</option>
                  <option value="Active">Active</option>
                  <option value="Closed">Completed</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-[#092130]">
                  Poster Name (Optional)
                </label>
                <input
                  type="text"
                  value={posterName}
                  onChange={(e) => setPosterName(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
                />
              </div>
            </div>
          </section>

          {/* Organization Details */}
          <section>
            <h2 className="mb-4 text-lg font-bold text-[#092130] border-b border-[#E2E8F0] pb-2">
              Organization Details
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-[#092130]">
                  Organization Name
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-[#092130]">
                  Location
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-[#092130]">
                  Cause (e.g. Human Services)
                </label>
                <input
                  type="text"
                  value={cause}
                  onChange={(e) => setCause(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-[#092130]">
                  Our Mission
                </label>
                <textarea
                  rows={2}
                  value={orgMission}
                  onChange={(e) => setOrgMission(e.target.value)}
                  className="w-full resize-none rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
                />
              </div>
            </div>
          </section>

          {/* Project Details */}
          <section>
            <h2 className="mb-4 text-lg font-bold text-[#092130] border-b border-[#E2E8F0] pb-2">
              Project Details
            </h2>
            <div className="grid gap-6">
              <div>
                <label className="mb-1 block text-sm font-semibold text-[#092130]">
                  What we need
                </label>
                <textarea
                  rows={3}
                  value={whatWeNeed}
                  onChange={(e) => setWhatWeNeed(e.target.value)}
                  className="w-full resize-none rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-[#092130]">
                  How this will help
                </label>
                <textarea
                  rows={3}
                  value={howThisHelps}
                  onChange={(e) => setHowThisHelps(e.target.value)}
                  className="w-full resize-none rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
                />
              </div>
            </div>
          </section>

          {/* Skills */}
          <section>
            <h2 className="mb-4 text-lg font-bold text-[#092130] border-b border-[#E2E8F0] pb-2">
              Skills Needed
            </h2>
            <div className="space-y-3">
              {skills.map((skill, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={skill}
                    onChange={(e) => {
                      const newSkills = [...skills];
                      newSkills[index] = e.target.value;
                      setSkills(newSkills);
                    }}
                    placeholder="e.g. Web Development"
                    className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
                  />
                  <button
                    type="button"
                    onClick={() => setSkills(skills.filter((_, i) => i !== index))}
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSkills([...skills, ""])}
                className="text-sm font-semibold text-[#114160] hover:text-[#092130]"
              >
                + Add Another Skill
              </button>
            </div>
          </section>

          {/* Submit */}
          <div className="flex items-center justify-end gap-4 border-t border-[#E2E8F0] pt-6">
            <Link
              href="/nonprofit/dashboard"
              className="text-sm font-medium text-[#475569] hover:text-[#092130]"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving || !title}
              className="rounded-md bg-[#114160] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#092130] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Project"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
