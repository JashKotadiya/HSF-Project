"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import supabase from "@/lib/supabase";
import { normalizeRoleFromUser } from "@/lib/roles";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  
  const [isClient, setIsClient] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
    
    const fetchRole = async (userId: string, user: User) => {
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      return normalizeRoleFromUser(data, user);
    };

    const checkUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user || null);
      if (session?.user) {
        const role = await fetchRole(session.user.id, session.user);
        setUserRole(role);
      } else {
        setUserRole(null);
      }
    };

    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user || null);
        if (session?.user) {
          const role = await fetchRole(session.user.id, session.user);
          setUserRole(role);
        } else {
          setUserRole(null);
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  // Don't render complex logic until client hydration to avoid mismatch
  if (!isClient) return <nav className="h-16 w-full border-b border-[#E2E8F0] bg-white"></nav>;

  const dashboardLink = userRole === "nonprofit" ? "/nonprofit/dashboard" : "/volunteer/dashboard";

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[#E2E8F0] bg-white/80 px-6 py-4 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-extrabold tracking-tight text-[#092130]">
            Human Service Forum
          </span>
        </Link>

        {/* Links */}
        <div className="hidden items-center gap-8 md:flex">
          <Link
            href="/projects"
            className={`text-sm font-semibold transition hover:text-[#114160] ${
              pathname?.startsWith("/projects") ? "text-[#114160]" : "text-[#475569]"
            }`}
          >
            Browse Projects
          </Link>

          {user ? (
            <div className="flex items-center gap-4">
              {userRole === "volunteer" && (
                <Link
                  href="/volunteer/discover"
                  className={`text-sm font-semibold transition hover:text-[#114160] ${
                    pathname?.startsWith("/volunteer/discover")
                      ? "text-[#114160]"
                      : "text-[#475569]"
                  }`}
                >
                  Discover
                </Link>
              )}
              <Link
                href={dashboardLink}
                className={`text-sm font-semibold transition hover:text-[#114160] ${
                  pathname?.includes("/dashboard") ? "text-[#114160]" : "text-[#475569]"
                }`}
              >
                Dashboard
              </Link>
              <button
                onClick={handleSignOut}
                className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2 text-sm font-semibold text-[#092130] transition hover:bg-[#E2E8F0]"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Link
                href="/login"
                className="text-sm font-semibold text-[#475569] transition hover:text-[#114160]"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-[#114160] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#092130]"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>

        {/* Mobile menu */}
        <div className="flex items-center gap-4 md:hidden">
          {user ? (
            <>
              {userRole === "volunteer" && (
                <Link href="/volunteer/discover" className="text-sm font-semibold text-[#114160]">
                  Discover
                </Link>
              )}
              <Link
                href={dashboardLink}
                className="text-sm font-semibold text-[#114160]"
              >
                Dashboard
              </Link>
              <button
                onClick={handleSignOut}
                className="text-sm font-medium text-[#475569] hover:text-[#092130]"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              href="/"
              className="text-sm font-semibold text-[#114160]"
            >
              Log In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
