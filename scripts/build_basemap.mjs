#!/usr/bin/env node
/** Rebuild the vendored basemap assets: Natural Earth GeoJSON for the
 *  globe, Protomaps PMTiles extracts for the places the film settles on.
 *
 *  Both sets are gitignored because they are large, which makes this file
 *  the only thing standing between a fresh clone and a blank world. Every
 *  asset the style asks for is declared here or in data/basemap.json, and
 *  nothing is fetched by hand.
 *
 *    node scripts/build_basemap.mjs --plan      the extracts block the film wants
 *    node scripts/build_basemap.mjs --check     what is missing, offline
 *    node scripts/build_basemap.mjs --geo       Natural Earth only
 *    node scripts/build_basemap.mjs --tiles     PMTiles only
 *    node scripts/build_basemap.mjs --fonts     glyph PBFs only
 *    node scripts/build_basemap.mjs --dem       terrain tiles only
 *    node scripts/build_basemap.mjs             everything, skipping what exists
 *    ... --force                                refetch even if present
 *    ... --out <dir>                            write somewhere else
 *
 *  Adding a stop to the film means adding an extract here: see the
 *  coverage report this prints, which names every stop the basemap cannot
 *  draw at close range and the bbox that would fix it.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NE = "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master";
const PLANET_HOST = "https://build.protomaps.com";

/** Natural Earth layers, with the properties worth keeping.
 *
 *  Everything else is dropped and coordinates are rounded to four
 *  decimals, roughly 11 metres, which is far finer than a 1:50m dataset
 *  can justify and cuts the vendored set by about a third. */
const GEO = {
  "land-50m": { url: `${NE}/50m/physical/ne_50m_land.json`, keep: [] },
  lakes: { url: `${NE}/50m/physical/ne_50m_lakes.json`, keep: ["name"] },
  rivers: { url: `${NE}/50m/physical/ne_50m_rivers_lake_centerlines.json`, keep: ["name"] },
  "borders-10m": {
    url: `${NE}/10m/cultural/ne_10m_admin_0_boundary_lines_land.json`,
    keep: ["featurecla"],
  },
  // The ocean polygon exists to mask terrain: terrarium tiles carry
  // bathymetry, and without this fill the sea floor shades like land.
  "ocean-50m": { url: `${NE}/50m/physical/ne_50m_ocean.json`, keep: [] },
};

/** Label sources are fetched raw and rewritten to points, because a label
 *  wants one anchor, not the polygon it names. */
const LABELS = {
  cities: `${NE}/50m/cultural/ne_50m_populated_places_simple.json`,
  countries: `${NE}/50m/cultural/ne_50m_admin_0_countries.json`,
};

/** MapLibre asks for glyphs by 256-codepoint range; this vendors the whole
 *  set once so no label ever phones home. */
const FONT_HOST = "https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts";
const FONT_STACK = "Noto Sans Regular";

const DEM_HOST = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const outDir = (() => {
  const i = argv.indexOf("--out");
  return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : join(REPO, "public");
})();
const FORCE = has("--force");
const CHECK = has("--check");
const only = ["--geo", "--tiles", "--fonts", "--dem"].some(has);
const wantGeo = CHECK || has("--geo") || !only;
const wantTiles = CHECK || has("--tiles") || !only;
const wantFonts = CHECK || has("--fonts") || !only;
const wantDem = CHECK || has("--dem") || !only;

