import supabase from "@/lib/supabase";
import type { AppRole } from "@/lib/roles";
import { messagingAPI } from "@/lib/messaging";

export type MessageRecipient = { id: string; name: string; project: string; status: string };
export const RECIPIENT_PAGE_SIZE = 30;

/** Application RLS and the RPC both enforce membership; no contact emails are requested. */
export async function listMessageRecipients(userId: string, role: AppRole, offset = 0) {
  let query = supabase.from("applications")
    .select(`id, applicant_name, status, created_at, ${role === "nonprofit" ? "posts!inner" : "posts"}(title, organization_name, user_id)`)
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(offset, offset + RECIPIENT_PAGE_SIZE - 1);
  query = role === "volunteer" ? query.eq("volunteer_id", userId) : query.eq("posts.user_id", userId);
  const { data, error } = await query;
  if (error) throw new Error("Couldn't load available applications. Please try again.");
  return Promise.all((data ?? []).map(async row => {
    const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
    // Closed project rows can be hidden by discovery RLS for volunteers.
    // The existing conversation RPC still authorizes the application participant.
    if (!post) {
      const context = await messagingAPI.open(row.id);
      return { id: row.id, name: context.participant_name, project: context.project_title, status: context.application_status };
    }
    return { id: row.id, name: role === "volunteer" ? post?.organization_name || "Organization" : row.applicant_name || "Volunteer", project: post?.title || "Project", status: row.status };
  })) as Promise<MessageRecipient[]>;
}
