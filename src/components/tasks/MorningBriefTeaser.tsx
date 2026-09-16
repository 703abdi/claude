import Link from "next/link";

export default function MorningBriefTeaser({
  hasBriefToday,
  briefTime,
}: {
  hasBriefToday: boolean;
  briefTime: string;
}) {
  return (
    <Link
      href="/brief"
      className="flex items-center justify-between border border-border bg-surface rounded-lg px-3.5 py-2.5 mb-5 hover:border-muted-2 transition-colors"
    >
      <div className="flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hasBriefToday ? "var(--status-green)" : "var(--muted-2)" }} />
        <span className="text-sm font-semibold">Morning brief</span>
        <span className="text-xs text-muted-2">
          {hasBriefToday ? "ready for today" : `scheduled for ${briefTime}`}
        </span>
      </div>
      <span className="text-xs text-muted">{hasBriefToday ? "Listen →" : "Generate →"}</span>
    </Link>
  );
}
