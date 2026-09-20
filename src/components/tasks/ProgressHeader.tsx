export default function ProgressHeader({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-bold tracking-tight">abdi&apos;s tasks</h1>
      <p className="mt-1 font-mono text-[11px] text-muted-2 tabular-nums">
        {completed}/{total} done · {pct}%
      </p>
    </div>
  );
}
