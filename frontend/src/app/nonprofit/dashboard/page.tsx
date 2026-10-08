"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { useAuth } from "@/components/auth/AuthProvider";
import PageHeader from "@/components/layout/PageHeader";

interface Post {
  id: string;
  title: string;
  content: string;
  status: "Draft" | "Active" | "Closed";
  poster_name?: string;
  created_at: string;
}

type ApplicantCounts = Record<string, { total: number; pending: number }>;

async function loadPosts(uid: string) {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  if (error || !data) return { error: error?.message ?? "Unknown error" };

  const ids = data.map((p) => p.id);
  const { data: apps } = ids.length
    ? await supabase.from("applications").select("project_id, status").in("project_id", ids)
    : { data: [] };
  const counts: ApplicantCounts = {};
  for (const app of apps ?? []) {
    const entry = (counts[app.project_id] ??= { total: 0, pending: 0 });
    entry.total += 1;
    if (app.status === "pending") entry.pending += 1;
  }
  return { posts: data as Post[], counts };
}

export default function NonprofitDashboard() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const emailName = user?.email?.split("@")[0] ?? "";
  const userName = emailName ? emailName.charAt(0).toUpperCase() + emailName.slice(1) : "User";

  const [posts, setPosts] = useState<Post[]>([]);
  const [applicantCounts, setApplicantCounts] = useState<ApplicantCounts>({});
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchPosts = useCallback((uid: string) => {
    return loadPosts(uid).then((result) => {
      if ("error" in result) {
        setActionError(`Couldn't load your projects: ${result.error}`);
      } else {
        setPosts(result.posts);
        setApplicantCounts(result.counts);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (userId) void fetchPosts(userId);
  }, [userId, fetchPosts]);

  const handleStatusChange = async (postId: string, newStatus: Post["status"]) => {
    setActionError(null);
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: newStatus } : p)));

    const { error } = await supabase
      .from("posts")
      .update({ status: newStatus })
      .eq("id", postId);

    if (error && userId) {
      setActionError(`Couldn't update the project status: ${error.message}`);
      void fetchPosts(userId);
    }
  };

  const handleDelete = async (postId: string) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this project?");
    if (!confirmDelete) return;

    setActionError(null);
    setPosts((prev) => prev.filter((p) => p.id !== postId));

    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error && userId) {
      setActionError(`Couldn't delete the project: ${error.message}`);
      void fetchPosts(userId);
    }
  };

  const activePosts = posts.filter((p) => p.status === "Active");
  const draftPosts = posts.filter((p) => p.status === "Draft");
  const closedPosts = posts.filter((p) => p.status === "Closed");

  const pendingApplicants = Object.values(applicantCounts).reduce((sum, c) => sum + c.pending, 0);

  const stats = [
    { label: "Live projects", value: activePosts.length },
    { label: "Drafts", value: draftPosts.length },
    { label: "Completed", value: closedPosts.length },
    { label: "Applicants to review", value: pendingApplicants },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        eyebrow={`Welcome back, ${userName}`}
        title="My Projects"
        subtitle="Create, publish, and manage your organization's volunteer projects."
        actions={
          <>
            <Link
              href="/nonprofit/dashboard/applicants"
              className="inline-flex items-center justify-center rounded-md border border-white/40 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Applicants{pendingApplicants > 0 ? ` (${pendingApplicants} new)` : ""}
            </Link>
            <Link
              href="/nonprofit/dashboard/edit/new"
              className="inline-flex items-center justify-center rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-[#114160] transition hover:bg-[#D3E6F2]"
            >
              + Create Project
            </Link>
          </>
        }
      >
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-white/15 bg-white/10 px-5 py-4">
              <p className="text-3xl font-extrabold">{loading ? "–" : s.value}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-[#D3E6F2]">{s.label}</p>
            </div>
          ))}
        </div>
      </PageHeader>

      <main className="mx-auto max-w-7xl px-6 py-12">
        {actionError && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {actionError}
          </div>
        )}
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-xl bg-white shadow-sm" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#CBD5E1] bg-white py-24 text-center">
            <h3 className="text-lg font-medium text-[#092130]">No projects found</h3>
            <p className="mt-2 text-sm text-[#475569]">Create your first project to get started!</p>
            <Link
              href="/nonprofit/dashboard/edit/new"
              className="mt-6 inline-flex items-center justify-center rounded-md border border-[#114160] px-4 py-2 text-sm font-semibold text-[#114160] transition hover:bg-[#D3E6F2]"
            >
              Create Project
            </Link>
          </div>
        ) : (
          <div className="space-y-10">
            {activePosts.length > 0 && (
              <PostSection
                title={`Live Projects (${activePosts.length})`}
                posts={activePosts}
                applicantCounts={applicantCounts}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            )}
            {draftPosts.length > 0 && (
              <PostSection
                title={`Drafts (${draftPosts.length})`}
                posts={draftPosts}
                applicantCounts={applicantCounts}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            )}
            {closedPosts.length > 0 && (
              <PostSection
                title={`Completed (${closedPosts.length})`}
                posts={closedPosts}
                applicantCounts={applicantCounts}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function PostSection({
  title,
  posts,
  applicantCounts,
  onStatusChange,
  onDelete,
}: {
  title: string;
  posts: Post[];
  applicantCounts: ApplicantCounts;
  onStatusChange: (id: string, status: Post["status"]) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-bold text-[#475569]">{title}</h2>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            applicants={applicantCounts[post.id] ?? { total: 0, pending: 0 }}
            onStatusChange={(status) => onStatusChange(post.id, status)}
            onDelete={() => onDelete(post.id)}
          />
        ))}
      </div>
    </section>
  );
}

function PostCard({
  post,
  applicants,
  onStatusChange,
  onDelete,
}: {
  post: Post;
  applicants: { total: number; pending: number };
  onStatusChange: (status: Post["status"]) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  const getStatusStyles = (status: string) => {
    switch (status) {
      case "Active":
        return "bg-emerald-100 text-emerald-800";
      case "Draft":
        return "bg-slate-100 text-slate-600";
      case "Closed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-slate-100 text-slate-600";
    }
  };

  return (
    <div className="relative flex flex-col rounded-xl border border-[#E2E8F0] bg-white transition hover:shadow-md">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-3">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${getStatusStyles(
            post.status
          )}`}
        >
          {post.status.toUpperCase()}
        </span>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Project actions"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            ⋮
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border border-[#E2E8F0] bg-white py-1 shadow-lg">
              <Link
                href={`/nonprofit/dashboard/post/${post.id}`}
                className="block px-4 py-2 text-sm text-[#0F172A] hover:bg-slate-50"
              >
                View Project
              </Link>
              <Link
                href={`/nonprofit/dashboard/edit/${post.id}`}
                className="block px-4 py-2 text-sm text-[#0F172A] hover:bg-slate-50"
              >
                Edit Project
              </Link>
              <button
                onClick={() => {
                  onStatusChange("Draft");
                  setMenuOpen(false);
                }}
                className="block w-full px-4 py-2 text-left text-sm text-[#0F172A] hover:bg-slate-50"
              >
                Set as Draft
              </button>
              <button
                onClick={() => {
                  onStatusChange("Active");
                  setMenuOpen(false);
                }}
                className="block w-full px-4 py-2 text-left text-sm text-[#0F172A] hover:bg-slate-50"
              >
                Set as Active
              </button>
              <button
                onClick={() => {
                  onStatusChange("Closed");
                  setMenuOpen(false);
                }}
                className="block w-full px-4 py-2 text-left text-sm text-[#0F172A] hover:bg-slate-50"
              >
                Set as Completed
              </button>
              <button
                onClick={() => {
                  onDelete();
                  setMenuOpen(false);
                }}
                className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                Delete Post
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-5">
        <h3 className="mb-2 text-xl font-bold text-[#092130] line-clamp-1">
          <Link href={`/nonprofit/dashboard/post/${post.id}`} className="hover:text-[#114160] hover:underline">
            {post.title}
          </Link>
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Created on {new Date(post.created_at).toLocaleDateString()}
        </p>
        <p className="text-sm text-slate-700 line-clamp-3">
          {post.content || "No description provided."}
        </p>
      </div>

      <div className="flex items-center justify-between rounded-b-xl border-t border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3">
        <span className="text-xs font-medium text-[#64748B]">
          {applicants.total} {applicants.total === 1 ? "applicant" : "applicants"}
          {applicants.pending > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
              {applicants.pending} to review
            </span>
          )}
        </span>
        <Link
          href={`/nonprofit/dashboard/applicants?project=${post.id}`}
          className="text-sm font-semibold text-[#114160] hover:underline"
        >
          View applicants →
        </Link>
      </div>
    </div>
  );
}