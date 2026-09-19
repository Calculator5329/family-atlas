/** Every journey: the migrations, flown one line at a time.
 *
 *  Ethan's ruling, 2026-08-21: "press play and then it's like whoosh, this
 *  person travelled here, whoosh, and this person travelled here, and I
 *  get to see where they all come from." So this is not a year sweep with
 *  three hundred lines arriving at once. It is a chapter per
 *  great-grandparent's line, a passage per person inside it, and the arc
 *  drawn under a camera that is actually travelling it.
 *
 *  It lives in the migration tab beside the scripted film (Ethan,
 *  2026-08-21: migration lines "belong in migration"). The film is the
 *  hand-written story of the crossings that matter; this is the whole
 *  recorded record of movement, in order, with nothing left out.
 *
 *  The event dots sit underneath, dimmed, filtered to the line and year
 *  the sequence has reached, so the movement is drawn against the family
 *  filling in behind it rather than against an empty sea.
 *
 *  Only the beat is React state, and it changes a couple of times a
 *  second. Everything per-frame goes straight to the map or to a DOM ref:
 *  a 60fps setState turns a film into a slideshow. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MLMap,
  addProtocol,
  removeProtocol,
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
} from "maplibre-gl";
import { Protocol } from "pmtiles";
import type { Feature, FeatureCollection } from "geojson";
import { buildStyle } from "@/lib/mapstyle";
import { ATTRIBUTION, arcLine, greatCircle } from "@/lib/camera";
import { branches, useAnchor } from "@/lib/kinship";
import { atlasCameraAt, buildAtlasTimeline, buildChapters } from "@/lib/journeys";
import { ICON_OFFSET, collectDots, toFeatures, OFF_BRANCH } from "@/lib/atlasevents";
import { EVENT_SHAPES, glyphImage, glyphName } from "@/lib/atlasglyphs";
import { MapModes } from "@/components/MapModes";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/** What the HUD is showing. Set from the render loop, but only when it
 *  actually changes — roughly twice a second at the busiest. */
interface Now {
  chapter: number;
  journey: number;
  leg: number;
  card: boolean;
}

const fmt = (n: number) => Math.round(n).toLocaleString();

/** "the record gives only the county here" — said out loud rather than
 *  drawn as though it were a street address. Repo rule 4. */
const VAGUE: Record<string, string> = {
  region: "one or both ends recorded only as a state or county",
  country: "one or both ends recorded only as a country",
};

