/** The atlas, told as a story rather than scrubbed as a chart.
 *
 *  Ethan's ask, 2026-08-21: pressing play should not fast-forward a year
 *  counter while three hundred straight lines appear at once. It should
 *  fly — "whoosh, this person travelled here" — one line at a time, so
 *  that where the family comes from is something you watch happen.
 *
 *  Three things are built here and nothing else:
 *
 *  1. A *journey*: one person's documented path, in order. Not a segment
 *     between two events — the whole life, so the caption can say
 *     "Holbeach, Lincolnshire to Lamoni, Iowa" and mean a person rather
 *     than a database row.
 *  2. A *chapter*: one great-grandparent's line, oldest journey first, so
 *     each line arrives from its own origin in its own passage.
 *  3. A *timeline* of beats over those chapters, with a camera for each,
 *     reusing the film's motion model rather than inventing a second one.
 *
 *  Nothing in here infers a move. A leg exists only because the same
 *  person is documented in two different places, and only when the two
 *  places are further apart than the coarser of them is vague — see FLOOR.
 */

import {
  OPENING,
  angularDistance,
  coverageZoom,
  ease,
  greatCircle,
  lerpAngle,
  tiltForZoom,
  zoomCurve,
  type Camera,
} from "@/lib/camera";
import { displayName, getPerson, people, places, relationsOf } from "@/lib/data";
import { ancestorTerm, branches, getAnchor } from "@/lib/kinship";
import type { Place } from "@/types";

// ---- the precision floor ----------------------------------------------

/** A record that says only "Iowa" is placed at the middle of Iowa: a real
 *  coordinate for a place nobody lived. Treated as a town it invents a
 *  hundred-mile move out of a blank. Treated as nothing it deletes an
 *  immigrant's crossing, because the record of where he started says
 *  "England" and no more.
 *
 *  So a stop is only as good as its precision, and a move has to be longer
 *  than the fuzz in its own coarsest end before it counts as a move at
 *  all. The same rule the printed packets use, in miles. */
const FLOOR: Record<string, number> = { locality: 1, region: 150, country: 400 };
const COARSE: Record<string, number> = { locality: 0, region: 1, country: 2 };

function coarser(a: Place, b: Place): string {
  const pa = a.precision ?? "country";
  const pb = b.precision ?? "country";
  return (COARSE[pa] ?? 2) >= (COARSE[pb] ?? 2) ? pa : pb;
}

const R_MILES = 3958.8;
export function miles(a: [number, number], b: [number, number]): number {
  return (angularDistance(a, b) * Math.PI * R_MILES) / 180;
}

/** A place the map can actually draw. Twenty-three gazetteer strings never
 *  resolved to a coordinate; without this guard they become points at
 *  undefined lon/lat that still count toward a total. */
export function located(id: string | undefined): Place | undefined {
  const p = id ? (places[id] as Place | undefined) : undefined;
  return p && Number.isFinite(p.lon) && Number.isFinite(p.lat) ? p : undefined;
}

// ---- journeys ----------------------------------------------------------

export interface Leg {
  a: [number, number];
  b: [number, number];
  from: string;
  to: string;
  /** What put them there: "Birth", "Marriage", "Burial". The caption says
   *  it, because the whole claim rests on those two records. */
  fromEvent: string;
  toEvent: string;
  fromYear: number;
  toYear: number;
  miles: number;
  /** The coarser of the two ends. "region" means this line is drawn from
   *  the middle of a county to the middle of another, and the caption has
   *  to admit it. */
  precision: string;
}

export interface Journey {
  pid: string;
  name: string;
  /** "Your 9th great-grandmother", or null off the direct line. */
  relation: string | null;
  chapter: string;
  color: string;
  legs: Leg[];
  startYear: number;
  endYear: number;
  miles: number;
  /** True when any leg crosses more than a thousand miles of it. */
  ocean: boolean;
}

/** The tree is static for the life of the page, so a person's route is
 *  computed once. The atlas asks this of every person still on the map
 *  each time the year moves, which is eleven hundred answers a drag. */
