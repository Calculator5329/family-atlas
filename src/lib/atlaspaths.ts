/** The atlas's static migration paths.
 *
 *  Ethan's ask, 2026-08-22: "option to show migration paths for a selected
 *  filter set. not like migration (a video) just the lines with directions
 *  and colors". So this is the migration tab's geometry with none of its
 *  time: every move made by the people the atlas is currently showing,
 *  drawn at once, coloured by the line the person belongs to and pointed
 *  the way they went.
 *
 *  The legs come from `legsFor`, which is the same function the journeys
 *  sequence flies, so a line here and a flight there cannot disagree about
 *  where somebody went. That also means the filters above the map do not
 *  cut a journey up: switching burials off changes which dots you see, not
 *  where a person moved. The set of *people* is what the filters choose;
 *  each of them then brings their whole route. */

import type { Feature } from "geojson";
import { arcLine } from "@/lib/camera";
import { legsFor, type Leg } from "@/lib/journeys";
import { arrowName } from "@/lib/atlasglyphs";
import type { EventDot } from "@/lib/atlasevents";

export interface PathLine {
  pid: string;
  name: string;
  color: string;
  colorIndex: number;
  branchLabel: string;
  leg: Leg;
  coords: [number, number][];
}

/** One line per move, for everyone with a surviving dot. */
export function collectPaths(
  dots: EventDot[],
  keep: number[],
  inYear: (leg: Leg) => boolean,
): PathLine[] {
  const seen = new Map<string, EventDot>();
  for (const i of keep) {
    const d = dots[i];
    if (d && !seen.has(d.pid)) seen.set(d.pid, d);
  }

  const out: PathLine[] = [];
  for (const [pid, d] of seen) {
    for (const leg of legsFor(pid)) {
      if (!inYear(leg)) continue;
      out.push({
        pid,
        name: d.name,
        color: d.color,
        colorIndex: d.colorIndex,
        branchLabel: d.branchLabel,
        leg,
        // Coarse enough to draw a thousand of these and fine enough that a
        // crossing of the Atlantic still bends the way the globe does.
        coords: arcLine(leg.a, leg.b, 40),
      });
    }
  }
  // Long moves first, so the ocean crossings are not painted over by the
  // county-to-county hops that share their landfall.
  return out.sort((a, b) => b.leg.miles - a.leg.miles);
}

export function pathFeatures(lines: PathLine[]): Feature[] {
  return lines.map((l, i) => ({
    type: "Feature",
    id: i,
    properties: {
      pid: l.pid,
      name: l.name,
      color: l.color,
      arrow: arrowName(l.colorIndex),
      branchLabel: l.branchLabel,
      from: l.leg.from,
      to: l.leg.to,
      years: `${l.leg.fromYear}–${l.leg.toYear}`,
      miles: Math.round(l.leg.miles),
      precision: l.leg.precision,
      why: `${l.leg.fromEvent} to ${l.leg.toEvent}`,
    },
    geometry: { type: "LineString", coordinates: l.coords },
  }));
}
