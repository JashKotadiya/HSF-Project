import { useEffect, useState } from "react";
import supabase from "@/lib/supabase";

export function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === "string").map(value => value.trim()).filter(Boolean))].sort()
    : [];
}

export function useCauseCategories() {
  const [state, setState] = useState<{ categories: string[]; loading: boolean; error: boolean }>({ categories: [], loading: true, error: false });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await supabase.from("cause_categories").select("name").order("name");
        if (error) throw error;
        if (!cancelled) setState({ categories: stringList(data?.map(row => row.name)), loading: false, error: false });
      } catch {
        if (!cancelled) setState(current => ({ ...current, loading: false, error: true }));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [retry]);
  return { ...state, retry: () => setRetry(value => value + 1) };
}

export function useVolunteerInterests(userId: string | undefined) {
  const [state, setState] = useState<{ userId: string; interests: string[]; error: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let latestRequest = 0;
    const load = async () => {
      const request = ++latestRequest;
      try {
        const { data, error } = await supabase.from("volunteer_interests").select("cause").eq("volunteer_id", userId).order("cause");
        if (error) throw error;
        if (!cancelled && request === latestRequest) setState({ userId, interests: stringList(data?.map(row => row.cause)), error: false });
      } catch {
        if (!cancelled && request === latestRequest) setState({ userId, interests: [], error: true });
      }
    };
    void load();
    window.addEventListener("focus", load);
    return () => { cancelled = true; window.removeEventListener("focus", load); };
  }, [userId, retry]);
  const current = userId && state?.userId === userId ? state : null;
  return { interests: current?.interests ?? [], loading: !!userId && !current, error: current?.error ?? false, retry: () => setRetry(value => value + 1) };
}
