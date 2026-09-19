/** The film's camera and timeline.
 *
 *  Ported from the map-stack spike, where this motion model was built and
 *  watched frame by frame before either renderer was chosen. Three things
 *  in here are the difference between a film and a slide transition:
 *
 *  1. Position moves along the great circle, not along a straight line in
 *     screen space, so an Atlantic crossing bends the way a ship's course
 *     bends.
 *  2. Zoom dips through a parabola: the camera pulls back far enough to
 *     see the whole crossing, then pushes in. How far back is a function
 *     of how far it travels, so a 5000km ocean earns a globe shot and a
 *     county hop does not.
 *  3. Pitch is a function of altitude, never of time. Tilting while far
 *     enough out to see the globe just shoves the planet off the frame.
 */

import type { FilmStop } from "@/types";
import { packetFile } from "@/lib/packet";

const D = Math.PI / 180;

export interface Camera {
  lon: number;
  lat: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

export const OPENING: Camera = { lon: -22, lat: 48, zoom: 1.5, bearing: 0, pitch: 0 };

// ---- basemap coverage --------------------------------------------------

interface Extract {
  id: string;
  file: string;
  maxZoom: number;
  bbox: [number, number, number, number];
}

export interface Basemap {
  attribution: string;
  world: { file: string; maxZoom: number };
  fallbackMaxZoom: number;
  extracts: Extract[];
  dem: { dir: string; maxZoom: number };
}

/** The basemap the packet was authored against: which tile extracts it
 *  expects under public/tiles and how far each can zoom. The tiles
 *  themselves are not in the packet (they are hundreds of megabytes and
 *  not the family's); scripts/build_basemap.mjs regenerates them from
 *  this same description. */
export const basemap = packetFile<Basemap>("basemap", {
  attribution: "",
  world: { file: "world.pmtiles", maxZoom: 6 },
  fallbackMaxZoom: 6,
  extracts: [],
  dem: { dir: "dem", maxZoom: 0 },
});

export const ATTRIBUTION = basemap.attribution;
export const WORLD_TILES = basemap.world.file;
export const EXTRACTS = basemap.extracts;

/** The closest zoom the basemap can actually draw at this point. Flying
 *  past it would be flying into a blur, so the camera stops there. */
export function coverageZoom(lon: number, lat: number): number {
  for (const e of basemap.extracts) {
    const [w, s, ep, n] = e.bbox;
    if (lon >= w && lon <= ep && lat >= s && lat <= n) return e.maxZoom;
  }
  return basemap.fallbackMaxZoom;
}

/** Settled camera for a stop, clamped to what the tiles support. Bearing
 *  and pitch are derived rather than authored: the film.json holds the
 *  history, and the composition is this file's job. */
export function cameraFor(stop: FilmStop, index: number): Camera {
  const zoom = Math.min(stop.zoom, coverageZoom(stop.lon, stop.lat));
  return {
    lon: stop.lon,
    lat: stop.lat,
    zoom,
    // Alternating slight bearings keep consecutive stops from looking
    // like the same shot twice; the amount is small enough to read as
    // composition rather than as a spin.
    bearing: zoom > 6 ? (index % 2 === 0 ? -13 : 9) : 0,
    pitch: zoom > 6 ? 42 : zoom > 4 ? 24 : 0,
  };
}

// ---- timeline ----------------------------------------------------------

export interface Segment {
  kind: "fly" | "hold";
  stopIndex: number;
  t0: number;
  t1: number;
}

export interface Timeline {
  segments: Segment[];
  duration: number;
  cameras: Camera[];
}

/** Flight time scales with distance travelled, floored so that even a
 *  short hop is a move rather than a cut. */
function flightSeconds(from: Camera, to: Camera): number {
  const spread = angularDistance([from.lon, from.lat], [to.lon, to.lat]);
  return Math.min(11, Math.max(2.6, 2.2 + spread * 0.14));
}

export function buildTimeline(stops: FilmStop[]): Timeline {
  const cameras = stops.map(cameraFor);
  const segments: Segment[] = [];
  let t = 0;
  stops.forEach((stop, i) => {
    const from = i === 0 ? OPENING : cameras[i - 1];
    const fly = flightSeconds(from, cameras[i]);
    segments.push({ kind: "fly", stopIndex: i, t0: t, t1: t + fly });
    t += fly;
    const hold = Math.max(4, stop.hold);
    segments.push({ kind: "hold", stopIndex: i, t0: t, t1: t + hold });
    t += hold;
  });
  return { segments, duration: t, cameras };
}

export function segmentAt(segments: Segment[], t: number): { seg: Segment; u: number } {
  const last = segments[segments.length - 1];
  if (t >= last.t1) return { seg: last, u: 1 };
  const seg = segments.find((s) => t >= s.t0 && t < s.t1) ?? segments[0];
  return { seg, u: (t - seg.t0) / (seg.t1 - seg.t0) };
}

/** Time at which a stop's caption is up, for the scrubber and for the
 *  ?stop= deep link.
 *
 *  Not the first instant of the hold: the caption fades in over the first
 *  0.7 seconds, and a jump that lands there leaves whoever followed the
 *  link staring at a map with the words still at zero opacity, with no
 *  clock running to bring them up. */
export function seekTo(segments: Segment[], stopIndex: number): number {
  const hold = segments.find((s) => s.kind === "hold" && s.stopIndex === stopIndex);
  return hold ? hold.t0 + Math.min(1, (hold.t1 - hold.t0) * 0.25) : 0;
}

// ---- easing ------------------------------------------------------------

export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Quintic in, cubic out. Deceleration is the half the eye reads as
 *  expensive, so it gets the longer part of the curve. */
export function ease(t: number): number {
  return t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function captionOpacity(u: number, holdSeconds: number): number {
  const inAt = 0.7 / holdSeconds;
  const outAt = 1.1 / holdSeconds;
  if (u < inAt) return easeInOutSine(u / inAt);
  if (u > 1 - outAt) return easeInOutSine((1 - u) / outAt);
  return 1;
}

// ---- spherical geometry ------------------------------------------------

export function greatCircle(
  a: [number, number],
  b: [number, number],
  f: number,
): [number, number] {
  const [lo1, la1] = [a[0] * D, a[1] * D];
  const [lo2, la2] = [b[0] * D, b[1] * D];
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((la2 - la1) / 2) ** 2 +
          Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2,
      ),
    );
  if (d === 0) return [a[0], a[1]];
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);
  return [Math.atan2(y, x) / D, Math.atan2(z, Math.hypot(x, y)) / D];
}

