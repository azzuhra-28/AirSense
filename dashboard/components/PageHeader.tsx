"use client";

/**
 * Judul halaman untuk tab selain Ringkasan.
 * Ringkas, tanpa embel-embel ikon besar.
 */
export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-5">
      <h1 className="text-base font-semibold text-slate-900 sm:text-lg">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-0.5 text-[12px] text-slate-400">{subtitle}</p>
      )}
    </header>
  );
}
