# Family atlas

A story-first viewer for a family history. It reads a **packet**, a folder
of JSON and pictures built from a GEDCOM and a set of written stories, and
turns it into a chronicle, a migration film played on a real map, an atlas
of every recorded event, a picture archive, and an explorable tree.

The program holds no family of its own. This repository has no data in it
and never has: it was exported from a private repository by a script that
refuses to write if any byte names a person in the tree.

## Loading a packet

You were probably sent a zip file. Then:

1. Unzip it. You get a folder named `packet` with `manifest.json` inside.
2. Put that folder at `public/packet/` in this checkout.
3. `npm install`, then `npm run dev`, and open the address it prints.

Without a packet the page says so and tells you where it looked.

The map surfaces (Migration, Atlas) also need basemap tiles, which are not
in the packet because they are large and not the family's. Build them once
with `npm run basemap`; it reads `public/packet/basemap.json` to know which
regions the packet expects and downloads the rest, about 275 MB. The first
run installs the `go-pmtiles` extractor, so it needs Go on your PATH once
(https://go.dev/dl). Everything else works without the tiles, and the map
pages say so until they exist.

## Building a packet

The packet format is described in [docs/packet-format.md](docs/packet-format.md).
The pipeline that builds one from a GEDCOM, a stories file and a media
manifest lives with the family data, in the private repository this viewer
was exported from. Writing your own is a matter of producing the files that
document lists.

## Developing

```sh
npm install
npm run dev      # Vite dev server
npm test         # tsc --noEmit
npm run build    # static site into dist/, packet not included
```

Design rules for the surfaces are in [docs/taste.md](docs/taste.md): dark
by default, no gradients, no glassmorphism, evidence grades always visible
in research mode and never louder than the story in family mode.

## License

MIT. See [LICENSE](LICENSE).

Exported 2026-09-19.
