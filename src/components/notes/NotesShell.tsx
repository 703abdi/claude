"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { NoteDTO } from "@/lib/notes";
import NoteEditor from "./NoteEditor";
import { displayTitle, preview, sortNotes } from "./note-text";

function shortDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "2-digit" } : {}) });
}

/** Moves to ?id= without a server round trip. Next keeps useSearchParams in step with pushState. */
function go(id: string | null) {
  window.history.pushState(null, "", id ? `/notes?id=${encodeURIComponent(id)}` : "/notes");
}

/** Notes on the left, one note on the right. On a phone it's one or the other. */
export default function NotesShell({ initialNotes }: { initialNotes: NoteDTO[] }) {
  const params = useSearchParams();
  const selectedId = params.get("id");
  const [notes, setNotes] = useState(initialNotes);
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? notes.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)) : notes;
    return sortNotes(list);
  }, [notes, query]);

  const selected = selectedId ? notes.find((n) => n.id === selectedId) ?? null : null;

  async function newNote() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error(String(res.status));
      const note = (await res.json()) as NoteDTO;
      setNotes((prev) => [note, ...prev]);
      setQuery("");
      setFocusId(note.id);
      go(note.id);
    } catch {
      setError("Could not make a note. Check your connection.");
    } finally {
      setCreating(false);
    }
  }

  const onSaved = useCallback((note: NoteDTO) => {
    setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
  }, []);

  const onDeleted = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    go(null);
  }, []);

  const input = "type-box h-10 min-w-0 bg-surface px-3 text-[14px] outline-none placeholder:text-muted-2";

  return (
    <div className="md:grid md:h-screen md:grid-cols-[320px_1fr]">
      <aside className={`${selectedId ? "hidden md:flex" : "flex"} min-h-0 flex-col md:border-r md:border-border`}>
        <div className="px-4 pb-3 pt-5 md:px-5 md:pt-8">
          <p className="eyebrow">Notes</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h1 className="text-[26px] font-semibold tracking-[-0.03em]">{notes.length}</h1>
            <button onClick={newNote} disabled={creating} className="h-10 shrink-0 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background disabled:opacity-25">
              New note
            </button>
          </div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search notes" className={`${input} mt-3 w-full`} />
          {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto border-t border-border">
          {shown.length === 0 && (
            <li className="px-5 py-8 text-center text-[14px] text-muted-2">{notes.length ? "No note matches." : "No notes yet. Start one above."}</li>
          )}
          {shown.map((n) => {
            const active = n.id === selectedId;
            return (
              <li key={n.id}>
                <a
                  href={`/notes?id=${n.id}`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    go(n.id);
                  }}
                  aria-current={active ? "page" : undefined}
                  className={`block border-b border-border px-4 py-3 transition-colors md:px-5 ${active ? "bg-surface-hover" : "hover:bg-surface"}`}
                >
                  <span className="flex items-baseline gap-2">
                    {n.pinned && <PinMark className="h-3 w-3 shrink-0 self-center text-accent" />}
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{displayTitle(n)}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-2" suppressHydrationWarning>
                      {shortDate(n.updatedAt)}
                    </span>
                  </span>
                  <span className="block truncate text-[12px] text-muted-2">{preview(n) || "Nothing written yet"}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className={`${selectedId ? "block" : "hidden md:block"} min-h-0 md:overflow-y-auto`}>
        {selected ? (
          <NoteEditor key={selected.id} note={selected} autoFocusTitle={focusId === selected.id} onSaved={onSaved} onDeleted={onDeleted} onBack={() => go(null)} />
        ) : selectedId ? (
          <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 px-6">
            <p className="text-[15px] text-muted-2">That note is gone.</p>
            <button onClick={() => go(null)} className="text-[13px] text-muted hover:text-foreground">
              ‹ Notes
            </button>
          </div>
        ) : (
          <div className="flex h-full min-h-[60vh] items-center justify-center px-6">
            <p className="text-[15px] text-muted-2">Pick a note, or start a new one.</p>
          </div>
        )}
      </section>
    </div>
  );
}

export function PinMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-label="Pinned">
      <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
