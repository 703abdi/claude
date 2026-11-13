"use client";

import { motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, type ReactNode } from "react";

const SHOWN = { opacity: 1, y: 0, filter: "blur(0px)" };

/** Blur-in on reveal. Runs at once when the element is already on screen at
 * mount (first fold), otherwise when it scrolls into view. */
export default function Reveal({ children, delay = 0, className, id }: { children: ReactNode; delay?: number; className?: string; id?: string }) {
  const reduced = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();

  useEffect(() => {
    const el = scope.current;
    if (!el || reduced) return;
    const run = () => animate(el, SHOWN, { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] });
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) {
      run();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          run();
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [animate, delay, reduced, scope]);

  return (
    <motion.div ref={scope} id={id} className={className} initial={reduced ? false : { opacity: 0, y: 20, filter: "blur(6px)" }}>
      {children}
    </motion.div>
  );
}
