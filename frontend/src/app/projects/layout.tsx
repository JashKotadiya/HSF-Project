import RequireRole from "@/components/auth/RequireRole";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole role="volunteer">{children}</RequireRole>;
}
