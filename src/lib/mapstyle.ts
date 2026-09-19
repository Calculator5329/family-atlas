/** The basemap style: a restrained, documentary basemap, not a dashboard.
 *
 *  Two data layers stacked. Natural Earth GeoJSON draws the globe and
 *  everything above continental scale. Protomaps PMTiles archives, all
 *  local files, draw real OpenStreetMap detail where a stop needs it. The
 *  Natural Earth land fill is never faded out, so the edge of an extract
 *  reads as "less detail here" instead of as a rectangle cut out of the
 *  continent.
 *
 *  Painting order matters more than it used to, because terrain sits in
 *  the middle of it: land fills first, then the hillshade over them, then
 *  every water fill above the hillshade. Terrarium tiles carry bathymetry,
 *  and water drawn last is what keeps the sea floor from shading like a
 *  mountain range. Labels ride above everything but the film overlay. */

import type {
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl";
import { basemap, EXTRACTS, WORLD_TILES } from "@/lib/camera";
import { packetManifest } from "@/lib/packet";

/** Absolute URLs, so the pmtiles:// protocol resolves the same in dev,
 *  in a preview build, and from a sub-path. */
const asset = (p: string) => new URL(p, document.baseURI).href;

export const C = {
  ocean: "#0a0e11",
  land: "#20262a",
  coast: "#4a555c",
  border: "#333b41",
  water: "#0d1418",
  river: "#233037",
  grat: "#171b1e",
  road: "#2f373d",
  roadMinor: "#262d32",
  park: "#1c2420",
  labelCity: "#8f99a1",
  labelPlace: "#7c868d",
  labelCountry: "#5f6b74",
  halo: "#0a0e11",
};

const FONT = ["Noto Sans Regular"];

const geo = (n: string): SourceSpecification => ({
  type: "geojson",
  data: asset(`geo/${n}.json`),
});

const pm = (file: string): SourceSpecification => ({
  type: "vector",
  url: `pmtiles://${asset(`tiles/${file}`)}`,
});

const dem = basemap.dem;

// ---- bands -------------------------------------------------------------

/** Everything under the terrain: the flat ground colours. */
function landBand(): LayerSpecification[] {
  return [
    { id: "ne-land", type: "fill", source: "land", paint: { "fill-color": C.land } },
  ];
}

function protoFills(src: string, minzoom: number): LayerSpecification[] {
  const kinds = ["park", "forest", "wood", "nature_reserve", "grass", "cemetery"];
  return [
    {
      id: `${src}-earth`,
      type: "fill",
      source: src,
      "source-layer": "earth",
      minzoom,
      paint: { "fill-color": C.land },
    },
    {
      id: `${src}-landuse`,
      type: "fill",
      source: src,
      "source-layer": "landuse",
      minzoom,
      filter: ["match", ["get", "kind"], kinds, true, false],
      paint: { "fill-color": C.park },
    },
  ];
}

/** The hillshade, computed client-side from vendored terrarium tiles.
 *  Kept deliberately quiet: relief should read like paper texture under
 *  the story, never like a rendered videogame. */
function terrainBand(): LayerSpecification[] {
  return [
    {
      id: "hillshade",
      type: "hillshade",
      source: "dem",
      paint: {
        "hillshade-exaggeration": [
          "interpolate", ["linear"], ["zoom"], 2, 0.2, 6, 0.34, 9, 0.42,
        ],
        "hillshade-shadow-color": "#06090b",
        "hillshade-highlight-color": "#323c43",
        "hillshade-accent-color": "#0c1114",
      },
    },
  ];
}

/** Water above terrain. The Natural Earth ocean polygon masks bathymetry
 *  at globe scale and hands off to OpenStreetMap water (which follows the
 *  real coastline) before its 1:50m edge could show at close range. */
function waterBand(): LayerSpecification[] {
  return [
    {
      id: "ne-ocean",
      type: "fill",
      source: "ocean",
      paint: {
        "fill-color": C.ocean,
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5.4, 1, 6.4, 0],
      },
    },
    { id: "ne-lakes", type: "fill", source: "lakes", paint: { "fill-color": C.water } },
    {
      id: "grat",
      type: "line",
      source: "grat",
      paint: {
        "line-color": C.grat,
        "line-width": 0.6,
        // The graticule used to hide under the land fill; above the ocean
        // mask it would cross continents, so it bows out before that reads.
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 3.5, 1, 5, 0],
      },
    },
  ];
}

