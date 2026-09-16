export default function ProgressHeader({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div className="animate-fade-in">
      <h1 className="text-xl font-bold tracking-tight">abdi&apos;s tasks</h1>
      <div className="mt-2 flex items-baseline gap-2 text-sm">
        <span className="font-semibold">
          {completed} / {total} completed
        </span>
        <span className="text-muted">{pct}%</span>
      </div>
      <div className="mt-2 h-2 w-full max-w-md rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-foreground transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
