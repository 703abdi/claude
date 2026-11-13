"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { NoteDTO } from "@/lib/notes";

type SaveState = "idle" | "saving" | "saved" | "error";

/** One note: a big title and a plain page under it, saved as you go. */
export default function NoteEditor({
  note,
  autoFocusTitle,
  onSaved,
  onDeleted,
  onBack,
}: {
  note: NoteDTO;
  autoFocusTitle: boolean;
  onSaved: (note: NoteDTO) => void;
  onDeleted: (id: string) => void;
  onBack: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [pinned, setPinned] = useState(note.pinned);
  const [state, setState] = useState<SaveState>("idle");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const titleInput = useRef<HTMLInputElement>(null);
  const bodyInput = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef({ title: note.title, body: note.body });
  const saved = useRef({ title: note.title, body: note.body });
  const chain = useRef<Promise<void>>(Promise.resolve());
  const gone = useRef(false);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  function patch(data: Partial<Pick<NoteDTO, "title" | "body" | "pinned">>, keepalive = false) {
    return fetch(`/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      keepalive,
    });
  }

  /** Saves title and body if they changed. Saves run one after another so an old one never wins. */
  function save() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    chain.current = chain.current.then(async () => {
      if (gone.current) return;
      const next = { ...current.current };
      if (next.title === saved.current.title && next.body === saved.current.body) return;
      setState("saving");
      try {
        const res = await patch(next);
        if (!res.ok) throw new Error(String(res.status));
        saved.current = next;
        onSavedRef.current((await res.json()) as NoteDTO);
        const dirty = current.current.title !== next.title || current.current.body !== next.body;
        setState(dirty ? "idle" : "saved");
      } catch {
        setState("error");
      }
    });
  }

  function schedule() {
    setState("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 900);
  }

  // Leaving the note (another note, back, or a new page) sends anything not saved yet.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      const c = current.current;
      if (gone.current || (c.title === saved.current.title && c.body === saved.current.body)) return;
      void patch(c, true)
        .then((res) => (res.ok ? res.json() : null))
        .then((dto) => dto && onSavedRef.current(dto as NoteDTO))
        .catch(() => {});
    };
    // patch only closes over note.id, which is fixed for this editor (keyed by id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (autoFocusTitle) titleInput.current?.focus();
  }, [autoFocusTitle]);

  // The page grows with what you write.
  useLayoutEffect(() => {
    const el = bodyInput.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 320)}px`;
  }, [body]);

  async function togglePin() {
    const value = !pinned;
    setPinned(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    chain.current = chain.current.then(async () => {
      const next = { ...current.current };
      setState("saving");
      try {
        const res = await patch({ ...next, pinned: value });
        if (!res.ok) throw new Error(String(res.status));
        saved.current = next;
        onSavedRef.current((await res.json()) as NoteDTO);
        setState("saved");
      } catch {
        setPinned(!value);
        setState("error");
      }
    });
  }

  async function remove() {
    setDeleting(true);
    if (timer.current) clearTimeout(timer.current);
    try {
      const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(String(res.status));
      gone.current = true;
      onDeleted(note.id);
    } catch {
      setDeleting(false);
      setConfirming(false);
      setState("error");
    }
  }

  const label = state === "saving" ? "saving" : state === "saved" ? "saved" : state === "error" ? "not saved" : "";

  return (
    <div className="mx-auto max-w-[760px] px-4 py-5 md:px-10 md:py-8">
      <button onClick={onBack} className="mb-4 inline-block text-[13px] text-muted hover:text-foreground md:hidden">
        ‹ Notes
      </button>

      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-[11px] text-muted-2" aria-live="polite">
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-4 text-[13px]">
          <button onClick={togglePin} aria-pressed={pinned} className={pinned ? "font-semibold text-accent hover:underline" : "text-muted-2 hover:text-foreground"}>
            {pinned ? "Pinned" : "Pin"}
          </button>
          {confirming ? (
            <>
              <button onClick={remove} disabled={deleting} className="font-semibold text-danger hover:underline disabled:opacity-50">
                Yes, delete
              </button>
              <button onClick={() => setConfirming(false)} className="text-muted hover:text-foreground">
                Keep
              </button>
            </>
          ) : (
            <button onClick={() => setConfirming(true)} className="text-muted-2 hover:text-danger">
              Delete
            </button>
          )}
        </span>
      </div>

      <input
        ref={titleInput}
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          current.current = { ...current.current, title: e.target.value };
          schedule();
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            bodyInput.current?.focus();
          }
        }}
        maxLength={300}
        placeholder="Title"
        aria-label="Title"
        style={{ outline: "none" }}
        className="mt-3 w-full bg-transparent text-[clamp(1.6rem,4vw,2.3rem)] font-semibold tracking-[-0.03em] outline-none placeholder:text-muted-2"
      />
      <textarea
        ref={bodyInput}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          current.current = { ...current.current, body: e.target.value };
          schedule();
        }}
        onBlur={save}
        maxLength={200_000}
        placeholder="Write anything."
        aria-label="Note"
        style={{ outline: "none" }}
        className="mt-3 block min-h-[50vh] w-full resize-none overflow-hidden bg-transparent text-[16px] leading-relaxed placeholder:text-muted-2"
      />
    </div>
  );
}
