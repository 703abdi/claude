# Library rework PRD (Nov 13 2026)

Abdi's answers: 1A 2B (+ relevant chats) 3A 4A 5A.

## What it is

The Library becomes a drill-down over everything in the vault worth learning from:

```
/library                              "What are you looking for?" search + 7 subject boxes + Add new
/library/browse/[subject]             source boxes inside the subject (Your SOPs, Agency SOPs, Agency research, Nightshift, Grok reports, Chats, Added by you, or a named source such as "School of Hard Knocks")
/library/browse/[subject]/[source]    topic boxes inside that source
/library/browse/[subject]/[source]/[topic]   every item on that topic: title, kind, one-line "what this is"
/library/[slug]                       the item: explanation panel (What this is / Where it came from / What it does), steps visual, AI / Human / Client tabs when it has versions, then the full text
/library/new                          Add new: paste text or a link, pick subject, source, topic
```

Subjects (fixed, in this order; slug -> label):
`content` Content, `paid-ads` Paid Ads, `sales` Sales and Outreach, `websites-design` Websites and Design, `claude-ai` Claude and AI, `agency-ops` Agency Ops, `business` Business and Offers.

## Data

`LibraryDoc` gets new nullable columns (additive migration, old rows keep working):
`subject`, `source`, `topic`, `kind` (sop | research | method | report | chat | note | link), `summary`, `origin`, `purpose`, `steps` (Json, string[]), `variants` (Json, `[{label, content, sourcePath}]`), `url`, `addedBy` ("sync" | "manual", default "sync").

Docs with no `subject` show under a last box "Unsorted" so nothing disappears.

### Metadata files (the explanations)

Written once by Claude agents, stored in the vault at `_scripts/library/meta/*.json`. Each file is a JSON array of:

```json
{
  "sourcePath": "Agency Library/SOPs/Human SOPs/Content/CON-02 Hooks and talking-point scripts.md",
  "variants": [{ "label": "AI", "sourcePath": "Agency Library/SOPs/AI SOPs/Content/CON-02 ... (AI).md" }],
  "title": "CON-02 Hooks and talking-point scripts",
  "kind": "sop",
  "subject": "content",
  "source": "Agency SOPs",
  "topic": "Hooks and scripts",
  "summary": "One or two plain sentences: what this is.",
  "origin": "Where it came from: which research, chats, people or date. Only what the file itself or its links say. If the file does not say, write \"source needed\".",
  "purpose": "What it does and when to open it.",
  "steps": ["3 to 7 short steps, only when the doc describes a process"]
}
```

Rules for the text: plain words a 12-year-old follows, no em dashes, no "serves as", no invented facts. `sourcePath` is relative to the vault root and must exist. For an agency SOP the primary `sourcePath` is the Human version and the AI and Client versions go in `variants` (label "Human" is implied for the primary). `subject` must be one of the 7 slugs. Topics are short noun phrases (2 to 4 words), reused across files where they fit; aim for 4 to 10 topics per subject.

`scripts/sync-library.sh` reads every meta file, loads the files they point to, and posts them (in batches) to `/api/library`. Vault docs in the old `SOPs/` folder with no meta entry still sync as before. Rows with `addedBy = "manual"` are never deleted by the sync.

## Acceptance criteria (pass / fail)

1. `/library` shows a "What are you looking for?" type-box and the 7 subject boxes, each with its item count, plus an "Add new" box. No flat list of SOPs.
2. Typing in the search box and submitting lists matching items (title, summary, topic, source) with links.
3. Clicking a subject shows source boxes with counts; clicking a source shows topic boxes with counts; clicking a topic lists its items. Each level has a breadcrumb back up.
4. An item page shows the three explanation lines above the text when they exist, a numbered steps strip when `steps` exists, and AI / Human / Client tabs when `variants` exists.
5. Local DB after sync holds at least 250 docs with `subject`, `summary`, `origin` and `purpose` all set, across all 7 subjects, and every agency SOP code appears once (not three times).
6. At least 30 chats are in the Library, each with an explanation, under source "Chats".
7. `/library/new` saves a pasted note or a link with subject, source (existing or newly typed) and topic; it then appears in the drill-down under that path, and survives a re-sync.
8. Old links `/library/<old-slug>` for the 17 personal SOPs still open.
9. Every page works at 375px wide with no sideways scroll.
10. `npm run typecheck`, `npm run lint`, `npm test` and `next build` all pass.
11. Design matches the app: `eyebrow` labels, `jarvis-panel` / `jarvis-row` lists, `type-box` inputs, thin borders, no box inside a box.

## Non-Goals

