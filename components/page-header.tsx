export function PageHeader({
  title,
  subtitle,
  milestone,
}: {
  title: string;
  subtitle?: string;
  milestone?: string;
}) {
  return (
    <header className="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            {subtitle}
          </p>
        )}
      </div>
      {milestone && (
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {milestone}
        </span>
      )}
    </header>
  );
}
