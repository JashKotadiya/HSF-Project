import Link from "next/link";

export default function PageHeader({
  title,
  subtitle,
  eyebrow,
  backHref,
  backLabel = "Back",
  actions,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-gradient-to-r from-[#092130] via-[#114160] to-[#4A0E99] px-6 py-14 text-white">
      <div className="mx-auto max-w-7xl">
        {backHref && (
          <Link
            href={backHref}
            className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-white/70 transition hover:text-white"
          >
            ← {backLabel}
          </Link>
        )}
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            {eyebrow && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#D3E6F2]">
                {eyebrow}
              </p>
            )}
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
            {subtitle && <p className="mt-4 text-lg text-white/80">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
