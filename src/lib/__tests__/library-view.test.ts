import { test } from "node:test";
import assert from "node:assert/strict";
import { domainOf, groupItems, isDoDont, parseExample, parseLinks, parseRelated, parseVisual } from "../library-view";

test("parseVisual accepts the five types and rejects bad ones", () => {
  assert.deepEqual(parseVisual({ type: "flow" }), { type: "flow" });
  assert.deepEqual(parseVisual({ type: "formula", parts: ["Hook", "Proof", 3, "CTA", "x", "y"], result: "A reel" }), {
    type: "formula",
    parts: ["Hook", "Proof", "CTA", "x"],
    result: "A reel",
  });
  assert.equal(parseVisual({ type: "formula", parts: ["a"] }), null);
  assert.equal(parseVisual({ type: "funnel", stages: ["one"] }), null);
  assert.deepEqual(parseVisual({ type: "numbers", items: [{ value: "10+", label: "videos" }, { label: "no value" }] }), {
    type: "numbers",
    items: [{ value: "10+", label: "videos" }],
  });
  assert.equal(parseVisual({ type: "twocol" }), null);
  assert.equal(parseVisual({ type: "pie" }), null);
  assert.equal(parseVisual(null), null);
});

test("example, links and related parse defensively", () => {
  assert.deepEqual(parseExample({ text: " Hi ", label: "" }), { text: "Hi", label: null });
  assert.equal(parseExample({ label: "x" }), null);
  assert.deepEqual(parseLinks([{ label: "A", url: "https://a.com" }, { label: "B", url: "ftp://b" }, { url: "https://c" }]), [
    { label: "A", url: "https://a.com" },
  ]);
  assert.deepEqual(parseRelated([{ slug: "s", title: "T" }, { slug: "x" }]), [{ slug: "s", title: "T" }]);
});

test("domainOf and isDoDont", () => {
  assert.equal(domainOf("https://www.youtube.com/watch?v=1"), "youtube.com");
  assert.equal(domainOf("not a url"), "not a url");
  assert.equal(isDoDont("Do", "Don't"), true);
  assert.equal(isDoDont("do", "DONT"), true);
  assert.equal(isDoDont("Before", "After"), false);
});

test("groupItems keeps first-seen order and puts loose items under Other only when mixed", () => {
  const items = [
    { id: 1, groupLabel: "B" },
    { id: 2, groupLabel: null },
    { id: 3, groupLabel: "A" },
    { id: 4, groupLabel: "B" },
  ];
  assert.deepEqual(
    groupItems(items).map((g) => [g.label, g.items.map((i) => i.id)]),
    [["B", [1, 4]], ["A", [3]], ["Other", [2]]],
  );
  assert.deepEqual(groupItems([{ id: 1, groupLabel: null }]).map((g) => g.label), [null]);
  assert.deepEqual(groupItems([]), []);
});
