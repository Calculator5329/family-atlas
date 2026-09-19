/** The atlas: where everything happened.
 *
 *  Ethan's ruling, 2026-08-21: the migration lines belong in the migration
 *  tab, and the atlas should be "the map that shows icons for different
 *  things... born and died, sort different types of events, sort different
 *  family lines. Just a really great visual interface for that."
 *
 *  So there is no movement here and nothing to press play on. There are
 *  three ways to cut the pile down — kind of event, family line, year —
 *  and a list beside the map that holds exactly what the map is holding.
 *
 *  The map answers at two scales, because one pile of a thousand identical
 *  glyphs is not a picture of anything (Ethan, 2026-08-22: "it could be
 *  improved to better showcase the data it is showing"). Zoomed out, one
 *  circle per place, sized by how much of this family's record happened
 *  there: Hingham is a disc and Nauvoo is a dot, which is the true shape
 *  of the archive. Zoomed in past a country, the circles give way to the
 *  events themselves, each one shaped by what happened and coloured by the
 *  line it belongs to, fanned into a ring in screen pixels so a hundred
 *  baptisms in one parish stay legible without any of them being drawn
 *  somewhere they did not happen.
 *
 *  The year scrubber has two meanings. Off, the year is a high-water mark
 *  and the map accumulates — good for "how far had they got by 1800". On,
 *  the year is a moving present twenty-five years wide, roughly a
 *  generation. The strip above it is the record's own distribution, so the
 *  scrubber is set against the years that actually hold anything. */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LngLatBounds,
  Map as MLMap,
  addProtocol,
  removeProtocol,
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
} from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildStyle } from "@/lib/mapstyle";
import { ATTRIBUTION, angularDistance } from "@/lib/camera";
import { branches, useAnchor } from "@/lib/kinship";
import type { Leg } from "@/lib/journeys";
import { collectPaths, pathFeatures } from "@/lib/atlaspaths";
import { legsFor } from "@/lib/journeys";
import {
  TIER_LABEL,
  collectPictures,
  groupByDoc,
  picturesByPlace,
  type AtlasPicture,
  type PictureDoc,
  type PictureTier,
} from "@/lib/atlaspictures";
import { collectLines, lineRows, type LinePerson } from "@/lib/atlaslines";
import { KIND_LABEL, archiveUrl, type ArchiveImage } from "@/lib/archive";
import { Lightbox } from "@/components/Lightbox";
import {
  ICON_OFFSET,
  collectDots,
  collectPlaces,
  placeFeatures,
  toFeatures,
  OFF_BRANCH,
  OFF_BRANCH_KEY,
  OFF_BRANCH_NAME,
  type EventDot,
} from "@/lib/atlasevents";
import {
  EVENT_SHAPES,
  GLYPH_PX,
  arrowImage,
  arrowName,
  glyphImage,
  glyphName,
  glyphUrl,
  type EventShape,
} from "@/lib/atlasglyphs";

/** Beside it, two answers the map cannot draw. The archive comes first:
 *  every picture the current filter set can honestly show, in the order
 *  Ethan asked for on 2026-08-22 — the family's own faces and places, then
 *  what was reconstructed from records, then the evidence and the maps,
 *  then newspapers, and the paperwork last. What a picture is allowed to
 *  claim, and what it is a picture *of*, both live in
 *  `lib/atlaspictures.ts`.
 *
 *  Second, and experimental, the ancestral lines: the same records folded
 *  back into people, and each person into the great-grandparent's line
 *  they descend through. Picking one draws their whole recorded route and
 *  frames it, which is the migration paths switch narrowed to one life.
 *
 *  What used to sit here — a list of events and a list of places — is gone
 *  by the same ruling. Both were the map read back out in rows.
 *
 *  The migration paths are still a switch rather than a film: every move
 *  made by the people still on the map, drawn at once, coloured by line
 *  and pointed the way they went. */

/** The legend's copy of a map glyph, drawn by the same code. */
function ShapeKey({ shape }: { shape: EventShape }) {
  return (
    <img className="atlas__glyph" src={glyphUrl(shape)} alt="" width={GLYPH_PX} height={GLYPH_PX} />
  );
}

/** How wide the moving window is when it is switched on. Twenty-five years
 *  is about a generation, which is the unit the eye is already looking for
 *  on a map of a family. */
const WINDOW = 25;

/** Where the map stops answering "where did this family live" and starts
 *  answering "what happened here". About the zoom at which one country
 *  fills the frame. */
const SPLIT = 5.2;

/** One list row, in pixels. The list only builds the rows you can see, so
 *  this number has to match the CSS or the scrollbar lies. */
const ROW_H = 46;

/** Pictures arrive in readable shelves rather than one enormous DOM wall.
 *  The next shelf is appended before the reader reaches the end, so this
 *  changes rendering cost without turning the archive into pagination. */
const PICTURE_BATCH = 48;

/** Two questions, after Ethan's cut of 2026-08-22: "Remove Places Remove
 *  Events. Pictures for now then new expiremental tab that is ancestral
 *  lines (people Kinda)". Both lists that went were re-readings of the
 *  map — a row per dot and a row per circle, saying again what the map had
 *  already said in the place it belongs. What the map cannot draw is a
 *  picture and a person, so those are what the panel holds. */
type Tab = "pictures" | "lines";

const EMPTY = { type: "FeatureCollection" as const, features: [] };

/** "your 6th great-grandmother" reads as a sentence when it opens a row. */
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Only the rows in view are built. At 1,100 events the old list rendered
 *  four hundred rows, each with its own rasterised glyph, and rebuilt all
 *  of them whenever anything on the page changed. */
function useVisibleRows(count: number, rowH: number) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [range, setRange] = useState({ start: 0, end: 30 });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const first = Math.floor(el.scrollTop / rowH);
    const fits = Math.ceil(el.clientHeight / rowH);
    setRange({
      start: Math.max(0, Math.min(count, first - 5)),
      end: Math.min(count, first + fits + 10),
    });
  }, [count, rowH]);

  const onScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      measure();
    });
  }, [measure]);

  useEffect(() => {
    measure();
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [measure]);

  return { ref, range, measure, onScroll };
}

