import ApplicationForm from "@/components/application/ApplicationForm";

export default function ApplyPage() {
  return (
    <main className="min-h-screen bg-[#0B0F14] px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-t-xl bg-gradient-to-r from-[#092130] via-[#114160] to-[#4A0E99] px-8 py-8 text-white">
          <h1 className="text-3xl font-bold tracking-tight">Apply to Project</h1>
          <p className="mt-2 text-sm text-white/80">Submit your application with experience and resume.</p>
        </div>

        <div className="bg-[#111827] px-8 py-8">
          <div className="mx-auto max-w-4xl rounded-xl bg-white px-8 py-8 shadow-[0_20px_60px_rgba(74,14,153,0.25)]">
            <ApplicationForm />
          </div>
        </div>
      </div>
    </main>
  );
}
