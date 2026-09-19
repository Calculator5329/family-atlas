/** Kinship: what any person in the tree is to the viewer.
 *
 *  Ethan's ask, 2026-08-16: as the story moves through four centuries the
 *  names blur, and "your 9th great-grandfather, on Great-Grandpa Nelson's
 *  side" is the sentence that snaps a stranger from 1632 back into the
 *  family. Two parts to that sentence and both live here: the relationship
 *  term, and the closest within-three-generations ancestor the path runs
 *  through.
 *
 *  The anchor defaults to the tree's root person and can be re-pointed at
 *  anyone, so a cousin opening the app on a laptop at Thanksgiving can
 *  measure the whole tree from themselves. The choice persists per
 *  browser, like the family/research mode switch. */

import { useSyncExternalStore } from "react";
import { getPerson, lineageLabel, relationsOf, tree } from "@/lib/data";
import type { Person } from "@/types";

// ---- anchor ------------------------------------------------------------

const KEY = "family-atlas:anchor";
const listeners = new Set<() => void>();

export const DEFAULT_ANCHOR = tree.meta.rootPerson;

export function getAnchor(): string {
  const stored = localStorage.getItem(KEY);
  return stored && getPerson(stored) ? stored : DEFAULT_ANCHOR;
}

export function setAnchor(id: string | null) {
  if (id && id !== DEFAULT_ANCHOR) localStorage.setItem(KEY, id);
  else localStorage.removeItem(KEY);
  listeners.forEach((fn) => fn());
}

export function useAnchor(): string {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getAnchor,
    () => DEFAULT_ANCHOR,
  );
}

// ---- ancestor walk -----------------------------------------------------

interface AncEntry {
  gen: number;
  /** The person one generation down on the (first found, hence shortest)
   *  path back to the walk's origin. Following `child` repeatedly walks
   *  home. */
  child: string | null;
}

const walkCache = new Map<string, Map<string, AncEntry>>();

/** Every ancestor of `id` with its generation distance, breadth first, so
 *  the recorded path per ancestor is a shortest one. The tree marries back
 *  into itself twice, so an ancestor can be reachable at two depths; the
 *  shallower wins, which is also the sentence a person would say. */
function ancestorsWalk(id: string): Map<string, AncEntry> {
  const hit = walkCache.get(id);
  if (hit) return hit;
  const out = new Map<string, AncEntry>([[id, { gen: 0, child: null }]]);
  let frontier = [id];
  let gen = 0;
  while (frontier.length) {
    gen += 1;
    const next: string[] = [];
    for (const pid of frontier) {
      for (const parent of relationsOf(pid).parents) {
        if (!out.has(parent)) {
          out.set(parent, { gen, child: pid });
          next.push(parent);
        }
      }
    }
    frontier = next;
  }
  walkCache.set(id, out);
  return out;
}

/** The chain from `from` up to `ancestor`, inclusive, using the shortest
 *  recorded path: [from, parent, grandparent, ..., ancestor]. */
function chainUp(from: string, ancestor: string): string[] {
  const walk = ancestorsWalk(from);
  if (!walk.has(ancestor)) return [];
  // Rebuild by walking child pointers from the ancestor back down.
  const chain: string[] = [];
  let cur: string | null = ancestor;
  while (cur) {
    chain.unshift(cur);
    cur = walk.get(cur)!.child;
  }
  return chain;
}

// ---- terms -------------------------------------------------------------

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];
const ord = (n: number) => ORDINALS[n] ?? `${n}th`;

function sexed(p: Person | undefined, male: string, female: string, neutral: string): string {
  if (p?.sex === "M") return male;
  if (p?.sex === "F") return female;
  return neutral;
}

/** "father", "grandmother", "7th great-grandfather" for a direct ancestor
 *  `gen` generations up. */
export function ancestorTerm(gen: number, p?: Person): string {
  const base = sexed(p, "father", "mother", "parent");
  if (gen === 1) return base;
  if (gen === 2) return `grand${base}`;
  if (gen === 3) return `great-grand${base}`;
  return `${ord(gen - 2)} great-grand${base}`;
}

