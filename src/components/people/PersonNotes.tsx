"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

/** Name and notes, saved as you go. Notes are the main thing on a person's page. */
export default function PersonNotes({ person }: { person: { id: string; name: string; notes: string | null } }) {
  const router = useRouter();
  const [name, setName] = useState(person.name);
  const [notes, setNotes] = useState(person.notes ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedNotes = useRef(person.notes ?? "");

  async function saveNotes(value: string) {
    if (value === savedNotes.current) return;
    setState("saving");
    try {
      await api.people.update(person.id, { notes: value || null });
      savedNotes.current = value;
      setState("saved");
    } catch {
      setState("error");
    }
  }

  function onNotes(value: string) {
    setNotes(value);
    setState("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveNotes(value), 900);
  }

  async function saveName() {
    const n = name.trim();
    if (!n || n === person.name) return setName(person.name);
    try {
      await api.people.update(person.id, { name: n });
      router.refresh();
    } catch {
      setName(person.name);
    }
  }

  async function remove() {
    await api.people.delete(person.id);
    router.push("/people");
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label="Name"
          className="min-w-0 flex-1 bg-transparent text-[clamp(1.6rem,4vw,2.3rem)] font-semibold tracking-[-0.03em] outline-none"
        />
        {confirming ? (
          <span className="mt-3 flex shrink-0 items-center gap-3 text-[13px]">
            <button onClick={remove} className="font-semibold text-danger hover:underline">
              Yes, remove
            </button>
            <button onClick={() => setConfirming(false)} className="text-muted hover:text-foreground">
              Keep
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirming(true)} className="mt-3 shrink-0 text-[13px] text-muted-2 hover:text-danger">
            Remove
          </button>
        )}
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-baseline justify-between px-1">
          <span className="eyebrow">Notes</span>
          <span className="font-mono text-[11px] text-muted-2" aria-live="polite">
            {state === "saving" ? "saving" : state === "saved" ? "saved" : state === "error" ? "not saved, check your connection" : ""}
          </span>
        </div>
        <textarea
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          onBlur={() => {
            if (timer.current) clearTimeout(timer.current);
            void saveNotes(notes);
          }}
          placeholder="Who they are, what you talked about, what matters to them."
          rows={Math.min(16, Math.max(5, notes.split("\n").length + 1))}
          className="type-box w-full resize-y bg-surface px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-muted-2"
        />
      </div>
    </div>
  );
}
