import Link from "next/link";

export default function ConfirmedPage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white text-center shadow-xl">
        <div className="bg-gradient-to-r from-[#092130] via-[#114160] to-[#4A0E99] px-8 py-8 text-white">
          <h1 className="text-2xl font-extrabold tracking-tight">Email Confirmed</h1>
        </div>
        <div className="p-8">
          <p className="text-sm text-[#475569]">Your account has been successfully verified.</p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-md bg-[#114160] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#092130]"
          >
            Go to Login
          </Link>
        </div>
      </div>
    </main>
  );
}
