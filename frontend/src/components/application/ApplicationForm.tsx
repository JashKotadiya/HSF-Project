"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  APPLICATION_QUESTIONS,
  ApplicationStatus,
  RESUME_BUCKET,
  SETUP_HINT,
} from "@/lib/applications";
import StatusBadge from "@/components/applications/StatusBadge";

const MAX_RESUME_MB = 10;

const RESUME_CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const NETWORK_ERROR = /load failed|failed to fetch|networkerror|network request failed/i;

/**
 * Uploads the resume as raw bytes rather than the File object: Safari reports a bare
 * "Load failed" for multipart File uploads that the server rejects or that drop mid-request.
 */
async function uploadResume(userId: string, projectId: string, file: File) {
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    throw new Error(
      "Couldn't read that file. If it's stored in iCloud or another cloud drive, download it to your computer and choose it again."
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = file.type || RESUME_CONTENT_TYPES[ext] || "application/octet-stream";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const path = `${userId}/${projectId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(RESUME_BUCKET).upload(path, bytes, { contentType });
    if (!error) return path;
    lastError = error;
    if (!NETWORK_ERROR.test(error.message)) break;
  }

  if (lastError && NETWORK_ERROR.test(lastError.message)) {
    throw new Error(
      "Couldn't upload your resume because the connection to the server dropped. Check your internet connection and try again."
    );
  }
  throw lastError ?? new Error("Couldn't upload your resume.");
}

const inputClass =
  "w-full rounded-md border border-[#CBD5E1] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-2 focus:ring-[#D3E6F2]";

export default function ApplicationForm({
  projectId,
  projectTitle,
  projectSummary,
}: {
  projectId: string;
  projectTitle: string;
  projectSummary?: string;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const email = user?.email ?? "";
  const [fullName, setFullName] = useState("");
  const [answers, setAnswers] = useState<string[]>(APPLICATION_QUESTIONS.map(() => ""));
  const [resume, setResume] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingStatus, setExistingStatus] = useState<ApplicationStatus | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const fetchExistingStatus = useCallback(async () => {
    if (!userId) return null;
    const { data } = await supabase
      .from("applications")
      .select("status")
      .eq("project_id", projectId)
      .eq("volunteer_id", userId)
      .maybeSingle();
    return (data?.status as ApplicationStatus | undefined) ?? null;
  }, [projectId, userId]);

  useEffect(() => {
    if (!userId) return;
    void fetchExistingStatus().then((status) => {
      setExistingStatus(status);
      setCheckingExisting(false);
    });
  }, [userId, fetchExistingStatus]);

  const handleAnswerChange = (index: number, value: string) => {
    const updated = [...answers];
    updated[index] = value;
    setAnswers(updated);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setResume(e.target.files?.[0] || null);
    setErrors([]);
  };

  const validateForm = () => {
    const newErrors: string[] = [];
    if (!fullName.trim()) newErrors.push("Please enter your full name.");
    answers.forEach((answer, index) => {
      if (!answer.trim()) newErrors.push(`Please answer question ${index + 1}.`);
    });
    if (!resume) newErrors.push("Please upload your resume.");
    else if (!/\.(pdf|docx?)$/i.test(resume.name)) newErrors.push("Your resume must be a PDF, DOC, or DOCX file.");
    else if (resume.size > MAX_RESUME_MB * 1024 * 1024) newErrors.push(`Your resume must be smaller than ${MAX_RESUME_MB} MB.`);
    return newErrors;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validationErrors = validateForm();
    if (validationErrors.length > 0 || !resume) {
      setErrors(validationErrors);
      return;
    }
    if (!userId) {
      setErrors(["Your session expired. Please log in again."]);
      return;
    }

    setErrors([]);
    setIsSubmitting(true);

    try {
      const resumePath = await uploadResume(userId, projectId, resume);

      const { error: insertError } = await supabase.from("applications").insert({
        project_id: projectId,
        volunteer_id: userId,
        status: "pending",
        resume_path: resumePath,
        applicant_name: fullName.trim(),
        applicant_email: email,
        answers: APPLICATION_QUESTIONS.map((q, i) => ({ q, a: answers[i].trim() })),
      });
      if (insertError) {
        // Don't leave an orphaned resume behind for an application that wasn't saved.
        await supabase.storage.from(RESUME_BUCKET).remove([resumePath]);
        if (insertError.code === "23505") {
          setExistingStatus((await fetchExistingStatus()) ?? "pending");
          return;
        }
        throw insertError;
      }

      setSubmitted(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
      const looksLikeSetup = /bucket|row-level security|column|schema cache|policy/i.test(message);
      setErrors([looksLikeSetup ? `${message}. ${SETUP_HINT}` : message || "Something went wrong while submitting your application."]);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (checkingExisting) {
    return <div className="h-96 animate-pulse rounded-xl border border-[#E2E8F0] bg-white" />;
  }

  if (submitted || existingStatus) {
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center">
        <h2 className="text-2xl font-bold text-[#092130]">
          {submitted ? "Application submitted!" : "You've already applied"}
        </h2>
        <p className="mt-2 text-sm text-[#475569]">
          {submitted
            ? `${projectTitle} will review your application. You can track it in My Projects.`
            : `Your application to ${projectTitle} is on file.`}
        </p>
        <div className="mt-4">
          <StatusBadge status={existingStatus ?? "pending"} />
        </div>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/volunteer/projects"
            className="rounded-md bg-[#114160] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#092130]"
          >
            Go to My Projects
          </Link>
          <Link
            href="/projects"
            className="rounded-md border border-[#114160] bg-white px-5 py-2.5 text-sm font-semibold text-[#114160] transition hover:bg-[#D3E6F2]"
          >
            Browse more projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="rounded-xl border border-[#E2E8F0] bg-white">
        <div className="border-b border-[#E2E8F0] px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
            PROJECT SUMMARY
          </p>
          <h2 className="mt-2 text-2xl font-bold text-[#092130]">{projectTitle}</h2>
          {projectSummary && (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#475569] line-clamp-3">
              {projectSummary}
            </p>
          )}
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-[#092130]">Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-[#092130]">Email</label>
              <input type="email" value={email} disabled className={`${inputClass} bg-[#F8FAFC] text-[#64748B]`} />
            </div>
          </div>

          {APPLICATION_QUESTIONS.map((question, index) => (
            <div key={question} className="space-y-2">
              <label className="block text-sm font-semibold text-[#092130]">{question}</label>
              <textarea
                value={answers[index]}
                onChange={(e) => handleAnswerChange(index, e.target.value)}
                rows={5}
                className={`${inputClass} resize-none`}
                placeholder="Type your response here..."
              />
            </div>
          ))}

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-[#092130]">Upload Resume</label>
            <div className="rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">
                    {resume ? resume.name : "No file selected"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Accepted formats: PDF, DOC, DOCX</p>
                </div>
                <label className="inline-flex cursor-pointer items-center rounded-md border border-[#114160] bg-white px-4 py-2 text-sm font-medium text-[#114160] transition hover:bg-[#D3E6F2]">
                  Choose File
                  <input type="file" accept=".pdf,.doc,.docx" onChange={handleFileChange} className="hidden" />
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <ul className="space-y-1 text-sm text-red-700">
            {errors.map((error) => (
              <li key={error}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-[#114160] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#092130] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Submitting..." : "Submit Application"}
        </button>
      </div>
    </form>
  );
}
