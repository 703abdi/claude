import * as webpush from "web-push";
import { prisma } from "@/lib/prisma";

/** Web Push to every device that turned notifications on in the Hub. The VAPID pair is
 * made once and kept in the database, so there is nothing to configure. Sending never
 * throws: a dead subscription (404/410) is removed, other failures are counted. */

const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:703abdi@gmail.com";

export type PushMessage = {
  title: string;
  body?: string;
  /** Path or URL the notification opens. Defaults to /hub. */
  url?: string;
  /** Same tag replaces the previous notification instead of stacking. */
  tag?: string;
};

export async function getVapid() {
  const existing = await prisma.pushConfig.findUnique({ where: { id: "vapid" } });
  if (existing) return existing;
  const keys = webpush.generateVAPIDKeys();
  return prisma.pushConfig.upsert({
    where: { id: "vapid" },
    create: { id: "vapid", publicKey: keys.publicKey, privateKey: keys.privateKey },
    update: {},
  });
}

export async function saveSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string | null) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent },
    update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent, failures: 0 },
  });
}

export async function removeSubscription(endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

export async function sendPush(msg: PushMessage): Promise<{ sent: number; removed: number; failed: number }> {
  const subs = await prisma.pushSubscription.findMany().catch(() => []);
  if (subs.length === 0) return { sent: 0, removed: 0, failed: 0 };
  const vapid = await getVapid();
  webpush.setVapidDetails(SUBJECT, vapid.publicKey, vapid.privateKey);
  const payload = JSON.stringify({ title: msg.title, body: msg.body ?? "", url: msg.url ?? "/hub", tag: msg.tag ?? undefined });

  let sent = 0;
  let removed = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12 });
        sent++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSentAt: new Date(), failures: 0 } }).catch(() => null);
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          removed++;
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => null);
        } else {
          failed++;
          await prisma.pushSubscription.update({ where: { id: s.id }, data: { failures: { increment: 1 } } }).catch(() => null);
        }
      }
    })
  );
  return { sent, removed, failed };
}

/** Fire-and-forget version for write paths: never slows or fails the action. */
export function pushLater(msg: PushMessage) {
  void sendPush(msg).catch(() => null);
}
