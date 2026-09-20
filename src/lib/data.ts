/** The single read of the packet's tree, stories and film, plus the
 *  derived indexes every surface needs. Built once at module load: a
 *  few hundred people is small enough that indexing eagerly costs
 *  nothing and saves every consumer a walk. Module load happens after
 *  the packet has been fetched (see main.tsx), which is what makes the
 *  synchronous reads below safe. */

import { packetFile } from "@/lib/packet";
import type {
  Family,
  Film,
  FilmStop,
  MediaItem,
  Person,
  Place,
  Story,
  Stories,
  Tree,
} from "@/types";

export const tree = packetFile<Tree>("tree", {
  meta: {
    generatedFrom: "",
    gedcomSha256: "",
    rootPerson: "",
    counts: { people: 0, living: 0, families: 0, sources: 0, places: 0, media: 0, mediaWithFile: 0 },
    livingFence: { mode: "", rule: "", emitted: "" },
  },
  people: {},
  families: {},
  places: {},
  sources: {},
  media: {},
  lineages: [],
} as unknown as Tree);
export const storiesDoc = packetFile<Stories>("stories", {
  meta: { generatedFrom: "", counts: { stories: 0, sections: 0 } },
  stories: [],
  sections: [],
});
export const film = packetFile<Film>("film", { title: "", subtitle: "", stops: [] });

export const stories: Story[] = storiesDoc.stories;
export const people = tree.people;
export const families = tree.families;
export const places = tree.places;
export const sources = tree.sources;
export const media = tree.media;
export const lineages = tree.lineages;

export const lineageByKey = new Map(lineages.map((l) => [l.key, l]));

export function lineageColor(key?: string | null): string {
  return (key && lineageByKey.get(key)?.color) || "var(--lineage-none)";
}

/** The lineage a person is shown as. Someone can sit in more than one
 *  line (the tree marries back into itself twice); the first is the one
 *  the curated roots list first, so it is a stable choice, not a guess. */
export function primaryLineage(p?: Person): string | null {
  return p?.lineages?.[0] ?? null;
}

/** An attachment in one clause: what kind of thing it is and how big.
 *  Everything here is optional in the GEDCOM, so the sentence is built
 *  from whatever survived rather than assumed. */
export function describeMedia(m?: MediaItem): string {
  if (!m) return "";
  const size = m.width && m.height ? `${m.width} by ${m.height}` : "";
  const parts = [m.kind, [size, m.format].filter(Boolean).join(" ")].filter(Boolean);
  return parts.join(", ");
}

/** How many curated lines there are, as a word, for copy that would
 *  otherwise hardcode "four". */
export const lineageCountWord = (() => {
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];
  return words[lineages.length] ?? String(lineages.length);
})();

/** How a person's lines read as a label. Someone near the present descends
 *  from every line, and saying so is the point of the colour code; someone
 *  who married in belongs to none, and saying that is honest rather than
 *  dismissive. */
