import RequireRole from "@/components/auth/RequireRole";

export default function VolunteerLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole role="volunteer">{children}</RequireRole>;
}
