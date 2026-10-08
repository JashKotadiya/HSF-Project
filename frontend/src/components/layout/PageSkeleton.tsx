/** Placeholder shown instantly while a server-rendered page loads, matching the PageHeader layout. */
export default function PageSkeleton({ variant = "grid" }: { variant?: "grid" | "detail" | "form" }) {
  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      <div className="bg-gradient-to-r from-[#092130] via-[#114160] to-[#4A0E99] px-6 py-14">
        <div className="mx-auto max-w-7xl animate-pulse space-y-4">
          <div className="h-4 w-32 rounded bg-white/20" />
          <div className="h-12 w-2/3 max-w-xl rounded bg-white/20" />
          <div className="h-5 w-1/2 max-w-lg rounded bg-white/15" />
        </div>
      </div>

      {variant === "grid" && (
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-12 lg:flex-row">
          <div className="h-96 w-full shrink-0 animate-pulse rounded-xl bg-white lg:w-72" />
          <div className="grid flex-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-xl bg-white" />
            ))}
          </div>
        </div>
      )}

      {variant === "detail" && (
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-12 lg:flex-row">
          <div className="h-[32rem] flex-1 animate-pulse rounded-xl bg-white" />
          <div className="h-64 w-full shrink-0 animate-pulse rounded-xl bg-white lg:w-80" />
        </div>
      )}

      {variant === "form" && (
        <div className="mx-auto max-w-4xl px-6 py-12">
          <div className="h-[36rem] animate-pulse rounded-xl bg-white" />
        </div>
      )}
    </main>
  );
}
