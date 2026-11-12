import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createNote, deleteNote, getNote, listNotes, updateNote } from "../notes";
import { prisma } from "../prisma";
import { displayTitle, preview, sortNotes } from "../../components/notes/note-text";

// Runs against the local database (DATABASE_URL). Every row made here is removed at the end.
const made: string[] = [];
const TAG = `notes-test-${Date.now()}`;
const noDb = process.env.DATABASE_URL ? false : "DATABASE_URL is not set, so the database test is skipped";

after(async () => {
  if (noDb) return;
  // deleteNote also drops the memory entry for each note.
  const left = await prisma.note.findMany({ where: { id: { in: made } }, select: { id: true } });
  for (const n of left) await deleteNote(n.id);
  await prisma.$disconnect();
});

test("create, update, pin ordering and delete", { skip: noDb }, async () => {
  const a = await createNote({ title: `${TAG} a`, body: "first body" });
  made.push(a.id);
  assert.equal(a.title, `${TAG} a`);
  assert.equal(a.body, "first body");
  assert.equal(a.pinned, false);

  const b = await createNote({ body: `${TAG} b first line\nsecond line` });
  made.push(b.id);
  assert.equal(b.title, "");

  // Newest updated comes first among unpinned notes.
  let mine = (await listNotes()).filter((n) => made.includes(n.id));
  assert.deepEqual(mine.map((n) => n.id), [b.id, a.id]);

  const a2 = await updateNote(a.id, { body: "changed body" });
  assert.equal(a2.body, "changed body");
  assert.equal(a2.title, `${TAG} a`);
  assert.ok(a2.updatedAt >= a.updatedAt);
  mine = (await listNotes()).filter((n) => made.includes(n.id));
  assert.deepEqual(mine.map((n) => n.id), [a.id, b.id]);

  // A pinned note goes on top even when another one is newer.
  await updateNote(b.id, { pinned: true });
  await updateNote(a.id, { title: `${TAG} a again` });
  const all = await listNotes();
  mine = all.filter((n) => made.includes(n.id));
  assert.deepEqual(mine.map((n) => n.id), [b.id, a.id]);
  const firstUnpinned = all.findIndex((n) => !n.pinned);
  assert.ok(firstUnpinned === -1 || all.slice(firstUnpinned).every((n) => !n.pinned), "pinned notes all come first");

  // Each save lands in memory with a link back to the note.
  const mem = await prisma.memoryDoc.findMany({ where: { source: "note", externalId: a.id } });
  assert.ok(mem.length > 0, "note is in memory after saving");
  assert.equal(mem[0].url, `/notes?id=${a.id}`);
  assert.equal(mem[0].title, `${TAG} a again`);
  assert.ok(mem.some((m) => m.body.includes("changed body")));

  await deleteNote(a.id);
  assert.equal(await getNote(a.id), null);
  assert.equal(await prisma.memoryDoc.count({ where: { source: "note", externalId: a.id } }), 0);
  assert.ok(!(await listNotes()).some((n) => n.id === a.id));
});

test("titles and previews for the list", () => {
  assert.equal(displayTitle({ title: "  Plan ", body: "x" }), "Plan");
  assert.equal(displayTitle({ title: "", body: "\n  Groceries\nmilk" }), "Groceries");
  assert.equal(displayTitle({ title: "", body: "" }), "Untitled");
  assert.equal(preview({ title: "", body: "Groceries\nmilk\neggs" }), "milk eggs");
  assert.equal(preview({ title: "List", body: "milk\neggs" }), "milk eggs");
  const sorted = sortNotes([
    { id: "1", title: "", body: "", pinned: false, updatedAt: "2026-11-12T10:00:00.000Z" },
    { id: "2", title: "", body: "", pinned: true, updatedAt: "2026-11-01T10:00:00.000Z" },
    { id: "3", title: "", body: "", pinned: false, updatedAt: "2026-11-12T11:00:00.000Z" },
  ]);
  assert.deepEqual(sorted.map((n) => n.id), ["2", "3", "1"]);
});
