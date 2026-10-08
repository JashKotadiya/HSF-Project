import type { Session } from "@supabase/supabase-js";
import supabase from "@/lib/supabase";

/**
 * After sign-in, the session can take a tick to show up in getSession() while
 * the client persists to storage. Dashboards used to redirect to "/" on the
 * first empty read — this waits briefly for a real session.
 */
export async function waitForClientSession(
  maxAttempts = 12,
  delayMs = 50
): Promise<Session | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) return session;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}
