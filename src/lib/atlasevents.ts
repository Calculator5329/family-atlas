/** The record as points: every dated, placed event in the tree, coloured
 *  by the line it belongs to and shaped by what happened.
 *
 *  Shared by two surfaces that want the same dots for opposite reasons.
 *  The atlas shows them all at once and lets you cut them down; the
 *  journeys sequence shows them dimmed, filling in behind the movement.
 *  Both read this, so a dot cannot mean one thing on one map and another
 *  thing on the other. */

import type { Feature } from "geojson";
import { displayName, families, getPerson, people } from "@/lib/data";
import { branchOf, branches } from "@/lib/kinship";
import { located } from "@/lib/journeys";
import { glyphName, shapeFor, type EventShape } from "@/lib/atlasglyphs";

/** Everyone outside the eight branches: descendants, collaterals, and the
 *  families people married into. They stay on the map, in grey, because a
 *  place is made by everyone who was there. */
export const OFF_BRANCH = "#5D6872";
export const OFF_BRANCH_KEY = "off";
export const OFF_BRANCH_NAME = "Married in or descended";

export interface EventDot {
  pid: string;
  name: string;
  /** The year, or -1 when the record gives a place and no date. Twenty-four
   *  of the twenty-six burials in this tree are like that: the cemetery is
   *  known and the day is not. Dropping them would hide a quarter of the
   *  places the family is buried in, so they are carried with the year
   *  marked absent and left out of anything that needs a date. */
  year: number;
  dated: boolean;
  label: string;
  shape: EventShape;
  place: string;
  placeId: string;
  color: string;
  colorIndex: number;
  branch: string;
  branchLabel: string;
  lon: number;
  lat: number;
}

/** All dated, placed events: person events plus marriages (carried once,
 *  by whichever spouse the wedding brought onto a line). */
export function collectDots(anchor: string): EventDot[] {
  const dots: EventDot[] = [];
  const list = branches(anchor);
  const index = new Map(list.map((b, i) => [b.id, i]));

  const paint = (pid: string) => {
    const b = branchOf(pid, anchor);
    return {
      color: b?.color ?? OFF_BRANCH,
      colorIndex: b ? (index.get(b.id) ?? 0) : list.length,
      branch: b?.id ?? OFF_BRANCH_KEY,
      branchLabel: b?.label ?? OFF_BRANCH_NAME,
    };
  };

  for (const p of Object.values(people)) {
    for (const e of p.events ?? []) {
      const place = located(e.place);
      if (!place) continue;
      const year = e.date?.year;
      dots.push({
        pid: p.id,
        name: displayName(p),
        year: year ?? -1,
        dated: Boolean(year),
        label: e.label,
        shape: shapeFor(e.label),
        place: place.label,
        placeId: e.place ?? "",
        ...paint(p.id),
        lon: place.lon,
        lat: place.lat,
      });
    }
  }

  for (const f of Object.values(families)) {
    const m = f.marriage;
    const place = located(m?.place);
    if (!place) continue;
    const year = m?.date?.year;
    const a = getPerson(f.husband);
    const b = getPerson(f.wife);
    const host = a ?? b;
    if (!host) continue;
    // Colour the marriage by whichever spouse is on a branch: a wedding
    // belongs to the line it joins, and only one of the two carries it.
    const onBranch = [a, b].find((x) => x && branchOf(x.id, anchor)) ?? host;
    dots.push({
      pid: host.id,
      name: [a, b].filter(Boolean).map((x) => displayName(x!)).join(" & "),
      year: year ?? -1,
      dated: Boolean(year),
      label: "Marriage",
      shape: "married",
      place: place.label,
      placeId: m?.place ?? "",
      ...paint(onBranch.id),
      lon: place.lon,
      lat: place.lat,
    });
  }

  return dots.sort((x, y) => (x.dated ? x.year : Infinity) - (y.dated ? y.year : Infinity));
}

/** Fan same-place dots into a ring so density is visible.
 *
 *  The offsets are in **screen pixels**, carried as a property and applied
 *  with a data-driven `icon-offset`, not baked into the coordinates. The
 *  first version moved the point itself by up to 0.075 degrees, which is
 *  eight kilometres: at country zoom that read as a cluster, and at town
 *  zoom it drew a baptism in the next parish. A map of a family that has
 *  spent forty cycles proving where people were should not move them for
 *  the sake of legibility. The point stays true and the picture of it
 *  moves. */
