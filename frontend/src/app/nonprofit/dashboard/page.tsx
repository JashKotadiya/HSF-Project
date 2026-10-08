"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { waitForClientSession } from "@/lib/auth-session";
import { normalizeRoleFromUser } from "@/lib/roles";

interface Post {
  id: string;
  title: string;
  content: string;
  status: "Draft" | "Active" | "Closed";
  poster_name?: string;
  created_at: string;
}

export default function NonprofitDashboard() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string>("User");
  const [userId, setUserId] = useState<string | null>(null);

  const fetchPosts = useCallback(async (uid: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setPosts(data as Post[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const session = await waitForClientSession();
      if (!session) {
        router.push("/");
        return;
      }

      // Route Protection
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();
      const role = normalizeRoleFromUser(profile, session.user);
      if (role === "volunteer") {
        router.push("/volunteer/dashboard");
        return;
      }

      setUserId(session.user.id);

      if (session.user.email) {
        const namePart = session.user.email.split("@")[0];
        setUserName(namePart.charAt(0).toUpperCase() + namePart.slice(1));
      }

      fetchPosts(session.user.id);
    };
    
    checkAuthAndFetch();
  }, [router, fetchPosts]);

  const handleStatusChange = async (postId: string, newStatus: string) => {
    // Optimistic update
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, status: newStatus as any } : p))
    );

    const { error } = await supabase
      .from("posts")
      .update({ status: newStatus })
      .eq("id", postId);

    if (error && userId) {
      console.error("Update error:", error);
      fetchPosts(userId); // Revert on error
    }
  };

  const handleDelete = async (postId: string) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this project?");
    if (!confirmDelete) return;

    setPosts((prev) => prev.filter((p) => p.id !== postId));

    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error && userId) {
      console.error("Delete error:", error);
      fetchPosts(userId);
    }
  };

  const activePosts = posts.filter((p) => p.status === "Active");
  const draftPosts = posts.filter((p) => p.status === "Draft");
  const closedPosts = posts.filter((p) => p.status === "Closed");

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#092130]">Dashboard</h1>
            <p className="mt-1 text-sm text-[#475569]">Welcome back, {userName}</p>
          </div>
          <Link
            href="/nonprofit/dashboard/edit/new"
            className="inline-flex items-center justify-center rounded-md bg-[#114160] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#092130]"
          >
            + Create Project
          </Link>
        </div>

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
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            )}
            {draftPosts.length > 0 && (
              <PostSection
                title={`Drafts (${draftPosts.length})`}
                posts={draftPosts}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            )}
            {closedPosts.length > 0 && (
              <PostSection
                title={`Completed (${closedPosts.length})`}
                posts={closedPosts}
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
  onStatusChange,
  onDelete,
}: {
  title: string;
  posts: Post[];
  onStatusChange: (id: string, status: string) => void;
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
  onStatusChange,
  onDelete,
}: {
  post: Post;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

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
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            ⋮
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border border-[#E2E8F0] bg-white py-1 shadow-lg">
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
        <h3 className="mb-2 text-xl font-bold text-[#2563EB] line-clamp-1">
          {post.title}
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Created on {new Date(post.created_at).toLocaleDateString()}
        </p>
        <p className="text-sm text-slate-700 line-clamp-3">
          {post.content || "No description provided."}
        </p>
      </div>
    </div>
  );
}