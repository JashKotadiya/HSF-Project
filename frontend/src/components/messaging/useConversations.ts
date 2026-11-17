"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MESSAGE_POLL_MS, messagingAPI } from "@/lib/messaging";
import type { Conversation } from "@/lib/messaging";

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const requestVersion = useRef(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true, inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      const version = ++requestVersion.current;
      try {
        const result = await messagingAPI.list();
        if (active && version === requestVersion.current) { setConversations(result); setError(null); }
      } catch (failure) {
        if (active && version === requestVersion.current) setError(failure instanceof Error ? failure.message : "Couldn't load conversations. Please try again.");
      } finally {
        inFlight = false;
        if (active && version === requestVersion.current) setLoading(false);
      }
    };
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    const timer = window.setInterval(refresh, MESSAGE_POLL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [revision]);
  return { conversations, loading, error, reload };
}
export type InboxData = ReturnType<typeof useConversations>;
