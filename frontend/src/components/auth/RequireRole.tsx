"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppRole, dashboardPathForRole } from "@/lib/roles";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Renders children only for a signed-in user with `role`. Guests go to the
 * login page; users with the other role go to their own home page.
 */
export default function RequireRole({
  role,
  children,
}: {
  role: AppRole;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { loading, user, role: actualRole } = useAuth();
  const allowed = !loading && !!user && actualRole === role;

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/");
    else if (actualRole && actualRole !== role) router.replace(dashboardPathForRole(actualRole));
  }, [loading, user, actualRole, role, router]);

  if (!allowed) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#F8FAFC]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#114160] border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
