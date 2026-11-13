"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Subject = { slug: string; label: string };

const field = "type-box w-full min-w-0 bg-surface px-3 py-2.5 text-[15px] outline-none placeholder:text-muted-2";

export default function NewDocForm({
  subjects,
  sources,
  topics,
  defaultSource,
}: {
  subjects: Subject[];
  sources: string[];
  topics: string[];
  defaultSource: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [subject, setSubject] = useState("");
  const [source, setSource] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!content.trim() && !url.trim()) {
      setError("Paste some text or a link.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/library/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          url: url.trim() || null,
          content,
          subject,
          source: source.trim() || null,
          topic: topic.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.slug) {
        setError(typeof data.error === "string" ? data.error : "That did not save. Try again.");
        setSaving(false);
        return;
      }
      router.push(`/library/${data.slug}`);
      router.refresh();
    } catch {
      setError("That did not save. Check your connection and try again.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block">
        <span className="eyebrow mb-1.5 block px-1">Title</span>
        <input required value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="What should this be called?" />
      </label>

      <label className="block">
        <span className="eyebrow mb-1.5 block px-1">Link (optional)</span>
        <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} className={field} placeholder="https://" />
      </label>

      <label className="block">
        <span className="eyebrow mb-1.5 block px-1">Text {url.trim() ? "(optional)" : ""}</span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          className={`${field} resize-y leading-relaxed`}
          placeholder="Paste the note here. Markdown works."
        />
      </label>

      <label className="block">
        <span className="eyebrow mb-1.5 block px-1">Subject</span>
        <select required value={subject} onChange={(e) => setSubject(e.target.value)} className={field}>
          <option value="" disabled>
            Pick one
          </option>
          {subjects.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="eyebrow mb-1.5 block px-1">Source</span>
          <input list="library-sources" value={source} onChange={(e) => setSource(e.target.value)} className={field} placeholder={defaultSource} />
          <datalist id="library-sources">
            {sources.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="block min-w-0">
          <span className="eyebrow mb-1.5 block px-1">Topic</span>
          <input list="library-topics" value={topic} onChange={(e) => setTopic(e.target.value)} className={field} placeholder="For example: Hooks and scripts" />
          <datalist id="library-topics">
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <button type="submit" disabled={saving} className="h-11 rounded-lg bg-foreground px-5 text-[14px] font-semibold text-background disabled:opacity-40">
        {saving ? "Saving..." : "Save to Library"}
      </button>
    </form>
  );
}
