/** The migration film.
 *
 *  Ethan's ruling: a real map played through time that pauses at each
 *  immigration moment and tells it. The script is hand-authored in
 *  data/film.json and validated against the tree by check_film.py, so a
 *  growing tree cannot silently break a stop.
 *
 *  The same surface does double duty: with ?person= it flies one person's
 *  recorded places instead of the scripted film, which is what the person
 *  page's "show on the map" link opens.
 *
 *  Only the caption and the scrubber are React state, and they change at
 *  most once per stop. Everything that changes per frame is written
 *  straight to the map or to a DOM ref, because a 60fps setState is how a
 *  film turns into a slideshow. */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Map as MLMap, addProtocol, removeProtocol, type GeoJSONSource } from "maplibre-gl";
import { Protocol } from "pmtiles";
import type { Feature } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  ATTRIBUTION,
  arcLine,
  buildTimeline,
  cameraAt,
  captionOpacity,
  greatCircle,
  OPENING,
  seekTo,
} from "@/lib/camera";
import { buildStyle } from "@/lib/mapstyle";
import {
  displayName,
  filmStops,
  film,
  getPerson,
  getPlace,
  lineageColor,
  placesOf,
  storyById,
} from "@/lib/data";
import { ancestorTerm, familiarName, getAnchor, kinBridge, nearestKin } from "@/lib/kinship";
import { archiveForStop, archiveUrl, KIND_LABEL } from "@/lib/archive";
import { Lightbox } from "@/components/Lightbox";
import { MapModes } from "@/components/MapModes";
import { media } from "@/lib/data";
import type { FilmStop } from "@/types";

/** Who a stop is about: explicit stop.people wins, else the linked
 *  story's resolved cast. Shared by the kin line and the portraits. */
function stopPeopleIds(stop: FilmStop): { ids: string[]; authored: boolean } {
  if (stop.people) return { ids: stop.people, authored: true };
  if (!stop.story) return { ids: [], authored: false };
  return {
    ids: (storyById.get(stop.story)?.people ?? []).filter((p) => p.id).map((p) => p.id!),
    authored: false,
  };
}

/** Was this person alive anywhere near this moment? A story's cast runs
 *  past its own century: story 2 is about a 1638 crossing and names Ethan
 *  at the end of it, which made the 1638 stop announce "you, if you are
 *  who we think you are" and put a modern photograph on the rail. A
 *  person with no dates at all is kept, because the alternative is
 *  dropping the people the tree knows least about. */
function aliveNear(id: string, year: number): boolean {
  const p = getPerson(id);
  const born = p?.birth?.date?.year ?? null;
  const died = p?.death?.date?.year ?? null;
  if (born === null && died === null) return true;
  const from = born ?? (died as number) - 80;
  const to = died ?? (born as number) + 80;
  return year >= from - 5 && year <= to + 5;
}

/** Who a stop speaks for.
 *
 *  A cast written into film.json is taken as written: the author of the
 *  script knows who the stop is about, including the present-day stop
 *  where the answer is Ethan himself.
 *
 *  A cast inherited from a story is filtered, because a story's cast is
 *  the whole story's cast. Story 16 walks four lines from the 1870s to
 *  now, so its living members were being announced as the relation at an
 *  1870s stop: the Minnesota stop said Ethan's grandfather, who never
 *  moved to Minnesota (his report, 2026-08-16). Nobody in range means no
 *  relation line, never a nearest-anybody. */
function stopCast(stop: FilmStop): string[] {
  const { ids, authored } = stopPeopleIds(stop);
  if (authored) return ids;
  return ids.filter((id) => id !== getAnchor() && aliveNear(id, stop.year));
}

/** The subject of a caption, with the credit and the honesty label cut
 *  off. Two photographers shooting the same memorial write two captions
 *  that differ only in "Credit: ...", and the sidebar showed both. */
const subjectOf = (caption: string) =>
  caption
    .toLowerCase()
    .split(/\bcredit:/)[0]
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Portraits for a stop: media the cited people actually have files for,
 *  then archive images gathered for the stop's story. Family faces first;
 *  a period scene fills the sidebar only when no face exists.
 *
 *  The cap is generous now that the rail scrolls (Ethan, 2026-08-16:
 *  "much more images in the migration section"). It exists only so one
 *  place with a big archive cannot bury the film's own controls. */
