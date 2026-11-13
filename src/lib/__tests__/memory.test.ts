import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { chunkText, cleanSnippet, hashDoc, isSearchable, normaliseText, orQuery } from "../memory/text";
import { callMemoryBody } from "../fathom";

// Pure helpers first. They need no database.

test("normaliseText fixes line endings, NUL bytes and blank runs", () => {
  assert.equal(normaliseText("a\r\nb\u0000c  \n\n\n\nd"), "a\nbc\n\nd");
});

test("short text is one chunk; empty text is one empty chunk", () => {
  assert.deepEqual(chunkText("hello there"), ["hello there"]);
  assert.deepEqual(chunkText("   "), [""]);
});

test("long text splits on paragraphs, chunks stay under the limit and no word is cut", () => {
  const para = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
  const text = Array.from({ length: 40 }, () => para).join("\n\n");
  const chunks = chunkText(text, 1000);
  assert.ok(chunks.length > 5);
  for (const c of chunks) {
    assert.ok(c.length <= 1000, `chunk of ${c.length}`);
    for (const w of c.split(/\s+/)) assert.match(w, /^word\d+$/);
  }
  assert.equal(chunks.join(" ").split(/\s+/).length, 60 * 40);
});

test("one giant paragraph with no breaks still splits on spaces", () => {
  const text = Array.from({ length: 2000 }, () => "alpha").join(" ");
  const chunks = chunkText(text, 500);
  assert.ok(chunks.length >= 20);
  for (const c of chunks) {
    assert.ok(c.length <= 500);
    assert.ok(c.split(" ").every((w) => w === "alpha"));
  }
});

test("hash changes with title or body", () => {
  assert.notEqual(hashDoc("a", "b"), hashDoc("a", "c"));
  assert.notEqual(hashDoc("a", "b"), hashDoc("x", "b"));
  assert.equal(hashDoc("a", "b"), hashDoc("a", "b"));
});

test("OR query keeps words only, so no operators get through", () => {
  assert.equal(orQuery('omar "lunch" -friday or OR'), "omar or lunch or friday");
  assert.equal(isSearchable("?!?? ---"), false);
  assert.equal(isSearchable("omar"), true);
});

test("snippet is plain text and about 300 characters", () => {
  const s = cleanSnippet(`<b>hi</b> ${"word ".repeat(200)}`);
  assert.ok(!/[<>]/.test(s));
  assert.ok(s.length <= 310);
});

test("call memory body has summary, attendees and action items", () => {
  const body = callMemoryBody({
    default_summary: { template_name: "general", markdown_formatted: "## Recap\nTalked pricing." },
    recorded_by: { name: "Abdi", email: "a@x.com" },
    calendar_invitees: [{ name: "Omar Ali", email: "o@y.com", is_external: true }],
    action_items: [{ description: "Send the deck", completed: false, assignee: { name: "Abdi" } }],
  });
  assert.match(body, /Talked pricing/);
  assert.match(body, /Attendees: Abdi, Omar Ali/);
  assert.match(body, /- Send the deck \(Abdi\)/);
});

// Database tests. They run against DATABASE_URL (local Postgres) and clean up after themselves.
const hasDb = Boolean(process.env.DATABASE_URL);
const SRC = `test-memory-${process.pid}`;