const protoWater = (src: string, minzoom: number): LayerSpecification[] => [
  {
    id: `${src}-water`,
    type: "fill",
    source: src,
    "source-layer": "water",
    minzoom,
    paint: { "fill-color": C.water },
  },
];

function lineBand(): LayerSpecification[] {
  return [
    {
      id: "ne-rivers",
      type: "line",
      source: "rivers",
      paint: {
        "line-color": C.river,
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 9, 1.6],
      },
    },
    {
      id: "ne-coast",
      type: "line",
      source: "land",
      paint: {
        "line-color": C.coast,
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.5, 5, 0.9, 9, 1.6],
        "line-opacity": 0.9,
      },
    },
    {
      id: "ne-borders",
      type: "line",
      source: "borders",
      paint: {
        "line-color": C.border,
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 8, 1.2],
        "line-dasharray": [3, 2],
        "line-opacity": 0.85,
      },
    },
  ];
}

function protoLines(src: string, minzoom: number): LayerSpecification[] {
  return [
    {
      id: `${src}-roads-minor`,
      type: "line",
      source: src,
      "source-layer": "roads",
      minzoom: Math.max(minzoom, 8),
      filter: ["match", ["get", "kind"], ["minor_road", "path"], true, false],
      paint: {
        "line-color": C.roadMinor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.3, 13, 1.1],
      },
    },
    {
      id: `${src}-roads`,
      type: "line",
      source: src,
      "source-layer": "roads",
      minzoom,
      filter: ["match", ["get", "kind"], ["highway", "major_road", "medium_road"], true, false],
      paint: {
        "line-color": C.road,
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.3, 9, 0.8, 13, 2.2],
      },
    },
    {
      id: `${src}-coast`,
      type: "line",
      source: src,
      "source-layer": "earth",
      minzoom,
      paint: {
        "line-color": C.coast,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 10, 1.6],
      },
    },
  ];
}

/** Labels, all restrained: muted greys, a halo the colour of the ocean,
 *  and nothing bold. Countries read as letterpressed captions and step
 *  aside before the film's close shots, where the authored era label in
 *  the HUD takes over the naming of things. */
function labelBand(): LayerSpecification[] {
  return [
    {
      id: "city-labels",
      type: "symbol",
      source: "cities",
      minzoom: 3.4,
      maxzoom: 8.6,
      filter: [">=", ["zoom"], ["get", "mz"]],
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 4, 9.5, 8, 12],
        "text-max-width": 8,
        "text-padding": 6,
        "symbol-sort-key": ["get", "rank"],
      },
      paint: {
        "text-color": C.labelCity,
        "text-halo-color": C.halo,
        "text-halo-width": 1.1,
      },
    },
    {
      id: "country-labels",
      type: "symbol",
      source: "countryLabels",
      minzoom: 1.4,
      maxzoom: 6.6,
      filter: [">=", ["zoom"], ["get", "min"]],
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.28,
        "text-size": ["interpolate", ["linear"], ["zoom"], 1.5, 8.5, 5.5, 12.5],
        "text-max-width": 7,
        "text-padding": 8,
      },
      paint: {
        "text-color": C.labelCountry,
        "text-halo-color": C.halo,
        "text-halo-width": 1.3,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.85, 6.6, 0],
      },
    },
  ];
}

/** OpenStreetMap locality names where an extract has real detail; they
 *  pick up where the Natural Earth set bows out. */