export function lineageLabel(p?: Person): string {
  const keys = p?.lineages ?? [];
  if (keys.length === 0) return "Married in or collateral";
  if (keys.length === lineages.length && keys.length > 1) return `All ${lineageCountWord} lines`;
  const names = keys.map((k) => lineageByKey.get(k)?.label ?? k);
  if (names.length === 1) return `${names[0]} line`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} lines`;
}

/** "1597 to now": the earliest dated birth in the tree to the present,
 *  for the one-line span under the title. */
export const treeSpan: string = (() => {
  let earliest = Infinity;
  for (const p of Object.values(people)) {
    const y = p.birth?.date?.year;
    if (y && y < earliest) earliest = y;
  }
  return Number.isFinite(earliest) ? `${earliest} to now` : "";
})();

export function getPerson(id?: string | null): Person | undefined {
  return id ? people[id] : undefined;
}

export function getPlace(id?: string | null): Place | undefined {
  return id ? places[id] : undefined;
}

// ---------- relationship indexes ----------

export interface Relations {
  /** Every recorded parent, first family first. Kinship and the lineage
   *  walk follow all of them. */
  parents: string[];
  /** The parents in the person's first family: what the chart draws and
   *  the Parents box leads with. */
  primaryParents: string[];
  /** Parents from any further family, with the link's label if it has one. */
  otherParents: { id: string; label?: string }[];
  children: string[];
  spouses: { id: string; family: Family }[];
  siblings: string[];
}

const relCache = new Map<string, Relations>();

export function relationsOf(id: string): Relations {
  const cached = relCache.get(id);
  if (cached) return cached;

  const p = people[id];
  const rel: Relations = {
    parents: [], primaryParents: [], otherParents: [], children: [], spouses: [], siblings: [],
  };
  if (!p) return rel;

  p.famc.forEach((fid, i) => {
    const f = families[fid];
    if (!f) return;
    for (const parent of [f.husband, f.wife]) {
      if (!parent || rel.parents.includes(parent)) continue;
      rel.parents.push(parent);
      if (i === 0) rel.primaryParents.push(parent);
      else rel.otherParents.push({ id: parent, label: p.parentLinks?.[fid] });
    }
    for (const c of f.children) {
      if (c !== id && !rel.siblings.includes(c)) rel.siblings.push(c);
    }
  });

  for (const fid of p.fams) {
    const f = families[fid];
    if (!f) continue;
    const other = f.husband === id ? f.wife : f.husband;
    if (other) rel.spouses.push({ id: other, family: f });
    for (const c of f.children) {
      if (!rel.children.includes(c)) rel.children.push(c);
    }
  }

  rel.children.sort(byBirth);
  rel.siblings.sort(byBirth);
  relCache.set(id, rel);
  return rel;
}

export function birthYear(id: string): number | undefined {
  return people[id]?.birth?.date?.year;
}

export function byBirth(a: string, b: string): number {
  const ya = birthYear(a);
  const yb = birthYear(b);
  if (ya == null && yb == null) return 0;
  if (ya == null) return 1;
  if (yb == null) return -1;
  return ya - yb;
}

/** Direct ancestors, breadth first, capped by generation depth. */
export function ancestorsOf(id: string, maxGen: number): string[][] {
  const gens: string[][] = [[id]];
  const seen = new Set([id]);
  for (let g = 0; g < maxGen; g++) {
    const next: string[] = [];
    for (const pid of gens[g]) {
      for (const parent of relationsOf(pid).parents) {
        if (!seen.has(parent)) {
          seen.add(parent);
          next.push(parent);
        }
      }
    }
    if (!next.length) break;
    gens.push(next);
  }
  return gens;
}

// ---------- stories ----------

export const storyById = new Map(stories.map((s) => [s.id, s]));

/** Stories that name a person, for their page. */
const storiesByPerson = new Map<string, Story[]>();
for (const s of stories) {
  const ids = new Set(
    [...s.people, ...s.mentions].map((p) => p.id).filter(Boolean) as string[],
  );
  for (const id of ids) {
    const list = storiesByPerson.get(id) ?? [];
    list.push(s);
    storiesByPerson.set(id, list);
  }
}

export function storiesFor(id: string): Story[] {
  return storiesByPerson.get(id) ?? [];
}

export const storyParts: { part: string; stories: Story[] }[] = (() => {
  const order: string[] = [];
  const grouped = new Map<string, Story[]>();
  for (const s of stories) {
    const part = s.part || "Stories";
    if (!grouped.has(part)) {
      grouped.set(part, []);
      order.push(part);
    }
    grouped.get(part)!.push(s);
  }
  return order.map((part) => ({ part, stories: grouped.get(part)! }));
})();

// ---------- film ----------

export const filmStops: FilmStop[] = film.stops;
export const stopById = new Map(filmStops.map((s) => [s.id, s]));

/** Film stops that link to a story, so a story page can offer the film. */
export function stopsForStory(storyId: string): FilmStop[] {
  return filmStops.filter((s) => s.story === storyId);
}

// ---------- search ----------

export interface SearchHit {
  kind: "person" | "story" | "place";
  id: string;
  label: string;
  detail: string;
  lineage?: string | null;
  score: number;
}

interface IndexEntry {
  hay: string;
  hit: Omit<SearchHit, "score">;
}

const searchIndex: IndexEntry[] = (() => {
  const out: IndexEntry[] = [];
  for (const p of Object.values(people)) {
    const names = [p.name, ...(p.altNames ?? [])].map((n) => n.full);
    out.push({
      hay: names.join(" ").toLowerCase(),
      hit: {
        kind: "person",
        id: p.id,
        label: p.name.full || "Unnamed",
        detail: lifespan(p),
        lineage: primaryLineage(p),
      },
    });
  }
  for (const s of stories) {
    out.push({
      hay: `${s.title} ${s.line ?? ""}`.toLowerCase(),
      hit: {
        kind: "story",
        id: s.id,
        label: s.title,
        detail: s.number ? `Story ${s.number}` : "Story",
      },
    });
  }
  for (const pl of Object.values(places)) {
    out.push({
      hay: pl.label.toLowerCase(),
      hit: { kind: "place", id: pl.id, label: pl.label, detail: pl.precision },
    });
  }
  return out;
})();

export function search(query: string, limit = 12): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: SearchHit[] = [];
  for (const entry of searchIndex) {
    const at = entry.hay.indexOf(q);
    if (at < 0) continue;
    // Prefix of a word beats a mid-word match; people beat places.
    const wordStart = at === 0 || entry.hay[at - 1] === " ";
    const kindBonus = entry.hit.kind === "person" ? 2 : entry.hit.kind === "story" ? 1 : 0;
    hits.push({ ...entry.hit, score: (wordStart ? 10 : 0) + kindBonus - at * 0.01 });
  }
  hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return hits.slice(0, limit);
}

// ---------- formatting ----------

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatDate(d?: {
  raw: string;
  year?: number;
  month?: number;
  day?: number;
  approximate?: boolean;
}): string {
  if (!d) return "";
  if (!d.year) return d.raw;
  const month = d.month ? MONTHS[d.month - 1] : "";
  const stem = d.day && month
    ? `${d.day} ${month} ${d.year}`
    : month
      ? `${month} ${d.year}`
      : String(d.year);
  // An estimated year has to look estimated. A birth year that is three
  // stated ages in three deeds and no birth record at all, printed as
  // "1805" beside a daughter's "8 January 1839", claims a precision the
  // register never gave.
  return d.approximate ? `about ${stem}` : stem;
}

export function yearOf(d?: { year?: number; raw?: string; approximate?: boolean }): string {
  if (!d) return "";
  if (!d.year) return d.raw ?? "";
  return d.approximate ? `c. ${d.year}` : String(d.year);
}

/** "1597 to 1662", or "b. 1830", or "" when the fence hid the dates. */
export function lifespan(p: Person): string {
  if (p.living) return "living";
  // Year-only, and only when a year actually parsed: a lifespan is not the
  // place to surface a raw GEDCOM string.
  const b = p.birth?.date?.year ? yearOf(p.birth.date) : "";
  const d = p.death?.date?.year ? yearOf(p.death.date) : "";
  if (b && d) return `${b} to ${d}`;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  return "dates unknown";
}

export function placeLabel(id?: string | null, raw?: string): string {
  const pl = getPlace(id);
  if (pl) return pl.label;
  return raw ?? "";
}

export function displayName(p?: Person, fallback = "Unknown"): string {
  if (!p) return fallback;
  const n = p.name.full?.trim();
  return n || `${p.name.given} ${p.name.surname}`.trim() || fallback;
}

/** Every place a person's events touch, oldest first, for the map. */
export function placesOf(p: Person): { place: Place; event: string; year?: number }[] {
  const out: { place: Place; event: string; year?: number }[] = [];
  for (const e of p.events ?? []) {
    const pl = getPlace(e.place);
    if (pl) out.push({ place: pl, event: e.label, year: e.date?.year });
  }
  return out.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
}
