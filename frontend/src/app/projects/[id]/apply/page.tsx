import ApplicationForm from "@/components/application/ApplicationForm";

export default function ApplyPage() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-t-xl bg-gradient-to-r from-[#092130] via-[#114160] to-[#4A0E99] px-8 py-8 text-white">
          <h1 className="text-3xl font-bold tracking-tight">Apply to Project</h1>
          <p className="mt-2 text-sm text-white/80">Submit your application with experience and resume.</p>
        </div>

        <div className="rounded-b-xl border border-t-0 border-[#E2E8F0] bg-white px-8 py-8 shadow-sm">
          <div className="mx-auto max-w-4xl">
            <ApplicationForm />
          </div>
        </div>
      </div>
    </main>
  );
}