function protoLabels(src: string, minzoom: number): LayerSpecification[] {
  return [
    {
      id: `${src}-place-labels`,
      type: "symbol",
      source: src,
      "source-layer": "places",
      minzoom: Math.max(minzoom, 8),
      filter: ["==", ["get", "kind"], "locality"],
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT,
        "text-size": 11.5,
        "text-max-width": 8,
        "text-padding": 6,
        "symbol-sort-key": ["coalesce", ["get", "min_zoom"], 10],
      },
      paint: {
        "text-color": C.labelPlace,
        "text-halo-color": C.halo,
        "text-halo-width": 1.1,
      },
    },
  ];
}

const OVERLAY: LayerSpecification[] = [
  {
    id: "route-ghost",
    type: "line",
    source: "routes",
    layout: { "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 3.4, "line-opacity": 0.12 },
  },
  {
    id: "route",
    type: "line",
    source: "routes",
    layout: { "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 1.4, "line-opacity": 0.95 },
  },
  {
    id: "place-halo",
    type: "circle",
    source: "places",
    paint: {
      "circle-radius": ["*", ["get", "pulse"], 26],
      "circle-color": ["get", "color"],
      "circle-opacity": ["*", ["-", 1, ["get", "pulse"]], 0.18],
    },
  },
  {
    id: "place",
    type: "circle",
    source: "places",
    paint: {
      "circle-radius": ["case", ["get", "current"], 4.4, 2.8],
      "circle-color": C.ocean,
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 1.6,
    },
  },
  {
    id: "vessel",
    type: "circle",
    source: "vessel",
    paint: {
      "circle-radius": 3,
      "circle-color": "#f2f0ec",
      "circle-stroke-color": "#0a0e11",
      "circle-stroke-width": 1,
    },
  },
];

const emptyGeoJson: SourceSpecification = {
  type: "geojson",
  data: { type: "FeatureCollection", features: [] },
};

export function buildStyle(): StyleSpecification {
  const sources: Record<string, SourceSpecification> = {
    land: geo("land-50m"),
    lakes: geo("lakes"),
    rivers: geo("rivers"),
    borders: geo("borders-10m"),
    ocean: geo("ocean-50m"),
    grat: geo("graticule"),
    cities: geo("cities"),
    countryLabels: geo("country-labels"),
    dem: {
      type: "raster-dem",
      tiles: [`${asset(dem.dir)}/{z}/{x}/{y}.png`],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: dem.maxZoom,
    },
    world: pm(WORLD_TILES),
    routes: emptyGeoJson,
    places: emptyGeoJson,
    vessel: emptyGeoJson,
  };

  const layers: LayerSpecification[] = [
    { id: "ocean-bg", type: "background", paint: { "background-color": C.ocean } },
    ...landBand(),
    ...protoFills("world", 3.2),
  ];
  for (const e of EXTRACTS) {
    sources[e.id] = pm(e.file);
    layers.push(...protoFills(e.id, 6));
  }

  layers.push(...terrainBand());
  layers.push(...waterBand());
  layers.push(...protoWater("world", 3.2));
  for (const e of EXTRACTS) layers.push(...protoWater(e.id, 6));

  layers.push(...lineBand());
  layers.push(...protoLines("world", 3.2));
  for (const e of EXTRACTS) layers.push(...protoLines(e.id, 6));

  layers.push(...labelBand());
  for (const e of EXTRACTS) layers.push(...protoLabels(e.id, 6));

  layers.push(...OVERLAY);

  return {
    version: 8,
    name: `${packetManifest().title} film`,
    glyphs: `${asset("fonts")}/{fontstack}/{range}.pbf`,
    // Declared in the style rather than set on the map: setProjection
    // before the style has loaded throws, and the throw kills the page.
    projection: { type: "globe" },
    sources,
    layers,
    // atmosphere-blend is set explicitly because the default fades the
    // atmosphere out entirely by zoom 7, which is where the film spends
    // every settle: the limb should still read as a lit planet there.
    sky: {
      "sky-color": "#070a0c",
      "horizon-color": "#2a3339",
      "fog-color": "#0a0e11",
      "sky-horizon-blend": 0.7,
      "horizon-fog-blend": 0.6,
      "fog-ground-blend": 0.9,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.9, 6, 0.8, 11, 0.5],
    },
  } as StyleSpecification;
}
