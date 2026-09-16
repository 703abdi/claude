"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

export default function PersonHeader({
  person,
}: {
  person: { id: string; name: string; notes: string | null };
}) {
  const router = useRouter();
  const [name, setName] = useState(person.name);
  const [notes, setNotes] = useState(person.notes ?? "");

  async function saveName() {
    if (!name.trim() || name === person.name) return;
    await api.people.update(person.id, { name: name.trim() });
    router.refresh();
  }

  async function saveNotes() {
    if (notes === (person.notes ?? "")) return;
    await api.people.update(person.id, { notes: notes || null });
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete ${person.name}? This removes them from all linked tasks.`)) return;
    await api.people.delete(person.id);
    router.push("/people");
    router.refresh();
  }

  return (
    <div className="mt-3">
      <div className="flex items-start justify-between gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          className="text-xl font-bold tracking-tight bg-transparent outline-none border-b border-transparent hover:border-border focus:border-muted-2 flex-1"
        />
        <button onClick={remove} className="text-xs text-status-red hover:underline shrink-0 mt-1.5">
          Delete
        </button>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={saveNotes}
        placeholder="Notes about this person..."
        rows={2}
        className="w-full mt-2 bg-surface-2 border border-border rounded-md px-2.5 py-2 text-sm text-muted resize-none outline-none focus:border-muted-2"
      />
    </div>
  );
}