describe("memory in Postgres", { skip: hasDb ? false : "DATABASE_URL not set" }, async () => {
  const { prisma } = await import("../prisma");
  const { deleteMemory, searchMemory, upsertMemory } = await import("../memory");

  after(async () => {
    await prisma.memoryDoc.deleteMany({ where: { source: SRC } });
    await prisma.$disconnect();
  });

  test("upsert then search finds it with a plain snippet", async () => {
    const r = await upsertMemory({
      source: SRC,
      externalId: "a",
      title: "Call with Zorblax",
      body: "We talked about the quintavex pricing plan and the <b>launch</b> date in March.",
      url: "https://example.com/a",
      date: new Date(),
    });
    assert.deepEqual(r, { chunks: 1, changed: true });
    const hits = await searchMemory("quintavex pricing", { sources: [SRC] });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].title, "Call with Zorblax");
    assert.equal(hits[0].url, "https://example.com/a");
    assert.match(hits[0].snippet, /quintavex/i);
    assert.ok(!/[<>]/.test(hits[0].snippet));
    assert.ok(hits[0].score > 0);
    assert.ok(hits[0].date);
  });

  test("the same content again is a no-op", async () => {
    const before = await prisma.memoryDoc.findFirst({ where: { source: SRC, externalId: "a" }, select: { id: true } });
    const r = await upsertMemory({
      source: SRC,
      externalId: "a",
      title: "Call with Zorblax",
      body: "We talked about the quintavex pricing plan and the <b>launch</b> date in March.",
    });
    assert.deepEqual(r, { chunks: 1, changed: false });
    const now = await prisma.memoryDoc.findFirst({ where: { source: SRC, externalId: "a" }, select: { id: true } });
    assert.equal(now?.id, before?.id);
  });

  test("a changed body replaces the chunks", async () => {
    const r = await upsertMemory({ source: SRC, externalId: "a", title: "Call with Zorblax", body: "Now only about the flimbertoad contract." });
    assert.equal(r.changed, true);
    assert.equal((await searchMemory("quintavex", { sources: [SRC] })).length, 0);
    assert.equal((await searchMemory("flimbertoad", { sources: [SRC] })).length, 1);
    assert.equal(await prisma.memoryDoc.count({ where: { source: SRC, externalId: "a" } }), 1);
  });

  test("a long body is stored as several chunks, and a shorter one drops the extras", async () => {
    const para = "The glimmerwing project needs a budget review and a new timeline. ".repeat(20);
    const body = Array.from({ length: 12 }, () => para).join("\n\n");
    const r = await upsertMemory({ source: SRC, externalId: "long", title: "Long doc", body });
    assert.ok(r.chunks >= 3, `got ${r.chunks} chunks`);
    assert.equal(await prisma.memoryDoc.count({ where: { source: SRC, externalId: "long" } }), r.chunks);
    const rows = await prisma.memoryDoc.findMany({ where: { source: SRC, externalId: "long" }, select: { hash: true, title: true } });
    assert.equal(new Set(rows.map((x) => x.hash)).size, 1);
    assert.ok(rows.every((x) => x.title === "Long doc"));

    // At most 2 chunks per document, even though every chunk matches.
    const hits = await searchMemory("glimmerwing budget", { sources: [SRC], limit: 10 });
    assert.equal(hits.length, 2);

    await upsertMemory({ source: SRC, externalId: "long", title: "Long doc", body: "short now, glimmerwing" });
    assert.equal(await prisma.memoryDoc.count({ where: { source: SRC, externalId: "long" } }), 1);
  });

  test("no match for all words falls back to any word", async () => {
    await upsertMemory({ source: SRC, externalId: "or", title: "Snarfle notes", body: "Snarfle wants the proposal by Friday." });
    const hits = await searchMemory("snarfle wobbleglorp", { sources: [SRC] });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].title, "Snarfle notes");
  });

  test("empty and junk queries return nothing", async () => {
    assert.deepEqual(await searchMemory(""), []);
    assert.deepEqual(await searchMemory("   "), []);
    assert.deepEqual(await searchMemory("!!! ??? ---"), []);
    assert.deepEqual(await searchMemory("the and of"), []); // stop words only
    assert.deepEqual(await searchMemory("'); drop table \"MemoryDoc\"; --", { sources: [SRC] }), []);
  });

  test("delete removes every chunk", async () => {
    await deleteMemory(SRC, "long");
    assert.equal(await prisma.memoryDoc.count({ where: { source: SRC, externalId: "long" } }), 0);
    assert.equal((await searchMemory("glimmerwing", { sources: [SRC] })).length, 0);
  });
});
