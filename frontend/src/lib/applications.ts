export type ApplicationStatus = "pending" | "approved" | "rejected";

/** Row shape of the `applications` table (see supabase/applications.sql). */
export interface Application {
  id: string;
  project_id: string;
  volunteer_id: string;
  status: ApplicationStatus;
  created_at: string;
  resume_path?: string | null;
  answers?: { q: string; a: string }[] | null;
  applicant_name?: string | null;
  applicant_email?: string | null;
}

export const APPLICATION_QUESTIONS = [
  "Why are you interested in this project?",
  "What relevant experience do you have?",
  "What is your availability over the next few weeks?",
];

export const RESUME_BUCKET = "resumes";

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: "Under review",
  approved: "Approved",
  rejected: "Not selected",
};

export const STATUS_STYLES: Record<ApplicationStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-slate-100 text-slate-600",
};

export const SETUP_HINT =
  "Applications aren't fully set up in Supabase yet. Run supabase/applications.sql in the Supabase SQL Editor.";
