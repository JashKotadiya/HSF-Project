"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";
import { dashboardPathForRole } from "@/lib/roles";
import { useAuth } from "@/components/auth/AuthProvider";

type Tab = "volunteer" | "organization";
type Mode = "login" | "signup";

export default function AuthPortal() {
  const router = useRouter();
  const { loading: authLoading, user, role } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>("volunteer");
  const [authMode, setAuthMode] = useState<Mode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Supabase redirects back here with ?error=... when an email/OAuth link fails.
  const [error, setError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("error_description") ?? params.get("error");
  });
  const [message, setMessage] = useState<string | null>(null);

  // Signed-in users (including right after login/signup) go straight to their area.
  useEffect(() => {
    if (user && role) router.replace(dashboardPathForRole(role));
  }, [user, role, router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (params.has("error") || params.has("error_description")) {
      window.history.replaceState(null, "", "/");
      return;
    }

    if (code) {
      void supabase.auth.exchangeCodeForSession(window.location.href).then(({ error: exchangeError }) => {
        if (exchangeError) setError(exchangeError.message);
        window.history.replaceState(null, "", "/");
      });
    }
  }, []);

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
          options: { data: { role: actualRole } },
        });
        if (signUpError) throw signUpError;

        // With email confirmation on, there's no session yet; the profile is
        // created on first sign-in (or by the DB trigger).
        if (!data.session) {
          setMessage(
            "Check your email to confirm your account. After you confirm, sign in once — your profile will be created automatically if it does not exist yet."
          );
          setLoading(false);
        }
      } else {
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
      }
      // On success the auth provider picks up the session and the effect above redirects.
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  };

  if (authLoading || user) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#F8FAFC]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#114160] border-t-transparent" />
      </div>
    );
  }

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
                Don&apos;t have an account?{" "}
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
