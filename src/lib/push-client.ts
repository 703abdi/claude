"use client";

/** Browser side of push: register the service worker, ask for permission, save the
 * subscription on the server. Everything here is safe to call where push is not
 * supported; the functions just answer false. */

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iPhone only delivers pushes to an app opened from the Home Screen. */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function permissionState(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

async function registration() {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

function base64ToUint8(b64: string) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Is this device subscribed right now? */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/** Turn notifications on for this device. Returns the permission result. */
export async function enablePush(): Promise<"granted" | "denied" | "default" | "unsupported" | "failed"> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  try {
    const reg = await registration();
    const { publicKey } = (await (await fetch("/api/push", { cache: "no-store" })).json()) as { publicKey: string };
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8(publicKey) as BufferSource }));
    const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
    return res.ok ? "granted" : "failed";
  } catch {
    return "failed";
  }
}

/** Turn notifications off for this device. */
export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => null);
  await sub.unsubscribe().catch(() => null);
}

/** A notification from the page itself (no server round trip), for example "call in 10 min"
 * while the app is open. Needs permission already granted. */
export async function localNotify(title: string, body: string, tag: string, url = "/hub") {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  try {
    const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await registration());
    await reg.showNotification(title, { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url } });
    return true;
  } catch {
    return false;
  }
}

/** The number on the app icon (home-screen app, or the Mac dock for installed apps). */
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) void nav.setAppBadge?.(count);
    else void nav.clearAppBadge?.();
  } catch {
    // not supported
  }
}
