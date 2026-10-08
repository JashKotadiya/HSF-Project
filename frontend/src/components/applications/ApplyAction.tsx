"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { useAuth } from "@/components/auth/AuthProvider";
import type { ApplicationStatus } from "@/lib/applications";
import StatusBadge from "@/components/applications/StatusBadge";

/** "Apply now" for new projects; the application status if the volunteer already applied. */
export default function ApplyAction({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [status, setStatus] = useState<ApplicationStatus | null | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      const { data } = await supabase
        .from("applications")
        .select("status")
        .eq("project_id", projectId)
        .eq("volunteer_id", userId)
        .maybeSingle();
      setStatus((data?.status as ApplicationStatus) ?? null);
    };
    void load();
  }, [projectId, userId]);

  if (status === undefined) {
    return <div className="h-11 w-full animate-pulse rounded-md bg-[#F1F5F9]" />;
  }

  if (status) {
    return (
      <div className="space-y-3 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[#092130]">Your application</span>
          <StatusBadge status={status} />
        </div>
        <Link href="/volunteer/projects" className="block text-sm font-semibold text-[#114160] hover:underline">
          View in My Projects →
        </Link>
      </div>
    );
  }

  return (
    <Link
      href={`/projects/${projectId}/apply`}
      className="block w-full rounded-md bg-[#114160] px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#092130]"
    >
      Apply now
    </Link>
  );
}