function descendantTerm(gen: number, p?: Person): string {
  const base = sexed(p, "son", "daughter", "child");
  if (gen === 1) return base;
  if (gen === 2) return `grand${base}`;
  if (gen === 3) return `great-grand${base}`;
  return `${ord(gen - 2)} great-grand${base}`;
}

/** The short label for the close ancestor a path runs through:
 *  "Dad", "Grandma", "Great-Grandpa". Capitalised because it stands in
 *  for a name's honorific. */
export function closeTerm(gen: number, p?: Person): string {
  const base = sexed(p, "Grandpa", "Grandma", "Grandparent");
  if (gen === 1) return sexed(p, "Dad", "Mom", "Parent");
  if (gen === 2) return base;
  return `Great-${base}`;
}

// ---- the relation ------------------------------------------------------

export interface Relation {
  /** Lowercase phrase to hang after a name: "your 9th great-grandfather". */
  term: string;
  /** The ancestor of the anchor, at most 3 generations up, that the path
   *  to this person runs through. Null when the person IS within three
   *  generations, or when no blood path exists. */
  via: { id: string; term: string } | null;
  /** True when the relation is by marriage, not blood. */
  byMarriage?: boolean;
  /** Generational steps between anchor and target; lower is closer.
   *  Lets a surface with several people pick the nearest to speak about. */
  dist: number;
}

/** Surnames in a GEDCOM are recorded two ways at once. Some women carry
 *  their maiden name only, some carry both with the married one last, and
 *  some carry only the married one. Nothing marks which is which, so the
 *  two questions a label can ask get two different answers. */
const tokens = (s: string | undefined) => (s ?? "").trim().split(/\s+/).filter(Boolean);

/** The name a person went by, which is the last surname on the record:
 *  "Grandma Smith", not "Grandma Jones Smith". */
function usedSurname(id: string): string {
  const t = tokens(getPerson(id)?.name.surname);
  return t[t.length - 1] ?? "";
}

/** The surname the line *above* a person carries, which is the father's.
 *  Asking the person is wrong half the time: a woman recorded under her
 *  married name belongs to her father's line, not her husband's. */
function lineSurname(id: string): string {
  const p = getPerson(id);
  const mine = tokens(p?.name.surname)[0] ?? "";
  const father = relationsOf(id)
    .parents.map((x) => getPerson(x))
    .find((x) => x?.sex === "M");
  const dad = tokens(father?.name.surname).pop() ?? "";
  if (!dad) return mine || p?.name.given || "?";
  // Spelling drifts one generation at a time (a father written Wardrep
  // has a daughter written Wardrip) and the family says the spelling it
  // last saw.
  if (mine && mine.slice(0, 4).toLowerCase() === dad.slice(0, 4).toLowerCase()) return mine;
  return dad;
}

/** How the family actually says a branch: "Grandma Willis", "Grandpa
 *  Stone" (Ethan's wording, 2026-08-16). Sexed term plus the surname they
 *  went by. An ancestor with no surname on record borrows his line's. */
export function familiarName(id: string, anchor: string = getAnchor()): string {
  const p = getPerson(id);
  const gen = ancestorsWalk(anchor).get(id)?.gen ?? 3;
  const name = usedSurname(id) || lineSurname(id) || p?.name.given || "?";
  return `${closeTerm(Math.min(gen, 3), p)} ${name}`;
}

/** "through Grandma Stone", or null when the person is already close or
 *  unconnected. The one-phrase form every story and chip carries. */
export function throughLabel(target: string, anchor: string = getAnchor()): string | null {
  const rel = relationTo(target, anchor);
  if (!rel?.via) return null;
  return `through ${familiarName(rel.via.id, anchor)}`;
}

/** The full chain of people from the anchor to the target: up the
 *  anchor's line, and down the other side when the target is a cousin
 *  rather than an ancestor. Empty when the tree cannot connect them.
 *  This is the thread the tree explorer draws. */
