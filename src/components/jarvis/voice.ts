"use client";

/** Browser voice: speechSynthesis to talk, SpeechRecognition to listen. Free, no key.
 * Chrome and Safari have both; Firefox has no recognition, so the mic hides there. */

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function recCtor(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canListen() {
  return recCtor() !== null;
}
export function canSpeak() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** A calm British voice when the device has one (Daniel on Apple devices), else the default. */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const prefer = [/^Daniel/i, /Google UK English Male/i, /^Arthur/i, /en-GB/i, /en-US/i];
  for (const re of prefer) {
    const v = voices.find((x) => re.test(x.name) || re.test(x.lang));
    if (v) return v;
  }
  return voices[0] ?? null;
}

export function speak(text: string, on: { start?: () => void; end?: () => void; word?: () => void } = {}) {
  if (!canSpeak()) {
    on.end?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  }
  u.rate = 1.02;
  u.pitch = 0.95;
  u.onstart = () => on.start?.();
  u.onboundary = () => on.word?.();
  u.onend = () => on.end?.();
  u.onerror = () => on.end?.();
  synth.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** One utterance. Resolves with what was heard ("" if nothing). */
export function listenOnce(onPartial: (text: string) => void): { done: Promise<string>; stop: () => void } {
  const Ctor = recCtor();
  if (!Ctor) return { done: Promise.reject(new Error("unsupported")), stop: () => {} };
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = "";
  let last = "";
  const done = new Promise<string>((resolve, reject) => {
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText = text;
      }
      last = text;
      onPartial(text);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") reject(new Error("mic-blocked"));
    };
    rec.onend = () => resolve((finalText || last).trim());
  });
  rec.start();
  return { done, stop: () => rec.stop() };
}

const WAKE = /\b(?:hey |ok |okay |yo )?jarvis\b[\s,.!?]*(.*)$/i;

/** Pulls the command out of a heard sentence: "hey Jarvis, what's next" -> "what's next".
 * Returns "" when only the name was said, null when the name was not said at all. Pure. */
export function wakeCommand(heard: string): string | null {
  const m = heard.trim().match(WAKE);
  if (!m) return null;
  return m[1].trim().replace(/[.?!]+$/, "");
}

/** Hands-free: keeps the mic open and calls onCommand for a sentence that starts with "Jarvis".
 * Saying only "Jarvis" arms it, and the next sentence is the command. The browser stops
 * recognition every so often, so it restarts itself until stop() is called. */
export function listenForWake(on: { command: (text: string) => void; armed?: (armed: boolean) => void; blocked?: () => void }): { stop: () => void; pause: () => void; resume: () => void } {
  const Ctor = recCtor();
  if (!Ctor) return { stop: () => {}, pause: () => {}, resume: () => {} };
  let stopped = false;
  let paused = false;
  let armedUntil = 0;
  let rec: Rec | null = null;

  const start = () => {
    if (stopped || paused) return;
    rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      if (!last?.isFinal) return;
      const heard = last[0].transcript.trim();
      if (!heard) return;
      const cmd = wakeCommand(heard);
      if (cmd === null) {
        if (Date.now() < armedUntil) {
          armedUntil = 0;
          on.armed?.(false);
          on.command(heard);
        }
        return;
      }
      if (cmd) {
        armedUntil = 0;
        on.armed?.(false);
        on.command(cmd);
      } else {
        armedUntil = Date.now() + 8000;
        on.armed?.(true);
        setTimeout(() => Date.now() >= armedUntil && on.armed?.(false), 8100);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stopped = true;
        on.blocked?.();
      }
    };
    rec.onend = () => {
      rec = null;
      if (!stopped && !paused) setTimeout(start, 400);
    };
    try {
      rec.start();
    } catch {
      setTimeout(start, 1000);
    }
  };
  start();

  return {
    stop: () => {
      stopped = true;
      rec?.abort();
    },
    // Paused while Jarvis is talking, so he does not hear himself.
    pause: () => {
      paused = true;
      rec?.abort();
    },
    resume: () => {
      if (stopped || !paused) return;
      paused = false;
      setTimeout(start, 300);
    },
  };
}
