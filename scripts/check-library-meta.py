#!/usr/bin/env python3
"""Usage: python3 check_meta_v2.py <meta-file.json> [more files]. Exit 0 when clean."""
import json, os, re, sys, collections
V = "/Users/abdi/Library/Mobile Documents/iCloud~md~obsidian/Documents/Abdi's Brain"
def words(s): return len(str(s).split())
def norm(s):
    s = s.lower().replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = re.sub(r"[*_#>`|\\]", "", s)
    return re.sub(r"\s+", " ", s).strip()
bad = []; vis = collections.Counter(); n = 0
for f in sys.argv[1:]:
    raw = open(f, encoding="utf-8").read()
    if "—" in raw or "–" in raw: bad.append((f, "em or en dash character in file"))
    for e in json.loads(raw):
        if e.get("skip"): continue
        n += 1; p = e["sourcePath"]; b = lambda m: bad.append((p, m))
        try: doc = open(os.path.join(V, p), encoding="utf-8").read()
        except Exception as x: b("cannot read note: %s" % x); continue
        for v in e.get("variants", []):
            try: doc += "\n" + open(os.path.join(V, v["sourcePath"]), encoding="utf-8").read()
            except Exception: pass
        nd = norm(doc)
        for fld, mx in (("tldr", 16), ("useWhen", 14), ("from", 14)):
            if not e.get(fld): b("missing " + fld)
            elif words(e[fld]) > mx: b("%s over %d words" % (fld, mx))
        st = e.get("steps")
        if not isinstance(st, list) or not 2 <= len(st) <= 5: b("steps must be 2 to 5")
        else:
            for s in st:
                if words(s) > 7: b("step over 7 words: " + s)
        ex = e.get("example")
        if ex is not None:
            if not ex.get("text") or not ex.get("label"): b("example needs text and label")
            else:
                if words(ex["text"]) > 30: b("example over 30 words")
                if words(ex["label"]) > 6: b("example label over 6 words")
                if norm(ex["text"]).strip(' ."\'') not in nd: b("example text not found word for word in the note")
        for l in e.get("links", []):
            if not l.get("url") or not l.get("label"): b("link needs label and url")
            elif l["url"] not in doc: b("link url not in note: " + l["url"])
            elif words(l["label"]) > 5: b("link label over 5 words")
        if len(e.get("links", [])) > 5: b("more than 5 links")
        rel = e.get("related", [])
        if len(rel) > 3: b("more than 3 related")
        for r in rel:
            if not os.path.exists(os.path.join(V, r)): b("related path missing: " + r)
        v = e.get("visual") or {}
        t = v.get("type"); vis[t] += 1
        if t == "flow": pass
        elif t == "formula":
            ps = v.get("parts", [])
            if not 2 <= len(ps) <= 4 or any(words(x) > 3 for x in ps) or not v.get("result") or words(v["result"]) > 4: b("bad formula visual")
        elif t == "twocol":
            if not v.get("leftLabel") or not v.get("rightLabel"): b("twocol needs labels")
            for side in ("left", "right"):
                it = v.get(side, [])
                if not 1 <= len(it) <= 3 or any(words(x) > 7 for x in it): b("bad twocol " + side)
        elif t == "funnel":
            sg = v.get("stages", [])
            if not 3 <= len(sg) <= 5 or any(words(x) > 3 for x in sg): b("bad funnel visual")
        elif t == "numbers":
            it = v.get("items", [])
            if not 1 <= len(it) <= 3: b("numbers needs 1 to 3 items")
            for x in it:
                if not x.get("value") or not x.get("label") or words(x["label"]) > 6: b("bad numbers item")
                elif norm(str(x["value"])).strip("+~%$x ") not in nd: b("number not in note: %s" % x["value"])
        else: b("visual.type must be flow, formula, twocol, funnel or numbers")
print("entries checked:", n); print("visual types:", dict(vis))
for p, m in bad: print("BAD", p, "::", m)
print("problems:", len(bad)); sys.exit(1 if bad else 0)
