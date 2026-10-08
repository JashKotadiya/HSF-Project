"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import supabase from "@/lib/supabase";
import { AppRole, dashboardPathForRole } from "@/lib/roles";
import { useAuth } from "@/components/auth/AuthProvider";

/** Each role only sees its own area: volunteers find and track projects, nonprofits manage theirs. */
const NAV_LINKS: Record<AppRole, { href: string; label: string }[]> = {
  volunteer: [
    { href: "/projects", label: "Browse Projects" },
    { href: "/volunteer/projects", label: "My Projects" },
  ],
  nonprofit: [
    { href: "/nonprofit/dashboard", label: "My Projects" },
    { href: "/nonprofit/dashboard/applicants", label: "Applicants" },
  ],
};

/** The most specific nav link matching the current path, so parent links don't also light up. */
function activeHref(pathname: string | null, links: { href: string }[]) {
  if (!pathname) return null;
  return (
    links
      .filter((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, user, role } = useAuth();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  const links = user && role ? NAV_LINKS[role] : [];
  const homeHref = user && role ? dashboardPathForRole(role) : "/";
  const currentHref = activeHref(pathname, links);

  return (
    <nav className="sticky top-0 z-50 h-16 w-full border-b border-[#E2E8F0] bg-white/80 px-6 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between">
        <Link href={homeHref} className="flex items-center gap-3">
          <span className="text-xl font-extrabold tracking-tight text-[#092130]">
            Human Service Forum
          </span>
          {role === "nonprofit" && (
            <span className="hidden rounded-full bg-[#EDE9FF] px-2.5 py-0.5 text-xs font-semibold text-[#4A0E99] sm:inline">
              Organization
            </span>
          )}
        </Link>

        <div className="flex items-center gap-6">
          {loading ? (
            <div className="h-9 w-24 animate-pulse rounded-md bg-[#F1F5F9]" />
          ) : (
            <>
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-semibold transition hover:text-[#114160] ${
                    currentHref === link.href ? "text-[#114160]" : "text-[#475569]"
                  }`}
                >
                  {link.label}
                </Link>
              ))}

              {user ? (
                <button
                  onClick={handleSignOut}
                  className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2 text-sm font-semibold text-[#092130] transition hover:bg-[#E2E8F0]"
                >
                  Sign Out
                </button>
              ) : (
                pathname !== "/" && (
                  <Link
                    href="/"
                    className="rounded-md bg-[#114160] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#092130]"
                  >
                    Log In
                  </Link>
                )
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
