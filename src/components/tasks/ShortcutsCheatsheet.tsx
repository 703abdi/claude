"use client";

const ROWS: [string, string][] = [
  ["⌘K / Ctrl+K", "Open command palette"],
  ["/", "Open command palette"],
  ["j / k", "Move focus down / up"],
  ["e / Enter", "Open focused task"],
  ["x", "Toggle complete"],
  ["1 – 4", "Jump to Today / Now / Next / Later"],
  ["Esc", "Close panel or palette"],
  ["?", "Toggle this cheatsheet"],
];

export default function ShortcutsCheatsheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-black/60 animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-sm border border-border bg-surface rounded shadow-xl animate-slide-up p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-2">Shortcuts</span>
          <button onClick={onClose} className="text-muted-2 hover:text-foreground text-xs">
            Esc
          </button>
        </div>
        <div className="space-y-1.5">
          {ROWS.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-muted">{label}</span>
              <kbd className="font-mono text-[11px] text-foreground bg-surface-2 border border-border rounded px-1.5 py-0.5">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
