"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/supabase";

type State = { status: "loading" } | { status: "error" } | { status: "done"; email: string | null };

/**
 * The other person's contact email for an application, if they chose to share one.
 * Only an address someone explicitly shared is ever shown: the database returns it
 * only to the applicant and the project owner, for pending and approved applications.
 */
export default function SharedContact({ applicationId, label = "Contact" }: { applicationId: string; label?: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState({ status: "loading" });
      const { data, error } = await supabase.rpc("get_shared_contact", { p_application_id: applicationId });
      if (cancelled) return;
      if (error) setState({ status: "error" });
      else setState({ status: "done", email: typeof data === "string" && data.trim() ? data : null });
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  if (state.status === "loading") return null;
  if (state.status === "error") {
    return <p className="text-sm text-[#64748B]">Couldn&apos;t check for a shared contact email.</p>;
  }
  if (!state.email) {
    return <p className="text-sm text-[#64748B]">{label}: no contact email shared</p>;
  }
  return (
    <p className="text-sm text-[#64748B]">
      {label}:{" "}
      <a href={`mailto:${state.email}`} className="font-semibold text-[#114160] hover:underline">
        {state.email}
      </a>
    </p>
  );
}