export function toFeatures(dots: EventDot[]): Feature[] {
  const at = new Map<string, number>();
  return dots.map((d, i) => {
    const key = `${d.lon},${d.lat}`;
    const n = at.get(key) ?? 0;
    at.set(key, n + 1);
    // Eight to a turn, each turn a little wider and rotated off the last
    // so the spokes of one ring do not hide the spokes of the next.
    const turn = Math.floor(n === 0 ? 0 : (n - 1) / 8);
    const radius = n === 0 ? 0 : 13 + turn * 11;
    const angle = ((n - 1) % 8) * (Math.PI / 4) + turn * 0.39;
    return {
      type: "Feature",
      id: i,
      properties: {
        idx: i,
        pid: d.pid,
        name: d.name,
        year: d.year,
        dated: d.dated,
        label: d.label,
        shape: d.shape,
        place: d.place,
        placeId: d.placeId || key,
        branch: d.branch,
        branchLabel: d.branchLabel,
        icon: glyphName(d.shape, d.colorIndex),
        offset: [
          Math.round(radius * Math.cos(angle)),
          Math.round(radius * Math.sin(angle)),
        ],
      },
      geometry: { type: "Point", coordinates: [d.lon, d.lat] },
    };
  });
}

/** `icon-offset` reading the ring the line above authored. Both maps that
 *  draw these dots need it, and a ring applied on one map and not the
 *  other would be two different claims about the same event. */
export const ICON_OFFSET = ["array", "number", 2, ["get", "offset"]];

export interface PlaceMass {
  key: string;
  label: string;
  lon: number;
  lat: number;
  count: number;
  /** Earliest and latest year among the dated events here. */
  from: number;
  to: number;
  /** The line with the most events here, and its colour. */
  color: string;
  branchLabel: string;
  /** Indices back into the dot list, for the list to pick up. */
  dots: number[];
}

/** The same events asked a different question: not "what happened" but
 *  "where did this family keep happening". Sixty-eight events in Hingham
 *  and one in Nauvoo is the shape of the record, and nine hundred
 *  identically sized glyphs hide it. */
export function collectPlaces(dots: EventDot[], keep?: number[]): PlaceMass[] {
  const byPlace = new Map<string, PlaceMass & { tally: Map<string, [number, string, string]> }>();
  const idx = keep ?? dots.map((_, i) => i);
  for (const i of idx) {
    const d = dots[i];
    if (!d) continue;
    const key = d.placeId || `${d.lon},${d.lat}`;
    let m = byPlace.get(key);
    if (!m) {
      m = {
        key,
        label: d.place,
        lon: d.lon,
        lat: d.lat,
        count: 0,
        from: Infinity,
        to: -Infinity,
        color: OFF_BRANCH,
        branchLabel: OFF_BRANCH_NAME,
        dots: [],
        tally: new Map(),
      };
      byPlace.set(key, m);
    }
    m.count += 1;
    m.dots.push(i);
    if (d.dated) {
      m.from = Math.min(m.from, d.year);
      m.to = Math.max(m.to, d.year);
    }
    const t = m.tally.get(d.branch);
    m.tally.set(d.branch, [(t?.[0] ?? 0) + 1, d.color, d.branchLabel]);
  }
  const out: PlaceMass[] = [];
  for (const m of byPlace.values()) {
    // A place belongs to whichever line was there most; a tie goes to the
    // named line rather than to "married in or descended", because the
    // grey is the absence of an answer and not an answer.
    let best: [number, string, string] = [0, OFF_BRANCH, OFF_BRANCH_NAME];
    for (const [branch, v] of m.tally) {
      if (v[0] > best[0] || (v[0] === best[0] && branch !== OFF_BRANCH_KEY && best[1] === OFF_BRANCH)) {
        best = v;
      }
    }
    const { tally: _tally, ...rest } = m;
    out.push({ ...rest, color: best[1], branchLabel: best[2] });
  }
  return out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The place masses as circles, sized where they are drawn rather than
 *  here: the radius is a paint expression so it can answer to zoom.
 *
 *  `pics` marks the places the archive has a picture of. The mark has to
 *  clear the disc it belongs to and the disc's size is the count, so the
 *  offset is measured here from the same curve the paint expression uses
 *  at the zoom where the discs are largest. */
export function placeFeatures(masses: PlaceMass[], pics?: Map<string, number>): Feature[] {
  return masses.map((m) => {
    const held = pics?.get(m.key) ?? 0;
    return {
      type: "Feature",
      properties: {
        key: m.key,
        label: m.label,
        count: m.count,
        color: m.color,
        span: m.from <= m.to ? `${m.from}\u2013${m.to}` : "",
        pics: held,
        picOffset: [0, -Math.round(1.5 * (3.4 + 2.1 * Math.sqrt(m.count))) - 9],
      },
      geometry: { type: "Point", coordinates: [m.lon, m.lat] },
    };
  });
}
