import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUBJECTS,
  browseHref,
  buildTabs,
  groupBySegment,
  kindFilters,
  kindLabel,
  matchesKind,
  toCard,
  parseSteps,
  parseVariants,
  searchTerms,
  titleHits,
  segmentOf,
  slugify,
  subjectInfo,
  uniqueSlug,
  valuesForSegment,
} from "../library";

test("subjects are the seven from the PRD, in order", () => {
  assert.deepEqual(
    SUBJECTS.map((s) => s.slug),
    ["content", "paid-ads", "sales", "websites-design", "claude-ai", "agency-ops", "business"],
  );
  assert.equal(subjectInfo("unsorted")?.label, "Unsorted");
  assert.equal(subjectInfo("nope"), null);
});

test("slugify matches the old SOP slug rule", () => {
  assert.equal(slugify("00 How Claude Works for Abdi.md"), "00-how-claude-works-for-abdi");
  assert.equal(slugify("CON-02 Hooks and talking-point scripts"), "con-02-hooks-and-talking-point-scripts");
});

test("segments map back to the stored values, null becomes Other", () => {
  assert.equal(segmentOf("Agency SOPs"), "agency-sops");
  assert.equal(segmentOf(null), "other");
  assert.equal(segmentOf("  "), "other");
  const values = ["Agency SOPs", "agency  sops", null, "Chats"];
  assert.deepEqual(valuesForSegment(values, "agency-sops"), ["Agency SOPs", "agency  sops"]);
  assert.deepEqual(valuesForSegment(values, "other"), [null]);
  assert.deepEqual(valuesForSegment(values, "missing"), []);
});

test("groupBySegment merges same-slug values and puts Other last", () => {
  const g = groupBySegment([
    { value: null, count: 2 },
    { value: "Chats", count: 3 },
    { value: "Agency SOPs", count: 1 },
    { value: "agency sops", count: 4 },
  ]);
  assert.deepEqual(g, [
    { name: "Agency SOPs", seg: "agency-sops", count: 5 },
    { name: "Chats", seg: "chats", count: 3 },
    { name: "Other", seg: "other", count: 2 },
  ]);
});

test("uniqueSlug appends a number on collision", () => {
  assert.equal(uniqueSlug("My Note", new Set()), "my-note");
  assert.equal(uniqueSlug("My Note", new Set(["my-note", "my-note-2"])), "my-note-3");
  assert.equal(uniqueSlug("!!!", new Set()), "item");
});

test("steps and variants parse defensively", () => {
  assert.deepEqual(parseSteps(["a", "", 3, "b"]), ["a", "b"]);
  assert.deepEqual(parseSteps(null), []);
  assert.deepEqual(parseVariants([{ label: "AI", content: "x", sourcePath: "p" }, { label: 1 }, "bad"]), [
    { label: "AI", content: "x", sourcePath: "p" },
  ]);
});

test("buildTabs puts Human first, then AI, then Client", () => {
  const tabs = buildTabs("primary", [
    { label: "Client", content: "c" },
    { label: "AI", content: "a" },
  ]);
  assert.deepEqual(tabs.map((t) => t.label), ["Human", "AI", "Client"]);
  assert.equal(tabs[0].content, "primary");
  assert.deepEqual(buildTabs("p", []), []);
  const own = buildTabs("p", [{ label: "Human", content: "h" }, { label: "AI", content: "a" }]);
  assert.equal(own[0].content, "h");
});

test("searchTerms splits words, drops short ones, trims plural s, caps at 6", () => {
  assert.deepEqual(searchTerms("instagram videos"), ["instagram", "video"]);
  assert.deepEqual(searchTerms("  Hook, a  B-roll! "), ["hook", "roll"]);
  assert.deepEqual(searchTerms("ads class bus"), ["ads", "class", "bus"]);
  assert.deepEqual(searchTerms("hooks Hook"), ["hook"]);
  assert.deepEqual(searchTerms("one two three four five six seven"), ["one", "two", "three", "four", "five", "six"]);
  assert.deepEqual(searchTerms("a ? !"), []);
  assert.equal(titleHits("Instagram Video Hooks", ["instagram", "video"]), 2);
  assert.equal(titleHits("Paid ads", ["instagram"]), 0);
});

test("kind labels and browse hrefs", () => {
  assert.equal(kindLabel("sop"), "SOP");
  assert.equal(kindLabel(null), "Doc");
  assert.equal(browseHref("content"), "/library/browse/content");
  assert.equal(browseHref("content", "Agency SOPs"), "/library/browse/content/agency-sops");
  assert.equal(browseHref("content", "Agency SOPs", "Hooks and scripts"), "/library/browse/content/agency-sops/hooks-and-scripts");
  assert.equal(browseHref("content", null, null), "/library/browse/content/other/other");
});

test("kindFilters lists present kinds in a fixed order with counts, none for one kind", () => {
  const items = [{ kind: "chat" }, { kind: "sop" }, { kind: "chat" }, { kind: null }];
  assert.deepEqual(kindFilters(items), [
    { kind: "all", label: "All", count: 4 },
    { kind: "sop", label: "SOPs", count: 1 },
    { kind: "chat", label: "Chats", count: 2 },
    { kind: "doc", label: "Other", count: 1 },
  ]);
  assert.deepEqual(kindFilters([{ kind: "sop" }, { kind: "sop" }]), []);
  assert.equal(matchesKind({ kind: null }, "doc"), true);
  assert.equal(matchesKind({ kind: "sop" }, "chat"), false);
  assert.equal(matchesKind({ kind: "sop" }, "all"), true);
});

test("toCard flattens a row for the client", () => {
  const c = toCard({
    slug: "s", title: "T", kind: "sop", summary: "sum", subject: "content", source: null, topic: "Hooks",
    origin: null, purpose: "p", steps: ["a", 2, "b"], url: null,
    tldr: " Short ", useWhen: null, fromLine: null, example: { text: "quote" }, links: [{ label: "L", url: "https://x.dev" }],
    related: null, visual: { type: "flow" }, groupLabel: "",
  });
  assert.equal(c.tldr, "Short");
  assert.deepEqual(c.example, { text: "quote", label: null });
  assert.deepEqual(c.visual, { type: "flow" });
  assert.equal(c.groupLabel, null);
  assert.deepEqual(c.related, []);
  assert.deepEqual(c.steps, ["a", "b"]);
  assert.equal(c.path, "Content / Other / Hooks");
});
