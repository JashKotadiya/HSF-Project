
"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";
import { useAuth } from "@/components/auth/AuthProvider";
import supabase from "@/lib/supabase";

type OrganizationSettings = {
  organization_name: string;
  mission_statement: string;
  description: string;
};

const EMPTY_SETTINGS: OrganizationSettings = {
  organization_name: "",
  mission_statement: "",
  description: "",
};

const inputClass =
  "w-full rounded-md border border-[#CBD5E1] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-2 focus:ring-[#D3E6F2]";

function draftKey(userId: string) {
  return `hsf-nonprofit-settings-draft-${userId}`;
}

function readDraft(userId: string): OrganizationSettings | null {
  try {
    const stored = sessionStorage.getItem(draftKey(userId));
    if (!stored) return null;

    const parsed: unknown = JSON.parse(stored);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("organization_name" in parsed) ||
      !("mission_statement" in parsed) ||
      !("description" in parsed) ||
      typeof parsed.organization_name !== "string" ||
      typeof parsed.mission_statement !== "string" ||
      typeof parsed.description !== "string"
    ) {
      return null;
    }

    return {
      organization_name: parsed.organization_name,
      mission_statement: parsed.mission_statement,
      description: parsed.description,
    };
  } catch {
    return null;
  }
}

function writeDraft(
  userId: string,
  draft: OrganizationSettings
) {
  try {
    sessionStorage.setItem(
      draftKey(userId),
      JSON.stringify(draft)
    );
  } catch {
    // The form can still be used if storage is unavailable.
  }
}

function clearDraft(userId: string) {
  try {
    sessionStorage.removeItem(draftKey(userId));
  } catch {
    // Ignore browser storage errors.
  }
}