const legCache = new Map<string, Leg[]>();

export function legsFor(pid: string): Leg[] {
  const cached = legCache.get(pid);
  if (cached) return cached;
  const legs = buildLegs(pid);
  legCache.set(pid, legs);
  return legs;
}

function buildLegs(pid: string): Leg[] {
  const stops = (people[pid]?.events ?? [])
    .map((e) => ({ place: located(e.place), year: e.date?.year, label: e.label }))
    .filter((s): s is { place: Place; year: number; label: string } =>
      Boolean(s.place && s.year),
    )
    .sort((x, y) => x.year - y.year);
  if (stops.length < 2) return [];

  const out: Leg[] = [];
  let prev = stops[0];
  for (const s of stops.slice(1)) {
    if (s.place.id === prev.place.id) continue;
    const a: [number, number] = [prev.place.lon, prev.place.lat];
    const b: [number, number] = [s.place.lon, s.place.lat];
    const d = miles(a, b);
    const p = coarser(prev.place, s.place);
    if (d < (FLOOR[p] ?? 400)) continue;
    out.push({
      a,
      b,
      from: prev.place.label,
      to: s.place.label,
      fromEvent: prev.label,
      toEvent: s.label,
      fromYear: prev.year,
      toYear: s.year,
      miles: d,
      precision: p,
    });
    prev = s;
  }
  return out;
}

function journeyFor(pid: string, chapter: string, color: string, anchor: string): Journey | null {
  const legs = legsFor(pid);
  if (!legs.length) return null;
  const gen = generationOf(pid, anchor);
  return {
    pid,
    name: displayName(getPerson(pid)),
    relation: gen === null ? null : `Your ${ancestorTerm(gen, getPerson(pid))}`,
    chapter,
    color,
    legs,
    startYear: legs[0].fromYear,
    endYear: legs[legs.length - 1].toYear,
    miles: legs.reduce((n, l) => n + l.miles, 0),
    ocean: legs.some((l) => l.miles > 1000),
  };
}

/** Generations from the anchor up to a direct ancestor, or null. Kept
 *  local rather than exported from kinship because the atlas asks it of
 *  every person in the tree and wants the cheap answer. */
const genCache = new Map<string, Map<string, number>>();
function generationOf(pid: string, anchor: string): number | null {
  let table = genCache.get(anchor);
  if (!table) {
    table = new Map([[anchor, 0]]);
    let frontier = [anchor];
    let gen = 0;
    while (frontier.length) {
      gen += 1;
      const next: string[] = [];
      for (const id of frontier) {
        for (const parent of relationsOf(id).parents) {
          if (!table.has(parent)) {
            table.set(parent, gen);
            next.push(parent);
          }
        }
      }
      frontier = next;
    }
    genCache.set(anchor, table);
  }
  return table.get(pid) ?? null;
}

// ---- chapters ----------------------------------------------------------

export interface Chapter {
  key: string;
  title: string;
  sub: string;
  color: string;
  journeys: Journey[];
  from: number;
  to: number;
  miles: number;
  /** The shot that holds the whole chapter, for its title card. */
  cam: Camera;
}

/** The zoom a settled shot uses, by how precise the record is. A county
 *  centroid does not earn a town-level close-up: pushing in to zoom 8 on
 *  "Iowa" frames a field the family never saw. */
const SETTLE: Record<string, number> = { locality: 7.1, region: 5.2, country: 4 };

function shotFor(lon: number, lat: number, precision: string, index: number): Camera {
  const zoom = Math.min(SETTLE[precision] ?? 4, coverageZoom(lon, lat));
  return {
    lon,
    lat,
    zoom,
    bearing: zoom > 6 ? (index % 2 === 0 ? -11 : 8) : 0,
    pitch: zoom > 6 ? 40 : zoom > 4.6 ? 22 : 0,
  };
}

/** A shot that holds every point in a chapter, so its title card shows the
 *  ground the line is about to cover before anything moves. */
