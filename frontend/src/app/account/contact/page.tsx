"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import PageHeader from "@/components/layout/PageHeader";
import ContactSharingForm from "@/components/profile/ContactSharingForm";
import { dashboardPathForRole } from "@/lib/roles";

/** Contact sharing settings, for both volunteers and organizations. */
export default function ContactSharingPage() {
  const router = useRouter();
  const { loading, user, role } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#F8FAFC]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#114160] border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        eyebrow="Account"
        title="Contact sharing"
        subtitle="Choose whether the people you work with can reach you directly."
        backHref={role ? dashboardPathForRole(role) : "/"}
        backLabel="Back"
      />
      <div className="mx-auto max-w-2xl px-6 py-10">
        <ContactSharingForm />
      </div>
    </main>
  );
}