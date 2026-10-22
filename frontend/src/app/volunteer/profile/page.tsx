
"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useState,
} from "react";

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

type ProfileDraft = {
  full_name: string;
  bio: string;
  skillsText: string;
};

const EMPTY_PROFILE: Profile = {
  full_name: "",
  bio: "",
  technical_skills: [],
  resume_path: null,
};

const EMPTY_DRAFT: ProfileDraft = {
  full_name: "",
  bio: "",
  skillsText: "",
};

function getSkills(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (skill): skill is string => typeof skill === "string"
    );
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
  }

  return [];
}

// Give each signed-in user a separate draft.
function getDraftKey(userId: string) {
  return `hsf-volunteer-profile-draft-${userId}`;
}

function readProfileDraft(
  userId: string
): ProfileDraft | null {
  try {
    const stored = sessionStorage.getItem(
      getDraftKey(userId)
    );

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

    return {
      full_name: parsed.full_name,
      bio: parsed.bio,
      skillsText: parsed.skillsText,
    };
  } catch {
    return null;
  }
}

function saveProfileDraft(
  userId: string,
  draft: ProfileDraft
) {
  try {
    sessionStorage.setItem(
      getDraftKey(userId),
      JSON.stringify(draft)
    );
  } catch {
    // The editor remains usable without session storage.
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

  const [profile, setProfile] =
    useState<Profile>(EMPTY_PROFILE);

  const [skillsText, setSkillsText] = useState("");
  const [savedFields, setSavedFields] =
    useState<ProfileDraft>(EMPTY_DRAFT);

  const [resume, setResume] = useState<File | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<
    string | null
  >(null);
  const [error, setError] = useState<
    string | null
  >(null);

  // Used to avoid displaying another user's draft
  // while a different account's profile is loading.
  const [loadedUserId, setLoadedUserId] = useState<
    string | null
  >(null);

  // Load the database profile and restore any draft.
  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    const loadProfile = async () => {
      const { data, error: profileError } =
        await supabase
          .from("profiles")
          .select(
            "full_name, bio, technical_skills, resume_path"
          )
          .eq("id", userId)
          .maybeSingle();

      if (cancelled) return;

      if (profileError) {
        setError(
          `Couldn't load your profile: ${profileError.message}`
        );
      } else {
        const skills = getSkills(
          data?.technical_skills
        );

        const databaseFields: ProfileDraft = {
          full_name:
            data?.full_name ||
            user?.user_metadata?.full_name ||
            "",
          bio: data?.bio || "",
          skillsText: skills.join(", "),
        };

        // Keep a copy of what was actually saved.
        setSavedFields(databaseFields);

        // An existing unsaved draft takes precedence.
        const draft = readProfileDraft(userId);

        setProfile({
          full_name:
            draft?.full_name ??
            databaseFields.full_name,
          bio:
            draft?.bio ??
            databaseFields.bio,
          technical_skills: skills,
          resume_path: data?.resume_path || null,
        });

        setSkillsText(
          draft?.skillsText ??
          databaseFields.skillsText
        );

        setError(null);
      }

      setLoadedUserId(userId);
      setLoading(false);
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Preserve Name, Bio, and Skills together.
  const updateDraft = (
    field: keyof ProfileDraft,
    value: string
  ) => {
    if (!userId || loadedUserId !== userId) {
      return;
    }

    const nextDraft: ProfileDraft = {
      full_name: profile.full_name,
      bio: profile.bio,
      skillsText,
      [field]: value,
    };

    if (field === "skillsText") {
      setSkillsText(value);
    } else {
      setProfile((current) => ({
        ...current,
        [field]: value,
      }));
    }

    // Save the draft without saving to Supabase.
    saveProfileDraft(userId, nextDraft);

    setMessage(null);
  };

  const hasUnsavedProfileChanges =
    profile.full_name !==
      savedFields.full_name ||
    profile.bio !== savedFields.bio ||
    skillsText !== savedFields.skillsText;

  // Restore the last saved Name, Bio, and Skills.
  const handleDiscardDraft = () => {
    if (!userId) return;

    clearProfileDraft(userId);

    setProfile((current) => ({
      ...current,
      full_name: savedFields.full_name,
      bio: savedFields.bio,
    }));

    setSkillsText(savedFields.skillsText);

    setMessage(
      "Unsaved profile changes discarded."
    );
    setError(null);
  };

  const handleFileChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    setResume(
      event.target.files?.[0] || null
    );
    setError(null);
  };

  const handleSave = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!userId || loadedUserId !== userId) {
      setError(
        "Your session expired. Please log in again."
      );
      return;
    }

    const skills = skillsText
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);

    if (!profile.full_name.trim()) {
      setError("Please enter your name.");
      return;
    }

    if (
      resume &&
      (!RESUME_EXTENSIONS.test(resume.name) ||
        resume.size >
          MAX_RESUME_MB * 1024 * 1024)
    ) {
      setError(
        `Your resume must be a PDF, DOC, or DOCX file smaller than ${MAX_RESUME_MB} MB.`
      );
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    let resumePath = profile.resume_path;

    const nameToSave =
      profile.full_name.trim();
    const bioToSave = profile.bio.trim();
    const skillsToSave = skills.join(", ");

    // Capture exactly what was submitted.
    const submittedFields: ProfileDraft = {
      full_name: profile.full_name,
      bio: profile.bio,
      skillsText,
    };

    try {
      if (resume) {
        const bytes =
          await resume.arrayBuffer();

        const safeName =
          resume.name.replace(
            /[^a-zA-Z0-9._-]/g,
            "_"
          );

        resumePath =
          `${userId}/profile/${Date.now()}-${safeName}`;

        const { error: uploadError } =
          await supabase.storage
            .from(RESUME_BUCKET)
            .upload(resumePath, bytes, {
              contentType:
                resume.type ||
                "application/octet-stream",
            });

        if (uploadError) {
          throw uploadError;
        }
      }

      const { error: updateError } =
        await supabase
          .from("profiles")
          .update({
            full_name: nameToSave,
            bio: bioToSave,
            technical_skills: skills,
            resume_path: resumePath,
          })
          .eq("id", userId);

      if (updateError) {
        if (
          resumePath &&
          resumePath !==
            profile.resume_path
        ) {
          await supabase.storage
            .from(RESUME_BUCKET)
            .remove([resumePath]);
        }

        throw updateError;
      }

      if (
        profile.resume_path &&
        resumePath !==
          profile.resume_path
      ) {
        await supabase.storage
          .from(RESUME_BUCKET)
          .remove([profile.resume_path]);
      }

      // Update the saved snapshot.
      setSavedFields({
        full_name: nameToSave,
        bio: bioToSave,
        skillsText: skillsToSave,
      });

      setProfile((current) => ({
        ...current,
        full_name: nameToSave,
        bio: bioToSave,
        technical_skills: skills,
        resume_path: resumePath,
      }));

      setSkillsText(skillsToSave);
      setResume(null);

      // Clear the draft only after the save succeeds.
      // Restore it if newer edits were made during saving.
      const currentDraft =
        readProfileDraft(userId);

      const draftMatchesSubmission =
        currentDraft === null ||
        (
          currentDraft.full_name ===
            submittedFields.full_name &&
          currentDraft.bio ===
            submittedFields.bio &&
          currentDraft.skillsText ===
            submittedFields.skillsText
        );

      if (draftMatchesSubmission) {
        clearProfileDraft(userId);
      }

      setMessage(
        "Your profile was saved."
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Couldn't save your profile."
      );
    } finally {
      setSaving(false);
    }
  };

  if (
    loading ||
    (userId !== undefined &&
      loadedUserId !== userId)
  ) {
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
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {message && (
            <div
              role="status"
              className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-700"
            >
              {message}
            </div>
          )}

          {/* UNSAVED CHANGES NOTICE */}
          {hasUnsavedProfileChanges && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D8CCFF] bg-[#F5F1FF] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#4A0E99]">
                  Unsaved changes
                </p>
                <p className="mt-1 text-xs text-[#64748B]">
                  Click Save profile to save them permanently.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDiscardDraft}
                disabled={saving}
                className="text-xs font-semibold text-[#4A0E99] underline hover:text-[#32076B] disabled:opacity-60"
              >
                Discard changes
              </button>
            </div>
          )}

          {/* NAME */}
          <div>
            <label
              htmlFor="full-name"
              className="mb-2 block text-sm font-semibold text-[#092130]"
            >
              Name
            </label>

            <input
              id="full-name"
              className={inputClass}
              value={profile.full_name}
              onChange={(event) =>
                updateDraft(
                  "full_name",
                  event.target.value
                )
              }
              disabled={saving}
              required
            />
          </div>

          {/* BIO */}
          <div>
            <label
              htmlFor="bio"
              className="mb-2 block text-sm font-semibold text-[#092130]"
            >
              Bio
            </label>

            <textarea
              id="bio"
              className={`${inputClass} min-h-32 resize-y`}
              value={profile.bio}
              onChange={(event) =>
                updateDraft(
                  "bio",
                  event.target.value
                )
              }
              disabled={saving}
              placeholder="Tell organizations about your experience and interests."
            />
          </div>

          {/* TECHNICAL SKILLS */}
          <div>
            <label
              htmlFor="skills"
              className="mb-2 block text-sm font-semibold text-[#092130]"
            >
              Technical skills
            </label>

            <input
              id="skills"
              className={inputClass}
              value={skillsText}
              onChange={(event) =>
                updateDraft(
                  "skillsText",
                  event.target.value
                )
              }
              disabled={saving}
              placeholder="React, Python, data analysis"
            />

            <p className="mt-2 text-xs text-[#64748B]">
              Separate skills with commas.
            </p>
          </div>

          {/* RESUME */}
          <div>
            <label
              htmlFor="resume"
              className="mb-2 block text-sm font-semibold text-[#092130]"
            >
              Resume
            </label>

            <input
              id="resume"
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
              disabled={saving}
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

          {/* SAVE BUTTON */}
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-[#114160] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#092130] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? "Saving..."
              : "Save profile"}
          </button>
        </form>
      </div>
    </main>
  );
}
