type TrackerStatus = "matched" | "in_progress" | "completed";

const COLUMNS: { key: TrackerStatus; label: string }[] = [
  { key: "matched", label: "Matched" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];

// Fake data for now. We'll replace this with real Supabase data later.
const SAMPLE_PROJECTS: { id: string; title: string; status: TrackerStatus }[] = [
  { id: "1", title: "Food Bank Website Refresh", status: "matched" },
  { id: "2", title: "Volunteer Scheduling Tool", status: "in_progress" },
  { id: "3", title: "Annual Report Design", status: "completed" },
];

export default function TrackerPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#F8FAFC] px-4 py-8">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight text-[#092130]">
        Project Status Tracker
      </h1>
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <section
            key={col.key}
            className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm"
          >
            <h2 className="mb-3 text-sm font-semibold uppercase text-[#114160]">
              {col.label}
            </h2>
            <div className="space-y-3">
              {SAMPLE_PROJECTS.filter((p) => p.status === col.key).map((p) => (
                <div
                  key={p.id}
                  className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-sm text-[#475569]"
                >
                  {p.title}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}