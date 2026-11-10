"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";
import { useAuth } from "@/components/auth/AuthProvider";
import supabase from "@/lib/supabase";
type OrganizationSettings = {
    organization_name: string;
    mission_statement: string;
    description: string;
    contact_email: string;
    share_contact_email: boolean;
};
const EMPTY_SETTINGS: OrganizationSettings = {
    organization_name: "",
    mission_statement: "",
    description: "",
    contact_email: "",
    share_contact_email: false,
};
const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const inputClass = "w-full rounded-md border border-[#CBD5E1] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-2 focus:ring-[#D3E6F2]";
function draftKey(userId: string) {
    return `hsf-nonprofit-settings-draft-${userId}`;
}
function readDraft(userId: string): OrganizationSettings | null {
    try {
        const stored = sessionStorage.getItem(draftKey(userId));
        if (!stored)
            return null;
        const parsed: unknown = JSON.parse(stored);
        if (typeof parsed !== "object" ||
            parsed === null ||
            !("organization_name" in parsed) ||
            !("mission_statement" in parsed) ||
            !("description" in parsed) ||
            typeof parsed.organization_name !== "string" ||
            typeof parsed.mission_statement !== "string" ||
            typeof parsed.description !== "string") {
            return null;
        }
        const draft = parsed as Record<string, unknown>;
        return {
            organization_name: parsed.organization_name,
            mission_statement: parsed.mission_statement,
            description: parsed.description,
            contact_email: typeof draft.contact_email === "string" ? draft.contact_email : "",
            share_contact_email: draft.share_contact_email === true,
        };
    }
    catch {
        return null;
    }
}
function writeDraft(userId: string, draft: OrganizationSettings) {
    try {
        sessionStorage.setItem(draftKey(userId), JSON.stringify(draft));
    }
    catch {
        // The form can still be used if storage is unavailable.
    }
}
function clearDraft(userId: string) {
    try {
        sessionStorage.removeItem(draftKey(userId));
    }
    catch {
        // Ignore browser storage errors.
    }
}
export default function NonprofitSettingsPage() {
    const { user, role, loading: authLoading } = useAuth();
    const userId = user?.id;
    const saveRequestRef = useRef(0);
    const [settings, setSettings] = useState<OrganizationSettings>(EMPTY_SETTINGS);
    const [savedSettings, setSavedSettings] = useState<OrganizationSettings>(EMPTY_SETTINGS);
    const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [retryCount, setRetryCount] = useState(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    useEffect(() => {
        return () => {
            // Invalidate any save started by the previous account.
            saveRequestRef.current += 1;
        };
    }, [userId]);
    // Invalidate pending saves as soon as Supabase reports a session change.
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user?.id !== userId) {
                saveRequestRef.current += 1;
            }
        });
        return () => subscription.unsubscribe();
    }, [userId]);
    // Load the organization settings for the current user.
    useEffect(() => {
        if (authLoading || !userId || role !== "nonprofit") {
            return;
        }
        let cancelled = false;
        async function loadSettings() {
            // Avoid synchronous state updates in the effect.
            await Promise.resolve();
            if (cancelled)
                return;
            setLoading(true);
            setLoadedUserId(null);
            setSaving(false);
            setError(null);
            setMessage(null);
            try {
                const { data, error: loadError } = await supabase
                    .from("profiles")
                    .select("organization_name, mission_statement, description, contact_email, share_contact_email")
                    .eq("id", userId)
                    .in("role", ["nonprofit", "organization", "org"])
                    .maybeSingle();
                if (cancelled)
                    return;
                if (loadError) {
                    throw new Error(`Couldn't load organization settings: ${loadError.message}`);
                }
                if (!data) {
                    throw new Error("Organization profile not found. Please retry loading.");
                }
                const saved: OrganizationSettings = {
                    organization_name: data.organization_name ?? "",
                    mission_statement: data.mission_statement ?? "",
                    description: data.description ?? "",
                    contact_email: data.contact_email ?? "",
                    share_contact_email: data.share_contact_email ?? false,
                };
                // Only a successful read enables editing and saving.
                setSavedSettings(saved);
                setSettings(readDraft(userId) ?? saved);
                setLoadedUserId(userId);
                setError(null);
            }
            catch (loadFailure) {
                if (cancelled)
                    return;
                setLoadedUserId(null);
                setError(loadFailure instanceof Error
                    ? loadFailure.message
                    : "Couldn't load organization settings.");
            }
            finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }
        void loadSettings();
        return () => {
            cancelled = true;
        };
    }, [userId, role, authLoading, retryCount]);
    function updateField<K extends keyof OrganizationSettings>(
        field: K,
        value: OrganizationSettings[K]
    ) {
        if (!userId || loadedUserId !== userId || saving) {
            return;
        }
        const updated = {
            ...settings,
            [field]: value,
        };
        setSettings(updated);
        writeDraft(userId, updated);
        setMessage(null);
        setError(null);
    }
    const hasChanges = settings.organization_name !==
        savedSettings.organization_name ||
        settings.mission_statement !==
            savedSettings.mission_statement ||
        settings.description !==
            savedSettings.description ||
        settings.contact_email !==
            savedSettings.contact_email ||
        settings.share_contact_email !==
            savedSettings.share_contact_email;
    function discardChanges() {
        if (!userId || saving)
            return;
        clearDraft(userId);
        setSettings(savedSettings);
        setError(null);
        setMessage("Unsaved changes discarded.");
    }
    async function handleSave(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!userId ||
            role !== "nonprofit" ||
            loadedUserId !== userId ||
            saving) {
            return;
        }
        const contactEmail = settings.contact_email.trim();
        if (
            contactEmail &&
            (contactEmail.length > 254 || !CONTACT_EMAIL_PATTERN.test(contactEmail))
        ) {
            setError("Please enter a valid contact email address.");
            return;
        }
        const updated: OrganizationSettings = {
            organization_name: settings.organization_name.trim(),
            mission_statement: settings.mission_statement.trim(),
            description: settings.description.trim(),
            contact_email: contactEmail,
            share_contact_email: contactEmail !== "" && settings.share_contact_email,
        };
        if (!updated.organization_name) {
            setError("Organization name is required.");
            return;
        }
        if (!updated.mission_statement) {
            setError("Mission statement is required.");
            return;
        }
        const savingUserId = userId;
        const requestId = ++saveRequestRef.current;
        let canUpdateCurrentAccount = false;
        setSaving(true);
        setError(null);
        setMessage(null);
        try {
            const { data, error: saveError } = await supabase
                .from("profiles")
                .update({
                    organization_name: updated.organization_name,
                    mission_statement: updated.mission_statement,
                    description: updated.description,
                    contact_email: updated.contact_email || null,
                    share_contact_email: updated.share_contact_email,
                })
                .eq("id", savingUserId)
                .in("role", ["nonprofit", "organization", "org"])
                .select("organization_name, mission_statement, description, contact_email, share_contact_email")
                .single();
            // Verify the session itself, not just the user ID captured by
            // this render. A save may complete before React renders a new user.
            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (requestId !== saveRequestRef.current ||
                authError ||
                authData.user?.id !== savingUserId) {
                return;
            }
            canUpdateCurrentAccount = true;
            if (saveError)
                throw saveError;
            if (!data)
                throw new Error("Organization settings were not saved.");
            const saved: OrganizationSettings = {
                organization_name: data.organization_name ?? "",
                mission_statement: data.mission_statement ?? "",
                description: data.description ?? "",
                contact_email: data.contact_email ?? "",
                share_contact_email: data.share_contact_email ?? false,
            };
            // Guard the form, saved baseline, and draft against stale saves.
            if (requestId !== saveRequestRef.current)
                return;
            setSettings(saved);
            setSavedSettings(saved);
            clearDraft(savingUserId);
            setMessage("Organization settings saved successfully.");
        }
        catch (saveFailure) {
            if (!canUpdateCurrentAccount ||
                requestId !== saveRequestRef.current)
                return;
            setError(saveFailure instanceof Error
                ? saveFailure.message
                : "Couldn't save organization settings.");
        }
        finally {
            // An old request must not clear the new account's saving state.
            if (canUpdateCurrentAccount && requestId === saveRequestRef.current) {
                setSaving(false);
            }
        }
    }
    if (authLoading) {
        return (<main className="min-h-screen bg-[#F8FAFC]">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="h-80 animate-pulse rounded-xl bg-white"/>
        </div>
      </main>);
    }
    if (!user || role !== "nonprofit") {
        return (<main className="min-h-screen bg-[#F8FAFC]">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-2xl font-bold text-[#092130]">
            Access restricted
          </h1>
          <p className="mt-3 text-[#475569]">
            Organization settings are only available to
            signed-in nonprofit accounts.
          </p>
          <Link href="/" className="mt-6 inline-block text-[#114160] underline">
            Return to home
          </Link>
        </div>
      </main>);
    }
    if (loading) {
        return (<main className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="h-80 animate-pulse rounded-xl bg-white"/>
      </div>
    </main>);
    }
    if (loadedUserId !== userId) {
        return (<main className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold text-[#092130]">
            Unable to load organization settings
          </h1>
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error ?? "Your organization information could not be loaded."}
          </p>
          <p className="mt-3 text-sm text-[#64748B]">
            Your saved organization information has not been changed.
            Please retry before editing your settings.
          </p>
          <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="mt-6 rounded-md bg-[#114160] px-5 py-3 text-sm font-semibold text-white hover:bg-[#092130]">
            Retry loading
          </button>
        </div>
      </div>
    </main>);
    }
    return (<main className="min-h-screen bg-[#F8FAFC]">
      <PageHeader title="Organization Settings" subtitle="Manage the information that represents your nonprofit organization."/>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <form onSubmit={handleSave} className="space-y-8 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8">
          <div className="border-b border-[#E2E8F0] pb-5">
            <h2 className="text-xl font-bold text-[#092130]">
              Organization Information
            </h2>
            <p className="mt-2 text-sm text-[#64748B]">
              Keep your nonprofit&apos;s details accurate and
            </p>
          </div>
          {error && (<div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>)}
          {message && (<div role="status" className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              {message}
            </div>)}
          {hasChanges && (<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D8CCFF] bg-[#F5F1FF] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#4A0E99]">
                  Unsaved changes
                </p>
                <p className="mt-1 text-xs text-[#64748B]">
                  Your draft is preserved when you switch pages.
                  Click Save Changes to update your organization.
                </p>
              </div>
              <button type="button" onClick={discardChanges} disabled={saving} className="text-xs font-semibold text-[#4A0E99] underline hover:text-[#32076B] disabled:opacity-60">
                Discard changes
              </button>
            </div>)}
          <div>
            <label htmlFor="organization-name" className="mb-2 block text-sm font-semibold text-[#092130]">
              Organization Name *
            </label>
            <input id="organization-name" className={inputClass} value={settings.organization_name} onChange={(event) => updateField("organization_name", event.target.value)} placeholder="Enter your organization's name" required maxLength={150} disabled={saving || loadedUserId !== userId}/>
          </div>
          <div>
            <label htmlFor="mission-statement" className="mb-2 block text-sm font-semibold text-[#092130]">
              Mission Statement *
            </label>
            <textarea id="mission-statement" className={`${inputClass} min-h-32 resize-y`} value={settings.mission_statement} onChange={(event) => updateField("mission_statement", event.target.value)} placeholder="What is your organization's mission?" required maxLength={1000} disabled={saving}/>
            <p className="mt-2 text-xs text-[#64748B]">
              Describe the purpose and goals of your nonprofit.
            </p>
          </div>
          <div>
            <label htmlFor="description" className="mb-2 block text-sm font-semibold text-[#092130]">
              Organization Description
            </label>
            <textarea id="description" className={`${inputClass} min-h-40 resize-y`} value={settings.description} onChange={(event) => updateField("description", event.target.value)} placeholder="Tell volunteers more about your organization, its work, and its impact." maxLength={3000} disabled={saving}/>
          </div>
          <div className="border-t border-[#E2E8F0] pt-6">
            <h3 className="text-lg font-bold text-[#092130]">Contact Preferences</h3>
            <p className="mt-2 text-sm text-[#64748B]">
              Choose whether volunteers who apply to your projects can contact your organization by email.
            </p>
          </div>
          <div>
            <label htmlFor="contact-email" className="mb-2 block text-sm font-semibold text-[#092130]">
              Contact Email (Optional)
            </label>
            <input
              id="contact-email"
              type="email"
              className={inputClass}
              value={settings.contact_email}
              onChange={(event) => updateField("contact_email", event.target.value)}
              placeholder="contact@organization.org"
              maxLength={254}
              disabled={saving}
            />
            <p className="mt-2 text-xs text-[#64748B]">
              This is separate from your login email. Providing a contact email is completely optional.
            </p>
          </div>
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={settings.share_contact_email}
                onChange={(event) => updateField("share_contact_email", event.target.checked)}
                disabled={saving || !settings.contact_email.trim()}
                className="mt-1 h-4 w-4 accent-[#114160]"
              />
              <span>
                <span className="block text-sm font-semibold text-[#092130]">
                  Share my contact email with applicants
                </span>
                <span className="mt-1 block text-sm text-[#64748B]">
                  When enabled, volunteers who have applied to your projects can see this address while their application is pending or approved.
                </span>
              </span>
            </label>
          </div>
          <p className="text-xs text-[#64748B]">
            If you leave this option unchecked, your contact email will not be shown to applicants.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#E2E8F0] pt-6">
            <Link href="/nonprofit/dashboard" className="rounded-md border border-[#CBD5E1] bg-white px-5 py-3 text-sm font-semibold text-[#092130] transition hover:bg-[#F1F5F9]">
              Back to Dashboard
            </Link>
            <button type="submit" disabled={saving || !hasChanges || loadedUserId !== userId} className="rounded-md bg-[#114160] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#092130] disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </main>);
}