function stopPortraits(stop: FilmStop): { src: string; name: string }[] {
  const out: { src: string; name: string }[] = [];
  for (const pid of stopCast(stop)) {
    const p = getPerson(pid);
    for (const mid of p?.mediaRefs ?? []) {
      const m = media[mid];
      if (m?.file && (m.kind ?? "").toLowerCase() !== "document") {
        out.push({ src: m.file, name: displayName(p) });
      }
    }
  }
  // Gated by place, not just by story: a story crosses an ocean and its
  // pictures must not follow it back across.
  for (const img of archiveForStop(stop.story, stop.title, stop.year)) {
    out.push({
      src: archiveUrl(img),
      name: img.kind === "direct" ? img.caption : `${KIND_LABEL[img.kind]} · ${img.caption}`,
    });
  }
  // Deduped by subject as well as by file: the archive holds several
  // frames of the same scene, and a rail showing one memorial plaque
  // twice reads as a bug however much room it has.
  const seenSrc = new Set<string>();
  const seenSubject = new Set<string>();
  const kept: { src: string; name: string }[] = [];
  for (const x of out) {
    const subject = subjectOf(x.name);
    if (seenSrc.has(x.src) || (subject && seenSubject.has(subject))) continue;
    seenSrc.add(x.src);
    if (subject) seenSubject.add(subject);
    kept.push(x);
  }
  return kept.slice(0, 24);
}

/** A person's recorded places, cast as a film so one renderer serves both. */
function personFilm(personId: string): { stops: FilmStop[]; title: string; subtitle: string } | null {
  const p = getPerson(personId);
  if (!p || p.living) return null;
  const visits = placesOf(p);
  if (!visits.length) return null;

  const stops: FilmStop[] = visits.map((v, i) => ({
    id: `${personId}-${i}`,
    year: v.year ?? 0,
    yearLabel: v.year ? String(v.year) : "",
    title: v.place.label,
    lineage: p.lineages?.[0] ?? null,
    lat: v.place.lat,
    lon: v.place.lon,
    zoom: v.place.precision === "locality" ? 8.5 : v.place.precision === "region" ? 6 : 4.2,
    hold: 5,
    kicker: v.event,
    narration:
      v.place.precision === "locality"
        ? `${v.event} at ${v.place.label}.`
        : `${v.event} at ${v.place.label}. The record names the ${v.place.precision} only, so this is where the ${v.place.precision} sits, not where they stood.`,
    story: null,
    arc: i > 0 ? { from: `${personId}-${i - 1}`, kind: "land" } : undefined,
  }));

  return {
    stops,
    title: displayName(p),
    subtitle: `${visits.length} recorded ${visits.length === 1 ? "place" : "places"}, in the order the records give them.`,
  };
}

