"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/supabase";
import { useAuth } from "@/components/auth/AuthProvider";
import { contactEmailError, normalizeContactEmail } from "@/lib/contact";

const inputClass =
  "w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]";

/**
 * Lets a volunteer or an organization choose a contact email and whether to share it.
 * The account (login) email is never shown to anyone; this separate address is shared
 * only while sharing is on, with the other person on a pending or approved application.
 */
export default function ContactSharingForm() {
  const { user, role } = useAuth();
  const userId = user?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [share, setShare] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      const { data, error: loadFailure } = await supabase
        .from("profiles")
        .select("contact_email, share_contact")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (loadFailure) {
        setLoadError("Couldn't load your contact settings. Please refresh and try again.");
      } else {
        setEmail(data?.contact_email ?? "");
        setShare(data?.share_contact === true);
      }
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const save = async () => {
    setError(null);
    setSaved(false);
    const problem = contactEmailError(email);
    if (problem) {
      setError(problem);
      return;
    }
    if (!userId) return;

    const contact = normalizeContactEmail(email);
    setSaving(true);
    const { data, error: saveError } = await supabase
      .from("profiles")
      .update({ contact_email: contact, share_contact: contact !== null && share })
      .eq("id", userId)
      .select("contact_email, share_contact")
      .maybeSingle();
    setSaving(false);

    // Keep what was typed when saving fails, so nothing has to be retyped.
    if (saveError || !data) {
      setError("Couldn't save your contact settings. Please try again.");
      return;
    }
    setEmail(data.contact_email ?? "");
    setShare(data.share_contact === true);
    setSaved(true);
  };

  const others = role === "nonprofit" ? "volunteers who apply to your projects" : "organizations you apply to";
  const hasAddress = normalizeContactEmail(email) !== null;

  if (loading && !loadError) {
    return <p className="text-sm text-[#64748B]">Loading your contact settings…</p>;
  }
  if (loadError) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {loadError}
      </p>
    );
  }

  return (
    <div className="space-y-5 rounded-xl border border-[#E2E8F0] bg-white p-6">
      <div>
        <h2 className="text-xl font-bold text-[#092130]">Contact sharing</h2>
        <p className="mt-2 text-sm leading-6 text-[#475569]">
          The email you sign in with stays private. It is only used to sign you in and to send you notifications.
          If you want {others} to be able to reach you, add a contact email below and turn sharing on.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="contact-email" className="block text-sm font-semibold text-[#092130]">
          Contact email (optional)
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setSaved(false);
          }}
          placeholder="name@example.org"
          maxLength={254}
          className={inputClass}
        />
      </div>

      <label className="flex items-start gap-3 text-sm text-[#092130]">
        <input
          type="checkbox"
          checked={share && hasAddress}
          disabled={!hasAddress}
          onChange={(e) => {
            setShare(e.target.checked);
            setSaved(false);
          }}
          className="mt-1 h-4 w-4 accent-[#4A0E99]"
        />
        <span>
          Share this address with {others}, while their application is pending or approved. Turn this off at any time to stop sharing.
        </span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm text-emerald-700">
          Saved. {share && hasAddress ? "Your contact email is shared." : "Nothing is shared."}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-md bg-[#4A0E99] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3a0b78] disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}