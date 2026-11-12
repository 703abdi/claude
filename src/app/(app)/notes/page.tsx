import { Suspense } from "react";
import { listNotes } from "@/lib/notes";
import NotesShell from "@/components/notes/NotesShell";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const notes = await listNotes();
  return (
    <Suspense>
      <NotesShell initialNotes={notes} />
    </Suspense>
  );
}