export default function FilmPage() {
  const [params] = useSearchParams();
  const personId = params.get("person");
  const placeId = params.get("place");
  const wantStop = params.get("stop");

  const script = useMemo(() => {
    if (personId) return personFilm(personId);
    if (placeId) {
      const pl = getPlace(placeId);
      if (!pl) return null;
      return {
        stops: [
          {
            id: pl.id,
            year: 0,
            yearLabel: "",
            title: pl.label,
            lineage: null,
            lat: pl.lat,
            lon: pl.lon,
            zoom: pl.precision === "locality" ? 8.5 : pl.precision === "region" ? 6 : 4.2,
            hold: 6,
            kicker: pl.precision,
            narration: `${pl.label}. Every event in the tree that names this place is anchored here.`,
            story: null,
          } satisfies FilmStop,
        ],
        title: pl.label,
        subtitle: "One place from the tree.",
      };
    }
    return { stops: filmStops, title: film.title, subtitle: film.subtitle };
  }, [personId, placeId]);

  const stops = script?.stops ?? filmStops;
  const timeline = useMemo(() => buildTimeline(stops), [stops]);

  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const readyRef = useRef(false);
  const captionRef = useRef<HTMLDivElement>(null);
  const portraitsRef = useRef<HTMLDivElement>(null);
  const yearRef = useRef<HTMLDivElement>(null);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [zoomed, setZoomed] = useState<{ src: string; name: string } | null>(null);

  // ---- map lifecycle ----
  useEffect(() => {
    if (!container.current) return;
    const protocol = new Protocol();
    addProtocol("pmtiles", protocol.tile);

    const map = new MLMap({
      container: container.current,
      style: buildStyle(),
      center: [OPENING.lon, OPENING.lat],
      zoom: OPENING.zoom,
      attributionControl: false,
      interactive: false,
      fadeDuration: 0,
    });
    mapRef.current = map;

    map.on("load", () => {
      readyRef.current = true;
      setReady(true);
    });

    return () => {
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
      removeProtocol("pmtiles");
    };
  }, []);

  // ---- the film loop ----
  useEffect(() => {
    let raf = 0;
    let last = 0;

    function src(id: string): GeoJSONSource | undefined {
      return mapRef.current?.getSource(id) as GeoJSONSource | undefined;
    }

    function draw() {
      const map = mapRef.current;
      if (!map || !readyRef.current) return;

      const t = tRef.current;
      const { cam, seg, u, progress } = cameraAt(timeline, t);
      map.jumpTo({
        center: [cam.lon, cam.lat],
        zoom: cam.zoom,
        bearing: cam.bearing,
        pitch: cam.pitch,
      });

      // Routes: every arc already flown, plus the one being drawn.
      const routes: Feature[] = [];
      stops.forEach((s, i) => {
        if (!s.arc) return;
        const from = stops.find((x) => x.id === s.arc!.from);
        if (!from) return;
        let f = 0;
        if (seg.stopIndex > i) f = 1;
        else if (seg.stopIndex === i) f = seg.kind === "hold" ? 1 : progress;
        if (f <= 0.001) return;
        const pts = arcLine([from.lon, from.lat], [s.lon, s.lat]);
        routes.push({
          type: "Feature",
          properties: { color: lineageColor(s.lineage) },
          geometry: { type: "LineString", coordinates: pts.slice(0, Math.max(2, Math.round(pts.length * f))) },
        });
      });
      src("routes")?.setData({ type: "FeatureCollection", features: routes });

      // The moving point on the arc currently being drawn.
      const current = stops[seg.stopIndex];
      const arcFrom = current.arc ? stops.find((x) => x.id === current.arc!.from) : undefined;
      const vessel: Feature[] = [];
      if (seg.kind === "fly" && arcFrom && progress > 0.02 && progress < 0.99) {
        vessel.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "Point",
            coordinates: greatCircle([arcFrom.lon, arcFrom.lat], [current.lon, current.lat], progress),
          },
        });
      }
      src("vessel")?.setData({ type: "FeatureCollection", features: vessel });

      // Place marks appear as the film reaches them and stay.
      const places: Feature[] = [];
      stops.forEach((s, i) => {
        const reached =
          seg.stopIndex > i || (seg.stopIndex === i && (seg.kind === "hold" || progress > 0.55));
        if (!reached) return;
        const isCurrent = seg.stopIndex === i && seg.kind === "hold";
        places.push({
          type: "Feature",
          properties: {
            color: lineageColor(s.lineage),
            pulse: isCurrent ? (u * 1.6) % 1 : 1,
            current: isCurrent,
          },
          geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        });
      });
      src("places")?.setData({ type: "FeatureCollection", features: places });

      if (captionRef.current) {
        const o = seg.kind === "hold" ? captionOpacity(u, Math.max(4, current.hold)) : 0;
        captionRef.current.style.opacity = String(o);
        captionRef.current.style.transform = `translateY(${(1 - o) * 10}px)`;
        if (portraitsRef.current) {
          portraitsRef.current.style.opacity = String(o);
          portraitsRef.current.style.transform = `translateY(${(1 - o) * 10}px)`;
        }
      }
      if (yearRef.current) {
        yearRef.current.textContent = current.yearLabel || String(current.year || "");
      }
      setIndex((prev) => (prev === seg.stopIndex ? prev : seg.stopIndex));
    }

    function loop(now: number) {
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      if (playingRef.current) {
        tRef.current = Math.min(timeline.duration, tRef.current + dt);
        if (tRef.current >= timeline.duration) {
          playingRef.current = false;
          setPlaying(false);
        }
      }
      draw();
      raf = requestAnimationFrame(loop);
    }

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stops, timeline]);

  // Deep link: ?stop=<id> starts the film paused on that stop.
  useEffect(() => {
    if (!ready) return;
    const at = wantStop ? stops.findIndex((s) => s.id === wantStop) : -1;
    if (at >= 0) {
      tRef.current = seekTo(timeline.segments, at);
      setIndex(at);
    } else {
      tRef.current = 0;
      playingRef.current = true;
      setPlaying(true);
    }
  }, [ready, wantStop, stops, timeline]);

  const stop = stops[index] ?? stops[0];
  const story = stop?.story ? storyById.get(stop.story) : undefined;

  function seekStop(i: number) {
    tRef.current = seekTo(timeline.segments, i);
    setIndex(i);
    playingRef.current = false;
    setPlaying(false);
  }

  if (!script) {
    return (
      <div className="page page--narrow">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 26, marginBottom: 10 }}>
          Nothing to map
        </h1>
        <p className="dim">
          That person has no place on record, or is living and so carries no places in this
          data at all.
        </p>
        <Link className="backlink" to="/map">
          Watch the migration film instead
        </Link>
      </div>
    );
  }

  return (
    <div className="film">
      <div className="film__map" ref={container} />

      {(personId || placeId) && (
        <div style={{ position: "absolute", left: 48, top: 32, zIndex: 10, maxWidth: 380 }}>
          <div className="eyebrow">{personId ? "One life on the map" : "One place"}</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--text-000)", margin: "6px 0 4px" }}>
            {script.title}
          </div>
          <div className="dim" style={{ fontSize: 12.5 }}>{script.subtitle}</div>
          <Link className="backlink" to="/map" style={{ marginTop: 10 }}>
            The full migration film
          </Link>
        </div>
      )}

      <div className="film__year" ref={yearRef} />
      {stop.era && <div className="film__era">{stop.era}</div>}

      {(() => {
        const portraits = stopPortraits(stop);
        if (!portraits.length) return null;
        return (
          <div className="film__portraits" ref={portraitsRef}>
            <div className="film__portraits__count">
              {portraits.length} {portraits.length === 1 ? "picture" : "pictures"} of this place
            </div>
            {portraits.map((x) => (
              <figure key={x.src}>
                <button type="button" onClick={() => setZoomed(x)} title="Enlarge">
                  <img src={x.src} alt={x.name} loading="lazy" />
                </button>
                <figcaption>{x.name}</figcaption>
              </figure>
            ))}
          </div>
        );
      })()}

      {zoomed && (
        <Lightbox src={zoomed.src} alt={zoomed.name} onClose={() => setZoomed(null)}>
          {zoomed.name}
        </Lightbox>
      )}

      <div className="film__caption" ref={captionRef}>
        {stop.kicker && <div className="eyebrow">{stop.kicker}</div>}
        <h2>{stop.title}</h2>
        {(() => {
          const ids = stopCast(stop);
          const near = ids.length ? nearestKin(ids) : null;
          // Silence read as an oversight (Ethan, 2026-08-16: the Wright
          // and Batdorf stops "don't show relation to me", then "who and
          // how related?" on four more). A stop with nobody directly
          // related still has a tie, one marriage further down the line,
          // and naming that is the answer to his question. Only when even
          // that fails does the film say there is no proved line.
          if (!near) {
            if (stop.kinNote) return <div className="film__kin film__kin--open">{stop.kinNote}</div>;
            if (!ids.length) return null;
            const bridge = kinBridge(ids);
            if (bridge) {
              const from = displayName(getPerson(bridge.id));
              const down = displayName(getPerson(bridge.through));
              return (
                <div className="film__kin film__kin--open">
                  {from} · no blood line to you: {ancestorTerm(bridge.gen, getPerson(bridge.id))} of{" "}
                  {down}, {bridge.rel.term}
                  {bridge.rel.via && <>, through {familiarName(bridge.rel.via.id)}</>}
                </div>
              );
            }
            return (
              <div className="film__kin film__kin--open">
                No proved line from these people to you yet
              </div>
            );
          }
          const who = displayName(getPerson(near.id));
          return (
            <div className="film__kin">
              {who} · {near.rel.term}
              {near.rel.via && <>, through {familiarName(near.rel.via.id)}</>}
            </div>
          );
        })()}
        <p>{stop.narration}</p>
        {story && (
          <Link className="chip chip--person" to={`/story/${story.id}`}>
            Read the story
          </Link>
        )}
      </div>

      <div className="film__bar">
        <button
          className="playbtn"
          title={playing ? "Pause" : "Play"}
          onClick={() => {
            const next = !playingRef.current;
            if (next && tRef.current >= timeline.duration) tRef.current = 0;
            playingRef.current = next;
            setPlaying(next);
          }}
        >
          {playing ? (
            <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true">
              <rect x="0" y="0" width="4" height="12" fill="currentColor" />
              <rect x="7" y="0" width="4" height="12" fill="currentColor" />
            </svg>
          ) : (
            <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true">
              <path d="M0 0 11 6 0 12z" fill="currentColor" />
            </svg>
          )}
        </button>

        <div className="film__scrub">
          {stops.map((s, i) => (
            <button
              key={s.id}
              className="film__tick"
              data-on={i === index}
              data-past={i < index}
              title={`${s.yearLabel || s.year} · ${s.title}`}
              onClick={() => seekStop(i)}
            >
              <span>{i === 0 || i === stops.length - 1 || i === index ? s.yearLabel || s.year : ""}</span>
            </button>
          ))}
        </div>

        <div className="dim" style={{ fontSize: 11, fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>
          {index + 1} / {stops.length}
        </div>
      </div>

      {!personId && <MapModes mode="film" />}

      <div
        className="dim"
        style={{
          position: "absolute",
          right: 14,
          bottom: 68,
          fontSize: 9.5,
          zIndex: 10,
          maxWidth: 300,
          textAlign: "right",
          lineHeight: 1.5,
        }}
      >
        {ATTRIBUTION}
      </div>

      {!ready && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "#080a0c",
            zIndex: 30,
            color: "var(--text-300)",
            fontSize: 12.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Loading the world
        </div>
      )}
    </div>
  );
}
