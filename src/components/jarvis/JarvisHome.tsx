"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { Briefing, EventLine } from "@/lib/jarvis/briefing";
import { ago, useMedia, useNow } from "@/components/hub/hub-ui";
import { localNotify } from "@/lib/push-client";
import Backdrop, { BACKDROPS, useBackdrop } from "./Backdrop";
import PrayerLine from "./PrayerLine";
import { createOrb, type Orb, type OrbState } from "./orb";
import { canListen, canSpeak, listenForWake, listenOnce, speak, stopSpeaking } from "./voice";

type Source = { name: string; ok: boolean; lastSyncAt: string | null; error: string | null };
type Payload = Briefing & { sources: Source[] };
type Nudge = { id: string; kind: string; title: string; body: string; url: string | null; createdAt: string };
type MacStatus = { online: boolean; updatedAt: string | null; sessions: { name: string; state: "running" | "waiting" | "idle"; detail?: string }[] };
type Done = { id: string; kind: string; summary: string; undone?: boolean };
type Answer = { q: string; a: string; bad?: boolean; actions?: Done[]; sources?: { title: string; url: string | null }[] };

const POLL_MS = 30_000;
const SOURCE_LABEL: Record<string, string> = { google: "Google", calendly: "Calendly", fathom: "Fathom" };
const WAKE_KEY = "pos.wake";

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function useHome() {
  const [data, setData] = useState<Payload | null>(null);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [mac, setMac] = useState<MacStatus | null>(null);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const [brief, n, m] = await Promise.all([
      getJson<Payload>(`/api/jarvis/brief?tz=${encodeURIComponent(tz)}`),
      getJson<{ nudges: Nudge[] }>("/api/jarvis/nudges"),
      getJson<MacStatus>("/api/mac/status"),
    ]);
    if (brief) {
      setData(brief);
      setUpdatedAt(Date.now());
    }
    setError(!brief);
    if (n) setNudges(n.nudges);
    setMac(m);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(() => !document.hidden && load(), POLL_MS);
    const onShow = () => !document.hidden && load();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [load]);

  return { data, nudges, setNudges, mac, error, updatedAt, reload: load };
}

function OrbCanvas({ state, level, onTap, label }: { state: OrbState; level: number; onTap: () => void; label: string }) {
  const host = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const orb = useRef<Orb | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!host.current || !canvas.current) return;
    try {
      orb.current = createOrb(canvas.current, host.current);
    } catch {
      // No WebGL (old phone, locked-down browser): a plain glowing disc stands in.
      const t = setTimeout(() => setFailed(true), 0);
      return () => clearTimeout(t);
    }
    return () => {
      orb.current?.destroy();
      orb.current = null;
    };
  }, []);
  useEffect(() => orb.current?.setState(state), [state]);
  useEffect(() => orb.current?.setLevel(level), [level]);

  return (
    <button ref={host} onClick={onTap} aria-label={label} title={label} className="jarvis-orb relative block h-[200px] w-full max-w-[520px] cursor-pointer md:h-[280px]">
      {failed ? <span className="jarvis-orb-fallback" data-state={state} /> : <canvas ref={canvas} className="absolute inset-0 h-full w-full" />}
    </button>
  );
}

