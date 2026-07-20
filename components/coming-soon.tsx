export function ComingSoon({ points }: { points: string[] }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-6 dark:border-slate-700">
      <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">
        À venir dans ce module :
      </p>
      <ul className="space-y-2">
        {points.map((p) => (
          <li key={p} className="flex gap-2 text-sm text-slate-600 dark:text-slate-400">
            <span aria-hidden className="text-slate-400">
              •
            </span>
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