export function threadTo(target: string, anchor: string = getAnchor()): string[] {
  const up = ancestorsWalk(anchor);
  if (up.has(target)) return chainUp(anchor, target);
  const down = ancestorsWalk(target);
  if (down.has(anchor)) return chainUp(target, anchor).reverse();
  let best: { id: string; sum: number } | null = null;
  for (const [aid, a] of up) {
    const b = down.get(aid);
    if (b && (!best || a.gen + b.gen < best.sum)) best = { id: aid, sum: a.gen + b.gen };
  }
  if (!best) return [];
  const upChain = chainUp(anchor, best.id);
  const downChain = chainUp(target, best.id).reverse();
  return [...upChain, ...downChain.slice(1)];
}

/** How many generations of descendants the tree records below a person.
 *  The tree explorer uses this so "show in the tree" from a person page
 *  opens deep enough to hold every recorded descendant. */
export function descendantDepth(id: string): number {
  let max = 0;
  const seen = new Set([id]);
  let frontier = [id];
  let gen = 0;
  while (frontier.length) {
    gen += 1;
    const next: string[] = [];
    for (const pid of frontier) {
      for (const c of relationsOf(pid).children) {
        if (!seen.has(c)) {
          seen.add(c);
          next.push(c);
        }
      }
    }
    if (next.length) max = gen;
    frontier = next;
  }
  return max;
}

/** Of several people, the one nearest the anchor and how. A story names
 *  many people; the relation line speaks about the closest of them. */
export function nearestKin(
  ids: string[],
  anchor: string = getAnchor(),
): { id: string; rel: Relation } | null {
  let best: { id: string; rel: Relation } | null = null;
  for (const id of ids) {
    const rel = relationTo(id, anchor);
    if (rel && (!best || rel.dist < best.rel.dist)) best = { id, rel };
  }
  return best;
}

// ---- the eight branches ------------------------------------------------

/** A great-grandparent and everyone above them. Ethan's ask, 2026-08-16:
 *  the atlas should be coloured by great-grandparent, because that is the
 *  last generation he can name, and every dot on the map hangs off one of
 *  the eight of them.
 *
 *  Colours extend the four lineage hues with five more of the same muted
 *  family, distinct in hue rather than in brightness so they survive a
 *  dark basemap. */
const BRANCH_COLORS = [
  "#C08A3E",
  "#4E8FA8",
  "#7FA05A",
  "#A9636B",
  "#8A7CB6",
  "#4FA396",
  "#B5784A",
  "#6E86C0",
  "#9C8C5A",
];

export interface Branch {
  id: string;
  /** The great-grandparent's full name, for the one place with room. */
  name: string;
  /** The headline: "The Stone line". The surname the line above the
   *  great-grandparent carries, which is not always the surname on their
   *  own record. Ethan's ask, 2026-08-21: a legend that reads a
   *  great-grandmother's full name tells him nothing he cannot already
   *  see; "The Stone line, Mom's side, Great-Grandma Willis" is how the
   *  family says it. */
  label: string;
  /** "Great-Grandma Willis" — the person, as they are spoken about. */
  familiar: string;
  /** "Mom's side" / "Dad's side", from the parent the line runs through. */
  side: string;
  /** "Grandpa Smith" — the grandparent this branch hangs off, which is
   *  what separates the two halves of one grandparent's ancestry. */
  through: string;
  /** "Mom's side · Great-Grandma Willis". The legend's second line. */
  sub: string;
  /** The surnames the branch actually carries, commonest first. */
  surnames: string[];
  color: string;
  /** The great-grandparent and every ancestor above them. */
  members: Set<string>;
}

const branchCache = new Map<string, Branch[]>();

