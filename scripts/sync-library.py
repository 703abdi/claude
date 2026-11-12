#!/usr/bin/env python3
"""Push the vault's Library docs into the app. Called by scripts/sync-library.sh.

Sources:
  1. Every *.json in the meta folder ($LIBRARY_META_DIR, default "$VAULT/_scripts/library/meta").
     Each is a JSON array of entries: sourcePath, title, kind, subject, source, topic, summary,
     origin, purpose, steps, variants [{label, sourcePath}], url, skip.
  2. Every .md in the vault's SOPs/ folder, exactly as before (slug = slugify(file name)),
     merged with a meta entry for the same sourcePath when there is one.

Posts in batches to /api/library, then removes rows the app has with addedBy "sync" that are
no longer in the set. Rows added in the app (addedBy "manual") are never touched.
Set LIBRARY_DRY_RUN=1 to print what would be sent without posting.
"""
import glob
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

SUBJECTS = {"content", "paid-ads", "sales", "websites-design", "claude-ai", "agency-ops", "business"}
KINDS = {"sop", "research", "method", "report", "chat", "note", "link"}
RESERVED = {"new", "browse"}  # pages under /library
MAX_CONTENT = 190_000
BATCH_DOCS = 20
BATCH_BYTES = 3_500_000  # stay under the host's request body limit


def warn(msg):
    print("warning: " + msg, file=sys.stderr)


def slugify(t):
    t = re.sub(r"\.md$", "", t.lower())
    t = re.sub(r"[^a-z0-9]+", "-", t)
    return t.strip("-")


def truncate(text):
    if len(text) <= MAX_CONTENT:
        return text
    tail = "\n\n[truncated]"
    return text[: MAX_CONTENT - len(tail)] + tail


def clip(value, n):
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value[:n] if value else None


def order_of(title):
    m = re.match(r"^(\d+)\s", title)
    if m:
        return int(m.group(1))
    m = re.match(r"^[A-Za-z]{2,6}-(\d+)\b", title)
    if m:
        return int(m.group(1))
    return 99


