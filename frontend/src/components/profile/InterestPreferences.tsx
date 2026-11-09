"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import supabase from "@/lib/supabase";
import { stringList, useCauseCategories, useVolunteerInterests } from "@/lib/interests";

function draftKey(userId: string) { return `hsf-interest-draft-${userId}`; }

export default function InterestPreferences() {
  const { user, role, loading: authLoading } = useAuth();
  const userId = !authLoading && role === "volunteer" ? user?.id : undefined;
  const categories = useCauseCategories();
  const saved = useVolunteerInterests(userId);
  const [editor, setEditor] = useState<{ userId: string; selected: string[]; dirty: boolean } | null>(null);
  const [feedback, setFeedback] = useState<{ userId: string; error: boolean; message: string } | null>(null);
  const [savingFor, setSavingFor] = useState<string | null>(null);
  const saving = useRef(false);
  const activeUser = useRef(userId);
  useEffect(() => { activeUser.current = userId; }, [userId]);
  useEffect(() => {
    if (!userId) return;
    try {
      const raw = window.sessionStorage.getItem(draftKey(userId));
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every(value => typeof value === "string")) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore an external browser draft after hydration.
          setEditor({ userId, selected: stringList(parsed), dirty: true });
        }
      }
    } catch { /* Editing also works when storage is unavailable. */ }
  }, [userId]);

  if (!userId) return null;
  const current = editor?.userId === userId ? editor : null;
  const selected = current?.selected ?? saved.interests;
  const disabled = saved.loading || saved.error || categories.loading || categories.error || savingFor === userId;
  const message = feedback?.userId === userId ? feedback : null;
  const change = (next: string[]) => {
    setEditor({ userId, selected: next, dirty: true });
    setFeedback(null);
    try { window.sessionStorage.setItem(draftKey(userId), JSON.stringify(next)); } catch { /* Optional draft. */ }
  };
  const save = async () => {
    if (disabled || saving.current) return;
    saving.current = true;
    setSavingFor(userId);
    setFeedback(null);
    try {
      const { data, error } = await supabase.rpc("save_my_interests", { p_causes: selected });
      if (error) throw error;
      if (activeUser.current !== userId) return;
      const persisted = stringList(data?.map((row: { cause: string }) => row.cause));
      setEditor({ userId, selected: persisted, dirty: false });
      try { window.sessionStorage.removeItem(draftKey(userId)); } catch { /* Optional draft. */ }
      setFeedback({ userId, error: false, message: "Your interests were saved." });
    } catch {
      if (activeUser.current === userId) setFeedback({ userId, error: true, message: "Couldn't save your interests. Your selections are still here; please try again." });
    } finally {
      saving.current = false;
      setSavingFor(null);
    }
  };

  return (
    <section aria-labelledby="interests-heading" className="mt-8 space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8">
      <h2 id="interests-heading" className="text-xl font-bold text-[#092130]">Interests / Cause Areas</h2>
      <p className="text-sm text-[#475569]">Choose causes you care about, then select Use my interests when browsing projects. These are separate from your technical skills.</p>
      {(saved.error || categories.error) && (
        <div role="alert" className="text-sm text-red-700">
          Couldn&apos;t load your interests.
          <button type="button" className="ml-2 underline" onClick={() => { saved.retry(); categories.retry(); }}>Retry interests</button>
        </div>
      )}
      {saved.loading || categories.loading ? <p role="status">Loading interests...</p> : (
        <fieldset disabled={disabled} className="space-y-2">
          <legend className="sr-only">Your interests</legend>
          {stringList([...categories.categories, ...selected]).map(cause => (
            <label key={cause} className="flex items-center gap-2 text-sm text-[#475569]">
              <input type="checkbox" checked={selected.includes(cause)} onChange={() => change(selected.includes(cause) ? selected.filter(value => value !== cause) : stringList([...selected, cause]))} />
              {cause}
            </label>
          ))}
        </fieldset>
      )}
      {current?.dirty && <p className="text-sm text-[#475569]">Unsaved interest selections</p>}
      {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-red-700" : "text-sm text-green-700"}>{message.message}</p>}
      <div className="flex gap-4">
        <button type="button" disabled={disabled} onClick={() => void save()} className="rounded-md bg-[#114160] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">{savingFor === userId ? "Saving interests..." : "Save interests"}</button>
        <button type="button" disabled={disabled || selected.length === 0} onClick={() => change([])} className="text-sm font-semibold text-[#114160] underline disabled:opacity-60">Clear interests</button>
      </div>
    </section>
  );
}
