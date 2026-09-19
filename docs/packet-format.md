# The packet format

A packet is a directory the viewer fetches at startup. It is the only
place family data lives at runtime: the program bundles none, and every
surface reads from the files listed here.

Format name `family-atlas-packet`, version 1.

## Layout

```
packet/
  manifest.json      what this packet is, and which files it holds
  tree.json          people, families, places, sources, lineages
  stories.json       the written stories and standalone sections
  film.json          the scripted migration film: stops on a map
  transcriptions.json  verbatim record transcriptions
  archive.json       the picture archive: one entry per image file
  quotes.json        original-record quotes with speaker and grade
  glossary.json      period terms and their glosses
  basemap.json       which map regions the film and atlas expect
  media/             the image files archive.json names
```

Every file but the manifest is optional. A packet without pictures is a
thinner app, not a broken one: each role has an empty default in the
viewer.

## manifest.json

```json
{
  "format": "family-atlas-packet",
  "formatVersion": 1,
  "title": "The Example Family",
  "subtitle": "Four lines, four centuries, one tree",
  "intro": "One paragraph for the front door.",
  "generated": "2026-09-19",
  "profile": "share",
  "living": "fenced",
  "livingNote": "Living people appear by name and family link only; no dates, places, notes or sources.",
  "source": { "generatedFrom": "research/tree.ged", "gedcomSha256": "ae53…" },
  "counts": { "people": 876, "living": 46, "stories": 20, "filmStops": 19, "images": 120 },
  "mediaDir": "media",
  "files": {
    "tree": { "path": "tree.json", "bytes": 1277695, "sha256": "…" },
    "stories": { "path": "stories.json", "bytes": 136035, "sha256": "…" }
  }
}
```

- `title` is the name in the browser tab and the top bar. `subtitle` is
  the front-door headline, `intro` the paragraph under it.
- `living` is `"fenced"` or `"included"`, and `livingNote` is the
  sentence the front door shows about it. A fenced packet gives living
  people a name, a sex and their family links, and nothing that dates
  or places a life.
- `files` maps a **role** to a file. The viewer asks for files by role;
  the names in the layout above are conventions, not requirements.
  `sha256` is over the file's bytes, so a packet can be checked after
  an email.
- `mediaDir` is the directory the archive's `file` values resolve in,
  relative to the packet.

## The data files

The shapes are the viewer's TypeScript types in `src/types.ts`
(`Tree`, `Stories`, `Film`) and the interfaces at the top of
`src/lib/records.ts` (`RecordDoc`), `src/lib/archive.ts`
(`ArchiveImage`), `src/lib/quotes.ts` (`Quote`, `GlossTerm`) and
`src/lib/camera.ts` (`Basemap`). The notes below are what the types
cannot say.

**tree.json** has `meta`, `people`, `families`, `places`, `sources`,
`media` and `lineages`. `meta.rootPerson` is the default viewpoint: the
person "you" means until the reader anchors on someone else. Each person
carries `famc` (families they are a child in) and `fams` (families they
are a spouse in); the viewer derives parents, children, siblings and
spouses from those. `lineages` are the curated lines that give the
colour code, each measured from a `rootPerson` and carrying its own
`color`; the viewer names nothing about them and counts them rather than
assuming four.

**stories.json** stories are Markdown in `body`, with citations as
footnotes. `people` and `mentions` link names in the text to person ids
so the viewer can make them links and say how each is related to the
reader. `part` groups stories on the front door. `sections` are
standalone pieces (a timeline, an origin map note) shown outside the
numbered list.

**film.json** is a list of `stops`, each a place, a year, a camera zoom,
narration, and optionally the story it opens. A stop with `arc.from`
draws a route from that earlier stop; a stop marked `waypoint` is passed
through rather than held at, and must have a route in and a route out.

**transcriptions.json** records carry the full `text` of a document, the
`people` it names, the `stories` it serves and an evidence `grade`.

**archive.json** images carry a `kind`: `direct` (a family place, record
or grave), `context` (the time and place, not the family), `ai-enhanced`
or `ai-generated`. The viewer labels every image with its kind and sorts
real ones first. AI kinds must carry `method` and `evidence` saying how
they were made and from what.

**basemap.json** describes the tile extracts the map surfaces expect:
the world file, and per region a file name, bounding box and maximum
zoom. The tiles themselves are not in the packet; `npm run basemap`
builds them from this description.

## Privacy

A packet is somebody's family. The viewer treats it as such: it is never
committed to the program's repository (`public/packet/` is ignored), it
is fetched from beside the page rather than from any server, and nothing
in the program sends it anywhere. Whoever builds a packet decides what
goes in it; the `living` field tells the reader what was decided.
