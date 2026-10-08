"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import supabase from "@/lib/supabase";
import { waitForClientSession } from "@/lib/auth-session";
import { normalizeRoleFromUser } from "@/lib/roles";
import { useRouter } from "next/navigation";

export default function VolunteerDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("Volunteer");

  useEffect(() => {
    const checkUser = async () => {
      const session = await waitForClientSession();
      if (!session) {
        router.push("/");
        return;
      }

      // Route Protection
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();
      const role = normalizeRoleFromUser(profile, session.user);
      if (role === "nonprofit") {
        router.push("/nonprofit/dashboard");
        return;
      }
      
      if (session.user.email) {
        const namePart = session.user.email.split("@")[0];
        setUserName(namePart.charAt(0).toUpperCase() + namePart.slice(1));
      }
      setLoading(false);
    };

    checkUser();
  }, [router]);

  if (loading) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#F8FAFC]">
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-bold text-[#092130]">Welcome back, {userName}!</h1>
        <p className="mt-2 text-[#475569]">This is your volunteer dashboard.</p>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/volunteer/discover"
            className="inline-flex rounded-lg bg-[#114160] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#092130]"
          >
            Volunteer discovery (MUI job board)
          </Link>
          <Link
            href="/projects"
            className="inline-flex rounded-lg border border-[#CBD5E1] bg-white px-5 py-2.5 text-sm font-semibold text-[#092130] transition hover:bg-[#F8FAFC]"
          >
            Browse projects (directory)
          </Link>
        </div>

        <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#CBD5E1] bg-white py-20 text-center shadow-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#E0F2FE]">
            <svg
              className="h-8 w-8 text-[#0284C7]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#092130]">No Active Applications</h2>
          <p className="mt-2 max-w-md text-sm text-[#475569]">
            You haven't applied to any projects yet. Browse our open opportunities to find a cause that matches your skills!
          </p>
          <Link
            href="/projects"
            className="mt-6 rounded-md bg-[#114160] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#092130]"
          >
            Browse Projects
          </Link>
        </div>
      </main>
    </div>
  );
}