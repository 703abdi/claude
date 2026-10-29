const AVATAR_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#14b8a6",
  "#f43f5e",
  "#6366f1",
  "#22c55e",
  "#06b6d4",
  "#a855f7",
];

function colorForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialsForName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZE_CLASSES = {
  sm: "w-8 h-8 text-xs",
  md: "w-11 h-11 text-sm",
  lg: "w-16 h-16 text-lg",
  xl: "w-20 h-20 text-xl",
};

export default function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  const color = colorForName(name);
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 rounded-full font-semibold text-white select-none ${SIZE_CLASSES[size]} ${className ?? ""}`}
      style={{ backgroundColor: `color-mix(in srgb, ${color} 55%, black)` }}
      title={name}
    >
      {initialsForName(name)}
    </span>
  );
}