export default function NonprofitSettingsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const userId = user?.id;

  const [settings, setSettings] =
    useState<OrganizationSettings>(EMPTY_SETTINGS);

  const [savedSettings, setSavedSettings] =
    useState<OrganizationSettings>(EMPTY_SETTINGS);

  const [loadedUserId, setLoadedUserId] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(
    null
  );

  const [message, setMessage] = useState<string | null>(
    null
  );

  // Load the organization settings for the current user.
  useEffect(() => {
    if (authLoading || !userId || role !== "nonprofit") {
      return;
    }

    let cancelled = false;

    async function loadSettings() {
      const { data, error: loadError } = await supabase
        .from("profiles")
        .select(
          "organization_name, mission_statement, description"
        )
        .eq("id", userId)
        .eq("role", "nonprofit")
        .maybeSingle();

      if (cancelled) return;

      if (loadError) {
        setError(
          `Couldn't load organization settings: ${loadError.message}`
        );
      } else if (!data) {
        setError("Organization profile not found.");
      } else {
        const saved: OrganizationSettings = {
          organization_name: data.organization_name ?? "",
          mission_statement: data.mission_statement ?? "",
          description: data.description ?? "",
        };

        setSavedSettings(saved);

        const draft = readDraft(userId);
        setSettings(draft ?? saved);

        setError(null);
      }

      setLoadedUserId(userId);
      setLoading(false);
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [userId, role, authLoading]);

  function updateField(
    field: keyof OrganizationSettings,
    value: string
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
  }

  const hasChanges =
    settings.organization_name !==
      savedSettings.organization_name ||
    settings.mission_statement !==
      savedSettings.mission_statement ||
    settings.description !==
      savedSettings.description;

  function discardChanges() {
    if (!userId || saving) return;

    clearDraft(userId);
    setSettings(savedSettings);
    setError(null);
    setMessage("Unsaved changes discarded.");
  }

  async function handleSave(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !userId ||
      role !== "nonprofit" ||
      loadedUserId !== userId ||
      saving
    ) {
      return;
    }

    const updated: OrganizationSettings = {
      organization_name: settings.organization_name.trim(),
      mission_statement: settings.mission_statement.trim(),
      description: settings.description.trim(),
    };

    if (!updated.organization_name) {
      setError("Organization name is required.");
      return;
    }

    if (!updated.mission_statement) {
      setError("Mission statement is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const { data, error: saveError } = await supabase
        .from("profiles")
        .update(updated)
        .eq("id", userId)
        .eq("role", "nonprofit")
        .select(
          "organization_name, mission_statement, description"
        )
        .single();

      if (saveError) throw saveError;

      const saved: OrganizationSettings = {
        organization_name: data.organization_name ?? "",
        mission_statement: data.mission_statement ?? "",
        description: data.description ?? "",
      };

      setSettings(saved);
      setSavedSettings(saved);
      clearDraft(userId);

      setMessage("Organization settings saved successfully.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Couldn't save organization settings."
      );
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-[#F8FAFC]">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="h-80 animate-pulse rounded-xl bg-white" />
        </div>
      </main>
    );
  }

  if (!user || role !== "nonprofit") {
    return (
      <main className="min-h-screen bg-[#F8FAFC]">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-2xl font-bold text-[#092130]">
            Access restricted
          </h1>
          <p className="mt-3 text-[#475569]">
            Organization settings are only available to
            signed-in nonprofit accounts.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-[#114160] underline"
          >
            Return to home
          </Link>
        </div>
      </main>
    );
  }

  if (loading || loadedUserId !== userId) {
    return (
      <main className="min-h-screen bg-[#F8FAFC]">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="h-80 animate-pulse rounded-xl bg-white" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        title="Organization Settings"
        subtitle="Manage the information that represents your nonprofit organization."
      />

      <div className="mx-auto max-w-3xl px-6 py-12">
        <form
          onSubmit={handleSave}
          className="space-y-8 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="border-b border-[#E2E8F0] pb-5">
            <h2 className="text-xl font-bold text-[#092130]">
              Organization Information
            </h2>
            <p className="mt-2 text-sm text-[#64748B]">
              Keep your nonprofit's details accurate and
              up to date.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {message && (
            <div
              role="status"
              className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-700"
            >
              {message}
            </div>
          )}

          {hasChanges && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D8CCFF] bg-[#F5F1FF] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#4A0E99]">
                  Unsaved changes
                </p>
                <p className="mt-1 text-xs text-[#64748B]">
                  Your draft is preserved when you switch pages.
                  Click Save Changes to update your organization.
                </p>
              </div>

              <button
                type="button"
                onClick={discardChanges}
                disabled={saving}
                className="text-xs font-semibold text-[#4A0E99] underline hover:text-[#32076B] disabled:opacity-60"
              >
                Discard changes
              </button>
            </div>
          )}

          <div>
            <label
              htmlFor="organization-name"
              className="mb-2 block text-sm font-semibold text-[#092130]"
            >
              Organization Name *
            </label>

            <input
              id="organization-name"
              className={inputClass}
              value={settings.organization_name}
              onChange={(event) =>
                updateField(
                  "organization_name",
                  event.target.value
                )
              }
              placeholder="Enter your organization's name"
              required
              maxLength={150}
              disabled={saving || !!error && loadedUserId !== userId}
            />
          </div>

          <div>
            <label
              htmlFor="mission-statement"
              className="mb-2 block text-sm font-semibold text-[#092130]"
            >
              Mission Statement *
            </label>

            <textarea
              id="mission-statement"
              className={`${inputClass} min-h-32 resize-y`}
              value={settings.mission_statement}
              onChange={(event) =>
                updateField(
                  "mission_statement",
                  event.target.value
                )
              }
              placeholder="What is your organization's mission?"
              required
              maxLength={1000}
              disabled={saving}
            />

            <p className="mt-2 text-xs text-[#64748B]">
              Describe the purpose and goals of your nonprofit.
            </p>
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-2 block text-sm font-semibold text-[#092130]"
            >
              Organization Description
            </label>

            <textarea
              id="description"
              className={`${inputClass} min-h-40 resize-y`}
              value={settings.description}
              onChange={(event) =>
                updateField(
                  "description",
                  event.target.value
                )
              }
              placeholder="Tell volunteers more about your organization, its work, and its impact."
              maxLength={3000}
              disabled={saving}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#E2E8F0] pt-6">
            <Link
              href="/nonprofit/dashboard"
              className="rounded-md border border-[#CBD5E1] bg-white px-5 py-3 text-sm font-semibold text-[#092130] transition hover:bg-[#F1F5F9]"
            >
              Back to Dashboard
            </Link>

            <button
              type="submit"
              disabled={saving || !hasChanges || !!error && loadedUserId !== userId}
              className="rounded-md bg-[#114160] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#092130] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
