"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatPrayerLine, nextPrayer, spokenPrayerLine } from "@/lib/prayer";

type Coords = { lat: number; lng: number; at: number };

const KEY = "pos.coords";
const DENIED_KEY = "pos.coords.denied";
const DAY_MS = 24 * 60 * 60 * 1000;

function readCoords(): Coords | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<Coords>;
    if (typeof c.lat !== "number" || typeof c.lng !== "number") return null;
    return { lat: c.lat, lng: c.lng, at: typeof c.at === "number" ? c.at : 0 };
  } catch {
    return null;
  }
}

function saveCoords(c: Coords) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
    localStorage.removeItem(DENIED_KEY);
  } catch {
    /* storage blocked: the line still shows for this visit */
  }
}

function readDenied(): boolean {
  try {
    return localStorage.getItem(DENIED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveDenied() {
  try {
    localStorage.setItem(DENIED_KEY, "1");
  } catch {
    /* nothing to do */
  }
}

/** Next prayer and how long until it, worked out on this device. Asks for location only when tapped. */
export default function PrayerLine({ onText }: { onText?: (spoken: string | null) => void }) {
  // "loading" until mounted, so the server and first client render match.
  const [state, setState] = useState<"loading" | "off" | "asking" | "denied" | "on">("loading");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const locate = useCallback((silent: boolean) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      if (!silent) setState("denied");
      return;
    }
    if (!silent) setState("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() };
        saveCoords(c);
        setCoords(c);
        setState("on");
      },
      (err) => {
        if (silent) return;
        if (err.code === err.PERMISSION_DENIED) {
          saveDenied();
          setState("denied");
        } else {
          setState("off");
        }
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: DAY_MS },
    );
  }, []);

  // Read what is cached after mount. Never prompt here.
  useEffect(() => {
    const cached = readCoords();
    const denied = readDenied();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setCoords(cached);
    setState(cached ? "on" : denied ? "denied" : "off");
    if (cached && Date.now() - cached.at > DAY_MS && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((p) => {
          if (p.state === "granted") locate(true);
        })
        .catch(() => {});
    }
  }, [locate]);

  // Work out the line now and every 30 seconds.
  useEffect(() => {
    if (state !== "on" || !coords) {
      onTextRef.current?.(null);
      return;
    }
    const tick = () => {
      const now = new Date();
      const next = nextPrayer(coords.lat, coords.lng, now);
      setLine(formatPrayerLine(next, now));
      onTextRef.current?.(spokenPrayerLine(next, now));
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [state, coords]);

  if (state === "loading" || state === "denied") return null;
  if (state === "off" || state === "asking") {
    return (
      <button type="button" onClick={() => locate(false)} disabled={state === "asking"} className="font-mono text-[11px] text-muted-2 hover:text-foreground disabled:opacity-60">
        {state === "asking" ? "Finding your location..." : "Turn on prayer times"}
      </button>
    );
  }
  if (!line) return null;
  return <p className="font-mono text-[11px] text-muted-2">{line}</p>;
}
