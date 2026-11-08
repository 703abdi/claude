"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

export const AGENT_COLOR: Record<string, string> = {
  grok: "#1d9bf0",
  codex: "#10a37f",
  claude: "#d97757",
  jarvis: "var(--accent)",
  fathom: "#a78bfa",
};

export function agentColor(name: string) {
  return AGENT_COLOR[name.toLowerCase()] ?? "var(--muted-2)";
}

export function ago(iso: string | number | null, now = Date.now()) {
  if (iso === null) return "never";
  const t = typeof iso === "number" ? iso : new Date(iso).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function shortAge(iso: string | null, now = Date.now()) {
  if (!iso) return "";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Re-renders every `ms`. Returns the current time, or null before mount (keeps SSR stable). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, ms);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [ms]);
  return now;
}

function subscribeMedia(query: string) {
  return (cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  };
}

/** SSR-safe media query (false on the server and during hydration). */
export function useMedia(query: string) {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => false
  );
}

export type ChipTone = "neutral" | "gold" | "danger" | "warn" | "ok";

const TONE: Record<ChipTone, { bg: string; fg: string }> = {
  neutral: { bg: "var(--surface-hover)", fg: "var(--muted)" },
  gold: { bg: "var(--accent-soft)", fg: "var(--accent)" },
  danger: { bg: "color-mix(in srgb, var(--danger) 14%, transparent)", fg: "var(--danger)" },
  warn: { bg: "color-mix(in srgb, var(--warn) 14%, transparent)", fg: "var(--warn)" },
  ok: { bg: "color-mix(in srgb, var(--ok) 14%, transparent)", fg: "var(--ok)" },
};

/** Small pill. Pass `color` for a category chip (soft tint of the stored color), or a tone. */
export function Chip({
  color,
  tone = "neutral",
  children,
  title,
}: {
  color?: string;
  tone?: ChipTone;
  children: ReactNode;
  title?: string;
}) {
  const style = color
    ? { backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, color: `color-mix(in srgb, ${color} 85%, white)` }
    : { backgroundColor: TONE[tone].bg, color: TONE[tone].fg };
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap"
      style={style}
    >
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card min-w-0 p-4 md:p-5 ${className}`}>{children}</div>;
}

export function CardTitle({ label, right }: { label: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[15px] font-bold tracking-tight text-foreground">{label}</h2>
      {right}
    </div>
  );
}

/** Animated check mark: box pops 0.6 -> 1.15 -> 1, path draws in. */
export function CheckMark({ on, size = 14 }: { on: boolean; size?: number }) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {on && (
        <motion.svg
          key="check"
          viewBox="0 0 16 16"
          width={size}
          height={size}
          fill="none"
          initial={reduced ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: reduced ? 1 : [0.6, 1.15, 1], opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          <motion.path
            d="M3 8.5l3 3 7-7"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.24, delay: 0.05 }}
          />
        </motion.svg>
      )}
    </AnimatePresence>
  );
}

/** Number that flips when it changes. */
export function FlipNumber({ value, className = "" }: { value: string | number; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <span className={`relative inline-flex overflow-hidden tabular-nums ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(value)}
          initial={reduced ? false : { y: "-70%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { y: "70%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export type Toast = { id: number; text: string; actionLabel?: string; onAction?: () => void };

export function ToastHost({ toast, onDone }: { toast: Toast | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, 6000);
    return () => clearTimeout(t);
  }, [toast, onDone]);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-border-2 bg-surface-hover px-4 py-2.5 text-sm text-foreground shadow-[0_12px_40px_-12px_rgba(0,0,0,0.9)]"
          >
            <span className="min-w-0 truncate">{toast.text}</span>
            {toast.onAction && (
              <button
                onClick={() => {
                  toast.onAction?.();
                  onDone();
                }}
                className="shrink-0 rounded-full px-2.5 py-1 font-bold text-accent hover:bg-accent-soft"
              >
                {toast.actionLabel ?? "Undo"}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
