"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

export default function CountUp({ value, suffix = "", duration = 1.1 }: { value: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.textContent = `${value}${suffix}`;
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = `${Math.round(v)}${suffix}`;
      },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, suffix, duration, reduced]);

  return <span ref={ref}>{`${value}${suffix}`}</span>;
}
