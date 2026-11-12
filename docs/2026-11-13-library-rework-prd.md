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
