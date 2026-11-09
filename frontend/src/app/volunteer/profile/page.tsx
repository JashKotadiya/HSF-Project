"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { useAuth } from "@/components/auth/AuthProvider";
import supabase from "@/lib/supabase";
import { RESUME_BUCKET } from "@/lib/applications";
import InterestPreferences from "@/components/profile/InterestPreferences";

const MAX_RESUME_MB = 10;
const RESUME_EXTENSIONS = /\.(pdf|docx?)$/i;
const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  "w-full rounded-md border border-[#CBD5E1] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-2 focus:ring-[#D3E6F2]";

type Profile = {
  full_name: string;
  bio: string;
  technical_skills: string[];
  resume_path: string | null;
  contact_email: string;
  share_contact_email: boolean;
};

type ProfileDraft = {
  full_name: string;
  bio: string;
  skillsText: string;
  contact_email: string;
  share_contact_email: boolean;
};

const EMPTY_PROFILE: Profile = {
  full_name: "",
  bio: "",
  technical_skills: [],
  resume_path: null,
  contact_email: "",
  share_contact_email: false,
};

const EMPTY_DRAFT: ProfileDraft = {
  full_name: "",
  bio: "",
  skillsText: "",
  contact_email: "",
  share_contact_email: false,
};

function getSkills(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((skill): skill is string => typeof skill === "string");
  }
  if (typeof value === "string") {
    return value.split(",").map((skill) => skill.trim()).filter(Boolean);
  }
  return [];
}

function getDraftKey(userId: string) {
  return `hsf-volunteer-profile-draft-${userId}`;
}

function readProfileDraft(
  userId: string,
  fallback?: ProfileDraft
): ProfileDraft | null {
  try {
    const stored = sessionStorage.getItem(getDraftKey(userId));
    if (!stored) return null;

    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("full_name" in parsed) ||
      !("bio" in parsed) ||
      !("skillsText" in parsed) ||
      typeof parsed.full_name !== "string" ||
      typeof parsed.bio !== "string" ||
      typeof parsed.skillsText !== "string"
    ) {
      return null;
    }

    // Contact preferences are optional for older drafts.
    const draft = parsed as Record<string, unknown>;
    return {
      full_name: parsed.full_name,
      bio: parsed.bio,
      skillsText: parsed.skillsText,
      contact_email: typeof draft.contact_email === "string" ? draft.contact_email : (fallback?.contact_email ?? ""),
      share_contact_email: typeof draft.share_contact_email === "boolean"
        ? draft.share_contact_email
        : (fallback?.share_contact_email ?? false),
    };
  } catch {
    return null;
  }
}

function saveProfileDraft(userId: string, draft: ProfileDraft) {
  try {
    sessionStorage.setItem(getDraftKey(userId), JSON.stringify(draft));
  } catch {
    // Profile editing remains available if session storage is unavailable.
  }
}

function clearProfileDraft(userId: string) {
  try {
    sessionStorage.removeItem(getDraftKey(userId));
  } catch {
    // Ignore storage errors.
  }
}

