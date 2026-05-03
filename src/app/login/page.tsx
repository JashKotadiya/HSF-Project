"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "../../lib/supabase";

type UserRole = "nonprofit" | "volunteer";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      const user = signInData.user;

      if (!user) {
        setError("Login succeeded, but no user was returned.");
        return;
      }

      const metadataRole = user.user_metadata?.role as UserRole | undefined;

      if (!metadataRole || (metadataRole !== "nonprofit" && metadataRole !== "volunteer")) {
        setError("No valid role found for this user.");
        return;
      }

      const { data: existingProfile, error: fetchProfileError } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .maybeSingle();

      if (fetchProfileError) {
        setError(fetchProfileError.message);
        return;
      }

      if (!existingProfile) {
        const { error: insertProfileError } = await supabase.from("profiles").insert([
          {
            id: user.id,
            role: metadataRole,
          },
        ]);

        if (insertProfileError) {
          setError(insertProfileError.message);
          return;
        }
      }

      if (metadataRole === "nonprofit") {
        router.push("/nonprofit/dashboard");
      } else {
        router.push("/volunteer/dashboard");
      }
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong during login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F3F4F6] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#D3E6F2] bg-white shadow-xl">
          <div className="bg-gradient-to-r from-[#092130] via-[#114160] to-[#4A0E99] px-8 py-8 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
              Human Service Forum
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Welcome back</h1>
            <p className="mt-2 text-sm text-white/85">
              Sign in to continue to your account.
            </p>
          </div>

          <div className="px-8 py-8">
            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
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
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#114160] focus:ring-2 focus:ring-[#D3E6F2]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#114160] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#092130] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}