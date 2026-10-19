"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { useAuth } from "@/components/auth/AuthProvider";
import supabase from "@/lib/supabase";
import { RESUME_BUCKET } from "@/lib/applications";

const MAX_RESUME_MB = 10;
const RESUME_EXTENSIONS = /\.(pdf|docx?)$/i;
const inputClass =
  "w-full rounded-md border border-[#CBD5E1] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-2 focus:ring-[#D3E6F2]";

type Profile = {
  full_name: string;
  bio: string;
  technical_skills: string[];
  resume_path: string | null;
};

function getSkills(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((skill): skill is string => typeof skill === "string");
  if (typeof value === "string") return value.split(",").map((skill) => skill.trim()).filter(Boolean);
  return [];
}

export default function VolunteerProfilePage() {
  const { user } = useAuth();
  const userId = user?.id;
  const [profile, setProfile] = useState<Profile>({
    full_name: "",
    bio: "",
    technical_skills: [],
    resume_path: null,
  });
  const [skillsText, setSkillsText] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const loadProfile = async () => {
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, bio, technical_skills, resume_path")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        setError(`Couldn't load your profile: ${profileError.message}`);
      } else {
        const skills = getSkills(data?.technical_skills);
        setProfile({
          full_name: data?.full_name || user?.user_metadata?.full_name || "",
          bio: data?.bio || "",
          technical_skills: skills,
          resume_path: data?.resume_path || null,
        });
        setSkillsText(skills.join(", "));
      }
      setLoading(false);
    };

    void loadProfile();
  }, [user, userId]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setResume(event.target.files?.[0] || null);
    setError(null);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) {
      setError("Your session expired. Please log in again.");
      return;
    }

    const skills = skillsText.split(",").map((skill) => skill.trim()).filter(Boolean);
    if (!profile.full_name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (resume && (!RESUME_EXTENSIONS.test(resume.name) || resume.size > MAX_RESUME_MB * 1024 * 1024)) {
      setError(`Your resume must be a PDF, DOC, or DOCX file smaller than ${MAX_RESUME_MB} MB.`);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    let resumePath = profile.resume_path;

    try {
      if (resume) {
        const bytes = await resume.arrayBuffer();
        const safeName = resume.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        resumePath = `${userId}/profile/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(RESUME_BUCKET)
          .upload(resumePath, bytes, { contentType: resume.type || "application/octet-stream" });
        if (uploadError) throw uploadError;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name.trim(),
          bio: profile.bio.trim(),
          technical_skills: skills,
          resume_path: resumePath,
        })
        .eq("id", userId);
      if (updateError) {
        if (resumePath && resumePath !== profile.resume_path) {
          await supabase.storage.from(RESUME_BUCKET).remove([resumePath]);
        }
        throw updateError;
      }

      if (profile.resume_path && resumePath !== profile.resume_path) {
        await supabase.storage.from(RESUME_BUCKET).remove([profile.resume_path]);
      }
      setProfile((current) => ({ ...current, technical_skills: skills, resume_path: resumePath }));
      setSkillsText(skills.join(", "));
      setResume(null);
      setMessage("Your profile was saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <main className="min-h-screen bg-[#F8FAFC]"><div className="mx-auto max-w-3xl px-6 py-16"><div className="h-96 animate-pulse rounded-xl bg-white" /></div></main>;
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        title="My profile"
        subtitle="Keep your volunteer profile up to date so organizations can learn more about you."
      />
      <div className="mx-auto max-w-3xl px-6 py-12">
        <form onSubmit={handleSave} className="space-y-8 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8">
          {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
          {message && <div role="status" className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-700">{message}</div>}

          <div>
            <label htmlFor="full-name" className="mb-2 block text-sm font-semibold text-[#092130]">Name</label>
            <input id="full-name" className={inputClass} value={profile.full_name} onChange={(event) => setProfile({ ...profile, full_name: event.target.value })} required />
          </div>

          <div>
            <label htmlFor="bio" className="mb-2 block text-sm font-semibold text-[#092130]">Bio</label>
            <textarea id="bio" className={`${inputClass} min-h-32 resize-y`} value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} placeholder="Tell organizations about your experience and interests." />
          </div>

          <div>
            <label htmlFor="skills" className="mb-2 block text-sm font-semibold text-[#092130]">Technical skills</label>
            <input id="skills" className={inputClass} value={skillsText} onChange={(event) => setSkillsText(event.target.value)} placeholder="React, Python, data analysis" />
            <p className="mt-2 text-xs text-[#64748B]">Separate skills with commas.</p>
          </div>

          <div>
            <label htmlFor="resume" className="mb-2 block text-sm font-semibold text-[#092130]">Resume</label>
            <input id="resume" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFileChange} className="block w-full rounded-md border border-[#CBD5E1] bg-white px-4 py-3 text-sm text-[#475569] file:mr-4 file:rounded-md file:border-0 file:bg-[#D3E6F2] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#114160]" />
            <p className="mt-2 text-xs text-[#64748B]">{resume ? `Selected: ${resume.name}` : profile.resume_path ? "A resume is already uploaded. Choose a new file to replace it." : "PDF, DOC, or DOCX, up to 10 MB."}</p>
          </div>

          <button type="submit" disabled={saving} className="rounded-md bg-[#114160] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#092130] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? "Saving..." : "Save profile"}
          </button>
        </form>
      </div>
    </main>
  );
}
