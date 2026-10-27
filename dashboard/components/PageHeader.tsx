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
      <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 text-xs text-slate-300 sm:text-sm">
          {subtitle}
        </p>
      )}
    </header>
  );
}