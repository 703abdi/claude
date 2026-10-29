import type { Zone } from "@/lib/agents/town";

export const N = 13;

export type Pt = { c: number; r: number };

export type Dest = "tasks" | "calendar" | "people" | "metrics";

export type Cell =
  | { kind: "road" }
  | { kind: "park" }
  | { kind: "building"; floors: number; zone?: Zone; dest?: Dest };

export const DEST_LABEL: Record<Dest, string> = {
  tasks: "Task Tower",
  calendar: "Calendar Hall",
  people: "People Office",
  metrics: "Metrics Lab",
};

const DEST_CELLS: [number, number, Dest][] = [
  [5, 1, "calendar"],
  [9, 11, "people"],
  [11, 11, "tasks"],
  [11, 5, "metrics"],
];

export const ZONE_DOOR: Record<Zone, Pt> = {
  INBOX: { c: 0, r: 1 },
  WORKSHOP: { c: 12, r: 1 },
  DESK: { c: 0, r: 11 },
  PARK: { c: 4, r: 6 },
  AWAY: { c: 0, r: 0 },
};

const LANDMARKS: [number, number, Zone][] = [
  [1, 1, "INBOX"],
  [11, 1, "WORKSHOP"],
  [1, 11, "DESK"],
];

export function isRoad(c: number, r: number) {
  return c >= 0 && r >= 0 && c < N && r < N && (c % 4 === 0 || r % 4 === 0);
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildCity(): Cell[][] {
  const rand = mulberry32(42);
  const grid: Cell[][] = [];
  for (let c = 0; c < N; c++) {
    grid.push([]);
    for (let r = 0; r < N; r++) {
      if (isRoad(c, r)) grid[c][r] = { kind: "road" };
      else if (c >= 5 && c <= 7 && r >= 5 && r <= 7) grid[c][r] = { kind: "park" };
      else if (rand() < 0.12) grid[c][r] = { kind: "park" };
      else grid[c][r] = { kind: "building", floors: 1 + Math.floor(rand() * 4) };
    }
  }
  for (const [c, r, zone] of LANDMARKS) grid[c][r] = { kind: "building", floors: 5, zone };
  for (const [c, r, dest] of DEST_CELLS) grid[c][r] = { kind: "building", floors: 6, dest };
  return grid;
}

export function findPath(from: Pt, to: Pt): Pt[] {
  if (from.c === to.c && from.r === to.r) return [];
  const key = (p: Pt) => `${p.c},${p.r}`;
  const prev = new Map<string, Pt | null>([[key(from), null]]);
  const queue: Pt[] = [from];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.c === to.c && cur.r === to.r) break;
    for (const [dc, dr] of dirs) {
      const next = { c: cur.c + dc, r: cur.r + dr };
      if (!isRoad(next.c, next.r) || prev.has(key(next))) continue;
      prev.set(key(next), cur);
      queue.push(next);
    }
  }
  if (!prev.has(key(to))) return [];
  const path: Pt[] = [];
  let node: Pt | null | undefined = to;
  while (node && !(node.c === from.c && node.r === from.r)) {
    path.unshift(node);
    node = prev.get(key(node));
  }
  return path;
}

export function roadNeighbors(p: Pt): Pt[] {
  return [
    { c: p.c + 1, r: p.r },
    { c: p.c - 1, r: p.r },
    { c: p.c, r: p.r + 1 },
    { c: p.c, r: p.r - 1 },
  ].filter((q) => isRoad(q.c, q.r));
}