- No in-app AI writing (the Anthropic key is invalid until about Nov 14).
- No School of Hard Knocks scrape. Abdi adds it through Add new.
- No file upload, no editing of vault docs in the app, no images from Nightshift.
- No sync to production, commit, push or deploy without Abdi's yes.
- Chats are picked for relevance, not imported wholesale.

---

# V2 content pass (Nov 12 2026)

Abdi after seeing it live: "too many words, not clear enough instruction, no visuals or example links or anything."
Also: split big topics, hint when the steps line overflows, merge "Skool of Content" into "School of Hard Knocks".

## What an item shows now (pop-up and top of the item page)

1. `tldr`: one line, the whole point.
2. `visual`: one drawn graphic that fits the item.
3. `steps`: what to do, as commands.
4. `example`: one real line lifted from the note.
5. `links`: links that are in the note, plus `related` Library items.
6. `from`: one short line on where it came from.
7. Button: Read the full note. The old long summary / origin / purpose sit behind a "More detail" expander.

## New fields in each meta entry (old fields stay)

```json
{
  "tldr": "max 16 words. What this is, said so a 12-year-old gets it. No filler.",
  "useWhen": "max 14 words. Starts with a verb or 'When'. The moment to open it.",
  "from": "max 14 words. Who or what it came from and the date. 'source needed' if unknown.",
  "steps": ["max 5 steps, each max 7 words, each starts with a verb (a command)"],
  "example": { "text": "max 30 words, copied word for word from the note", "label": "max 6 words: what the example is, e.g. 'A hook from this note'" },
  "links": [{ "label": "max 5 words", "url": "a URL that appears in the note, copied exactly" }],
  "related": ["vault-relative paths of up to 3 other notes this one was built from or pairs with"],
  "visual": { "type": "..." }
}
```

`visual` is exactly one of:
- `{ "type": "flow" }` draws `steps` as a numbered line. Use when the note is a process.
- `{ "type": "formula", "parts": ["2 to 4 labels, max 3 words each"], "result": "max 4 words" }` draws A + B + C = result. Use when the note boils down to a recipe.
- `{ "type": "twocol", "leftLabel": "Do", "left": ["max 3 items, max 7 words each"], "rightLabel": "Don't", "right": ["max 3 items"] }` any two-sided contrast (do / don't, before / after, us / them, works / fails).
- `{ "type": "funnel", "stages": ["3 to 5 labels, max 3 words each, top to bottom"] }` use when the note is about stages people move through.
- `{ "type": "numbers", "items": [{ "value": "10+", "label": "max 6 words" }] }` 1 to 3 key numbers that the note itself states.

Rules: `steps` is required for every entry (if the note is not a process, the steps are how to use it). `example` is required unless the note has no quotable line (then omit it). `links` may be empty; never invent a URL. Numbers, names and quotes come only from the note. No em or en dashes, straight quotes, plain words.

## Groups inside big topics

`_scripts/library/meta/groups.json` is one object `{ "<sourcePath>": "<group label>" }`. Any (subject, source, topic) set with more than 6 items gets split into groups of 2 to 6 items with a 2 to 4 word label. The topic page shows the groups as headed sections.

## Acceptance criteria (pass / fail)

1. Every non-skipped meta entry passes `check_meta_v2.py` (field limits, example found in the note, link URLs found in the note, visual schema, no dashes).
2. No single visual type is used for more than 60% of items.
3. The pop-up for a typical item shows: tldr, visual, steps, example, links or related, from line, one accent button. Visible words in the pop-up are under half of the v1 pop-up for the same item (measure 5 items, report both numbers).
4. Topic pages with more than 6 items show group headings; no group has more than 6 cards.
5. When the steps line overflows, a fade and a small arrow show there is more.
6. "Skool of Content" no longer appears as a source.
7. Typecheck, lint, tests, build pass. No sideways page scroll at 375px.

## Non-Goals

No images from the vault, no generated pictures, no in-app AI, no new subjects.

## Full note reader (added after Abdi: "I don't like the full note system, rethink it")

The "Pick a tab to read the full text" tab bar goes away. Under the summary the item page shows a reader:
- The note is split into sections by its markdown headings (h1 to h3). A chat is split into exchanges: each "**You:**" turn starts a section and its label is the first words of what he asked (max 8 words).
- Desktop: a section list on the left (sticky, scrolls on its own), the picked section on the right. The first section is open on load. Only one section shows at a time, with previous / next section buttons at the bottom.
- Phone: the section list is a horizontal swipe row of chips above the section.
- A note with fewer than 2 sections just shows its text. Notes with Human / AI / Client versions get a small segmented control above the section list.
- Acceptance: on load, the page height at 1280x800 for CON-02 and for the longest chat is under 2 screens; clicking a section swaps the right pane without a page reload; a link with #section-id opens that section.
