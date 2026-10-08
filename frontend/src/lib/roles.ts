import type { User } from "@supabase/supabase-js";

/** Canonical roles stored in `profiles.role` and used in routes. */
export type AppRole = "volunteer" | "nonprofit";

/**
 * ABC / legacy metadata used `organization`; this app uses `nonprofit` in DB and URLs.
 */
export function normalizeRole(
  profileRole?: string | null,
  metadataRole?: string | null
): AppRole {
  const raw = (profileRole || metadataRole || "volunteer").toLowerCase();
  if (raw === "nonprofit" || raw === "organization" || raw === "org") {
    return "nonprofit";
  }
  return "volunteer";
}

export function normalizeRoleFromUser(
  profile: { role?: string } | null | undefined,
  user: User | null | undefined
): AppRole {
  return normalizeRole(
    profile?.role,
    (user?.user_metadata?.role as string | undefined) ?? null
  );
}

export function dashboardPathForRole(role: AppRole): string {
  return role === "nonprofit" ? "/nonprofit/dashboard" : "/volunteer/dashboard";
}

export function isVolunteerRole(role: AppRole): boolean {
  return role === "volunteer";
}
