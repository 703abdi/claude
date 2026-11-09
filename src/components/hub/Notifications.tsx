"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { InboxItem } from "@/lib/hub-types";
import { badgeTitle, unreadItems } from "@/lib/notify-logic";
import { currentSubscription, disablePush, enablePush, isIos, isStandalone, permissionState, pushSupported, setAppBadge } from "@/lib/push-client";
import Popup from "./Popup";
import { Chip, agentColor, ago, useNow } from "./hub-ui";

const SEEN_KEY = "pos.notif.seen";

const SEEN_EVENT = "pos:notif-seen";

function readSeen() {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function subscribeSeen(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(SEEN_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(SEEN_EVENT, cb);
  };
}
function writeSeen(t: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(t));
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

type PushState = "off" | "on" | "blocked" | "unsupported" | "install" | "busy";

/** The bell on the home screen: unread count, the feed items behind it, and the switch
 * that turns phone notifications on for this device. */
export default function Notifications({ inbox, onResolve }: { inbox: InboxItem[]; onResolve: (item: InboxItem, action: "task" | "dismiss") => void }) {
  const [open, setOpen] = useState(false);
  // Last time the tray was opened (shared across tabs). While the tray is open the
  // markers stay where they were, so Abdi can see what was new.
  const seenAt = useSyncExternalStore(subscribeSeen, readSeen, () => 0);
  const [frozenSeen, setFrozenSeen] = useState<number | null>(null);
  const markerSeen = frozenSeen ?? seenAt;
  const [push, setPush] = useState<PushState>("off");
  const [note, setNote] = useState<string | null>(null);
  const now = useNow(30_000) ?? undefined;
  const baseTitle = useRef<string>("");

  useEffect(() => {
    baseTitle.current = document.title.replace(/^\(\d+\)\s*/, "");
  }, []);

  const refreshPushState = useCallback(async () => {
    if (!pushSupported()) {
      setPush(isIos() && !isStandalone() ? "install" : "unsupported");
      return;
    }
    const perm = permissionState();
    if (perm === "denied") return setPush("blocked");
    const sub = await currentSubscription();
    setPush(sub && perm === "granted" ? "on" : "off");
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void refreshPushState(), 0);
    return () => clearTimeout(t);
  }, [refreshPushState]);

  const unread = unreadItems(inbox, seenAt);

  // Tab title and the icon badge follow the unread count.
  useEffect(() => {
    if (!baseTitle.current) return;
    document.title = badgeTitle(baseTitle.current, unread.length);
    setAppBadge(unread.length);
  }, [unread.length]);

  function openTray() {
    setFrozenSeen(seenAt);
    setOpen(true);
    writeSeen(Date.now());
  }
  function closeTray() {
    setOpen(false);
    setFrozenSeen(null);
    setNote(null);
  }

  async function toggle() {
    if (push === "on") {
      setPush("busy");
      await disablePush();
      setNote("Off for this device.");
      await refreshPushState();
      return;
    }
    if (push === "install") {
      setNote("On iPhone: tap Share, then Add to Home Screen. Open it from there and flip this on.");
      return;
    }
    setPush("busy");
    const r = await enablePush();
    if (r === "granted") setNote("On. You get the morning brief, new tasks from calls, agent questions and the evening numbers.");
    else if (r === "denied") setNote("Blocked. Allow notifications for this site in the browser settings, then try again.");
    else setNote("Could not turn it on. Try again in a minute.");
    await refreshPushState();
  }

  async function sendTest() {
    setNote("Sending…");
    const res = await fetch("/api/push/test", { method: "POST" }).then((r) => r.json()).catch(() => null);
    setNote(res?.sent ? `Sent to ${res.sent} device${res.sent === 1 ? "" : "s"}.` : "Nothing sent. Is this device on?");
  }

  const items = inbox.slice(0, 20);
  const count = unreadItems(inbox, markerSeen).length;

  return (
    <>
      <button onClick={openTray} aria-label={count ? `${count} new notifications` : "Notifications"} className="bell" title="Notifications">
        <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden>
          <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <AnimatePresence>
          {count > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 26 }}
              className="bell-badge"
            >
              {count > 9 ? "9+" : count}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <Popup open={open} onClose={closeTray} eyebrow="Notifications" title={count ? `${count} new` : "You are caught up"}>
        <div className="mb-4 rounded-2xl border border-border bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold">Notify this device</p>
              <p className="text-[12px] text-muted">
                {push === "on" && "On. Morning brief, new call tasks, agent questions, evening numbers."}
                {push === "off" && "Off. Turn it on to get pushed when something changes."}
                {push === "blocked" && "Blocked in the browser. Allow notifications for this site first."}
                {push === "install" && "Add this to your Home Screen first, then open it from there."}
                {push === "unsupported" && "This browser cannot do push."}
                {push === "busy" && "One second…"}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={push === "on"}
              disabled={push === "busy" || push === "unsupported"}
              onClick={toggle}
              className={`switch ${push === "on" ? "switch-on" : ""}`}
            >
              <span className="switch-knob" />
            </button>
          </div>
          {(note || push === "on") && (
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="min-w-0 text-[12px] text-muted-2">{note}</p>
              {push === "on" && (
                <button onClick={sendTest} className="btn-ghost h-8 shrink-0 px-3 text-[12px]">
                  Send a test
                </button>
              )}
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Nothing yet. New tasks from calls, agent posts and the daily digests land here.</p>
        ) : (
          <ol className="space-y-2">
            {items.map((it) => {
              const isNew = !it.resolvedAt && new Date(it.createdAt).getTime() > markerSeen;
              const color = agentColor(it.agent);
              return (
                <li key={it.id} className={`rounded-2xl border px-3 py-2.5 ${isNew ? "border-accent/40 bg-accent-soft" : "border-border bg-surface"}`}>
                  <div className="flex items-center gap-2">
                    {isNew && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label="new" />}
                    <Chip color={color}>{it.agent}</Chip>
                    <span className="ml-auto font-mono text-[11px] text-muted-2">{ago(it.createdAt, now)}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold leading-snug">{it.title}</p>
                  {it.body && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{it.body}</p>}
                  <div className="mt-2 flex items-center gap-1.5">
                    {it.link && (
                      <a href={it.link} target="_blank" rel="noreferrer" className="btn-ghost h-8 px-3 text-[12px]">
                        Open
                      </a>
                    )}
                    {!it.resolvedAt && (
                      <button onClick={() => onResolve(it, "dismiss")} className="btn-ghost h-8 px-3 text-[12px] text-muted">
                        Got it
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Popup>
    </>
  );
}
