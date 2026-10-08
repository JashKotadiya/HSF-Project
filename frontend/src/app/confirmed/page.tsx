export default function ConfirmedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F3F4F6]">
      <div className="bg-white p-8 rounded-xl shadow-md text-center max-w-md">
        <h1 className="text-2xl font-bold text-[#092130]">
          Email Confirmed 🎉
        </h1>
        <p className="mt-3 text-slate-600">
          Your account has been successfully verified.
        </p>
        <a
          href="/login"
          className="mt-5 inline-block bg-[#114160] text-white px-5 py-2 rounded-lg hover:bg-[#092130]"
        >
          Go to Login
        </a>
      </div>
    </main>
  );
}