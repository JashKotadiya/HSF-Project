"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";
import { waitForClientSession } from "@/lib/auth-session";
import {
  dashboardPathForRole,
  normalizeRole,
  normalizeRoleFromUser,
} from "@/lib/roles";

type Tab = "volunteer" | "organization";
type Mode = "login" | "signup";

export default function AuthPortal() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("volunteer");
  const [authMode, setAuthMode] = useState<Mode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthRedirect = async () => {
      if (typeof window === "undefined") return;

      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const oauthError =
        params.get("error_description") ?? params.get("error");

      if (oauthError) {
        setError(oauthError);
        window.history.replaceState(null, "", "/");
        return;
      }

      if (code) {
        const { data, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(window.location.href);
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
        window.history.replaceState(null, "", "/");

        const user = data.session?.user;
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();
          const role = normalizeRoleFromUser(profile, user);
          if (!profile) {
            await supabase
              .from("profiles")
              .upsert([{ id: user.id, role }]);
          }
          await waitForClientSession();
          router.replace(dashboardPathForRole(role));
        }
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle();
        const role = normalizeRoleFromUser(data, session.user);
        router.replace(dashboardPathForRole(role));
      }
    };

    void handleAuthRedirect();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const actualRole = activeTab === "organization" ? "nonprofit" : "volunteer";

    try {
      if (authMode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: actualRole,
            },
          },
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          // Only write profiles when we have a JWT. If email confirmation is on,
          // signUp often returns user but no session — RLS blocks anon inserts and
          // triggers this error. Profile is created on first sign-in, or via DB trigger.
          if (data.session) {
            const { error: profileError } = await supabase.from("profiles").upsert([
              { id: data.user.id, role: actualRole },
            ]);
            if (profileError) throw profileError;

            await waitForClientSession();
            router.refresh();
            router.push(`/${actualRole}/dashboard`);
          } else {
            setMessage(
              "Check your email to confirm your account. After you confirm, sign in once — your profile will be created automatically if it does not exist yet."
            );
          }
        }
      } else {
        // Log In
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        if (!data.session) {
          throw new Error(
            "No active session after sign-in. If email confirmation is required in Supabase, confirm your email and try again."
          );
        }

        if (data.user) {
          const { data: profileData, error: profileReadError } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", data.user.id)
            .maybeSingle();

          if (profileReadError) throw profileReadError;

          const dbRole = normalizeRole(
            profileData?.role,
            (data.user.user_metadata?.role as string | undefined) ?? actualRole
          );
          if (!profileData) {
            const { error: upsertError } = await supabase
              .from("profiles")
              .upsert([{ id: data.user.id, role: dbRole }]);
            if (upsertError) throw upsertError;
          }

          await waitForClientSession();

          router.refresh();
          router.replace(dashboardPathForRole(dbRole));
        }
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#F8FAFC] px-4 py-12">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-xl">
        
        {/* Header / Brand */}
        <div className="bg-gradient-to-r from-[#092130] via-[#114160] to-[#4A0E99] px-8 py-10 text-center text-white">
          <h1 className="text-3xl font-extrabold tracking-tight">Join. Connect. Grow.</h1>
          <p className="mt-2 text-sm text-[#D3E6F2]">
            The professional community for human services.
          </p>
        </div>

        <div className="p-8">
          {/* Main Tabs (Volunteer vs Org) */}
          <div className="mb-8 flex rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => { setActiveTab("volunteer"); setError(null); setMessage(null); }}
              className={`flex-1 rounded-md py-2.5 text-sm font-semibold transition ${
                activeTab === "volunteer"
                  ? "bg-white text-[#114160] shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              I am a Volunteer
            </button>
            <button
              onClick={() => { setActiveTab("organization"); setError(null); setMessage(null); }}
              className={`flex-1 rounded-md py-2.5 text-sm font-semibold transition ${
                activeTab === "organization"
                  ? "bg-white text-[#4A0E99] shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              I am an Organization
            </button>
          </div>

          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-[#092130]">
              {authMode === "login" ? "Welcome back" : "Create an account"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {activeTab === "volunteer"
                ? "Find a cause you care about and start making a difference."
                : "Find the right talent to drive your mission forward."}
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#092130]">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#114160] focus:ring-2 focus:ring-[#D3E6F2]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-[#092130]">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#114160] focus:ring-2 focus:ring-[#D3E6F2]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full rounded-lg px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                activeTab === "volunteer" ? "bg-[#114160] hover:bg-[#092130]" : "bg-[#4A0E99] hover:bg-[#32076b]"
              }`}
            >
              {loading
                ? authMode === "login" ? "Signing in..." : "Creating account..."
                : authMode === "login" ? "Sign In" : "Sign Up"}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-slate-500">
            {authMode === "login" ? (
              <>
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setAuthMode("signup"); setError(null); }}
                  className="font-semibold text-[#114160] hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setAuthMode("login"); setError(null); }}
                  className="font-semibold text-[#114160] hover:underline"
                >
                  Log in
                </button>
              </>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}