function overview(points: [number, number][]): Camera {
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const w = Math.max(...lons) - Math.min(...lons);
  const h = Math.max(...lats) - Math.min(...lats);
  const span = Math.max(w, h * 1.5, 2);
  const zoom = Math.max(1.25, Math.min(5.6, Math.log2(360 / span) + 0.6));
  return {
    lon: (Math.max(...lons) + Math.min(...lons)) / 2,
    lat: (Math.max(...lats) + Math.min(...lats)) / 2,
    zoom,
    bearing: 0,
    pitch: 0,
  };
}

/** One chapter per great-grandparent's line, in the order the walk finds
 *  them — which is Dad's side and then Mom's — and a coda for the
 *  generations close enough to have been in the room. A line with no
 *  documented move is left out rather than given an empty chapter. */
export function buildChapters(anchor: string = getAnchor()): Chapter[] {
  const list = branches(anchor);
  const claimed = new Set<string>();
  const out: Chapter[] = [];

  const finish = (key: string, title: string, sub: string, color: string, js: Journey[]) => {
    if (!js.length) return;
    js.sort((a, b) => a.startYear - b.startYear || a.name.localeCompare(b.name));
    const pts = js.flatMap((j) => j.legs.flatMap((l) => [l.a, l.b]));
    out.push({
      key,
      title,
      sub,
      color,
      journeys: js,
      from: Math.min(...js.map((j) => j.startYear)),
      to: Math.max(...js.map((j) => j.endYear)),
      miles: js.reduce((n, j) => n + j.miles, 0),
      cam: overview(pts),
    });
  };

  for (const b of list) {
    const js: Journey[] = [];
    for (const pid of b.members) {
      if (claimed.has(pid)) continue;
      const j = journeyFor(pid, b.id, b.color, anchor);
      if (j) {
        claimed.add(pid);
        js.push(j);
      }
    }
    finish(b.id, b.label, `${b.sub} · through ${b.through}`, b.color, js);
  }

  // The last three generations sit above no great-grandparent, so nothing
  // above would ever show them moving. They are the part of the map Ethan
  // can check against his own memory, so they close the film.
  const near: Journey[] = [];
  for (const pid of Object.keys(people)) {
    if (claimed.has(pid)) continue;
    const gen = generationOf(pid, anchor);
    if (gen === null || gen > 2) continue;
    const j = journeyFor(pid, "near", NEAR_COLOR, anchor);
    if (j) near.push(j);
  }
  finish("near", "Closer to home", "Your parents and grandparents", NEAR_COLOR, near);

  return out;
}

export const NEAR_COLOR = "#D8C9A8";

// ---- the timeline ------------------------------------------------------

export type BeatKind = "card" | "approach" | "leg" | "settle";

export interface Beat {
  kind: BeatKind;
  t0: number;
  t1: number;
  /** Where the camera comes to rest at the end of this beat. */
  cam: Camera;
  chapter: number;
  /** -1 on a chapter card. */
  journey: number;
  /** -1 unless this beat draws a leg. */
  leg: number;
}

export interface AtlasTimeline {
  beats: Beat[];
  chapters: Chapter[];
  duration: number;
  /** Index of the first beat of each chapter, for the chapter buttons. */
  chapterStart: number[];
  /** Index of the beat that holds each journey's caption, in order. */
  journeyBeats: { chapter: number; journey: number; beat: number }[];
}

const CARD_S = 6.2;
const SETTLE_S = 1.9;
const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

const approachSeconds = (from: Camera, to: Camera) =>
  clamp(1, 3, 1 + angularDistance([from.lon, from.lat], [to.lon, to.lat]) * 0.06);

const legSeconds = (l: Leg) =>
  clamp(1.6, 5.5, 1.4 + angularDistance(l.a, l.b) * 0.09);

