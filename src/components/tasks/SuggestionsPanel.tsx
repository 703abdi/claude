"use client";

import { useState } from "react";
import type { Suggestion, Task } from "@/lib/types";
import { api } from "@/lib/api-client";

const TYPE_LABEL: Record<string, string> = {
  UNFINISHED_STEP: "Unfinished step",
  UNFINISHED_FOLLOW_UP: "Unfinished follow-up",
  ABANDONED_TASK: "Abandoned task",
  BLOCKER: "Blocker",
  OVERDUE: "Overdue",
  PERSON_FOLLOW_UP: "Follow-up",
  MISSING_TASK: "Possible task",
  OPPORTUNITY: "Opportunity",
  PRIORITY_CHANGE: "Priority",
  CROSS_SOURCE_LINK: "Connection",
};

export default function SuggestionsPanel({
  initialSuggestions,
  onTaskCreated,
  onTaskUpdated,
}: {
  initialSuggestions: Suggestion[];
  onTaskCreated?: (task: Task) => void;
  onTaskUpdated?: () => void;
}) {
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [open, setOpen] = useState(false);
  const [expandedReason, setExpandedReason] = useState<string | null>(null);

  async function resolve(id: string, action: "accept" | "reject" | "dismiss" | "snooze") {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    const result = await api.suggestions.resolve(id, action);
    if (action === "accept" && result.taskId) {
      onTaskUpdated?.();
    }
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="mb-6 border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-surface-2 transition-colors"
      >
        <span className="font-semibold">
          {suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"}
        </span>
        <span className="text-muted-2 text-xs">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border">
          {suggestions.map((s) => (
            <div key={s.id} className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wide text-muted-2">{TYPE_LABEL[s.type] ?? s.type}</span>
                  <p className="text-sm font-semibold mt-0.5">{s.title}</p>
                  <p className="text-xs text-muted mt-0.5">{s.body}</p>
                  <button
                    onClick={() => setExpandedReason(expandedReason === s.id ? null : s.id)}
                    className="text-[11px] text-muted-2 hover:text-foreground mt-1 underline decoration-dotted"
                  >
                    Why?
                  </button>
                  {expandedReason === s.id && (
                    <p className="text-[11px] text-muted-2 mt-1 italic">
                      {s.reason}
                      {s.relatedContext && (
                        <>
                          {" "}
                          — from {s.relatedContext.source.toLowerCase()},{" "}
                          {new Date(s.relatedContext.timestamp).toLocaleDateString()}
                        </>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => resolve(s.id, "accept")}
                    className="text-[11px] font-semibold bg-foreground text-background rounded px-2 py-1"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => resolve(s.id, "snooze")}
                    className="text-[11px] text-muted hover:text-foreground"
                  >
                    Snooze
                  </button>
                  <button
                    onClick={() => resolve(s.id, "dismiss")}
                    className="text-[11px] text-muted hover:text-status-red"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
