import { test } from "node:test";
import assert from "node:assert/strict";
import { firstWords, plainText, sectionSlug, splitSections } from "../note-sections";

test("empty input gives no sections", () => {
  assert.deepEqual(splitSections(""), []);
  assert.deepEqual(splitSections("\n\n  \n"), []);
  assert.deepEqual(splitSections("---\ntype: sop\n---\n"), []);
});

test("splits at h1 to h3, keeps h4 inside, intro before the first heading", () => {
  const md = "Some intro words.\n\n# One\ntext a\n#### Small\nstill one\n## Two\ntext b\n### Three\ntext c";
  const s = splitSections(md);
  assert.deepEqual(s.map((x) => x.label), ["Intro", "One", "Two", "Three"]);
  assert.deepEqual(s.map((x) => x.id), ["intro", "one", "two", "three"]);
  assert.match(s[1].body, /#### Small\nstill one/);
  assert.equal(s[0].body, "Some intro words.");
});

test("# lines inside code fences do not split", () => {
  const md = "# Real\n```bash\n# just a comment\n## also not a heading\n```\nafter\n## Next\nend";
  const s = splitSections(md);
  assert.deepEqual(s.map((x) => x.label), ["Real", "Next"]);
  assert.match(s[0].body, /# just a comment/);
});

test("frontmatter is dropped and repeated headings get unique ids", () => {
  const s = splitSections("---\ntitle: x\n---\n## Steps\na\n## Steps\nb");
  assert.deepEqual(s.map((x) => x.id), ["steps", "steps-2"]);
});

test("a chat splits at each You turn, labelled with the first words of the question", () => {
  const md = [
    "---", "type: chat", "---", "# Mock call review", "",
    "**You:**", "This is a call with me and my sales coach tell me the framework", "",
    "**ChatGPT:**", "## A heading in the answer", "Here is the framework.", "",
    "**You:** And what about [objections](https://x.com) on **price**?", "", "**ChatGPT:**", "Answer two.",
  ].join("\n");
  const s = splitSections(md);
  assert.equal(s.length, 2, "the title-only intro is skipped and answer headings do not split");
  assert.equal(s[0].label, "This is a call with me and my...");
  assert.equal(s[1].label, "And what about objections on price?");
  assert.match(s[0].body, /## A heading in the answer/);
});

test("text helpers", () => {
  assert.equal(plainText("**Bold** [[Page|alias]] [link](http://a) `code`"), "Bold alias link code");
  assert.equal(firstWords("one two three", 2), "one two...");
  assert.equal(sectionSlug("What's next? (v2)"), "what-s-next-v2");
  assert.equal(sectionSlug("!!!"), "section");
});