export function buildAtlasTimeline(chapters: Chapter[]): AtlasTimeline {
  const beats: Beat[] = [];
  const chapterStart: number[] = [];
  const journeyBeats: AtlasTimeline["journeyBeats"] = [];
  let t = 0;
  let cam = OPENING;
  let shot = 0;

  const push = (kind: BeatKind, seconds: number, next: Camera, c: number, j: number, l: number) => {
    beats.push({ kind, t0: t, t1: t + seconds, cam: next, chapter: c, journey: j, leg: l });
    t += seconds;
    cam = next;
  };

  chapters.forEach((chapter, ci) => {
    chapterStart.push(beats.length);
    push("card", CARD_S, chapter.cam, ci, -1, -1);

    chapter.journeys.forEach((journey, ji) => {
      const first = journey.legs[0];
      const origin = shotFor(first.a[0], first.a[1], first.precision, shot++);
      push("approach", approachSeconds(cam, origin), origin, ci, ji, -1);
      journeyBeats.push({ chapter: ci, journey: ji, beat: beats.length - 1 });

      journey.legs.forEach((leg, li) => {
        const dest = shotFor(leg.b[0], leg.b[1], leg.precision, shot++);
        push("leg", legSeconds(leg), dest, ci, ji, li);
      });

      push("settle", SETTLE_S, cam, ci, ji, -1);
    });
  });

  return { beats, chapters, duration: t, chapterStart, journeyBeats };
}

// ---- the camera --------------------------------------------------------

/** A frame that is dead still reads as a screenshot; this is a drift, not
 *  a movement. Lifted from the film's hold. */
function drift(target: Camera, u: number): Camera {
  const d = Math.sin(u * Math.PI) * 0.055;
  return { ...target, zoom: target.zoom + d * 1.5, bearing: target.bearing + d * 5 };
}

export interface AtlasFrame {
  cam: Camera;
  beat: Beat;
  /** 0..1 through the beat, unadjusted. */
  u: number;
  /** 0..1 of the leg drawn, eased. 1 on anything that is not a leg. */
  progress: number;
  index: number;
}

export function beatIndexAt(beats: Beat[], t: number): number {
  let lo = 0;
  let hi = beats.length - 1;
  if (t >= beats[hi].t1) return hi;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t < beats[mid].t1) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function atlasCameraAt(tl: AtlasTimeline, t: number): AtlasFrame {
  const index = beatIndexAt(tl.beats, t);
  const beat = tl.beats[index];
  const u = clamp(0, 1, (t - beat.t0) / (beat.t1 - beat.t0));
  const prev = index > 0 ? tl.beats[index - 1].cam : OPENING;

  if (beat.kind === "settle") {
    return { cam: drift(beat.cam, u), beat, u, progress: 1, index };
  }

  // The title card flies out to the chapter's whole ground, then holds on
  // it while the words are up.
  const FLY_PART = 0.45;
  if (beat.kind === "card" && u > FLY_PART) {
    return { cam: drift(beat.cam, (u - FLY_PART) / (1 - FLY_PART)), beat, u, progress: 1, index };
  }
  const uu = beat.kind === "card" ? u / FLY_PART : u;
  const p = ease(uu);

  const from: [number, number] = [prev.lon, prev.lat];
  const to: [number, number] = [beat.cam.lon, beat.cam.lat];
  const [lon, lat] = greatCircle(from, to, p);
  const spread = angularDistance(from, to);
  const pull = spread > 25 ? 1.35 : spread > 6 ? 3.4 : Math.min(prev.zoom, beat.cam.zoom) - 1.2;
  const zoom = zoomCurve(prev.zoom, beat.cam.zoom, pull, uu);

  return {
    cam: {
      lon,
      lat,
      zoom,
      bearing: lerpAngle(prev.bearing, beat.cam.bearing, ease(Math.min(1, uu * 1.25))),
      pitch: tiltForZoom(zoom, beat.cam.pitch),
    },
    beat,
    u,
    progress: beat.kind === "leg" ? p : 1,
    index,
  };
}

/** Time at which a journey's caption is up, for the transport buttons. */
export function seekJourney(tl: AtlasTimeline, chapter: number, journey: number): number {
  const hit = tl.journeyBeats.find((j) => j.chapter === chapter && j.journey === journey);
  return hit ? tl.beats[hit.beat].t0 : 0;
}
