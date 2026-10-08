import RequireRole from "@/components/auth/RequireRole";

export default function NonprofitLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole role="nonprofit">{children}</RequireRole>;
}