def mtime_of(path):
    return datetime.fromtimestamp(os.stat(path).st_mtime, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def load_meta(meta_dir, vault):
    """sourcePath -> entry, in file order. Skips bad entries with a warning."""
    entries = {}
    if not os.path.isdir(meta_dir):
        warn("no meta folder at " + meta_dir + " (only SOPs/ will sync)")
        return entries
    for path in sorted(glob.glob(os.path.join(meta_dir, "*.json"))):
        try:
            data = json.loads(read(path))
        except Exception as e:  # noqa: BLE001
            warn("could not read %s: %s" % (path, e))
            continue
        if not isinstance(data, list):
            warn(path + " is not a JSON array, skipped")
            continue
        for e in data:
            if not isinstance(e, dict) or e.get("skip") is True:
                continue
            sp = e.get("sourcePath")
            if not isinstance(sp, str) or not sp.strip():
                warn("entry with no sourcePath in " + path)
                continue
            if not os.path.isfile(os.path.join(vault, sp)):
                warn("missing file " + sp + " (from " + os.path.basename(path) + ")")
                continue
            if sp in entries:
                warn("duplicate entry for " + sp + ", keeping the first")
                continue
            entries[sp] = e
    return entries


def meta_fields(e, vault):
    """The grouping and explanation fields of a meta entry, cleaned to what the API accepts."""
    out = {}
    subject = e.get("subject")
    if subject is not None and subject not in SUBJECTS:
        warn("unknown subject %r for %s, left unsorted" % (subject, e["sourcePath"]))
        subject = None
    out["subject"] = subject
    kind = e.get("kind")
    if kind is not None and kind not in KINDS:
        warn("unknown kind %r for %s, dropped" % (kind, e["sourcePath"]))
        kind = None
    out["kind"] = kind
    out["source"] = clip(e.get("source"), 100)
    out["topic"] = clip(e.get("topic"), 100)
    for k in ("summary", "origin", "purpose"):
        out[k] = clip(e.get(k), 2000)
    steps = e.get("steps")
    if isinstance(steps, list):
        steps = [s.strip()[:300] for s in steps if isinstance(s, str) and s.strip()][:20]
    out["steps"] = steps or None
    url = e.get("url")
    out["url"] = url.strip() if isinstance(url, str) and re.match(r"^https?://", url.strip()) else None

    variants = []
    for v in e.get("variants") or []:
        if not isinstance(v, dict):
            continue
        label, vp = v.get("label"), v.get("sourcePath")
        if not isinstance(label, str) or not isinstance(vp, str):
            continue
        full = os.path.join(vault, vp)
        if not os.path.isfile(full):
            warn("missing variant file " + vp)
            continue
        variants.append({"label": label.strip()[:40], "content": truncate(read(full)), "sourcePath": vp})
    out["variants"] = variants[:5] or None
    return out


def build_docs(vault, meta):
    docs = []
    taken = set(RESERVED)
    used_meta = set()

    sops = os.path.join(vault, "SOPs")
    if os.path.isdir(sops):
        for name in sorted(os.listdir(sops)):
            if not name.endswith(".md") or name.startswith("_"):
                continue
            path = os.path.join(sops, name)
            sp = "SOPs/" + name
            title = name[:-3]
            m = re.match(r"^(\d+)\s", title)
            order = int(m.group(1)) if m else (-1 if title.lower() == "readme" else 99)
            if title.lower() == "readme":
                title = "Start here (index)"
            doc = {
                "slug": slugify(name),
                "title": title,
                "folder": "SOPs",
                "order": order,
                "content": truncate(read(path)),
                "sourcePath": sp,
                "mtime": mtime_of(path),
            }
            if sp in meta:
                e = meta[sp]
                used_meta.add(sp)
                doc.update(meta_fields(e, vault))
                if isinstance(e.get("title"), str) and e["title"].strip() and title != "Start here (index)":
                    doc["title"] = e["title"].strip()[:300]
                if doc.get("source"):
                    doc["folder"] = doc["source"]
            taken.add(doc["slug"])
            docs.append(doc)
    else:
        warn("no SOPs folder at " + sops)

    for sp, e in meta.items():
        if sp in used_meta:
            continue
        path = os.path.join(vault, sp)
        title = e.get("title") if isinstance(e.get("title"), str) and e["title"].strip() else os.path.basename(sp)[:-3]
        title = title.strip()[:300]
        slug = slugify(title) or slugify(os.path.basename(sp)) or "doc"
        if slug in taken:
            slug = slug + "-" + hashlib.sha1(sp.encode("utf-8")).hexdigest()[:6]
        taken.add(slug)
        doc = {
            "slug": slug[:200],
            "title": title,
            "order": order_of(title),
            "content": truncate(read(path)),
            "sourcePath": sp,
            "mtime": mtime_of(path),
        }
        doc.update(meta_fields(e, vault))
        doc["folder"] = (doc.get("source") or "Library")[:100]
        docs.append(doc)
    return docs


def api(app, token, method, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        app + "/api/library",
        data=data,
        method=method,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        print("%s /api/library failed: %s %s" % (method, e.code, e.read().decode("utf-8", "replace")[:2000]), file=sys.stderr)
        sys.exit(1)


def batches(docs):
    cur, size = [], 0
    for d in docs:
        n = len(json.dumps(d))
        if cur and (len(cur) >= BATCH_DOCS or size + n > BATCH_BYTES):
            yield cur
            cur, size = [], 0
        cur.append(d)
        size += n
    if cur:
        yield cur


def main():
    vault, app, token_file = sys.argv[1], sys.argv[2], sys.argv[3]
    meta_dir = os.environ.get("LIBRARY_META_DIR") or os.path.join(vault, "_scripts", "library", "meta")
    dry = os.environ.get("LIBRARY_DRY_RUN") == "1"

    meta = load_meta(meta_dir, vault)
    docs = build_docs(vault, meta)
    with_subject = sum(1 for d in docs if d.get("subject"))
    print("built %d docs (%d from meta, %d with a subject)" % (len(docs), len(meta), with_subject))

    if dry:
        for d in docs:
            print("  %-60s %s / %s / %s" % (d["slug"][:60], d.get("subject"), d.get("source"), d.get("topic")))
        print("dry run: nothing sent")
        return

    with open(token_file) as f:
        token = f.read().strip()

    upserted = skipped = 0
    for i, batch in enumerate(batches(docs), 1):
        res = api(app, token, "POST", {"docs": batch})
        upserted += res.get("upserted", 0)
        skipped += res.get("skipped", 0)
        print("batch %d: %s" % (i, res))

    have = {d["slug"] for d in api(app, token, "GET") if d.get("addedBy", "sync") == "sync"}
    gone = sorted(have - {d["slug"] for d in docs})
    deleted = 0
    if gone:
        deleted = api(app, token, "POST", {"docs": [], "deletedSlugs": gone}).get("deleted", 0)
    print("upserted %d, skipped %d (added in the app), deleted %d" % (upserted, skipped, deleted))


if __name__ == "__main__":
    main()
