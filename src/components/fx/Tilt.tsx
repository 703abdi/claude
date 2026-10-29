"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { PointerEvent, ReactNode } from "react";

export default function Tilt({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(y, [0, 1], [8, -8]), { stiffness: 200, damping: 18 });
  const rotateY = useSpring(useTransform(x, [0, 1], [-10, 10]), { stiffness: 200, damping: 18 });
  const glare = useTransform(
    [x, y],
    ([gx, gy]) => `radial-gradient(240px circle at ${Number(gx) * 100}% ${Number(gy) * 100}%, rgba(255,255,255,0.14), transparent 60%)`
  );

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - r.left) / r.width);
    y.set((e.clientY - r.top) / r.height);
  }
  function onLeave() {
    x.set(0.5);
    y.set(0.5);
  }

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={`relative ${className ?? ""}`}
      style={{ rotateX, rotateY, transformPerspective: 700 }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      whileHover={{ scale: 1.03 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
    >
      {children}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 hover-glare"
        style={{ background: glare }}
      />
    </motion.div>
  );
}
