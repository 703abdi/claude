import type { Effort } from "@/lib/types";

const LEVEL: Record<Effort, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
const COLOR: Record<Effort, string> = {
  LOW: "var(--effort-1)",
  MEDIUM: "var(--effort-2)",
  HIGH: "var(--effort-3)",
};

export default function EffortBars({
  effort,
  className,
  onClick,
}: {
  effort: Effort;
  className?: string;
  onClick?: () => void;
}) {
  const level = LEVEL[effort];
  const color = COLOR[effort];
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Effort: ${effort[0]}${effort.slice(1).toLowerCase()}`}
      className={`flex items-end gap-[2px] h-3.5 ${onClick ? "cursor-pointer" : "cursor-default"} ${className ?? ""}`}
    >
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className="w-1 rounded-[1px]"
          style={{
            height: `${bar * 4 + 2}px`,
            backgroundColor: bar <= level ? color : "var(--border)",
          }}
        />
      ))}
    </button>
  );
}
