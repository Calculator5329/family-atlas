/** Atlas glyphs: one small shape per kind of event, drawn once per colour
 *  so the map can carry two encodings at once.
 *
 *  Ethan's ask, 2026-08-16: "in atlas lets color code by great grandparent
 *  and shape code for event (icons)". Colour answers whose line a dot
 *  belongs to, shape answers what happened there, and the two are readable
 *  together only if neither one is doing the other's job.
 *
 *  The shapes are drawn to a canvas and registered as ordinary raster
 *  images rather than SDF icons: an SDF re-tinted at draw time softens a
 *  6px glyph into a smudge, and at this size the difference between a
 *  square and a diamond is the whole point. One image per shape and colour
 *  pair is cheap, and there are at most nine colours. */

export type EventShape =
  | "born"
  | "christened"
  | "married"
  | "lived"
  | "died"
  | "buried"
  | "other";

export const EVENT_SHAPES: { shape: EventShape; label: string; short?: string }[] = [
  { shape: "born", label: "Born" },
  // The legend puts these in two columns, and one label is four times the
  // length of the rest; the short form is for the chip and the long one
  // stays on its title.
  { shape: "christened", label: "Christened or baptised", short: "Christened" },
  { shape: "married", label: "Married" },
  { shape: "lived", label: "Lived" },
  { shape: "died", label: "Died" },
  { shape: "buried", label: "Buried" },
  { shape: "other", label: "Other record" },
];

/** The GEDCOM's event labels, which the parser already normalises, mapped
 *  onto the seven shapes. Anything unrecognised becomes "other" rather
 *  than disappearing. */
export function shapeFor(label: string): EventShape {
  switch (label) {
    case "Born":
      return "born";
    case "Christened":
    case "Baptized":
      return "christened";
    case "Marriage":
      return "married";
    case "Lived":
      return "lived";
    case "Died":
      return "died";
    case "Buried":
      return "buried";
    default:
      return "other";
  }
}

/** The shapes are authored in a 22-unit box, and rasterised into a larger
 *  one. Keeping the two apart means the glyphs can grow without every path
 *  below being redrawn by hand, and the stroke grows with them because
 *  ctx.scale scales lineWidth too.
 *
 *  Ethan's ask, 2026-08-21: "make the icons a lot bigger just so it's easy
 *  to navigate around and see stuff." At the old 11px on screen, a birth
 *  and a burial were the same grey speck until you leaned in. */
const BASE = 22;
const SIZE = 40;
const R = BASE / 2;

/** What one glyph measures on screen, for the legend to match the map. */
export const GLYPH_PX = SIZE / 2;

function path(ctx: CanvasRenderingContext2D, shape: EventShape) {
  const c = R;
  switch (shape) {
    case "born":
      ctx.arc(c, c, 7, 0, Math.PI * 2);
      break;
    case "christened":
      // A ring: the same circle as a birth, hollowed, because a baptism
      // is a birth's paper record rather than the event itself.
      ctx.arc(c, c, 7, 0, Math.PI * 2);
      ctx.arc(c, c, 3.4, 0, Math.PI * 2, true);
      break;
    case "married":
      ctx.moveTo(c, c - 8);
      ctx.lineTo(c + 8, c);
      ctx.lineTo(c, c + 8);
      ctx.lineTo(c - 8, c);
      break;
    case "lived":
      ctx.rect(c - 6, c - 6, 12, 12);
      break;
    case "died":
      // An upright cross, the one shape on the map that reads as an ending
      // without a caption.
      ctx.rect(c - 2, c - 8, 4, 16);
      ctx.rect(c - 7, c - 2, 14, 4);
      break;
    case "buried":
      ctx.moveTo(c - 8, c - 5);
      ctx.lineTo(c + 8, c - 5);
      ctx.lineTo(c, c + 8);
      break;
    case "other":
      ctx.arc(c, c, 3.6, 0, Math.PI * 2);
      break;
  }
  ctx.closePath();
}

export function glyphName(shape: EventShape, colorIndex: number): string {
  return `atlas-${shape}-${colorIndex}`;
}

function draw(shape: EventShape, color: string): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SIZE / BASE, SIZE / BASE);
  ctx.beginPath();
  path(ctx, shape);
  ctx.fillStyle = color;
  ctx.fill("evenodd");
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "#06090b";
  ctx.stroke();
  return ctx;
}

/** An ImageData for one shape in one colour, ready for map.addImage. */
export function glyphImage(shape: EventShape, color: string): ImageData {
  return draw(shape, color).getImageData(0, 0, SIZE, SIZE);
}

/** Rasterising is not free: canvas.toDataURL cost 383ms for the 416 glyphs
 *  one atlas render asks for, and the atlas re-rendered on every mouse
 *  move over the map. There are nine shapes and eleven colours, so the
 *  whole answer set is ninety-nine strings; cache them. */
const urlCache = new Map<string, string>();

/** The same glyph for the legend, so the key is drawn by the code that
 *  draws the map rather than by a second set of shapes that can drift. */
export function glyphUrl(shape: EventShape, color = "#C6CDD4"): string {
  const key = `${shape}|${color}`;
  let url = urlCache.get(key);
  if (!url) {
    url = draw(shape, color).canvas.toDataURL();
    urlCache.set(key, url);
  }
  return url;
}

/** The arrowhead the static migration lines carry, one per branch colour.
 *
 *  Drawn the same way as the event shapes and for the same reason: an SDF
 *  triangle re-tinted at 8px is a smudge, and a line whose direction you
 *  have to guess is a line that says people moved without saying which
 *  way. The triangle points along +x; MapLibre rotates it to the line. */
export function arrowName(colorIndex: number): string {
  return `atlas-arrow-${colorIndex}`;
}

export function arrowImage(color: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SIZE / BASE, SIZE / BASE);
  const c = R;
  ctx.beginPath();
  ctx.moveTo(c + 7, c);
  ctx.lineTo(c - 5, c - 6);
  ctx.lineTo(c - 2.5, c);
  ctx.lineTo(c - 5, c + 6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "#06090b";
  ctx.stroke();
  return ctx.getImageData(0, 0, SIZE, SIZE);
}
