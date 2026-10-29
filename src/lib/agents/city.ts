import type { Zone } from "@/lib/agents/town";

export const N = 13;
export const TILE = 44;
export const FLOOR_H = 13;

export const W = N * TILE + 60;
export const H = (N * TILE) / 2 + 200;
const OX = W / 2;
const OY = 112;

export type Pt = { c: number; r: number };

export type Dest = "tasks" | "calendar" | "people" | "metrics";

export type Cell =
  | { kind: "road" }
  | { kind: "park" }
  | {
      kind: "building";
      floors: number;
      palette: number;
      label?: string;
      zone?: Zone;
      dest?: Dest;
      tint?: { top: string; left: string; right: string };
    };

export const DEST_LABEL: Record<Dest, string> = {
  tasks: "Task Tower",
  calendar: "Calendar Hall",
  people: "People Office",
  metrics: "Metrics Lab",
};

export const DEST_DOOR: Record<Dest, Pt> = {
  calendar: { c: 4, r: 1 },
  people: { c: 8, r: 11 },
  tasks: { c: 12, r: 11 },
  metrics: { c: 12, r: 5 },
};

const DEST_CELLS: [number, number, Dest][] = [
  [5, 1, "calendar"],
  [9, 11, "people"],
  [11, 11, "tasks"],
  [11, 5, "metrics"],
];

const DEST_PALETTE = { top: "#bfe9e1", left: "#8fcfc2", right: "#73b5a8" };

export const ZONE_DOOR: Record<Zone, Pt> = {
  INBOX: { c: 0, r: 1 },
  WORKSHOP: { c: 12, r: 1 },
  DESK: { c: 0, r: 11 },
  PARK: { c: 4, r: 6 },
  AWAY: { c: 0, r: 0 },
};

const LANDMARKS: [number, number, Zone, string][] = [
  [1, 1, "INBOX", "Depot"],
  [11, 1, "WORKSHOP", "Workshop"],
  [1, 11, "DESK", "Front desk"],
];

export const PALETTES = [
  { top: "#ebe8e1", left: "#cfcbc0", right: "#b4afa2" },
  { top: "#dccdb0", left: "#bca98b", right: "#a18d72" },
  { top: "#c2d0df", left: "#98a9bd", right: "#7f8fa4" },
  { top: "#d9a690", left: "#b98470", right: "#9d6c59" },
];
export const LANDMARK_PALETTE = { top: "#cbbff9", left: "#a596e8", right: "#8b7dd6" };

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
      else grid[c][r] = { kind: "building", floors: 1 + Math.floor(rand() * 4), palette: Math.floor(rand() * 4) };
    }
  }
  for (const [c, r, zone, label] of LANDMARKS) {
    grid[c][r] = { kind: "building", floors: 5 + Math.floor(rand() * 2), palette: 4, label, zone };
  }
  for (const [c, r, dest] of DEST_CELLS) {
    grid[c][r] = { kind: "building", floors: 6, palette: 2, label: DEST_LABEL[dest], dest, tint: DEST_PALETTE };
  }
  return grid;
}

export function project(c: number, r: number, lift = 0) {
  return { x: OX + (c - r) * (TILE / 2), y: OY + ((c + r) * TILE) / 4 - lift };
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