export default function VolunteerProfilePage() {
  const { user } = useAuth();
  const userId = user?.id;
  const signupFullName = user?.user_metadata?.full_name as string | undefined;

  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [skillsText, setSkillsText] = useState("");
  const [savedFields, setSavedFields] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [resume, setResume] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function loadProfile() {
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, bio, technical_skills, resume_path, contact_email, share_contact_email")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;
      if (profileError || !data) {
        setError(
          profileError
            ? `Couldn't load your profile: ${profileError.message}`
            : "Your profile could not be found. Please reload and try again."
        );
        setLoadedUserId(null);
        setLoading(false);
        return;
      }

      const skills = getSkills(data.technical_skills);
      const databaseFields: ProfileDraft = {
        full_name: data.full_name || signupFullName || "",
        bio: data.bio || "",
        skillsText: skills.join(", "),
        contact_email: data.contact_email ?? "",
        share_contact_email: data.share_contact_email ?? false,
      };

      setSavedFields(databaseFields);
      const draft = readProfileDraft(userId, databaseFields);
      setProfile({
        full_name: draft?.full_name ?? databaseFields.full_name,
        bio: draft?.bio ?? databaseFields.bio,
        technical_skills: skills,
        resume_path: data.resume_path || null,
        contact_email: draft?.contact_email ?? databaseFields.contact_email,
        share_contact_email: draft?.share_contact_email ?? databaseFields.share_contact_email,
      });
      setSkillsText(draft?.skillsText ?? databaseFields.skillsText);
      setLoadedUserId(userId);
      setError(null);
      setLoading(false);
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [userId, signupFullName]);

  const updateDraft = <K extends keyof ProfileDraft>(
    field: K,
    value: ProfileDraft[K]
  ) => {
    if (!userId || loadedUserId !== userId || saving) return;

    const nextDraft: ProfileDraft = {
      full_name: profile.full_name,
      bio: profile.bio,
      skillsText,
      contact_email: profile.contact_email,
      share_contact_email: profile.share_contact_email,
      [field]: value,
    };

    if (field === "skillsText") {
      setSkillsText(value as string);
    } else {
      setProfile((current) => ({ ...current, [field]: value }));
    }
    saveProfileDraft(userId, nextDraft);
    setMessage(null);
  };

  const hasUnsavedProfileChanges =
    profile.full_name !== savedFields.full_name ||
    profile.bio !== savedFields.bio ||
    skillsText !== savedFields.skillsText ||
    profile.contact_email !== savedFields.contact_email ||
    profile.share_contact_email !== savedFields.share_contact_email;

  const handleDiscardDraft = () => {
    if (!userId || saving) return;
    clearProfileDraft(userId);
    setProfile((current) => ({
      ...current,
      full_name: savedFields.full_name,
      bio: savedFields.bio,
      contact_email: savedFields.contact_email,
      share_contact_email: savedFields.share_contact_email,
    }));
    setSkillsText(savedFields.skillsText);
    setMessage("Unsaved profile changes discarded.");
    setError(null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setResume(event.target.files?.[0] || null);
    setError(null);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId || loadedUserId !== userId || saving) {
      setError("Your profile has not loaded. Please reload or sign in again.");
      return;
    }

    const skills = skillsText.split(",").map((skill) => skill.trim()).filter(Boolean);
    if (!profile.full_name.trim()) {
      setError("Please enter your name.");
      return;
    }

    const contactEmailToSave = profile.contact_email.trim();
    if (
      contactEmailToSave &&
      (contactEmailToSave.length > 254 || !CONTACT_EMAIL_PATTERN.test(contactEmailToSave))
    ) {
      setError("Please enter a valid contact email address.");
      return;
    }
    const shareContactEmailToSave =
      contactEmailToSave !== "" && profile.share_contact_email;

    if (
      resume &&
      (!RESUME_EXTENSIONS.test(resume.name) ||
        resume.size > MAX_RESUME_MB * 1024 * 1024)
    ) {
      setError(
        `Your resume must be a PDF, DOC, or DOCX file smaller than ${MAX_RESUME_MB} MB.`
      );
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const previousResumePath = profile.resume_path;
    let resumePath = previousResumePath;
    const nameToSave = profile.full_name.trim();
    const bioToSave = profile.bio.trim();
    const skillsToSave = skills.join(", ");
    const submittedFields: ProfileDraft = {
      full_name: profile.full_name,
      bio: profile.bio,
      skillsText,
      contact_email: profile.contact_email,
      share_contact_email: profile.share_contact_email,
    };

    try {
      if (resume) {
        const bytes = await resume.arrayBuffer();
        const safeName = resume.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        resumePath = `${userId}/profile/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(RESUME_BUCKET)
          .upload(resumePath, bytes, {
            contentType: resume.type || "application/octet-stream",
          });
        if (uploadError) throw uploadError;
      }

      // Request the actual saved row: a successful update can affect ZERO rows.
      const { data: updatedRows, error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: nameToSave,
          bio: bioToSave,
          technical_skills: skills,
          resume_path: resumePath,
          contact_email: contactEmailToSave || null,
          share_contact_email: shareContactEmailToSave,
        })
        .eq("id", userId)
        .select("id, resume_path, contact_email, share_contact_email");

      if (updateError) {
        // Database outcome could be ambiguous: don't delete either file.
        throw new Error(`Couldn't update your profile: ${updateError.message}`);
      }

      if (!updatedRows || updatedRows.length === 0) {
        if (resumePath && resumePath !== previousResumePath) {
          // This update didn't save the new path: remove unused upload, if possible.
          const { error: cleanupError } = await supabase.storage
            .from(RESUME_BUCKET)
            .remove([resumePath]);
          if (cleanupError) {
            console.error("Couldn't remove unused replacement resume:", cleanupError);
          }
        }
        throw new Error("Your profile was not updated. Your previous resume has been preserved.");
      }

      if (
        updatedRows.length !== 1 ||
        String(updatedRows[0].id) !== String(userId) ||
        updatedRows[0].resume_path !== resumePath ||
        (updatedRows[0].contact_email ?? "") !== contactEmailToSave ||
        updatedRows[0].share_contact_email !== shareContactEmailToSave
      ) {
        // Do not remove old or new resumes if confirmation is inconsistent.
        throw new Error("The profile update could not be verified. Your previous resume has not been deleted.");
      }

      // Delete old resume ONLY after verifying the newly saved reference.
      if (previousResumePath && resumePath !== previousResumePath) {
        const { error: deleteError } = await supabase.storage
          .from(RESUME_BUCKET)
          .remove([previousResumePath]);
        if (deleteError) {
          console.error("Profile saved, but old resume cleanup failed:", deleteError);
        }
      }

      setSavedFields({
        full_name: nameToSave,
        bio: bioToSave,
        skillsText: skillsToSave,
        contact_email: contactEmailToSave,
        share_contact_email: shareContactEmailToSave,
      });
      setProfile((current) => ({
        ...current,
        full_name: nameToSave,
        bio: bioToSave,
        technical_skills: skills,
        resume_path: resumePath,
        contact_email: contactEmailToSave,
        share_contact_email: shareContactEmailToSave,
      }));
      setSkillsText(skillsToSave);
      setResume(null);

      const currentDraft = readProfileDraft(userId);
      const draftMatchesSubmission =
        currentDraft === null ||
        (currentDraft.full_name === submittedFields.full_name &&
          currentDraft.bio === submittedFields.bio &&
          currentDraft.skillsText === submittedFields.skillsText &&
          currentDraft.contact_email === submittedFields.contact_email &&
          currentDraft.share_contact_email === submittedFields.share_contact_email);
      if (draftMatchesSubmission) clearProfileDraft(userId);
      setMessage("Your profile was saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Couldn't save your profile."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading || (userId !== undefined && loadedUserId !== userId && !error)) {
    return (
      <main className="min-h-screen bg-[#F8FAFC]">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="h-96 animate-pulse rounded-xl bg-white" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        title="My profile"
        subtitle="Keep your volunteer profile up to date so organizations can learn more about you."
      />
      <div className="mx-auto max-w-3xl px-6 py-12">
        <form
          onSubmit={handleSave}
          className="space-y-8 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8"
        >
          {error && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}
          {message && (
            <div role="status" className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              {message}
            </div>
          )}
          {hasUnsavedProfileChanges && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D8CCFF] bg-[#F5F1FF] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#4A0E99]">Unsaved changes</p>
                <p className="mt-1 text-xs text-[#64748B]">Click Save profile to save them permanently.</p>
              </div>
              <button
                type="button"
                onClick={handleDiscardDraft}
                disabled={saving || loadedUserId !== userId}
                className="text-xs font-semibold text-[#4A0E99] underline hover:text-[#32076B] disabled:opacity-60"
              >
                Discard changes
              </button>
            </div>
          )}

          <div>
            <label htmlFor="full-name" className="mb-2 block text-sm font-semibold text-[#092130]">Name</label>
            <input
              id="full-name"
              className={inputClass}
              value={profile.full_name}
              onChange={(event) => updateDraft("full_name", event.target.value)}
              disabled={saving || loadedUserId !== userId}
              required
            />
          </div>

          <div>
            <label htmlFor="bio" className="mb-2 block text-sm font-semibold text-[#092130]">Bio</label>
            <textarea
              id="bio"
              className={`${inputClass} min-h-32 resize-y`}
              value={profile.bio}
              onChange={(event) => updateDraft("bio", event.target.value)}
              disabled={saving || loadedUserId !== userId}
              placeholder="Tell organizations about your experience and interests."
            />
          </div>

          <div className="border-t border-[#E2E8F0] pt-6">
            <h2 className="text-lg font-bold text-[#092130]">Contact Preferences</h2>
            <p className="mt-2 text-sm text-[#64748B]">
              Choose whether organizations reviewing your applications can contact you by email.
            </p>
          </div>
          <div>
            <label htmlFor="volunteer-contact-email" className="mb-2 block text-sm font-semibold text-[#092130]">
              Contact Email (Optional)
            </label>
            <input
              id="volunteer-contact-email"
              type="email"
              value={profile.contact_email}
              onChange={(event) => updateDraft("contact_email", event.target.value)}
              className={inputClass}
              placeholder="you@example.com"
              maxLength={254}
              disabled={saving || loadedUserId !== userId}
            />
            <p className="mt-2 text-xs text-[#64748B]">
              This address is separate from your login email. You do not have to provide one to apply for projects.
            </p>
          </div>
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={profile.share_contact_email}
                onChange={(event) => updateDraft("share_contact_email", event.target.checked)}
                disabled={saving || loadedUserId !== userId || !profile.contact_email.trim()}
                className="mt-1 h-4 w-4 accent-[#114160]"
              />
              <span>
                <span className="block text-sm font-semibold text-[#092130]">
                  Share my contact email with organizations
                </span>
                <span className="mt-1 block text-sm text-[#64748B]">
                  When enabled, organizations reviewing your applications can see this address and contact you before making an approval decision.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label htmlFor="skills" className="mb-2 block text-sm font-semibold text-[#092130]">Technical skills</label>
            <input
              id="skills"
              className={inputClass}
              value={skillsText}
              onChange={(event) => updateDraft("skillsText", event.target.value)}
              disabled={saving || loadedUserId !== userId}
              placeholder="React, Python, data analysis"
            />
            <p className="mt-2 text-xs text-[#64748B]">Separate skills with commas.</p>
          </div>

          <div>
            <label htmlFor="resume" className="mb-2 block text-sm font-semibold text-[#092130]">Resume</label>
            <input
              id="resume"
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
              disabled={saving || loadedUserId !== userId}
              className="block w-full rounded-md border border-[#CBD5E1] bg-white px-4 py-3 text-sm text-[#475569] file:mr-4 file:rounded-md file:border-0 file:bg-[#D3E6F2] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#114160]"
            />
            <p className="mt-2 text-xs text-[#64748B]">
              {resume
                ? `Selected: ${resume.name}`
                : profile.resume_path
                  ? "A resume is already uploaded. Choose a new file to replace it."
                  : "PDF, DOC, or DOCX, up to 10 MB."}
            </p>
          </div>

          <button
            type="submit"
            disabled={saving || loadedUserId !== userId}
            className="rounded-md bg-[#114160] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#092130] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save profile"}
          </button>
        </form>
        <InterestPreferences />
      </div>
    </main>
  );
}