export default function AtlasPage() {
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const anchor = useAnchor();
  const branchList = useMemo(() => branches(anchor), [anchor]);
  const dots = useMemo(() => collectDots(anchor), [anchor]);
  const features = useMemo(() => toFeatures(dots), [dots]);
  // Undated dots carry -1, which is not a year; the scrubber's range comes
  // from the records that actually have one.
  const years = useMemo(() => {
    const ys = dots.filter((d) => d.dated).map((d) => d.year);
    return { min: Math.min(...ys), max: Math.max(...ys) };
  }, [dots]);

  const [ready, setReady] = useState(false);
  const [upTo, setUpTo] = useState(9999);
  const [windowed, setWindowed] = useState(false);
  const [offKinds, setOffKinds] = useState<Set<string>>(new Set());
  const [offLines, setOffLines] = useState<Set<string>>(new Set());
  const [place, setPlace] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("pictures");
  const [paths, setPaths] = useState(false);
  const [scoped, setScoped] = useState(true);
  /** What the camera is looking at, sampled when it stops. The lists read
   *  the map through this, so panning is a filter. */
  const [view, setView] = useState<{ z: number; lon: number; lat: number; b: number; p: number } | null>(
    null,
  );
  const [openPic, setOpenPic] = useState<ArchiveImage | null>(null);
  /** Which multi-page documents have been opened out. */
  const [openDocs, setOpenDocs] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  /** The person picked in the lines tab. Their whole route is drawn even
   *  with the paths switch off, because picking a person in a list of
   *  people is asking where they went. */
  const [linePid, setLinePid] = useState<string | null>(null);

  /** Is this point on the screen? Three tests, because one is not enough
   *  on a globe. MapLibre's `project` wraps a point on the far side of the
   *  world back into the middle of the viewport — Sydney, from a camera
   *  over England, lands at x=1076 — so the projection alone would put
   *  Australia in a list of what you can see. The great-circle distance
   *  from the centre throws out the hemisphere you are not looking at, the
   *  bounds throw out the rest of the world, and the projection decides the
   *  edges. It is measured once per camera move rather than once per dot.
   *
   *  The pad is a glyph and a half: an event whose dot is half over the
   *  edge is still an event you can see, and a list that drops it while its
   *  glyph is on screen is a list that disagrees with the map. */
  const onScreen = useMemo(() => {
    const map = mapRef.current;
    if (!map || !view) return () => true;
    const bounds = map.getBounds();
    const middle = map.getCenter();
    const canvas = map.getCanvas();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    // A canvas with no size is a canvas that has not been laid out yet, not
    // a map showing nothing.
    if (!w || !h) return () => true;
    const pad = 34;
    return (d: { lon: number; lat: number }) => {
      if (angularDistance([middle.lng, middle.lat], [d.lon, d.lat]) > 88) return false;
      if (!bounds.contains([d.lon, d.lat])) return false;
      const at = map.project([d.lon, d.lat]);
      return at.x >= -pad && at.y >= -pad && at.x <= w + pad && at.y <= h + pad;
    };
  }, [view]);

  // "All years" means all of them, so the window steps aside rather than
  // showing the last 25 years of a range that has no end.
  const span = windowed && upTo !== 9999 ? WINDOW : null;

  /** Every filter except the year and the place, which the strip below the
   *  map and the place list respectively need to see past: a histogram
   *  drawn only of the years already chosen would be a picture of the
   *  chooser, not of the record. */
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    const keep: number[] = [];
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      if (offKinds.has(d.shape) || offLines.has(d.branch)) continue;
      if (
        q &&
        !d.name.toLowerCase().includes(q) &&
        !d.place.toLowerCase().includes(q) &&
        !d.label.toLowerCase().includes(q)
      )
        continue;
      keep.push(i);
    }
    return keep;
  }, [dots, offKinds, offLines, query]);

  // An undated record has a place and no year, so it belongs to every year
  // and to none. It shows while the scrubber is off, and steps aside the
  // moment the year means something — with the count said out loud in the
  // head, because a record that vanishes silently reads as a record that
  // does not exist.
  const inYear = useCallback(
    (d: EventDot) =>
      upTo === 9999 ? true : d.dated && d.year <= upTo && (!span || d.year > upTo - span),
    [upTo, span],
  );

  /** What survives every filter. The map and the list read this one array,
   *  so a dot on the map and a row in the list cannot disagree. */
  const keep = useMemo(
    () => base.filter((i) => inYear(dots[i]) && (!place || dots[i].placeId === place)),
    [base, dots, inYear, place],
  );

  /** The place circles keep every place the filters allow, whichever one
   *  is picked: narrowing to Hingham should not empty the rest of the map,
   *  it should leave the picked place lit inside it. */
  const masses = useMemo(
    () => collectPlaces(dots, base.filter((i) => inYear(dots[i]))),
    [dots, base, inYear],
  );

  /** Everyone still on the map, by name: what a picture tagged to a person
   *  is checked against. */
  const who = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of keep) m.set(dots[i].pid, dots[i].name);
    return m;
  }, [keep, dots]);

  /** Pinned against every place the filters allow, so panning cannot
   *  re-pin a picture to a coarser place than the one it names. */
  const allPictures = useMemo(() => collectPictures(masses, who), [masses, who]);
  const picsByPlace = useMemo(() => picturesByPlace(allPictures), [allPictures]);

  /** A move shows once it has been made. With the window on, once it is
   *  being made: a family that sailed in 1635 is not still sailing in 1720,
   *  and a map that says so is drawing a claim nobody made. */
  const legInYear = useCallback(
    (l: Leg) =>
      upTo === 9999
        ? true
        : span
          ? l.toYear > upTo - span && l.fromYear <= upTo
          : l.toYear <= upTo,
    [upTo, span],
  );

  const pathLines = useMemo(() => {
    if (paths) return collectPaths(dots, keep, legInYear);
    if (linePid) return collectPaths(dots, keep.filter((i) => dots[i].pid === linePid), legInYear);
    return [];
  }, [paths, linePid, dots, keep, legInYear]);

  /** And then the view, which is a filter like any other (Ethan,
   *  2026-08-22: the panel "should be specific to the current view
   *  including map on screen or selected lines and what happened stuff").
   *
   *  It is applied here and not above, so the map still draws everything
   *  the filters allow. A map that drew only what the last camera position
   *  had already agreed to would have nothing to pan into: the dots would
   *  arrive a beat after you let go. The map holds the record; the panel
   *  answers what you are looking at. */
  const inView = useMemo(
    () => (scoped ? keep.filter((i) => onScreen(dots[i])) : keep),
    [scoped, keep, onScreen, dots],
  );
  const offscreen = keep.length - inView.length;
  const massesInView = useMemo(
    () => (scoped ? masses.filter(onScreen) : masses),
    [scoped, masses, onScreen],
  );
  const baseInView = useMemo(
    () => (scoped ? base.filter((i) => onScreen(dots[i])) : base),
    [scoped, base, onScreen, dots],
  );

  /** A picture is in view when the place it is pinned to is, or when one of
   *  the people it is tagged to still has an event on the screen. */
  const pictures = useMemo(() => {
    if (!scoped) return allPictures;
    const places = new Set(massesInView.map((m) => m.key));
    const pids = new Set(inView.map((i) => dots[i].pid));
    return allPictures.filter(
      (p) =>
        (p.placeKey && places.has(p.placeKey)) || p.who.some((w) => pids.has(w.pid)),
    );
  }, [scoped, allPictures, massesInView, inView, dots]);

  /** The same records, folded into the people they belong to and the
   *  lines those people descend through. */
  const lineGroups = useMemo(() => collectLines(dots, inView, anchor), [dots, inView, anchor]);
  const lineList = useMemo(() => lineRows(lineGroups), [lineGroups]);
  const peopleCount = lineGroups.reduce((n, g) => n + g.people.length, 0);

  /** Facet counts answer "how many would I get", so each one is measured
   *  against every filter except its own. A count that ignored the year
   *  would offer you two hundred burials and then show you four. */
  const kindCounts = useMemo(() => {
    const c = new Map<string, number>();
    const q = query.trim().toLowerCase();
    for (const d of dots) {
      if (!inYear(d) || offLines.has(d.branch) || (place && d.placeId !== place)) continue;
      if (scoped && !onScreen(d)) continue;
      if (
        q &&
        !d.name.toLowerCase().includes(q) &&
        !d.place.toLowerCase().includes(q) &&
        !d.label.toLowerCase().includes(q)
      )
        continue;
      c.set(d.shape, (c.get(d.shape) ?? 0) + 1);
    }
    return c;
  }, [dots, inYear, offLines, place, query, scoped, onScreen]);

  const lineCounts = useMemo(() => {
    const c = new Map<string, number>();
    const q = query.trim().toLowerCase();
    for (const d of dots) {
      if (!inYear(d) || offKinds.has(d.shape) || (place && d.placeId !== place)) continue;
      if (scoped && !onScreen(d)) continue;
      if (
        q &&
        !d.name.toLowerCase().includes(q) &&
        !d.place.toLowerCase().includes(q) &&
        !d.label.toLowerCase().includes(q)
      )
        continue;
      c.set(d.branch, (c.get(d.branch) ?? 0) + 1);
    }
    return c;
  }, [dots, inYear, offKinds, place, query, scoped, onScreen]);

  /** The record's own shape in time: how many events fall in each decade,
   *  measured before the year filter so the strip stays still while the
   *  scrubber moves across it. */
  const histogram = useMemo(() => {
    const from = Math.floor(years.min / 10) * 10;
    const to = Math.ceil((years.max + 1) / 10) * 10;
    const buckets = new Array<number>((to - from) / 10).fill(0);
    for (const i of baseInView) {
      const d = dots[i];
      if (!d.dated) continue;
      buckets[Math.floor((d.year - from) / 10)] += 1;
    }
    return { from, to, buckets, peak: Math.max(1, ...buckets) };
  }, [baseInView, dots, years]);

  const toggle = (set: (fn: (prev: Set<string>) => Set<string>) => void, key: string) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // ---- the tooltip, kept out of React ------------------------------------
  //
  // It used to be state, so every mouse move over the map re-rendered the
  // whole page — four hundred list rows and their glyphs, 383ms of canvas
  // rasterising a frame. Nothing else on the page depends on where the
  // pointer is, so nothing else needs to hear about it.
  const showTip = useCallback((x: number, y: number, title: string, rows: string[]) => {
    const el = tipRef.current;
    if (!el) return;
    el.replaceChildren(
      Object.assign(document.createElement("b"), { textContent: title }),
      ...rows.filter(Boolean).map((row) => {
        const span = document.createElement("span");
        span.className = "dim";
        span.textContent = row;
        return span;
      }),
    );
    el.style.display = "grid";
    el.style.left = `${x + 14}px`;
    el.style.top = `${y + 10}px`;
  }, []);

  const hideTip = useCallback(() => {
    if (tipRef.current) tipRef.current.style.display = "none";
  }, []);

  useEffect(() => {
    if (!container.current) return;
    const protocol = new Protocol();
    addProtocol("pmtiles", protocol.tile);

    const map = new MLMap({
      container: container.current,
      style: buildStyle(),
      center: [-42, 38],
      zoom: 1.6,
      attributionControl: false,
      fadeDuration: 0,
    });
    mapRef.current = map;

    map.on("load", () => {
      // One image per shape and branch colour, plus the off-branch grey.
      const palette = [...branchList.map((b) => b.color), OFF_BRANCH];
      palette.forEach((color, i) => {
        for (const { shape } of EVENT_SHAPES) {
          const name = glyphName(shape, i);
          if (!map.hasImage(name)) {
            map.addImage(name, glyphImage(shape, color), { pixelRatio: 2 });
          }
        }
        if (!map.hasImage(arrowName(i))) {
          map.addImage(arrowName(i), arrowImage(color), { pixelRatio: 2 });
        }
      });

      // The paths go on first so they run under the places and the events
      // rather than over the top of the discs they connect.
      map.addSource("atlas-paths", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "atlas-paths-glow",
        type: "line",
        source: "atlas-paths",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 4, "line-opacity": 0.13 },
      });
      map.addLayer({
        id: "atlas-paths",
        type: "line",
        source: "atlas-paths",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 1.2, 1, 6, 1.9],
          "line-opacity": 0.82,
        },
      });
      map.addLayer({
        id: "atlas-paths-arrow",
        type: "symbol",
        source: "atlas-paths",
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 120,
          "icon-image": ["get", "arrow"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 1.2, 0.5, 6, 0.85],
        },
        paint: { "icon-opacity": 0.95 },
      });

      map.addSource("atlas-places", { type: "geojson", data: EMPTY });
      map.addSource("atlas-events", { type: "geojson", data: EMPTY });

      // Area, not radius, carries the count: a place with four times the
      // events should look four times the size, and a linear radius makes
      // it look sixteen. The zoom interpolation has to be the outermost
      // expression — a "zoom" reference anywhere else is rejected by the
      // style spec, and a rejected layer takes the whole map down with it —
      // so the disc is measured once per stop rather than scaled after.
      const disc = (k: number, pad = 0): ExpressionSpecification => [
        "+",
        pad,
        ["*", k, ["+", 3.4, ["*", 2.1, ["sqrt", ["get", "count"]]]]],
      ];
      const discSize = (pad = 0): ExpressionSpecification => [
        "interpolate",
        ["linear"],
        ["zoom"],
        1.2,
        disc(0.8, pad),
        SPLIT,
        disc(1.5, pad),
      ];

      map.addLayer({
        id: "atlas-places",
        type: "circle",
        source: "atlas-places",
        maxzoom: SPLIT,
        paint: {
          "circle-radius": discSize(),
          "circle-color": ["get", "color"],
          "circle-opacity": 0.62,
          "circle-stroke-color": "#06090b",
          "circle-stroke-width": 1,
          "circle-stroke-opacity": 0.7,
        },
      });
      map.addLayer({
        id: "atlas-places-pick",
        type: "circle",
        source: "atlas-places",
        maxzoom: SPLIT,
        filter: ["==", ["get", "key"], " "],
        paint: {
          "circle-radius": discSize(5),
          "circle-color": "transparent",
          "circle-stroke-color": "#ece7dd",
          "circle-stroke-width": 1.4,
        },
      });
      map.addLayer({
        id: "atlas-places-count",
        type: "symbol",
        source: "atlas-places",
        maxzoom: SPLIT,
        filter: [">=", ["get", "count"], 4],
        layout: {
          "text-field": ["to-string", ["get", "count"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 1.2, 9.5, SPLIT, 12],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#F2EEE6",
          "text-halo-color": "#06090b",
          "text-halo-width": 1.1,
        },
      });

      // A place the archive has a picture of, marked above its disc. The
      // offset is carried per feature because the disc's size is its count.
      const pic = document.createElement("canvas");
      pic.width = 26;
      pic.height = 26;
      const pcx = pic.getContext("2d")!;
      pcx.fillStyle = "#0a0e11";
      pcx.strokeStyle = "#ece7dd";
      pcx.lineWidth = 2;
      pcx.beginPath();
      pcx.roundRect(4, 6, 18, 15, 2.5);
      pcx.fill();
      pcx.stroke();
      pcx.beginPath();
      pcx.arc(13, 13.5, 3.6, 0, Math.PI * 2);
      pcx.stroke();
      map.addImage("atlas-pic", pcx.getImageData(0, 0, 26, 26), { pixelRatio: 2 });

      map.addLayer({
        id: "atlas-places-pic",
        type: "symbol",
        source: "atlas-places",
        maxzoom: SPLIT,
        filter: [">", ["get", "pics"], 0],
        layout: {
          "icon-image": "atlas-pic",
          "icon-offset": ["array", "number", 2, ["get", "picOffset"]] as unknown as ExpressionSpecification,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 1.2, 0.5, SPLIT, 0.75],
        },
      });

      // The halo goes on before the glyphs so it sits under the one it is
      // marking.
      map.addLayer({
        id: "atlas-pick",
        type: "symbol",
        source: "atlas-events",
        minzoom: SPLIT,
        filter: ["==", ["get", "idx"], -1],
        layout: {
          "icon-image": "atlas-halo",
          "icon-offset": ICON_OFFSET as unknown as ExpressionSpecification,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], SPLIT, 0.9, 9, 1.2],
        },
      });
      map.addLayer({
        id: "atlas-dots",
        type: "symbol",
        source: "atlas-events",
        minzoom: SPLIT,
        layout: {
          "icon-image": ["get", "icon"],
          "icon-offset": ICON_OFFSET as unknown as ExpressionSpecification,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], SPLIT, 0.85, 9, 1.15],
        },
        paint: { "icon-opacity": 0.92 },
      });

      // The pick ring is an image rather than a circle layer because the
      // ring has to sit where the glyph sits, and only an icon can take
      // the same pixel offset.
      const ring = document.createElement("canvas");
      ring.width = 44;
      ring.height = 44;
      const rc = ring.getContext("2d")!;
      rc.beginPath();
      rc.arc(22, 22, 17, 0, Math.PI * 2);
      rc.strokeStyle = "#ece7dd";
      rc.lineWidth = 3;
      rc.stroke();
      map.addImage("atlas-halo", rc.getImageData(0, 0, 44, 44), { pixelRatio: 2 });

      map.on("mousemove", "atlas-dots", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        map.getCanvas().style.cursor = "pointer";
        const p = f.properties as Record<string, string | number>;
        showTip(e.point.x, e.point.y, String(p.name), [
          `${p.label}${p.dated ? ` · ${p.year}` : ""}`,
          String(p.place),
          String(p.branchLabel),
        ]);
      });
      map.on("mouseleave", "atlas-dots", () => {
        map.getCanvas().style.cursor = "";
        hideTip();
      });
      map.on("click", "atlas-dots", (e) => {
        const p = e.features?.[0]?.properties;
        if (p?.idx !== undefined) setSelected(Number(p.idx));
      });

      map.on("mousemove", "atlas-places", (e) => {
        const p = e.features?.[0]?.properties as Record<string, string | number> | undefined;
        if (!p) return;
        map.getCanvas().style.cursor = "pointer";
        showTip(e.point.x, e.point.y, String(p.label), [
          `${p.count} ${Number(p.count) === 1 ? "record" : "records"}`,
          String(p.span ?? ""),
          "Click to open this place",
        ]);
      });
      map.on("mouseleave", "atlas-places", () => {
        map.getCanvas().style.cursor = "";
        hideTip();
      });
      map.on("mousemove", "atlas-places-pic", (e) => {
        const p = e.features?.[0]?.properties as Record<string, string | number> | undefined;
        if (!p) return;
        map.getCanvas().style.cursor = "pointer";
        showTip(e.point.x, e.point.y, String(p.label), [
          `${p.pics} ${Number(p.pics) === 1 ? "picture" : "pictures"} in the archive`,
          "Click to see them",
        ]);
      });
      map.on("mouseleave", "atlas-places-pic", () => {
        map.getCanvas().style.cursor = "";
        hideTip();
      });
      map.on("click", "atlas-places-pic", (e) => {
        const p = e.features?.[0]?.properties;
        if (!p) return;
        hideTip();
        setPlace(String(p.key));
        setTab("pictures");
      });

      map.on("mousemove", "atlas-paths", (e) => {
        const p = e.features?.[0]?.properties as Record<string, string | number> | undefined;
        if (!p) return;
        map.getCanvas().style.cursor = "pointer";
        showTip(e.point.x, e.point.y, String(p.name), [
          `${p.from} → ${p.to}`,
          `${p.years} · ${Number(p.miles).toLocaleString()} miles`,
          `${p.why}${p.precision === "region" ? " · both ends are regions, not addresses" : ""}`,
        ]);
      });
      map.on("mouseleave", "atlas-paths", () => {
        map.getCanvas().style.cursor = "";
        hideTip();
      });

      map.on("click", "atlas-places", (e) => {
        const p = e.features?.[0]?.properties;
        if (!p) return;
        hideTip();
        setPlace(String(p.key));
        // Whichever tab is open answers for the place: the pictures of it,
        // or the people who were there. Being thrown to the other one is a
        // surprise, so the click narrows and nothing moves.
        map.easeTo({ center: e.lngLat, zoom: Math.max(map.getZoom(), SPLIT + 1), duration: 900 });
      });

      // The dev build hands the map out so a browser session can ask it
      // where things are without a screenshot.
      if (import.meta.env.DEV) {
        (window as unknown as { __atlasMap?: MLMap }).__atlasMap = map;
      }

      const sample = () =>
        setView({
          z: map.getZoom(),
          lon: map.getCenter().lng,
          lat: map.getCenter().lat,
          b: map.getBearing(),
          p: map.getPitch(),
        });
      map.on("moveend", sample);
      // A window that got wider is showing more of the world, and the panel
      // has to hear about it: resizing fires no move.
      map.on("resize", sample);
      sample();

      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      removeProtocol("pmtiles");
    };
    // The map is built once; everything after is data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The filters are answered in JavaScript over eleven hundred records and
   *  the answer is handed to the map as data. The first version asked the
   *  style instead, and a search meant a filter expression carrying a
   *  literal list of every surviving index, re-evaluated per feature per
   *  frame. */
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const kept = new Set(keep);
    (map.getSource("atlas-events") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: features.filter((f) => kept.has(Number(f.properties?.idx))),
    });
  }, [ready, keep, features]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("atlas-places") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: placeFeatures(masses, picsByPlace),
    });
  }, [ready, masses, picsByPlace]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("atlas-paths") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: pathFeatures(pathLines),
    });
  }, [ready, pathLines]);

  // Picking a row or a dot: ring it, and fly close enough that the glyphs
  // are the layer being drawn — unless the caller has already framed
  // something wider. Picking a person frames their whole route, and a
  // second camera move to one end of it would undo that.
  const flyToSelected = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter("atlas-pick", ["==", ["get", "idx"], selected ?? -1] as FilterSpecification);
    if (selected === null) return;
    if (!flyToSelected.current) {
      flyToSelected.current = true;
      return;
    }
    const d = dots[selected];
    if (!d) return;
    map.easeTo({ center: [d.lon, d.lat], zoom: Math.max(map.getZoom(), SPLIT + 1), duration: 900 });
  }, [ready, selected, dots]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter("atlas-places-pick", [
      "==",
      ["get", "key"],
      place ?? " ",
    ] as FilterSpecification);
  }, [ready, place]);

  const rows = tab === "lines" ? lineList.length : 0;
  const list = useVisibleRows(rows, ROW_H);
  const { measure: measureRows } = list;
  const pictureSentinel = useRef<HTMLDivElement>(null);
  const [pictureLimit, setPictureLimit] = useState(PICTURE_BATCH);
  // A new answer starts at the top of it.
  useEffect(() => {
    if (list.ref.current) list.ref.current.scrollTop = 0;
    if (tab === "lines") measureRows();
    else setPictureLimit(PICTURE_BATCH);
  }, [lineList, pictures, tab, list.ref, measureRows]);

  useEffect(() => {
    if (tab !== "pictures" || pictureLimit >= pictures.length) return;
    const target = pictureSentinel.current;
    const root = list.ref.current;
    if (!target || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setPictureLimit((n) => Math.min(pictures.length, n + PICTURE_BATCH));
        }
      },
      { root, rootMargin: "480px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [pictureLimit, pictures.length, tab, list.ref]);

  const undated = dots.filter((d) => !d.dated).length;
  const undatedShown = inView.reduce((n, i) => n + (dots[i].dated ? 0 : 1), 0);
  const placeName = place ? (masses.find((m) => m.key === place)?.label ?? "this place") : null;

  // Picking an event or a place lifts its pictures to the top of the tab:
  // a picture is worth most beside the thing it is of, and worth least in
  // a wall of a hundred and sixty.
  const focusDot = selected !== null ? dots[selected] : undefined;
  const focusPlace = place ?? focusDot?.placeId ?? null;
  const focusPid = focusDot?.pid ?? null;
  const focusLabel = place ? placeName : (focusDot?.name ?? null);
  const isNear = (p: AtlasPicture) =>
    Boolean(
      (focusPlace && p.placeKey === focusPlace) ||
        (focusPid && p.who.some((w) => w.pid === focusPid)),
    );
  const nearPics = focusPlace || focusPid ? pictures.filter(isNear) : [];
  const restPics = nearPics.length ? pictures.filter((p) => !isNear(p)) : pictures;
  const visibleNearPics = nearPics.slice(0, pictureLimit);
  const visibleRestPics = restPics.slice(0, Math.max(0, pictureLimit - visibleNearPics.length));
  const visiblePictureCount = visibleNearPics.length + visibleRestPics.length;

  /** And the rest in Ethan's order (2026-08-22): the family's own faces and
   *  places, then what was reconstructed from records, then the evidence
   *  and the maps, then newspapers, and the paperwork last. `pictures` is
   *  already sorted that way, so grouping in encounter order keeps it. */
  const picSections: [PictureTier, AtlasPicture[]][] = [];
  for (const p of visibleRestPics) {
    const last = picSections[picSections.length - 1];
    if (last && last[0] === p.tier) last[1].push(p);
    else picSections.push([p.tier, [p]]);
  }

  /** Picking a person draws their route and frames it. A camera on one
   *  end of a crossing is a camera showing half the answer, so anyone with
   *  a recorded move gets their whole route in frame; anyone without one
   *  falls through to the ordinary fly-to-the-dot. */
  const pickPerson = (p: LinePerson) => {
    const next = linePid === p.pid ? null : p.pid;
    const map = mapRef.current;
    const legs = next ? legsFor(p.pid) : [];
    if (map && legs.length) {
      const box = new LngLatBounds();
      for (const l of legs) {
        box.extend(l.a);
        box.extend(l.b);
      }
      flyToSelected.current = false;
      map.fitBounds(box, {
        padding: { top: 70, bottom: 170, left: 380, right: 380 },
        maxZoom: 7,
        duration: 1000,
      });
    }
    setLinePid(next);
    setSelected(p.first);
  };

  const showPicture = (p: AtlasPicture) => {
    if (!p.placeKey) {
      setOpenPic(p.img);
      return;
    }
    setPlace(p.placeKey);
    mapRef.current?.easeTo({ center: [p.lon, p.lat], zoom: Math.max(mapRef.current.getZoom(), 4.4), duration: 900 });
  };

  const toggleDoc = (key: string) =>
    setOpenDocs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** One tile per document rather than per photograph. Ethan, 2026-08-22:
   *  "too many pictures of long cursive text on top". Eight of those were
   *  eight leaves of one court martial, and four more were the two pages
   *  and two crops of a single letter. A document stands as its first page
   *  with the rest folded behind a count, because twelve tiles of the same
   *  handwriting is not twelve things to look at. */
  const picDocs = (docs: PictureDoc[]) =>
    docs.flatMap((d) =>
      openDocs.has(d.key)
        ? [picTile(d.cover, d), ...d.pages.slice(1).map((p) => picTile(p))]
        : [picTile(d.cover, d)],
    );

  const picTile = (p: AtlasPicture, doc?: PictureDoc) => (
    <figure className="atlas__pic" key={p.img.file}>
      <button
        type="button"
        className="atlas__picgo"
        title={
          p.placeKey
            ? `${p.img.caption}\n\nGo to ${p.placeLabel}`
            : `${p.img.caption}\n\nNo place on this map to go to`
        }
        onClick={() => showPicture(p)}
      >
        <img src={p.url} alt={p.img.caption} loading="lazy" decoding="async" />
      </button>
      <button
        type="button"
        className="atlas__picopen"
        title="See it full size, with where it came from"
        onClick={() => setOpenPic(p.img)}
      >
        ⤢
      </button>
      {doc && doc.pages.length > 1 && (
        <button
          type="button"
          className="atlas__picmore"
          title={
            openDocs.has(doc.key)
              ? "Fold the rest of this document away"
              : `${doc.pages.length} pages of one document. Open them all out.`
          }
          onClick={() => toggleDoc(doc.key)}
        >
          {openDocs.has(doc.key) ? "fold" : `+${doc.pages.length - 1}`}
        </button>
      )}
      <figcaption>
        <b>
          {p.img.year ? `${p.img.year} · ` : ""}
          {p.placeLabel ?? p.img.place ?? "no place recorded"}
        </b>
        <em className="archive__badge" data-kind={p.img.kind}>
          {KIND_LABEL[p.img.kind]}
        </em>
        {!p.placeKey && p.who.length > 0 && (
          <em className="dim">tied to {p.who.map((w) => w.name).join(", ")}, not to a place here</em>
        )}
      </figcaption>
    </figure>
  );
  const lines = [
    ...branchList.map((b) => ({
      key: b.id,
      label: b.label,
      // Two to a row now, so the quiet line has half a panel to say who
      // this is in. It says the one thing the strong line does not — which
      // great-grandparent — and the whole sentence stays on the title.
      sub: b.familiar,
      full: `${b.sub} · through ${b.through}`,
      color: b.color,
    })),
    {
      key: OFF_BRANCH_KEY,
      label: OFF_BRANCH_NAME,
      sub: "None of the eight",
      full: "Not on a great-grandparent's line",
      color: OFF_BRANCH,
    },
  ];

  return (
    <div className="film atlas">
      <div className="film__map" ref={container} />

      <div className="atlas__panel">
        <div className="atlas__panelhead">
          <div className="eyebrow">The atlas</div>
          <div className="atlas__title">Where everything happened</div>
          <div className="atlas__tally">
            <b>{inView.length.toLocaleString()}</b> of {dots.length.toLocaleString()} placed
            events{scoped ? " on screen" : ""}
            {place
              ? ` in ${placeName}`
              : ` · ${massesInView.length.toLocaleString()} ${massesInView.length === 1 ? "place" : "places"}`}
          </div>
          <div className="atlas__note dim">
            {upTo !== 9999 && undated > 0
              ? `${undated} undated records set aside while the year is set`
              : undatedShown > 0
                ? `${undatedShown} of them carry a place and no date`
                : ""}
          </div>
          {place && (
            <button type="button" className="atlas__crumb" onClick={() => setPlace(null)}>
              <span>{placeName}</span>
              <em>clear</em>
            </button>
          )}
        </div>

        <div className="atlas__filters">
          <div className="atlas__group">
            <div className="atlas__grouphead">
              <span>What happened</span>
              <button type="button" className="atlas__mini" onClick={() => setOffKinds(new Set())}>
                all
              </button>
              <button
                type="button"
                className="atlas__mini"
                onClick={() => setOffKinds(new Set(EVENT_SHAPES.map((s) => s.shape)))}
              >
                none
              </button>
            </div>
            <div className="atlas__legend atlas__legend--shapes">
              {EVENT_SHAPES.map(({ shape, label, short }) => (
                <button
                  key={shape}
                  type="button"
                  className="atlas__key"
                  aria-pressed={!offKinds.has(shape)}
                  onClick={() => toggle(setOffKinds, shape)}
                  title={label}
                >
                  <ShapeKey shape={shape} />
                  <span>
                    <b>{short ?? label}</b>
                  </span>
                  <em className="atlas__count">{kindCounts.get(shape) ?? 0}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="atlas__group">
            <div className="atlas__grouphead">
              <span>Whose line</span>
              <button type="button" className="atlas__mini" onClick={() => setOffLines(new Set())}>
                all
              </button>
              <button
                type="button"
                className="atlas__mini"
                onClick={() => setOffLines(new Set(lines.map((l) => l.key)))}
              >
                none
              </button>
            </div>
            <div className="atlas__legend atlas__legend--branches">
              {lines.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  className="atlas__key atlas__key--two"
                  aria-pressed={!offLines.has(b.key)}
                  onClick={() => toggle(setOffLines, b.key)}
                  title={b.full}
                >
                  <i className="chip__dot" style={{ background: b.color }} />
                  <span>
                    <b>{b.label}</b>
                    <em>{b.sub}</em>
                    <em className="atlas__count">{lineCounts.get(b.key) ?? 0}</em>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="atlas__list">
        <div className="atlas__listhead">
          <div className="atlas__tabs">
            <button
              type="button"
              className="atlas__tab"
              aria-pressed={tab === "pictures"}
              onClick={() => setTab("pictures")}
            >
              Pictures <em>{pictures.length.toLocaleString()}</em>
            </button>
            <button
              type="button"
              className="atlas__tab"
              aria-pressed={tab === "lines"}
              onClick={() => setTab("lines")}
              title="Everyone the map is showing, gathered into the great-grandparent's line they descend through. Experimental."
            >
              Ancestral lines <em>{peopleCount.toLocaleString()}</em>
            </button>
          </div>
          <input
            className="atlas__search"
            type="search"
            value={query}
            placeholder="Find a person, a place, an event"
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          <button
            type="button"
            className="atlas__scope"
            aria-pressed={scoped}
            onClick={() => setScoped((v) => !v)}
            title="Bind these lists to the map. Pan or zoom and they follow it; switch this off to see everything the filters allow, wherever it is."
          >
            <i className="atlas__check" aria-hidden="true" />
            <span>What the map is showing</span>
            {scoped && offscreen > 0 && <em>{offscreen.toLocaleString()} off screen</em>}
          </button>
          {tab === "lines" && (
            <p className="atlas__note dim atlas__lineshead">
              Experimental. One row per person, not per record; picking one draws
              their whole recorded route.
            </p>
          )}
        </div>

        <div className="atlas__rows" ref={list.ref} onScroll={list.onScroll}>
          {tab === "lines" && (
            <>
              <div style={{ height: list.range.start * ROW_H }} />
              {lineList.slice(list.range.start, list.range.end).map((r) =>
                r.kind === "head" ? (
                  <div className="atlas__linehead" key={`head-${r.group.key}`}>
                    <i className="chip__dot" style={{ background: r.group.color }} />
                    <span>
                      <b>{r.group.label}</b>
                      <em>{r.group.sub}</em>
                    </span>
                    <em className="atlas__count">{r.group.people.length}</em>
                  </div>
                ) : (
                  <div
                    key={r.person.pid}
                    className={`atlas__row${linePid === r.person.pid ? " atlas__row--on" : ""}`}
                  >
                    <button
                      type="button"
                      className="atlas__rowmain"
                      title={[
                        r.person.term
                          ? `${cap(r.person.term)}${r.person.through ? ` · ${r.person.through}` : ""}`
                          : "The tree records no path from here to you",
                        r.person.moves
                          ? `${r.person.moves} recorded ${r.person.moves === 1 ? "move" : "moves"} · ${r.person.miles.toLocaleString()} miles over a whole life, not only the years on screen`
                          : "No recorded move: every event of theirs is in one place",
                      ].join("\n\n")}
                      onClick={() => pickPerson(r.person)}
                    >
                      <span className="atlas__rowname">
                        <b>{r.person.name}</b>
                        <em>
                          {r.person.term ? cap(r.person.term) : "not connected in the tree"}
                          {" · "}
                          {r.person.dated
                            ? r.person.from === r.person.to
                              ? r.person.from
                              : `${r.person.from}\u2013${r.person.to}`
                            : "no dates"}
                          {" · "}
                          {r.person.events} {r.person.events === 1 ? "record" : "records"}
                        </em>
                      </span>
                      {r.person.moves > 0 && (
                        <em className="atlas__rowmoves">
                          {r.person.moves} {r.person.moves === 1 ? "move" : "moves"}
                        </em>
                      )}
                    </button>
                    <button
                      type="button"
                      className="atlas__rowgo"
                      title={`Open ${r.person.name}`}
                      onClick={() => navigate(`/person/${r.person.pid}`)}
                    >
                      →
                    </button>
                  </div>
                ),
              )}
              <div style={{ height: Math.max(0, (rows - list.range.end) * ROW_H) }} />
            </>
          )}

          {tab === "pictures" && (
            <>
              {visibleNearPics.length > 0 && (
                <>
                  <div className="atlas__picshead">
                    <span>{focusLabel}</span>
                    <em>{nearPics.length}</em>
                  </div>
                  <div className="atlas__pics">{picDocs(groupByDoc(visibleNearPics))}</div>
                </>
              )}
              {picSections.map(([tier, list], i) => (
                <Fragment key={`${tier}-${i}`}>
                  <div className="atlas__picshead">
                    <span>{TIER_LABEL[tier]}</span>
                    <em>{list.length}</em>
                  </div>
                  <div className="atlas__pics">{picDocs(groupByDoc(list))}</div>
                </Fragment>
              ))}
              {pictures.length === 0 && (
                <p className="dim atlas__empty">
                  {scoped
                    ? "The archive has no picture of anywhere on this screen, and none of the people on it. Pan elsewhere, or switch off \u201cWhat the map is showing\u201d."
                    : "The archive has no picture of anywhere the filters allow, and none of the people they allow."}
                </p>
              )}
              {pictures.length > 0 && (
                <div className="atlas__picprogress" ref={pictureSentinel}>
                  <span>
                    Showing {visiblePictureCount.toLocaleString()} of {pictures.length.toLocaleString()}
                  </span>
                  {visiblePictureCount < pictures.length && <i aria-hidden="true" />}
                </div>
              )}
            </>
          )}

          {rows === 0 && tab === "lines" && (
            <p className="dim atlas__empty">
              {scoped && offscreen > 0
                ? place
                  ? `Nobody on this screen. ${placeName} is somewhere else on the map: pan back to it, clear the place, or switch off “What the map is showing”.`
                  : `Nobody on this screen. ${offscreen.toLocaleString()} matching ${offscreen === 1 ? "record is" : "records are"} elsewhere on the map: pan to them, or switch off “What the map is showing”.`
                : "Nobody matches. Every kind of event or every line may be switched off."}
            </p>
          )}
        </div>
      </div>

      {/* The record's own distribution in time, and the slice the scrubber
          is standing on. Clicking a decade goes there. */}
      <div className="atlas__hist" aria-hidden="true">
        {histogram.buckets.map((n, i) => {
          const decade = histogram.from + i * 10;
          const on =
            upTo === 9999 || (decade <= upTo && (!span || decade + 9 > upTo - span));
          return (
            <button
              key={decade}
              type="button"
              className={`atlas__bin${on ? " atlas__bin--on" : ""}`}
              title={`${decade}s · ${n} ${n === 1 ? "record" : "records"}`}
              onClick={() => setUpTo(decade + 9)}
            >
              <i style={{ height: `${Math.max(n ? 8 : 0, (n / histogram.peak) * 100)}%` }} />
            </button>
          );
        })}
      </div>

      <div className="film__bar atlas__bar">
        <button
          type="button"
          className="atlas__layer"
          aria-pressed={windowed}
          onClick={() => setWindowed((v) => !v)}
          title={`Show only a ${WINDOW}-year window instead of everything up to the year`}
        >
          <i className="atlas__check" aria-hidden="true" />
          {WINDOW}-year window
        </button>
        <button
          type="button"
          className="atlas__layer"
          aria-pressed={paths}
          onClick={() => setPaths((v) => !v)}
          title="Draw every move made by the people still on the map, pointed the way they went. A person's route is their whole route: the filters above choose the people, not the legs."
        >
          <i className="atlas__check" aria-hidden="true" />
          Migration paths
          {paths && <em className="atlas__pathcount">{pathLines.length.toLocaleString()}</em>}
        </button>
        <span className="atlas__yearlabel">
          {upTo === 9999 ? "all years" : span ? `${upTo - span}–${upTo}` : upTo}
        </span>
        <input
          type="range"
          min={years.min}
          max={years.max + 1}
          value={upTo === 9999 ? years.max + 1 : upTo}
          onChange={(e) => {
            const v = Number(e.currentTarget.value);
            setUpTo(v > years.max ? 9999 : v);
          }}
        />
        <span className="dim atlas__scale">
          {years.min}–{years.max} · places until you zoom in, events after
        </span>
      </div>

      {openPic && (
        <Lightbox
          src={archiveUrl(openPic)}
          alt={openPic.caption}
          onClose={() => setOpenPic(null)}
        >
          <span className="archive__badge" data-kind={openPic.kind}>
            {KIND_LABEL[openPic.kind]}
          </span>{" "}
          {openPic.caption}
          {openPic.method && <span className="dim"> · {openPic.method}</span>}
        </Lightbox>
      )}

      <div className="atlas__tip" ref={tipRef} style={{ display: "none" }} />

      <div className="film__credit dim">{ATTRIBUTION}</div>
    </div>
  );
}
