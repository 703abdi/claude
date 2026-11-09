"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMedia } from "./hub-ui";

/** One pop-up for the whole Hub: a bottom sheet on a phone, a centered card on a desktop.
 * Closes on the backdrop, the X, or Escape. Children render inside the padded body. */
export default function Popup({
  open,
  onClose,
  eyebrow,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const reduced = useReducedMotion();
  const desktop = useMedia("(min-width: 768px)");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  const sheet = !desktop;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="popup"
          className={`fixed inset-0 z-[200] flex ${sheet ? "items-end" : "items-center justify-center p-6"}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={reduced ? false : sheet ? { y: 40, opacity: 0 } : { scale: 0.96, opacity: 0, y: 8 }}
            animate={sheet ? { y: 0, opacity: 1 } : { scale: 1, opacity: 1, y: 0 }}
            exit={reduced ? undefined : sheet ? { y: 40, opacity: 0 } : { scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className={`popup relative w-full ${wide ? "md:max-w-[640px]" : "md:max-w-[520px]"} ${sheet ? "rounded-t-[28px]" : "rounded-[28px]"} max-h-[88svh] overflow-y-auto`}
          >
            {sheet && <span aria-hidden className="mx-auto mt-3 block h-1 w-10 rounded-full bg-border-2" />}
            <div className="flex items-start justify-between gap-3 px-5 pt-4 md:px-6 md:pt-5">
              <div className="min-w-0">
                {eyebrow && <p className="eyebrow eyebrow-accent mb-1">{eyebrow}</p>}
                <h2 className="text-[20px] font-extrabold leading-tight tracking-[-0.02em]">{title}</h2>
              </div>
              <button onClick={onClose} aria-label="Close" className="btn-ghost h-9 w-9 shrink-0 text-muted">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="px-5 pb-6 pt-4 md:px-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