// The packet installed under public/packet is the authority when there is
// one: a checkout of the public program has no data/ of its own, and the
// tiles it needs are the ones the packet's basemap.json and film.json
// describe. Under data/, the generated film is the whole one (data/film.json
// plus the untracked twentieth-century stops); fall back to the tracked
// half when this runs before the pipeline has, because a basemap missing a
// late stop's tile is a smaller failure than a build that cannot start.
const firstExisting = (...paths) => paths.find((p) => existsSync(p));
const basemapPath = firstExisting(
  join(REPO, "public", "packet", "basemap.json"),
  join(REPO, "data", "basemap.json"),
);
const filmPath = firstExisting(
  join(REPO, "public", "packet", "film.json"),
  join(REPO, "data", "generated", "film.json"),
  join(REPO, "data", "film.json"),
);
if (!basemapPath || !filmPath) {
  console.error("build_basemap: no basemap.json or film.json under public/packet or data/");
  process.exit(1);
}
const basemap = JSON.parse(readFileSync(basemapPath, "utf8"));
const film = JSON.parse(readFileSync(filmPath, "utf8"));

const kb = (p) => `${(statSync(p).size / 1024).toFixed(0)} KB`;
const inBbox = (lon, lat, b) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];

// ---- Natural Earth -----------------------------------------------------

function round(coords) {
  if (typeof coords[0] === "number") {
    return coords.map((n) => Math.round(n * 1e4) / 1e4);
  }
  return coords.map(round);
}

function trim(fc, keep) {
  return {
    type: "FeatureCollection",
    // Natural Earth carries a few attribute-only rows with a null geometry.
    // MapLibre tolerates them; the rounding pass does not.
    features: fc.features.filter((f) => f.geometry?.coordinates).map((f) => {
      const props = {};
      for (const k of keep) if (f.properties?.[k] != null) props[k] = f.properties[k];
      return {
        type: "Feature",
        properties: props,
        geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
      };
    }),
  };
}

/** Meridians every 15 degrees, parallels every 15 up to 75. The parallels
 *  are sampled every 2.5 degrees because a globe projection bends them and
 *  a two-point line would cut straight through the planet. */
function graticule() {
  const features = [];
  for (let lon = -180; lon < 180; lon += 15) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[lon, -90], [lon, 0], [lon, 90]] },
    });
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const line = [];
    for (let lon = -180; lon <= 180; lon += 2.5) line.push([lon, lat]);
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } });
  }
  return { type: "FeatureCollection", features };
}

