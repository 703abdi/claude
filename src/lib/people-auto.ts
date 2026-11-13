import { prisma } from "@/lib/prisma";
import { matchPeople } from "@/lib/quick-add-parse";
import { getPolicy } from "@/lib/policy";

/** One rule for every source that meets people (Fathom, Calendly, Google): someone you already
 * track is matched by name; anyone else is only noted as a sighting. They become a Person on
 * the day their distinct sightings reach the policy's personAfterSeen (default 3), so a
 * one-off booking or a stranger on an invite never clutters People. */

export type PersonLite = { id: string; name: string };

export type Seen = {
  /** Cleaned display name, if the source had one. */
  name: string | null;
  email?: string | null;
  /** Stable id of the call/booking/invite, so re-syncs do not count twice. */
  ref: string;
  source: "fathom" | "calendly" | "google";
  /** Goes in Person.notes when they are created. */
  note: string;
};

/** "jane.doe@x.com" -> "Jane Doe". Null for noreply, numbers-only and the like. */
export function nameFromEmail(email: string | null | undefined): string | null {
  const local = email?.split("@")[0]?.trim();
  if (!local || /^(no-?reply|info|hello|support|team|admin|contact|sales|mail|notifications?|calendar)$/i.test(local)) return null;
  const words = local.split(/[._+-]+/).filter((w) => /^[a-z]{2,}$/i.test(w));
  if (!words.length) return null;
  return words.slice(0, 3).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export async function notePerson(seen: Seen, people: PersonLite[]): Promise<PersonLite | null> {
  const name = seen.name ?? nameFromEmail(seen.email);
  if (!name && !seen.email) return null;
  if (name) {
    const hit = matchPeople(name.toLowerCase(), people);
    if (hit) return hit;
  }
  const key = seen.email ? seen.email.toLowerCase().trim() : `name:${name!.toLowerCase()}`;
  const row = await prisma.contactSighting.findUnique({ where: { key } });
  if (row?.personId) {
    const p = people.find((x) => x.id === row.personId) ?? (await prisma.person.findUnique({ where: { id: row.personId }, select: { id: true, name: true } }));
    if (p) return p;
  }
  const refs = row ? (row.refs.includes(seen.ref) ? row.refs : [...row.refs, seen.ref].slice(-50)) : [seen.ref];
  const sources = row ? [...new Set([...row.sources, seen.source])] : [seen.source];
  const { policy } = await getPolicy();
  let personId: string | null = null;
  if (name && refs.length >= policy.personAfterSeen) {
    const created = await prisma.person
      .create({ data: { name, notes: [seen.email, seen.note, `Seen ${refs.length} times (${sources.join(", ")}).`].filter(Boolean).join("\n") } })
      .catch(() => null);
    if (created) {
      personId = created.id;
      people.push({ id: created.id, name: created.name });
    }
  }
  await prisma.contactSighting.upsert({
    where: { key },
    create: { key, name: name ?? null, email: seen.email ?? null, refs, sources, personId },
    update: { name: name ?? row?.name ?? null, email: seen.email ?? row?.email ?? null, refs, sources, lastSeen: new Date(), personId: personId ?? row?.personId ?? null },
  });
  return personId ? { id: personId, name: name! } : null;
}
