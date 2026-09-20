export default function ProgressHeader({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div className="animate-fade-in mb-7">
      <h1 className="text-2xl font-bold tracking-tight">abdi&apos;s tasks</h1>
      <div className="mt-2.5 flex items-baseline gap-2">
        <span className="text-sm font-semibold">
          {completed} / {total} completed
        </span>
        <span className="text-sm text-muted">{pct}%</span>
      </div>
      <div className="mt-2.5 h-2 w-full max-w-md rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-foreground transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