async function buildGeo() {
  const dir = join(outDir, "geo");
  mkdirSync(dir, { recursive: true });

  const grat = join(dir, "graticule.json");
  if (FORCE || !existsSync(grat)) {
    writeFileSync(grat, JSON.stringify(graticule()));
    console.log(`  graticule.json    generated  ${kb(grat)}`);
  } else {
    console.log(`  graticule.json    present    ${kb(grat)}`);
  }

  for (const [name, spec] of Object.entries(GEO)) {
    const path = join(dir, `${name}.json`);
    if (!FORCE && existsSync(path)) {
      console.log(`  ${name.padEnd(16)}  present    ${kb(path)}`);
      continue;
    }
    const res = await fetch(spec.url);
    if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText} from ${spec.url}`);
    const raw = await res.json();
    writeFileSync(path, JSON.stringify(trim(raw, spec.keep)));
    console.log(
      `  ${name.padEnd(16)}  fetched    ${kb(path)}  (${raw.features.length} features)`,
    );
  }
}

// ---- labels ------------------------------------------------------------

/** Shoelace area of an outer ring, absolute, in squared degrees. Wrong
 *  near the poles and entirely good enough to pick a country's biggest
 *  landmass, which is all it does. */
function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2);
}

function ringCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const cross = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    a += cross;
    cx += (ring[i][0] + ring[i + 1][0]) * cross;
    cy += (ring[i][1] + ring[i + 1][1]) * cross;
  }
  if (a === 0) return ring[0];
  return [cx / (3 * a), cy / (3 * a)];
}

const point = (coords, properties) => ({
  type: "Feature",
  properties,
  geometry: { type: "Point", coordinates: coords.map((n) => Math.round(n * 1e4) / 1e4) },
});

async function buildLabels() {
  const dir = join(outDir, "geo");
  mkdirSync(dir, { recursive: true });

  const cityPath = join(dir, "cities.json");
  if (FORCE || !existsSync(cityPath)) {
    const res = await fetch(LABELS.cities);
    if (!res.ok) throw new Error(`cities: ${res.status} from ${LABELS.cities}`);
    const raw = await res.json();
    const features = raw.features
      .filter((f) => f.geometry?.coordinates && f.properties?.scalerank <= 8)
      .map((f) =>
        point(f.geometry.coordinates, {
          name: f.properties.name,
          rank: f.properties.scalerank,
          // NE's own per-city reveal zoom; the style trusts it.
          mz: f.properties.min_zoom,
          cap: f.properties.adm0cap ? 1 : 0,
        }),
      );
    writeFileSync(cityPath, JSON.stringify({ type: "FeatureCollection", features }));
    console.log(`  cities.json       generated  ${kb(cityPath)}  (${features.length} places)`);
  } else {
    console.log(`  cities.json       present    ${kb(cityPath)}`);
  }

  const countryPath = join(dir, "country-labels.json");
  if (FORCE || !existsSync(countryPath)) {
    const res = await fetch(LABELS.countries);
    if (!res.ok) throw new Error(`countries: ${res.status} from ${LABELS.countries}`);
    const raw = await res.json();
    const features = raw.features
      .filter((f) => f.geometry?.coordinates)
      .map((f) => {
        const polys =
          f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
        // The label anchors on the biggest landmass: France reads over
        // France, not over the mid-Atlantic between it and Guiana.
        const outer = polys.map((p) => p[0]).sort((a, b) => ringArea(b) - ringArea(a))[0];
        return point(ringCentroid(outer), {
          name: f.properties.NAME,
          min: f.properties.MIN_LABEL,
          max: f.properties.MAX_LABEL,
        });
      });
    writeFileSync(countryPath, JSON.stringify({ type: "FeatureCollection", features }));
    console.log(`  country-labels.json  generated  ${kb(countryPath)}  (${features.length})`);
  } else {
    console.log(`  country-labels.json  present    ${kb(countryPath)}`);
  }
}

// ---- fonts -------------------------------------------------------------

async function fetchPool(jobs, width, worker) {
  let i = 0;
  let done = 0;
  const errors = [];
  async function lane() {
    while (i < jobs.length) {
      const job = jobs[i++];
      try {
        await worker(job);
      } catch (e) {
        errors.push(`${job}: ${e.message}`);
      }
      done++;
      if (done % 200 === 0) console.log(`    ${done}/${jobs.length}`);
    }
  }
  await Promise.all(Array.from({ length: width }, lane));
  return errors;
}

async function buildFonts() {
  const dir = join(outDir, "fonts", FONT_STACK);
  mkdirSync(dir, { recursive: true });
  const ranges = Array.from({ length: 256 }, (_, i) => `${i * 256}-${i * 256 + 255}`);
  const todo = ranges.filter((r) => FORCE || !existsSync(join(dir, `${r}.pbf`)));
  if (!todo.length) {
    console.log(`  ${FONT_STACK}: 256 ranges present`);
    return;
  }
  const errors = await fetchPool(todo, 16, async (r) => {
    const res = await fetch(`${FONT_HOST}/${encodeURIComponent(FONT_STACK)}/${r}.pbf`);
    if (!res.ok) throw new Error(String(res.status));
    writeFileSync(join(dir, `${r}.pbf`), Buffer.from(await res.arrayBuffer()));
  });
  console.log(`  ${FONT_STACK}: ${todo.length - errors.length} ranges fetched`);
  if (errors.length) console.log(`  failed: ${errors.slice(0, 5).join(", ")}${errors.length > 5 ? "…" : ""}`);
}

// ---- terrain -----------------------------------------------------------

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) =>
  Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      2 ** z,
  );

/** Terrarium DEM tiles: the whole world to dem.worldMaxZoom, then each
 *  extract's bbox to just past its archive zoom, exactly the coverage
 *  pattern the vector tiles already follow. Ocean bathymetry comes along
 *  whether wanted or not; the ocean fill in the style masks it. */
async function buildDem() {
  const dem = basemap.dem;
  const dir = join(outDir, dem.dir);
  const want = new Set();
  for (let z = 0; z <= dem.worldMaxZoom; z++) {
    for (let x = 0; x < 2 ** z; x++) {
      for (let y = 0; y < 2 ** z; y++) want.add(`${z}/${x}/${y}`);
    }
  }
  for (const e of basemap.extracts) {
    const top = Math.min(dem.maxZoom, e.maxZoom + 1);
    for (let z = dem.worldMaxZoom + 1; z <= top; z++) {
      const [x0, x1] = [lon2x(e.bbox[0], z), lon2x(e.bbox[2], z)];
      const [y0, y1] = [lat2y(e.bbox[3], z), lat2y(e.bbox[1], z)];
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) want.add(`${z}/${x}/${y}`);
      }
    }
  }
  const todo = [...want].filter((t) => FORCE || !existsSync(join(dir, `${t}.png`)));
  console.log(`  ${want.size} tiles wanted, ${todo.length} to fetch`);
  if (!todo.length) return;
  const errors = await fetchPool(todo, 24, async (t) => {
    const res = await fetch(`${DEM_HOST}/${t}.png`);
    if (!res.ok) throw new Error(String(res.status));
    const path = join(dir, `${t}.png`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  });
  console.log(`  ${todo.length - errors.length} fetched`);
  if (errors.length) console.log(`  failed: ${errors.slice(0, 5).join(", ")}${errors.length > 5 ? "…" : ""}`);
}

// ---- PMTiles -----------------------------------------------------------

function pmtilesBin() {
  const local = join(homedir(), "go", "bin", "go-pmtiles");
  for (const bin of ["go-pmtiles", local]) {
    try {
      execFileSync(bin, ["version"], { stdio: "ignore" });
      return bin;
    } catch {
      /* keep looking */
    }
  }
  console.log("  installing go-pmtiles (one time, needs go on PATH)");
  execFileSync("go", ["install", "github.com/protomaps/go-pmtiles@latest"], { stdio: "inherit" });
  return local;
}

/** Protomaps publishes a dated planet build; there is no stable "latest"
 *  URL, so walk back from today until one answers. */
async function planetUrl() {
  const day = new Date();
  for (let i = 0; i < 14; i++) {
    const stamp = day.toISOString().slice(0, 10).replaceAll("-", "");
    const url = `${PLANET_HOST}/${stamp}.pmtiles`;
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok) return url;
    day.setUTCDate(day.getUTCDate() - 1);
  }
  throw new Error(`no planet build found under ${PLANET_HOST} in the last 14 days`);
}

async function buildTiles() {
  const dir = join(outDir, "tiles");
  mkdirSync(dir, { recursive: true });

  const jobs = [
    { file: basemap.world.file, maxZoom: basemap.world.maxZoom, bbox: null },
    ...basemap.extracts.map((e) => ({ file: e.file, maxZoom: e.maxZoom, bbox: e.bbox })),
  ];
  const todo = jobs.filter((j) => FORCE || !existsSync(join(dir, j.file)));
  for (const j of jobs.filter((x) => !todo.includes(x))) {
    console.log(`  ${j.file.padEnd(20)}  present    ${kb(join(dir, j.file))}`);
  }
  if (todo.length === 0) return;

  const bin = pmtilesBin();
  const planet = await planetUrl();
  console.log(`  planet: ${planet}`);

  for (const j of todo) {
    const path = join(dir, j.file);
    const args = ["extract", planet, path, `--maxzoom=${j.maxZoom}`];
    if (j.bbox) args.push(`--bbox=${j.bbox.join(",")}`);
    // Range requests against the planet file, so only the tiles inside the
    // bbox cross the wire; the 100+ GB archive is never downloaded.
    execFileSync(bin, args, { stdio: "inherit" });
    console.log(`  ${j.file.padEnd(20)}  extracted  ${kb(path)}`);
  }
}

// ---- planning ----------------------------------------------------------

/** The box one stop needs, and the zoom to fill it to.
 *
 *  Sized to the settle frame rather than to the point, because an extract
 *  edge inside the viewport draws a hard straight line across the shot with
 *  street detail on one side and bare Natural Earth on the other. The zoom
 *  is exactly what the stop is scripted to reach: a scripted film never
 *  goes closer, and dropping one level pays for roughly four times the
 *  ground area, which is what actually removes the edge. */
function boxFor(stop) {
  const halfLon = Math.min(6, Math.max(0.6, 900 / 2 ** stop.zoom));
  const halfLat = halfLon * 0.6;
  return {
    maxZoom: Math.min(10, Math.ceil(stop.zoom)),
    bbox: [stop.lon - halfLon, stop.lat - halfLat, stop.lon + halfLon, stop.lat + halfLat],
  };
}

/** Stops whose frames largely coincide share one archive. Ipswich and
 *  Hingham are twelve miles apart at the same altitude; two archives there
 *  would be the same tiles twice. */
function plan() {
  const close = film.stops.filter((s) => s.zoom > basemap.fallbackMaxZoom);
  const groups = [];
  for (const stop of close) {
    const box = boxFor(stop);
    // Merge when the stop already sits inside a group's box at a zoom that
    // box can serve. Comparing centres instead would leave Omagh with its
    // own archive despite standing inside the England one.
    // Merge when the stop already sits inside a group's box at a zoom that
    // box already serves. Never raise a group's zoom to take a stop in:
    // raising one level quadruples the tiles across the whole box, so one
    // close stop would drag a continent-sized archive up with it.
    const near = groups.find(
      (g) => g.maxZoom >= box.maxZoom && inBbox(stop.lon, stop.lat, g.bbox),
    );
    if (near) {
      near.covers.push(stop.id);
      near.maxZoom = Math.max(near.maxZoom, box.maxZoom);
      near.bbox = [
        Math.min(near.bbox[0], box.bbox[0]),
        Math.min(near.bbox[1], box.bbox[1]),
        Math.max(near.bbox[2], box.bbox[2]),
        Math.max(near.bbox[3], box.bbox[3]),
      ];
      continue;
    }
    groups.push({
      id: stop.id.replace(/-\d+$/, "").replace(/-(now|crossing|waystation)$/, ""),
      lon: stop.lon,
      lat: stop.lat,
      halfLon: (box.bbox[2] - box.bbox[0]) / 2,
      halfLat: (box.bbox[3] - box.bbox[1]) / 2,
      maxZoom: box.maxZoom,
      bbox: box.bbox,
      covers: [stop.id],
    });
  }
  return groups.map((g) => ({
    id: g.id,
    file: `${g.id}-z${g.maxZoom}.pmtiles`,
    maxZoom: g.maxZoom,
    bbox: g.bbox.map((n) => Math.round(n * 100) / 100),
    covers: g.covers,
  }));
}

// ---- coverage ----------------------------------------------------------

/** A stop with no extract clamps to fallbackMaxZoom, which is honest but
 *  distant. This is the list of what is still missing, and it is the
 *  reason this script prints anything at all when everything is present. */
function coverage() {
  const covered = [];
  const missing = [];
  const wideOnly = [];
  for (const stop of film.stops) {
    const e = basemap.extracts.find((x) => inBbox(stop.lon, stop.lat, x.bbox));
    if (e) covered.push({ stop, e });
    // A stop scripted no closer than the fallback wants nothing: the
    // Atlantic crossing and the three-state sweep are meant to be seen from
    // altitude, and an extract under them would never be drawn.
    else if (stop.zoom <= basemap.fallbackMaxZoom) wideOnly.push(stop);
    else missing.push(stop);
  }

  const want = film.stops.length - wideOnly.length;
  console.log(`\ncoverage: ${covered.length} of ${want} close stops have detail`);
  for (const { stop, e } of covered) {
    const short = e.maxZoom < stop.zoom ? `  (scripted z${stop.zoom}, archive stops at z${e.maxZoom})` : "";
    console.log(`  z${e.maxZoom}  ${stop.id.padEnd(22)} ${e.id}${short}`);
  }
  for (const stop of wideOnly) {
    console.log(`  --   ${stop.id.padEnd(22)} scripted wide at z${stop.zoom}, no extract wanted`);
  }
  if (missing.length) {
    console.log(
      `\nclamped to z${basemap.fallbackMaxZoom} for want of an extract. Add to ` +
        `data/basemap.json and rerun. These boxes cover the middle of the settle ` +
        `frame; Natural Earth keeps drawing the rest, so a modest box at a zoom ` +
        `the stop actually reaches beats a wide one nobody can afford:`,
    );
    for (const stop of missing) {
      const { bbox, maxZoom } = boxFor(stop);
      console.log(
        `  ${stop.id.padEnd(22)} z${maxZoom}  bbox ${bbox.map((n) => n.toFixed(2)).join(",")}  ${stop.title}`,
      );
    }
    console.log("  (--plan prints the whole extracts block, groups included)");
  }

  // A `covers` id that names no stop is a rename nobody propagated.
  const ids = new Set(film.stops.map((s) => s.id));
  const orphans = basemap.extracts.flatMap((e) =>
    (e.covers ?? []).filter((c) => !ids.has(c)).map((c) => `${e.id}: ${c}`),
  );
  if (orphans.length) console.log(`\ncovers ids with no film stop: ${orphans.join(", ")}`);
  return orphans.length === 0;
}

function checkOnly() {
  let ok = true;
  const geoDir = join(outDir, "geo");
  const tileDir = join(outDir, "tiles");
  for (const name of [...Object.keys(GEO), "graticule", "cities", "country-labels"]) {
    const p = join(geoDir, `${name}.json`);
    if (existsSync(p)) console.log(`  ok      geo/${name}.json  ${kb(p)}`);
    else {
      console.log(`  MISSING geo/${name}.json`);
      ok = false;
    }
  }
  const font = join(outDir, "fonts", FONT_STACK, "0-255.pbf");
  if (existsSync(font)) console.log(`  ok      fonts/${FONT_STACK}/  (${kb(font)} sample)`);
  else {
    console.log(`  MISSING fonts/${FONT_STACK}/`);
    ok = false;
  }
  const dem0 = join(outDir, basemap.dem.dir, "0/0/0.png");
  if (existsSync(dem0)) console.log(`  ok      ${basemap.dem.dir}/  (z0 sample present)`);
  else {
    console.log(`  MISSING ${basemap.dem.dir}/`);
    ok = false;
  }
  for (const f of [basemap.world.file, ...basemap.extracts.map((e) => e.file)]) {
    const p = join(tileDir, f);
    if (existsSync(p)) console.log(`  ok      tiles/${f}  ${kb(p)}`);
    else {
      console.log(`  MISSING tiles/${f}`);
      ok = false;
    }
  }
  if (!coverage()) ok = false;
  if (!ok) console.log("\nrun: node scripts/build_basemap.mjs");
  return ok;
}

if (has("--plan")) {
  console.log(JSON.stringify(plan(), null, 2));
  process.exit(0);
}

if (CHECK) {
  process.exit(checkOnly() ? 0 : 1);
}

if (wantGeo) {
  console.log("natural earth:");
  await buildGeo();
  console.log("labels:");
  await buildLabels();
}
if (wantFonts) {
  console.log("fonts:");
  await buildFonts();
}
if (wantDem) {
  console.log("terrain:");
  await buildDem();
}
if (wantTiles) {
  console.log("pmtiles:");
  await buildTiles();
}
coverage();
