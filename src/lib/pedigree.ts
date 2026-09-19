/** Layout for the tree explorer.
 *
 *  A pedigree is not a clean tree in a real family: two lines can marry
 *  each other twice, so the same person can legitimately
 *  appear at two places in one chart. The layout allows that (each
 *  placement gets its own key) and only guards against a person being
 *  their own ancestor, which would be a data error rather than a
 *  marriage. */

import { relationsOf } from "@/lib/data";

export const NODE_W = 176;
export const NODE_H = 42;
export const COL = 244;
export const ROW = 56;

/** The upward chart's two pitches. Sideways, a generation costs a wide
 *  column and a sibling costs a short row; upward the two swap, so the
 *  sibling pitch has to clear a whole node's width and the generation
 *  pitch only has to clear its height plus room for the elbow. */
export const COL_UP = 196;
export const ROW_UP = 112;

export type Direction = "ancestors" | "descendants";

/** Which way the generations run. Sideways is the genealogist's chart and
 *  stays the default; upward is the one people draw on paper, ancestors
 *  climbing above the person you started from (Ethan's ask, 2026-08-21). */
export type Orientation = "sideways" | "up";

export interface LayoutNode {
  key: string;
  id: string;
  gen: number;
  x: number;
  y: number;
  parentKey: string | null;
  /** Has further kin the depth limit cut off. */
  truncated: boolean;
}

export interface Layout {
  nodes: LayoutNode[];
  links: { from: LayoutNode; to: LayoutNode }[];
  width: number;
  height: number;
}

interface Raw {
  key: string;
  id: string;
  gen: number;
  parentKey: string | null;
  kids: Raw[];
  truncated: boolean;
}

function kinOf(id: string, dir: Direction): string[] {
  const rel = relationsOf(id);
  return dir === "ancestors" ? rel.parents : rel.children;
}

export function buildLayout(
  rootId: string,
  dir: Direction,
  maxGen: number,
  orient: Orientation = "sideways",
): Layout {
  let counter = 0;

  function build(id: string, gen: number, parentKey: string | null, path: Set<string>): Raw {
    const node: Raw = {
      key: `n${counter++}`,
      id,
      gen,
      parentKey,
      kids: [],
      truncated: false,
    };
    const kin = kinOf(id, dir);
    if (!kin.length) return node;
    if (gen >= maxGen || path.has(id)) {
      node.truncated = true;
      return node;
    }
    const nextPath = new Set(path).add(id);
    node.kids = kin.map((k) => build(k, gen + 1, node.key, nextPath));
    return node;
  }

  const root = build(rootId, 0, null, new Set());

  // Placement happens on two abstract axes and is projected onto x/y at
  // the end, because the packing rule — a leaf takes the next slot, a
  // parent centres on the slots its kin occupy — is the same rule whether
  // the generations run rightward or upward. Only the pitches differ.
  const genPitch = orient === "sideways" ? COL : ROW_UP;
  const crossPitch = orient === "sideways" ? ROW : COL_UP;

  let slot = 0;
  const placed: { raw: Raw; cross: number }[] = [];

  function place(raw: Raw): number {
    let cross: number;
    if (raw.kids.length === 0) {
      cross = slot * crossPitch;
      slot += 1;
    } else {
      const cs = raw.kids.map(place);
      cross = (Math.min(...cs) + Math.max(...cs)) / 2;
    }
    placed.push({ raw, cross });
    return cross;
  }

  place(root);

  // Upward, ancestors climb: generation 0 sits at the bottom and the
  // deepest generation at the top. Descendants keep falling downward,
  // which is the same gesture read the other way.
  const deepest = Math.max(...placed.map((p) => p.raw.gen));
  const nodes: LayoutNode[] = placed.map(({ raw, cross }) => {
    const rank = orient === "up" && dir === "ancestors" ? deepest - raw.gen : raw.gen;
    const along = rank * genPitch;
    return {
      key: raw.key,
      id: raw.id,
      gen: raw.gen,
      x: orient === "sideways" ? along : cross,
      y: orient === "sideways" ? cross : along,
      parentKey: raw.parentKey,
      truncated: raw.truncated,
    };
  });
  const byKey = new Map(nodes.map((n) => [n.key, n]));

  const links = nodes
    .filter((n) => n.parentKey)
    .map((n) => ({ from: byKey.get(n.parentKey!)!, to: n }));

  const maxX = Math.max(...nodes.map((n) => n.x)) + NODE_W;
  const maxY = Math.max(...nodes.map((n) => n.y)) + NODE_H;

  return { nodes, links, width: maxX, height: maxY };
}

/** An elbow with a rounded-off middle. Beziers between generation
 *  columns read as flow; a pedigree wants to read as structure.
 *
 *  Upward the elbow turns the other way, and it leaves from whichever
 *  edge faces the other node: an ancestor chart draws upward out of the
 *  top of a card, a descendant chart downward out of the bottom, and
 *  reading `from.y` rather than the direction keeps the two honest. */
export function linkPath(
  from: LayoutNode,
  to: LayoutNode,
  orient: Orientation = "sideways",
): string {
  if (orient === "sideways") {
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const mid = x1 + (x2 - x1) / 2;
    return `M${x1},${y1} H${mid} V${y2} H${x2}`;
  }
  const x1 = from.x + NODE_W / 2;
  const x2 = to.x + NODE_W / 2;
  const downward = to.y > from.y;
  const y1 = downward ? from.y + NODE_H : from.y;
  const y2 = downward ? to.y : to.y + NODE_H;
  const mid = y1 + (y2 - y1) / 2;
  return `M${x1},${y1} V${mid} H${x2} V${y2}`;
}