export function arcLine(a: [number, number], b: [number, number], n = 192): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => greatCircle(a, b, i / n));
}

export function angularDistance(a: [number, number], b: [number, number]): number {
  const [lo1, la1] = [a[0] * D, a[1] * D];
  const [lo2, la2] = [b[0] * D, b[1] * D];
  return (
    (2 *
      Math.asin(
        Math.sqrt(
          Math.sin((la2 - la1) / 2) ** 2 +
            Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2,
        ),
      )) /
    D
  );
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpAngle(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

/** Parabola dipping to `pull` at the midpoint, meeting z0 and z1 at the ends. */
export function zoomCurve(z0: number, z1: number, pull: number, u: number): number {
  const base = z0 + (z1 - z0) * u;
  const dip = Math.sin(Math.PI * u) ** 1.15;
  return base - (base - pull) * dip;
}

/** 0 at globe scale, full tilt once the camera is down at regional zoom. */
export function tiltForZoom(z: number, target: number): number {
  const k = Math.max(0, Math.min(1, (z - 4.2) / 3.2));
  return target * ease(k);
}

/** The camera at time t. */
export function cameraAt(
  timeline: Timeline,
  t: number,
): { cam: Camera; seg: Segment; u: number; progress: number } {
  const { seg, u } = segmentAt(timeline.segments, t);
  const target = timeline.cameras[seg.stopIndex];
  const progress = seg.kind === "fly" ? ease(u) : 1;

  if (seg.kind === "hold") {
    // A frame that is dead still reads as a screenshot. This is a drift,
    // not a movement: at most a twentieth of a zoom level.
    const drift = Math.sin(u * Math.PI) * 0.055;
    return {
      cam: {
        ...target,
        zoom: target.zoom + drift * 1.5,
        bearing: target.bearing + drift * 5,
      },
      seg,
      u,
      progress,
    };
  }

  const prev = seg.stopIndex > 0 ? timeline.cameras[seg.stopIndex - 1] : OPENING;
  const from: [number, number] = [prev.lon, prev.lat];
  const to: [number, number] = [target.lon, target.lat];
  const [lon, lat] = greatCircle(from, to, progress);

  const spread = angularDistance(from, to);
  const pull = spread > 25 ? 1.35 : spread > 6 ? 3.4 : Math.min(prev.zoom, target.zoom) - 1.4;
  const zoom = zoomCurve(prev.zoom, target.zoom, pull, u);

  return {
    cam: {
      lon,
      lat,
      zoom,
      // Bearing settles ahead of position: the camera arrives, then
      // composes the shot rather than still turning under the caption.
      bearing: lerpAngle(prev.bearing, target.bearing, ease(Math.min(1, u * 1.25))),
      pitch: tiltForZoom(zoom, target.pitch),
    },
    seg,
    u,
    progress,
  };
}