function Row({ line, showDay }: { line: EventLine; showDay: boolean }) {
  const soon = line.minutesAway !== null && line.minutesAway <= 30;
  return (
    <li>
      <Link href={`/calendar?day=${line.dayKey}`} className="jarvis-row">
        <span className={`w-[92px] shrink-0 font-mono text-[12px] ${soon ? "text-accent" : "text-muted"}`}>{showDay ? line.dayLabel : (line.time ?? "All day")}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-foreground">{line.title}</span>
          {(line.person || (showDay && line.time)) && (
            <span className="block truncate text-[12px] text-muted-2">{[showDay ? line.time : null, line.person].filter(Boolean).join(" · ")}</span>
          )}
        </span>
        {line.source && <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-2">{line.source}</span>}
      </Link>
    </li>
  );
}

function Panel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="jarvis-panel min-w-0">
      <h2 className="mb-1 flex items-baseline justify-between px-1">
        <span className="eyebrow">{title}</span>
        {count !== undefined && count > 0 && <span className="font-mono text-[11px] text-muted-2">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

export default function JarvisHome() {
  const { data, nudges, setNudges, mac, error, updatedAt, reload } = useHome();
  const now = useNow(10_000);
  const reduced = useReducedMotion();
  const isDesktop = useMedia("(min-width: 768px)");
  const { id: backdropId, choose, backdrop } = useBackdrop();

  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [level, setLevel] = useState(0);
  const [question, setQuestion] = useState("");
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState({ listen: false, speak: false });
  const [wake, setWake] = useState(false);
  const [armed, setArmed] = useState(false);
  const stopListening = useRef<(() => void) | null>(null);
  const decay = useRef<ReturnType<typeof setInterval> | null>(null);
  const history = useRef<{ q: string; a: string }[]>([]);
  const prayer = useRef<string | null>(null);
  const wakeCtl = useRef<ReturnType<typeof listenForWake> | null>(null);
  // Speech only works after the first tap or key press on the page, so Jarvis stays quiet until then.
  const touched = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setVoice({ listen: canListen(), speak: canSpeak() });
      try {
        setWake(canListen() && localStorage.getItem(WAKE_KEY) === "1");
      } catch {
        // storage blocked: wake word stays off
      }
    }, 0);
    const mark = () => (touched.current = true);
    window.addEventListener("pointerdown", mark);
    window.addEventListener("keydown", mark);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
      stopSpeaking();
      if (decay.current) clearInterval(decay.current);
    };
  }, []);

  const say = useCallback((text: string) => {
    if (!canSpeak()) return;
    wakeCtl.current?.pause();
    speak(text, {
      start: () => {
        setOrbState("speaking");
        // No analyser on browser speech: pulse on each word and let it fall off.
        if (decay.current) clearInterval(decay.current);
        decay.current = setInterval(() => setLevel((l) => (l > 0.02 ? l * 0.8 : 0)), 60);
        setLevel(0.6);
      },
      word: () => setLevel(0.55 + Math.random() * 0.4),
      end: () => {
        if (decay.current) clearInterval(decay.current);
        setLevel(0);
        setOrbState("idle");
        wakeCtl.current?.resume();
      },
    });
  }, []);

  function tapOrb() {
    if (orbState === "speaking") {
      stopSpeaking();
      setOrbState("idle");
      wakeCtl.current?.resume();
      return;
    }
    if (!data) return;
    const heads = nudges.length ? ` Heads up: ${nudges.slice(0, 2).map((n) => n.title).join(". ")}.` : "";
    say(`${data.spoken}${heads}${prayer.current ? ` ${prayer.current}` : ""}`);
  }

  const ask = useCallback(
    async (q: string) => {
      const text = q.trim();
      if (!text) return;
      setBusy(true);
      setQuestion("");
      setHeard("");
      setOrbState("thinking");
      try {
        const res = await fetch("/api/jarvis/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, history: history.current.slice(-3) }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setAnswer({ q: text, a: json.error ?? "Jarvis couldn't answer that.", bad: true });
          setOrbState("idle");
        } else {
          const a: string = json.answer ?? "";
          history.current = [...history.current, { q: text, a }].slice(-3);
          setAnswer({ q: text, a, actions: json.actions ?? [], sources: json.sources ?? [] });
          if ((json.actions ?? []).length) void reload();
          if (canSpeak()) say(a);
          else setOrbState("idle");
        }
      } catch {
        setAnswer({ q: text, a: "No connection. Try again.", bad: true });
        setOrbState("idle");
      } finally {
        setBusy(false);
      }
    },
    [reload, say]
  );

  async function undo(action: Done) {
    try {
      const res = await fetch("/api/jarvis/undo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: action.id }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't undo that.");
      setAnswer((prev) => (prev ? { ...prev, actions: prev.actions?.map((x) => (x.id === action.id ? { ...x, undone: true } : x)) } : prev));
      void reload();
    } catch (e) {
      setAnswer((prev) => (prev ? { ...prev, a: (e as Error).message, bad: true } : prev));
    }
  }

  async function mic() {
    if (orbState === "listening") {
      stopListening.current?.();
      return;
    }
    stopSpeaking();
    wakeCtl.current?.pause();
    setOrbState("listening");
    setHeard("");
    try {
      const { done, stop } = listenOnce(setHeard);
      stopListening.current = stop;
      const text = await done;
      stopListening.current = null;
      if (text) await ask(text);
      else setOrbState("idle");
    } catch (e) {
      setOrbState("idle");
      setAnswer({ q: "", a: (e as Error).message === "mic-blocked" ? "The microphone is blocked for this site. Allow it in the browser's site settings." : "This browser can't listen. Type instead.", bad: true });
    } finally {
      wakeCtl.current?.resume();
    }
  }

  // "Hey Jarvis": the mic stays open while this page is, and only acts on sentences that start with his name.
  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current = ask;
  }, [ask]);
  useEffect(() => {
    if (!wake) return;
    const ctl = listenForWake({
      command: (text) => void askRef.current(text),
      armed: (on) => {
        setArmed(on);
        if (on) setOrbState("listening");
        else setOrbState((s) => (s === "listening" ? "idle" : s));
      },
      blocked: () => {
        setWake(false);
        setAnswer({ q: "", a: "The microphone is blocked for this site, so Hey Jarvis is off.", bad: true });
      },
    });
    wakeCtl.current = ctl;
    return () => {
      ctl.stop();
      wakeCtl.current = null;
    };
  }, [wake]);

  function toggleWake() {
    const next = !wake;
    setWake(next);
    try {
      localStorage.setItem(WAKE_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  // Ten-minute heads-up for timed events today.
  const announced = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!data) return;
    for (const l of data.today) {
      if (l.minutesAway === null || l.minutesAway > 10 || announced.current.has(l.id)) continue;
      announced.current.add(l.id);
      void localNotify(l.minutesAway <= 1 ? "Starting now" : `In ${l.minutesAway} min`, l.title, `event-${l.id}`, "/calendar");
    }
  }, [data]);

  // Proactive: when something new comes in while the page is open, say it once.
  const spoken = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (spoken.current === null) {
      // First load: don't read out old ones.
      spoken.current = new Set(nudges.map((n) => n.id));
      return;
    }
    const fresh = nudges.filter((n) => !spoken.current!.has(n.id));
    if (!fresh.length) return;
    fresh.forEach((n) => spoken.current!.add(n.id));
    if (touched.current && !busy) say(`Heads up. ${fresh[0].title}. ${fresh[0].body}`.slice(0, 320));
  }, [nudges, busy, say]);

  async function dismiss(n: Nudge) {
    setNudges((prev) => prev.filter((x) => x.id !== n.id));
    await fetch(`/api/jarvis/nudges/${n.id}/dismiss`, { method: "POST" }).catch(() => null);
  }

  const nextBackdrop = () => {
    const i = BACKDROPS.findIndex((b) => b.id === backdropId);
    choose(BACKDROPS[(i + 1) % BACKDROPS.length].id);
  };

  const orbLabel = orbState === "speaking" ? "Stop talking" : "Read me the briefing";
  const empty = data && data.today.length === 0 && data.ahead.length === 0;
  const waitingMac = mac?.online ? mac.sessions.filter((s) => s.state === "waiting") : [];
  const runningMac = mac?.online ? mac.sessions.filter((s) => s.state === "running") : [];
  const status =
    orbState === "listening" ? (armed ? "Yes?" : "Listening") : orbState === "thinking" ? "Thinking" : orbState === "speaking" ? "Speaking" : wake ? "Say Jarvis, then what you need" : voice.speak ? "Tap the orb to hear it" : "Jarvis";

  return (
    <div className="relative flex min-h-[100svh] flex-col">
      <Backdrop src={backdrop.src} kenBurns={isDesktop && !reduced} />

      <div className="relative z-10 mx-auto flex w-full max-w-[980px] flex-1 flex-col items-center px-4 pb-56 pt-4 md:px-8 md:pb-36 md:pt-6">
        <OrbCanvas state={orbState} level={level} onTap={tapOrb} label={orbLabel} />

        <div className="-mt-4 w-full text-center md:-mt-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-2">{status}</p>
          <h1 className="mt-2 text-[clamp(1.9rem,5vw,3.1rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-foreground">{data ? data.greeting : " "}</h1>
          <p className="mx-auto mt-3 max-w-[640px] text-[clamp(1rem,2.2vw,1.2rem)] leading-snug text-muted">
            {data ? data.headline : error ? "Can't reach the server. Retrying." : "Reading your day."}
          </p>
        </div>

        {(nudges.length > 0 || waitingMac.length > 0) && (
          <section className="jarvis-panel mt-8 w-full" aria-label="Heads up">
            <h2 className="mb-1 px-1">
              <span className="eyebrow eyebrow-accent">Heads up</span>
            </h2>
            <ul>
              {waitingMac.map((s) => (
                <li key={`mac-${s.name}`} className="jarvis-row">
                  <span className="w-[92px] shrink-0 font-mono text-[12px] text-accent">On your Mac</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-foreground">{s.name} is waiting on you</span>
                    {s.detail && <span className="block truncate text-[12px] text-muted-2">{s.detail}</span>}
                  </span>
                </li>
              ))}
              {nudges.map((n) => {
                const body = (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-foreground">{n.title}</span>
                    {n.body && <span className="line-clamp-2 block text-[12px] text-muted-2">{n.body}</span>}
                  </span>
                );
                const when = <span className="w-[92px] shrink-0 font-mono text-[12px] text-accent">{now ? ago(n.createdAt, now) : ""}</span>;
                return (
                  <li key={n.id} className="jarvis-row">
                    {n.url ? (
                      <a href={n.url} target={n.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                        {when}
                        {body}
                      </a>
                    ) : (
                      <span className="flex min-w-0 flex-1 items-center gap-3">
                        {when}
                        {body}
                      </span>
                    )}
                    <button onClick={() => dismiss(n)} aria-label={`Dismiss: ${n.title}`} className="shrink-0 px-2 py-1 text-[16px] leading-none text-muted-2 hover:text-foreground">
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {data && (
          <div className="mt-9 grid w-full gap-x-10 gap-y-8 md:grid-cols-2">
            <Panel title="Today" count={data.today.length}>
              {data.today.length ? (
                <ul>
                  {data.today.map((l) => (
                    <Row key={l.id} line={l} showDay={false} />
                  ))}
                </ul>
              ) : (
                <p className="px-1 py-3 text-[14px] text-muted-2">Nothing left today.</p>
              )}
            </Panel>

            <Panel title="Next 7 days" count={data.ahead.length}>
              {data.ahead.length ? (
                <ul>
                  {data.ahead.slice(0, 6).map((l) => (
                    <Row key={l.id} line={l} showDay />
                  ))}
                </ul>
              ) : (
                <p className="px-1 py-3 text-[14px] text-muted-2">
                  {empty ? (
                    <>
                      Nothing on the calendar.{" "}
                      <Link href="/calendar" className="text-accent hover:underline">
                        Add something
                      </Link>
                    </>
                  ) : (
                    "Nothing after today."
                  )}
                </p>
              )}
              {data.ahead.length > 6 && (
                <Link href="/calendar" className="mt-1 block px-1 text-[12px] text-muted-2 hover:text-foreground">
                  {data.ahead.length - 6} more on the calendar
                </Link>
              )}
            </Panel>

            {data.calls.length > 0 && (
              <Panel title="Calls, last 2 days" count={data.calls.length}>
                <ul>
                  {data.calls.map((c) => (
                    <li key={c.id}>
                      <a href={c.url} target="_blank" rel="noreferrer" className="jarvis-row">
                        <span className="w-[92px] shrink-0 font-mono text-[12px] text-muted">{c.when}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-foreground">{c.title}</span>
                          {c.person && <span className="block truncate text-[12px] text-muted-2">{c.person}</span>}
                        </span>
                        <span className="shrink-0 text-[12px] text-accent">Recording</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {data.waiting.length > 0 && (
              <Panel title="Waiting on" count={data.waiting.length}>
                <ul>
                  {data.waiting.slice(0, 5).map((w) => (
                    <li key={w.personId ?? w.person}>
                      <Link href={w.personId ? `/people/${w.personId}` : "/people"} className="jarvis-row">
                        <span className="w-[92px] shrink-0 font-mono text-[12px] text-muted">{w.days === 0 ? "today" : `${w.days}d`}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-foreground">{w.person}</span>
                          <span className="block truncate text-[12px] text-muted-2">{w.items.join(" · ")}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        )}

        <div className="mt-10 flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-1.5 font-mono text-[11px] text-muted-2">
          <PrayerLine onText={(t) => (prayer.current = t)} />
          <button onClick={reload} className="hover:text-foreground" title="Refresh now">
            <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${error ? "bg-danger" : "bg-ok"}`} />
            {error ? "offline" : updatedAt && now ? `live · checked ${ago(updatedAt, now)}` : "connecting"}
          </button>
          {data?.sources.map((s) => (
            <Link key={s.name} href="/settings" title={s.error ?? (s.lastSyncAt ? `Last pull ${ago(s.lastSyncAt)}` : "Not pulled yet")} className="hover:text-foreground">
              <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${s.ok ? "bg-ok" : "bg-danger"}`} />
              {SOURCE_LABEL[s.name] ?? s.name}
              {s.lastSyncAt && now ? ` ${ago(s.lastSyncAt, now)}` : ""}
            </Link>
          ))}
          {mac?.online && (
            <span title={mac.sessions.map((s) => `${s.name}: ${s.state}`).join("\n") || "No Claude Code sessions open"}>
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-ok" />
              mac · {runningMac.length} running{waitingMac.length ? ` · ${waitingMac.length} waiting` : ""}
            </span>
          )}
          <button onClick={nextBackdrop} className="hover:text-foreground" title="Change the background">
            bg: {backdrop.label.toLowerCase()}
          </button>
        </div>
      </div>

      {/* Ask bar: floats over the page, above the phone tab bar */}
      <div className="jarvis-ask pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 px-3 md:bottom-6 md:pl-[76px]">
        <div className="pointer-events-auto mx-auto w-full max-w-[640px]">
          {(answer || heard) && (
            <div className={`jarvis-answer mb-2 ${answer?.bad ? "jarvis-answer-bad" : ""}`} role="status" aria-live="polite">
              {heard && !answer ? (
                <p className="text-[14px] text-muted">{heard}</p>
              ) : (
                answer && (
                  <>
                    {answer.q && <p className="mb-1 truncate font-mono text-[11px] text-muted-2">{answer.q}</p>}
                    <p className="text-[15px] leading-snug text-foreground">{answer.a}</p>
                    {!!answer.actions?.length && (
                      <ul className="mt-2 space-y-1 border-t border-border pt-2">
                        {answer.actions.map((x) => (
                          <li key={x.id} className="flex items-center justify-between gap-3 text-[13px]">
                            <span className={`min-w-0 truncate ${x.undone ? "text-muted-2 line-through" : "text-muted"}`}>{x.summary}</span>
                            {x.undone ? (
                              <span className="shrink-0 font-mono text-[11px] text-muted-2">undone</span>
                            ) : (
                              <button onClick={() => undo(x)} className="shrink-0 font-semibold text-accent hover:underline">
                                Undo
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!!answer.sources?.length && (
                      <p className="mt-2 truncate font-mono text-[11px] text-muted-2">
                        from:{" "}
                        {answer.sources.slice(0, 3).map((s, i) => (
                          <span key={i}>
                            {i > 0 && ", "}
                            {s.url ? (
                              <a href={s.url} target={s.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="hover:text-foreground hover:underline">
                                {s.title}
                              </a>
                            ) : (
                              s.title
                            )}
                          </span>
                        ))}
                      </p>
                    )}
                    <button onClick={() => setAnswer(null)} aria-label="Close answer" className="absolute right-2 top-1.5 px-2 py-1 text-[16px] leading-none text-muted-2 hover:text-foreground">
                      ×
                    </button>
                  </>
                )
              )}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void ask(question);
            }}
            className="command-bar flex h-14 items-center gap-1.5 pl-4 pr-2"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={busy}
              aria-label="Ask Jarvis"
              placeholder={busy ? "Thinking" : "Ask, or tell me what to do: add lunch with Ali fri 1pm"}
              className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-2"
            />
            {voice.listen && (
              <button
                type="button"
                onClick={toggleWake}
                aria-pressed={wake}
                title={wake ? "Hey Jarvis is on. The mic stays open on this page." : "Turn on Hey Jarvis (hands-free)"}
                className={`hidden h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10px] uppercase tracking-wider transition-colors sm:block ${wake ? "bg-accent-soft text-accent" : "text-muted-2 hover:bg-surface-hover hover:text-foreground"}`}
              >
                Hey Jarvis {wake ? "on" : "off"}
              </button>
            )}
            {voice.listen && (
              <button
                type="button"
                onClick={mic}
                aria-label={orbState === "listening" ? "Stop listening" : "Talk to Jarvis"}
                aria-pressed={orbState === "listening"}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${orbState === "listening" ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface-hover hover:text-foreground"}`}
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
                  <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
                  <path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
            <button type="submit" disabled={busy || !question.trim()} aria-label="Send" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition-opacity disabled:opacity-25">
              <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
                <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
