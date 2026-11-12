// Notes: plain text pages, each one also indexed in memory (source "note") so Jarvis can find it.
import type { Note } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteMemory, upsertMemory } from "@/lib/memory";
import { displayTitle } from "@/components/notes/note-text";

export type NoteDTO = { id: string; title: string; body: string; pinned: boolean; createdAt: string; updatedAt: string };

function toDTO(n: Note): NoteDTO {
  return { id: n.id, title: n.title, body: n.body, pinned: n.pinned, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() };
}

async function index(n: Note) {
  try {
    await upsertMemory({ source: "note", externalId: n.id, title: displayTitle(n), body: n.body, url: `/notes?id=${n.id}`, date: n.updatedAt });
  } catch (err) {
    // A memory failure never blocks saving a note.
    console.error("note memory index failed", n.id, err);
  }
}

export async function listNotes(): Promise<NoteDTO[]> {
  const rows = await prisma.note.findMany({ orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }] });
  return rows.map(toDTO);
}
export async function getNote(id: string): Promise<NoteDTO | null> {
  const n = await prisma.note.findUnique({ where: { id } });
  return n ? toDTO(n) : null;
}
/** Creates the note and indexes it in memory (source "note"). */
export async function createNote(data: { title?: string; body?: string }): Promise<NoteDTO> {
  const n = await prisma.note.create({ data: { title: data.title ?? "", body: data.body ?? "" } });
  await index(n);
  return toDTO(n);
}
/** Updates the note and re-indexes it. */
export async function updateNote(id: string, data: { title?: string; body?: string; pinned?: boolean }): Promise<NoteDTO> {
  const n = await prisma.note.update({ where: { id }, data });
  await index(n);
  return toDTO(n);
}
/** Deletes the note and its memory entry. */
export async function deleteNote(id: string): Promise<void> {
  await prisma.note.delete({ where: { id } });
  try {
    await deleteMemory("note", id);
  } catch (err) {
    console.error("note memory delete failed", id, err);
  }
}
