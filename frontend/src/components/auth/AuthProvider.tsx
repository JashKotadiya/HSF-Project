"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import supabase from "@/lib/supabase";
import { AppRole, normalizeRoleFromUser } from "@/lib/roles";

type AuthState = {
  /** True until the session and the user's role are both known. */
  loading: boolean;
  user: User | null;
  role: AppRole | null;
};

const AuthContext = createContext<AuthState>({ loading: true, user: null, role: null });

export function useAuth() {
  return useContext(AuthContext);
}

/** Looks up the role in `profiles`, creating the row from signup metadata if it's missing. */
async function resolveRole(user: User): Promise<AppRole> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = normalizeRoleFromUser(profile, user);
  if (!profile) {
    await supabase.from("profiles").upsert([{ id: user.id, role }]);
  }
  return role;
}

/**
 * Single source of truth for who is signed in. Mounted once in the root layout,
 * so navigating between pages never re-fetches the session or role.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, user: null, role: null });

  useEffect(() => {
    let currentUserId: string | null = null;
    let cancelled = false;

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;

      if (!user) {
        currentUserId = null;
        setState({ loading: false, user: null, role: null });
        return;
      }

      // Token refreshes re-fire this listener for the same user; keep the known role.
      if (user.id === currentUserId) {
        setState((prev) => ({ ...prev, user }));
        return;
      }

      currentUserId = user.id;
      setState({ loading: true, user, role: null });

      // Supabase can deadlock if other auth calls run inside this callback, so defer.
      setTimeout(async () => {
        const role = await resolveRole(user);
        if (!cancelled && currentUserId === user.id) {
          setState({ loading: false, user, role });
        }
      }, 0);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