export function branches(anchor: string = getAnchor()): Branch[] {
  const hit = branchCache.get(anchor);
  if (hit) return hit;
  const walk = ancestorsWalk(anchor);
  const out: Branch[] = [];
  for (const [id, entry] of walk) {
    if (entry.gen !== 3) continue;
    // The tree marries back into itself: one woman is a great-grandmother
    // twice over, and she is one branch, not two.
    if (out.some((b) => b.id === id)) continue;

    const chain = chainUp(anchor, id); // [anchor, parent, grandparent, them]
    const parent = getPerson(chain[1]);
    const side = sexed(parent, "Dad's side", "Mom's side", "Their side");
    const familiar = familiarName(id, anchor);
    const members = new Set(ancestorsWalk(id).keys());

    // The maiden token, not the married one: what the branch is made of.
    const tally = new Map<string, number>();
    for (const m of members) {
      const s = tokens(getPerson(m)?.name.surname)[0];
      if (s) tally.set(s, (tally.get(s) ?? 0) + 1);
    }
    const surnames = [...tally.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .map(([s]) => s);

    out.push({
      id,
      name: getPerson(id)?.name.full ?? id,
      label: `The ${lineSurname(id)} line`,
      familiar,
      side,
      through: chain[2] ? familiarName(chain[2], anchor) : "",
      sub: `${side} · ${familiar}`,
      surnames,
      color: BRANCH_COLORS[out.length % BRANCH_COLORS.length],
      members,
    });
  }
  branchCache.set(anchor, out);
  return out;
}

/** Which branch a person sits in, or null for descendants, collaterals and
 *  people who married in. Pedigree collapse puts a few people in two
 *  branches; the first, which is the nearer paternal one, wins. */
export function branchOf(id: string, anchor: string = getAnchor()): Branch | null {
  return branches(anchor).find((b) => b.members.has(id)) ?? null;
}

/** The line a person is shown as belonging to, on their own page and in
 *  the tree.
 *
 *  `lineageLabel` answers from the four curated lineages in
 *  data/lineages.json, and those four are measured from four of the eight
 *  great-grandparents. Anyone whose only path to the anchor runs through
 *  the other four — the whole Wiersma side, for one — comes back with no
 *  lineage at all, and the label for that used to read "Married in or
 *  collateral". Cycles 078 to 080 made the problem loud: they added
 *  twenty-seven Groningen ancestors, every one of them a fifth to eighth
 *  great-grandparent, and every one of their pages called them collateral
 *  directly above a line reading "Your 5th great-grandfather".
 *
 *  So: the curated lineage first, because it is the colour key; the branch
 *  second, which covers all eight great-grandparents and is measured from
 *  whoever the viewer has anchored on; and "married in or collateral" only
 *  when neither knows the person, which is the case it was written for. */
export function lineLabel(id: string, p: Person | undefined, anchor: string = getAnchor()): string {
  if ((p?.lineages ?? []).length > 0) return lineageLabel(p);
  return branchOf(id, anchor)?.label ?? lineageLabel(p);
}

/** When nobody in a group is related by blood or by their own marriage,
 *  the tie usually still exists one marriage further down: a Rhineland
 *  couple reach the viewer only because their great-great-granddaughter
 *  married one of the viewer's ancestors. Ethan's ask, 2026-08-16, on four
 *  film stops that answered "who and how related?" with silence.
 *
 *  So: walk down from each person until a descendant IS related, and
 *  report that descendant as the bridge. Returns the shortest such route,
 *  or null when the tree really cannot connect anyone in the group. */
export interface KinBridge {
  /** The person in the group the route starts from. */
  id: string;
  /** Their descendant who is related to the anchor. */
  through: string;
  /** Generations from `id` down to `through`. */
  gen: number;
  rel: Relation;
}

export function kinBridge(ids: string[], anchor: string = getAnchor()): KinBridge | null {
  let best: KinBridge | null = null;
  for (const id of ids) {
    const seen = new Set([id]);
    let frontier = [id];
    let gen = 0;
    while (frontier.length && gen < 8) {
      gen += 1;
      const next: string[] = [];
      for (const pid of frontier) {
        for (const c of relationsOf(pid).children) {
          if (seen.has(c)) continue;
          seen.add(c);
          next.push(c);
          const rel = relationTo(c, anchor);
          if (rel && (!best || gen + rel.dist < best.gen + best.rel.dist)) {
            best = { id, through: c, gen, rel };
          }
        }
      }
      frontier = next;
    }
  }
  return best;
}

/** The anchor-side branch marker: on the chain from anchor up toward the
 *  common ancestor, the person three (or fewer) generations up. Three
 *  rather than two because it is the most specific ancestor Ethan still
 *  knows by name (his ruling: "Close relative: Great Grandfather name"). */
function viaOf(anchor: string, throughAncestor: string): Relation["via"] {
  const chain = chainUp(anchor, throughAncestor);
  if (chain.length <= 4) return null; // target/common ancestor already close
  const id = chain[3]; // three generations up from the anchor
  return { id, term: closeTerm(3, getPerson(id)) };
}

function bloodRelation(anchor: string, target: string): Relation | null {
  if (anchor === target) return { term: "you, if you are who we think you are", via: null, dist: 0 };

  const up = ancestorsWalk(anchor);
  const hitUp = up.get(target);
  if (hitUp) {
    return {
      term: `your ${ancestorTerm(hitUp.gen, getPerson(target))}`,
      via: hitUp.gen > 3 ? viaOf(anchor, target) : null,
      dist: hitUp.gen,
    };
  }

  const down = ancestorsWalk(target);
  const hitDown = down.get(anchor);
  if (hitDown) {
    return { term: `your ${descendantTerm(hitDown.gen, getPerson(target))}`, via: null, dist: hitDown.gen };
  }

  // Nearest common ancestor: minimal combined distance, ties to the
  // anchor's side because the sentence is spoken from there.
  let best: { id: string; ga: number; gb: number } | null = null;
  for (const [aid, a] of up) {
    const b = down.get(aid);
    if (!b) continue;
    if (!best || a.gen + b.gen < best.ga + best.gb || (a.gen + b.gen === best.ga + best.gb && a.gen < best.ga)) {
      best = { id: aid, ga: a.gen, gb: b.gen };
    }
  }
  if (!best) return null;

  const { ga, gb } = best;
  const p = getPerson(target);
  let term: string;
  if (ga === 1 && gb === 1) {
    term = `your ${sexed(p, "uncle or half-brother", "aunt or half-sister", "sibling by one parent")}`;
  } else if (gb === 1) {
    // Sibling of an ancestor.
    const base = sexed(p, "granduncle", "grandaunt", "grand-sibling");
    term =
      ga === 2
        ? `your ${sexed(p, "uncle", "aunt", "parent's sibling")}`
        : ga === 3
          ? `your ${base}`
          : `your ${ord(ga - 2)} great-${base}`;
  } else if (ga === 1) {
    const base = sexed(p, "grandnephew", "grandniece", "grand-nibling");
    term =
      gb === 2
        ? `your ${sexed(p, "nephew", "niece", "sibling's child")}`
        : gb === 3
          ? `your ${base}`
          : `your ${ord(gb - 2)} great-${base}`;
  } else {
    const degree = Math.min(ga, gb) - 1;
    const removed = Math.abs(ga - gb);
    term = `your ${ord(degree)} cousin${removed ? ` ${removed === 1 ? "once" : removed === 2 ? "twice" : `${removed} times`} removed` : ""}`;
  }
  return { term, via: viaOf(anchor, best.id), dist: ga + gb };
}

/** The full answer, trying blood first and marriage second. Returns null
 *  for people the tree cannot connect to the anchor at all. */
export function relationTo(target: string, anchor: string = getAnchor()): Relation | null {
  const blood = bloodRelation(anchor, target);
  if (blood) return blood;

  // Married in: find a spouse with a blood relation and speak through them.
  for (const s of relationsOf(target).spouses) {
    const spouseRel = bloodRelation(anchor, s.id);
    if (spouseRel) {
      const p = getPerson(target);
      const word = sexed(p, "husband", "wife", "spouse");
      return {
        term: `${word} of ${spouseRel.term.replace(/^your /, "your ")}`,
        via: spouseRel.via,
        byMarriage: true,
        dist: spouseRel.dist + 1,
      };
    }
  }
  return null;
}

/** One display sentence: "Your 9th great-grandfather · through
 *  Grandpa Smith". */
export function relationSentence(target: string, anchor: string = getAnchor()): string | null {
  const rel = relationTo(target, anchor);
  if (!rel) return null;
  const head = rel.term.charAt(0).toUpperCase() + rel.term.slice(1);
  if (!rel.via) return head;
  return `${head} · through ${familiarName(rel.via.id, anchor)}`;
}
