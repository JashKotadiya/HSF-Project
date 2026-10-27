import supabase, { createLoginClient } from "@/lib/supabase";
import { AppRole, normalizeRoleFromUser } from "@/lib/roles";

/** Publish a session only after the account matches the selected login role. */
export async function signInWithRole(
  email: string,
  password: string,
  expectedRole: AppRole
) {
  const loginClient = createLoginClient();
  let authenticated = false;
  let accepted = false;

  try {
    const { data, error } = await loginClient.auth.signInWithPassword({ email, password });
    authenticated = !!data.session;
    if (error) throw error;
    if (!data.session || !data.user) {
      throw new Error("Couldn't start your session. Please confirm your email and try again.");
    }

    const { data: profile, error: profileError } = await loginClient
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileError) {
      throw new Error("Couldn't verify your account type. Please try again.");
    }

    const actualRole = normalizeRoleFromUser(profile, data.user);
    if (actualRole !== expectedRole) {
      throw new Error(
        actualRole === "nonprofit"
          ? 'This is an organization account. Select "I am an Organization" to sign in.'
          : 'This is a volunteer account. Select "I am a Volunteer" to sign in.'
      );
    }

    const { data: activeSession, error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (sessionError) throw sessionError;
    if (!activeSession.session) {
      throw new Error("Couldn't start your session. Please try again.");
    }
    accepted = true;
  } finally {
    if (authenticated && !accepted) {
      // Revoke only this temporary sign-in, not the user's other sessions.
      await loginClient.auth.signOut({ scope: "local" }).catch(() => undefined);
    }
    // Release the temporary client's browser visibility listener as well.
    await loginClient.auth.stopAutoRefresh();
  }
}
