"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { useSyncExternalStore } from "react";

export type BackdropId = "madinah" | "dc" | "none";
export const BACKDROPS: { id: BackdropId; label: string; src: string | null }[] = [
  { id: "madinah", label: "Madinah night", src: "/backgrounds/madinah-night.jpg" },
  { id: "dc", label: "DC dusk", src: "/backgrounds/dc-dusk.jpg" },
  { id: "none", label: "None", src: null },
];
const BACKDROP_KEY = "pos.backdrop";
const BACKDROP_EVENT = "pos:backdrop";

function readBackdrop(): BackdropId {
  try {
    const v = localStorage.getItem(BACKDROP_KEY);
    if (v === "madinah" || v === "dc" || v === "none") return v;
  } catch {
    // private mode etc.
  }
  return "madinah";
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(BACKDROP_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(BACKDROP_EVENT, cb);
  };
}

export function useBackdrop() {
  const id = useSyncExternalStore(subscribe, readBackdrop, () => "madinah" as BackdropId);
  function choose(next: BackdropId) {
    try {
      localStorage.setItem(BACKDROP_KEY, next);
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(BACKDROP_EVENT));
  }
  return { id, choose, backdrop: BACKDROPS.find((b) => b.id === id) ?? BACKDROPS[0] };
}

export default function Backdrop({ src, kenBurns }: { src: string | null; kenBurns: boolean }) {
  return (
    <div className="home-bg" aria-hidden>
      <AnimatePresence initial={false}>
        {src && (
          <motion.div
            key={src}
            className={`absolute inset-0 ${kenBurns ? "ken-burns" : ""}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <Image src={src} alt="" fill priority sizes="100vw" quality={80} style={{ objectFit: "cover", objectPosition: "center 40%" }} />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="home-bg-overlay" />
    </div>
  );
}