export default function JourneysPage() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);

  const anchor = useAnchor();
  const branchList = useMemo(() => branches(anchor), [anchor]);
  const dots = useMemo(() => collectDots(anchor), [anchor]);
  const features = useMemo(() => toFeatures(dots), [dots]);
  const chapters = useMemo(() => buildChapters(anchor), [anchor]);
  const timeline = useMemo(() => buildAtlasTimeline(chapters), [chapters]);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [now, setNow] = useState<Now>({ chapter: 0, journey: -1, leg: -1, card: true });

  const tRef = useRef(0);
  const playingRef = useRef(true);
  const speedRef = useRef(1);
  const captionRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const yearRef = useRef<HTMLDivElement>(null);
  const milesRef = useRef<HTMLSpanElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  playingRef.current = playing;
  speedRef.current = speed;

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
      const palette = [...branchList.map((b) => b.color), OFF_BRANCH];
      palette.forEach((color, i) => {
        for (const { shape } of EVENT_SHAPES) {
          const name = glyphName(shape, i);
          if (!map.hasImage(name)) {
            map.addImage(name, glyphImage(shape, color), { pixelRatio: 2 });
          }
        }
      });

      // Per-feature weight, so one arc can be held bright while everything
      // already flown falls back to a trace of itself.
      map.setPaintProperty("route", "line-opacity", ["coalesce", ["get", "op"], 0.95]);
      map.setPaintProperty("route", "line-width", ["coalesce", ["get", "w"], 1.4]);
      map.setPaintProperty("route-ghost", "line-opacity", [
        "*",
        ["coalesce", ["get", "op"], 0.95],
        0.16,
      ]);

      map.addSource("journey-events", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });
      map.addLayer(
        {
          id: "journey-dots",
          type: "symbol",
          source: "journey-events",
          layout: {
            "icon-image": ["get", "icon"],
            // The same pixel ring the atlas draws: two maps showing one
            // event should not disagree about where it sits.
            "icon-offset": ICON_OFFSET as unknown as ExpressionSpecification,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-size": ["interpolate", ["linear"], ["zoom"], 1.5, 0.6, 6, 0.85, 9, 1],
          },
          paint: { "icon-opacity": 0.4 },
        },
        "route-ghost",
      );

      // The place names the sequence calls out. The basemap's own labels
      // have bowed out by settle zoom, and a name that appears exactly as
      // the camera arrives is the whole point of arriving.
      map.addSource("journey-labels", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "journey-label",
        type: "symbol",
        source: "journey-labels",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 13,
          "text-offset": [0, -1.3],
          "text-anchor": "bottom",
          "text-allow-overlap": true,
          "text-max-width": 12,
        },
        paint: {
          "text-color": "#ece7dd",
          "text-halo-color": "#0a0e11",
          "text-halo-width": 1.7,
          "text-opacity": ["coalesce", ["get", "op"], 1],
        },
      });

      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      removeProtocol("pmtiles");
    };
    // The map is built once; features are stable for the app's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- the sequence loop ----
  //
  // requestAnimationFrame, because this moves a camera rather than a
  // counter. The heavy part — every arc already flown — is rebuilt only
  // when the beat changes; the frame itself recomputes one arc.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map: MLMap = mapRef.current;
    const src = (id: string) => map.getSource(id) as GeoJSONSource | undefined;

    let raf = 0;
    let last = 0;
    let builtAt = -1;
    let flown: Feature[] = [];
    let reached: Feature[] = [];
    let milesSoFar = 0;
    let filteredYear = -1;

    /** Everything already drawn, at the weight it should now be shown at:
     *  bright inside this journey, half-lit for the rest of this chapter,
     *  a trace for every chapter before it. */
    function rebuild(index: number) {
      flown = [];
      reached = [];
      milesSoFar = 0;
      const here = timeline.beats[index];
      const seen = new Set<string>();
      for (let i = 0; i < index; i += 1) {
        const b = timeline.beats[i];
        if (b.kind !== "leg") continue;
        const j = timeline.chapters[b.chapter].journeys[b.journey];
        const leg = j.legs[b.leg];
        const op = b.chapter !== here.chapter ? 0.09 : b.journey === here.journey ? 0.9 : 0.42;
        flown.push({
          type: "Feature",
          properties: { color: j.color, op, w: 1.4 },
          geometry: { type: "LineString", coordinates: arcLine(leg.a, leg.b, 64) },
        });
        milesSoFar += leg.miles;
        for (const pt of [leg.a, leg.b]) {
          const key = `${pt[0]},${pt[1]}`;
          if (seen.has(key)) continue;
          seen.add(key);
          reached.push({
            type: "Feature",
            properties: { color: j.color, pulse: 1, current: false },
            geometry: { type: "Point", coordinates: pt },
          });
        }
      }
      builtAt = index;
    }

    function draw(t: number) {
      const { cam, beat, u, progress, index } = atlasCameraAt(timeline, t);
      map.jumpTo({
        center: [cam.lon, cam.lat],
        zoom: cam.zoom,
        bearing: cam.bearing,
        pitch: cam.pitch,
      });
      if (index !== builtAt) rebuild(index);

      const chapter = timeline.chapters[beat.chapter];
      const journey = beat.journey >= 0 ? chapter.journeys[beat.journey] : null;
      const leg = beat.kind === "leg" && journey ? journey.legs[beat.leg] : null;

      // The arc being drawn, and the dot on the end of it.
      const routes = flown.slice();
      const vessel: Feature[] = [];
      if (leg) {
        const pts = arcLine(leg.a, leg.b, 64);
        const cut = Math.max(2, Math.round(pts.length * progress));
        routes.push({
          type: "Feature",
          properties: { color: journey!.color, op: 1, w: 2.4 },
          geometry: { type: "LineString", coordinates: pts.slice(0, cut) },
        });
        if (progress > 0.01 && progress < 0.995) {
          vessel.push({
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: greatCircle(leg.a, leg.b, progress) },
          });
        }
      }
      src("routes")?.setData({ type: "FeatureCollection", features: routes });
      src("vessel")?.setData({ type: "FeatureCollection", features: vessel });

      // The place the camera is on, ringing once a second, plus everywhere
      // the sequence has already been.
      const marks = reached.slice();
      let here: [number, number] | null = null;
      if (leg) here = progress > 0.62 ? leg.b : leg.a;
      else if (journey)
        here =
          beat.kind === "settle" ? journey.legs[journey.legs.length - 1].b : journey.legs[0].a;
      if (here && journey) {
        marks.push({
          type: "Feature",
          properties: { color: journey.color, pulse: (t * 0.85) % 1, current: true },
          geometry: { type: "Point", coordinates: here },
        });
        marks.push({
          type: "Feature",
          properties: { color: journey.color, pulse: 0.02, current: true },
          geometry: { type: "Point", coordinates: here },
        });
      }
      src("places")?.setData({ type: "FeatureCollection", features: marks });

      // Names, on the two ends of the leg being flown.
      const labels: Feature[] = [];
      if (leg) {
        labels.push({
          type: "Feature",
          properties: { label: leg.from, op: Math.max(0, 1 - progress * 1.6) },
          geometry: { type: "Point", coordinates: leg.a },
        });
        labels.push({
          type: "Feature",
          properties: { label: leg.to, op: Math.max(0, (progress - 0.45) / 0.35) },
          geometry: { type: "Point", coordinates: leg.b },
        });
      } else if (journey && beat.kind === "settle") {
        const lastLeg = journey.legs[journey.legs.length - 1];
        labels.push({
          type: "Feature",
          properties: { label: lastLeg.to, op: 1 },
          geometry: { type: "Point", coordinates: lastLeg.b },
        });
      }
      src("journey-labels")?.setData({ type: "FeatureCollection", features: labels });

      // The events of this line, filling in behind the movement.
      const year = leg
        ? Math.round(leg.fromYear + (leg.toYear - leg.fromYear) * progress)
        : journey
          ? beat.kind === "settle"
            ? journey.endYear
            : journey.startYear
          : chapter.from;
      if (year !== filteredYear) {
        filteredYear = year;
        // Undated dots have no year to compare against, so they stay out
        // of a sequence that is entirely about when things happened.
        const clauses: unknown[] = [
          ["==", ["get", "dated"], true],
          ["<=", ["get", "year"], year],
        ];
        if (chapter.key !== "near") clauses.push(["==", ["get", "branch"], chapter.key]);
        map.setFilter("journey-dots", ["all", ...clauses] as FilterSpecification);
      }

      // HUD.
      if (yearRef.current) yearRef.current.textContent = String(year);
      if (milesRef.current) {
        milesRef.current.textContent = `${fmt(milesSoFar + (leg ? leg.miles * progress : 0))} miles`;
      }
      if (cardRef.current) {
        const o =
          beat.kind === "card"
            ? Math.max(0, Math.min(1, Math.min((u - 0.22) / 0.18, (1 - u) / 0.14)))
            : 0;
        cardRef.current.style.opacity = String(o);
        cardRef.current.style.transform = `translateY(${(1 - o) * 12}px)`;
      }
      if (captionRef.current) {
        let o = 1;
        if (beat.kind === "card") o = 0;
        else if (beat.kind === "approach") o = Math.min(1, (t - beat.t0) / 0.5);
        else if (beat.kind === "settle") o = Math.min(1, (beat.t1 - t) / 0.5);
        captionRef.current.style.opacity = String(Math.max(0, o));
        captionRef.current.style.transform = `translateY(${(1 - Math.max(0, o)) * 10}px)`;
      }
      if (scrubRef.current && document.activeElement !== scrubRef.current) {
        scrubRef.current.value = String(t);
      }
      // On the settle the last leg is done, not pending, so the itinerary
      // shows the whole route lit rather than the last line greyed out.
      const legIndex = beat.kind === "settle" && journey ? journey.legs.length - 1 : beat.leg;
      setNow((prev) =>
        prev.chapter === beat.chapter &&
        prev.journey === beat.journey &&
        prev.leg === legIndex &&
        prev.card === (beat.kind === "card")
          ? prev
          : {
              chapter: beat.chapter,
              journey: beat.journey,
              leg: legIndex,
              card: beat.kind === "card",
            },
      );
    }

    function loop(stamp: number) {
      const dt = last ? (stamp - last) / 1000 : 0;
      last = stamp;
      if (playingRef.current) {
        tRef.current += dt * speedRef.current;
        if (tRef.current >= timeline.duration) {
          tRef.current = timeline.duration;
          playingRef.current = false;
          setPlaying(false);
        }
      }
      draw(tRef.current);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, timeline]);

  const chapter = timeline.chapters[now.chapter];
  const journey = now.journey >= 0 ? chapter?.journeys[now.journey] : undefined;

  function seek(t: number) {
    tRef.current = Math.max(0, Math.min(timeline.duration, t));
  }
  function step(delta: number) {
    const order = timeline.journeyBeats;
    const at = order.findIndex((j) => j.chapter === now.chapter && j.journey === now.journey);
    const next = Math.max(0, Math.min(order.length - 1, (at < 0 ? 0 : at) + delta));
    seek(timeline.beats[order[next].beat].t0);
  }

  return (
    <div className="film atlas--cinema">
      <div className="film__map" ref={container} />
      <MapModes mode="journeys" />

      <div className="film__year" ref={yearRef} />
      <div className="film__era">
        <span ref={milesRef} /> travelled so far
      </div>

      <div className="atlas__card" ref={cardRef}>
        <div className="eyebrow">
          Chapter {now.chapter + 1} of {timeline.chapters.length}
        </div>
        <h2>{chapter?.title}</h2>
        <p>{chapter?.sub}</p>
        <p className="dim">
          {chapter?.journeys.length} documented{" "}
          {chapter?.journeys.length === 1 ? "passage" : "passages"} · {chapter?.from}–
          {chapter?.to} · {fmt(chapter?.miles ?? 0)} miles
        </p>
        {chapter && chapter.key !== "near" && (
          <p className="dim">
            Surnames on this line:{" "}
            {branchList.find((b) => b.id === chapter.key)?.surnames.join(", ")}
          </p>
        )}
      </div>

      <div className="film__caption atlas__caption" ref={captionRef}>
        <div className="eyebrow" style={{ color: journey?.color }}>
          {chapter?.title}
        </div>
        <h2>{journey?.name}</h2>
        {journey?.relation && <p className="atlas__rel">{journey.relation}</p>}
        <div className="atlas__legs">
          {journey?.legs.map((l, i) => (
            <div
              key={`${l.from}-${l.to}-${l.fromYear}`}
              className={`atlas__leg${i <= now.leg ? " atlas__leg--on" : ""}`}
            >
              <span className="atlas__legyears">
                {l.fromYear}–{l.toYear}
              </span>
              <span>
                {l.from} → {l.to}
              </span>
              <span className="atlas__legmiles">{fmt(l.miles)} mi</span>
            </div>
          ))}
        </div>
        {journey && (
          <p className="atlas__why dim">
            Known from {journey.legs[0].fromEvent.toLowerCase()} at {journey.legs[0].from} and{" "}
            {journey.legs[journey.legs.length - 1].toEvent.toLowerCase()} at{" "}
            {journey.legs[journey.legs.length - 1].to}.
            {journey.legs.some((l) => l.precision !== "locality") &&
              ` Drawn coarse: ${VAGUE[journey.legs.find((l) => l.precision !== "locality")!.precision]}.`}
          </p>
        )}
      </div>

      <div className="atlas__chapters">
        {timeline.chapters.map((c, i) => (
          <button
            key={c.key}
            type="button"
            className="atlas__key"
            aria-pressed={i === now.chapter}
            onClick={() => seek(timeline.beats[timeline.chapterStart[i]].t0)}
          >
            <i className="chip__dot" style={{ background: c.color }} />
            {c.title}
          </button>
        ))}
      </div>

      <div className="film__bar atlas__bar">
        <button
          type="button"
          className="atlas__play"
          aria-label={playing ? "Pause" : "Play"}
          aria-pressed={playing}
          onClick={() => {
            // Pressing play on the last frame starts it again rather than
            // doing nothing, which is what a stopped film does.
            if (!playing && tRef.current >= timeline.duration - 0.01) seek(0);
            setPlaying((v) => !v);
          }}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button type="button" className="atlas__play" aria-label="Previous passage" onClick={() => step(-1)}>
          ⟨
        </button>
        <button type="button" className="atlas__play" aria-label="Next passage" onClick={() => step(1)}>
          ⟩
        </button>
        <span className="atlas__yearlabel" style={{ minWidth: 140 }}>
          {now.card ? chapter?.title : `${(now.journey ?? 0) + 1} of ${chapter?.journeys.length}`}
        </span>
        <input
          type="range"
          ref={scrubRef}
          min={0}
          max={timeline.duration}
          step={0.1}
          defaultValue={0}
          onChange={(e) => seek(Number(e.currentTarget.value))}
        />
        {[1, 2, 3].map((s) => (
          <button
            key={s}
            type="button"
            className="atlas__play"
            aria-pressed={speed === s}
            onClick={() => setSpeed(s)}
          >
            ×{s}
          </button>
        ))}
      </div>

      <div className="film__credit dim">{ATTRIBUTION}</div>
    </div>
  );
}
