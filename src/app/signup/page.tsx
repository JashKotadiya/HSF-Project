"use client";

import React, { useState } from "react";
import supabase from "../../lib/supabase";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"nonprofit" | "volunteer">("volunteer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

 try {
 const { data, error: signUpError } = await supabase.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: "http://localhost:3000/confirmed",
    data: {
      role,
    },
  },
});

  if (signUpError) {
    setError(signUpError.message);
    return;
  }

  setSuccess("Signup successful — please check your email to verify your account.");
  setEmail("");
  setPassword("");
  setRole("volunteer");

} catch (err: any) {
  setError(err?.message ?? String(err));
} finally {
  setLoading(false);
}};
  return (
    <main className="min-h-screen bg-[#F3F4F6] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#D3E6F2] bg-white shadow-xl">
          <div className="bg-gradient-to-r from-[#092130] via-[#114160] to-[#4A0E99] px-8 py-8 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
              Human Service Forum
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Create your account
            </h1>
            <p className="mt-2 text-sm text-white/85">
              Join HSF to apply for volunteer projects or post opportunities.
            </p>
          </div>

          <div className="px-8 py-8">
            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-1 block text-sm font-semibold text-[#092130]">
                  Email
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
                  placeholder="Enter a secure password"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#114160] focus:ring-2 focus:ring-[#D3E6F2]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-[#092130]">
                  Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "nonprofit" | "volunteer")}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#114160] focus:ring-2 focus:ring-[#D3E6F2]"
                >
                  <option value="volunteer">Volunteer</option>
                  <option value="nonprofit">Nonprofit Organization</option>
                </select>
              </div>

              <p className="text-center text-xs leading-5 text-slate-500">
                By signing up, you agree to our terms and privacy policy.
              </p>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#114160] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#092130] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Creating account..." : "Sign up"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}