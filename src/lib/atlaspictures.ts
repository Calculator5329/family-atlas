/** The picture archive, pinned to the atlas.
 *
 *  Ethan's ask, 2026-08-22: "Images should be somewhere here." They are —
 *  and after the same day's cut of the event and place lists, they are the
 *  first thing the panel holds. The hard part is not the tab: it is that a
 *  picture shown beside a place is a claim about that place, and more than
 *  half of these images are period context rather than the family's own
 *  record.
 *
 *  So a picture is pinned to **one** place and only when its own recorded
 *  place names that place: every meaningful word of the map's label has to
 *  appear in the picture's. Where several places qualify, the most specific
 *  wins, and a tie goes to whichever the picture named first — an image of
 *  "Fayette Township outside Lamoni, Decatur County, Iowa" belongs at
 *  Lamoni, not at the county seat down the road. A picture that matches
 *  nothing on the map is still shown when a person it is tagged to is in
 *  view, but it is not pinned and clicking it will not fly anywhere,
 *  because the map has nowhere honest to fly to. */

import { archive, archiveUrl, placeWords, type ArchiveImage } from "@/lib/archive";
import type { PlaceMass } from "@/lib/atlasevents";

export interface AtlasPicture {
  img: ArchiveImage;
  url: string;
  /** The place mass this picture is pinned to, or null when the only tie
   *  it has to the map is a person. */
  placeKey: string | null;
  placeLabel: string | null;
  lon: number;
  lat: number;
  /** The people in view this picture is tagged to, by name. */
  who: { pid: string; name: string }[];
  /** The four-digit year in the picture's date, for sorting. */
  year: number;
  /** What it is a picture of, which decides the order they come in. */
  tier: PictureTier;
  /** How much there is to look at: 0 a picture, 1 a printed page, 2 a
   *  handwritten one. Orders within a tier. */
  look: 0 | 1 | 2;
  /** The document this page belongs to. Twelve leaves of one court
   *  martial are one thing, not twelve. */
  doc: string;
}

/** What a picture *is*, which the archive does not record.
 *
 *  Ethan's ordering, 2026-08-22: "pictures prioritize people/place images
 *  then ai reconstructions and enhacnements then evidence and maps then
 *  newspapers only lastly borign records and stuff." The archive's own
 *  `kind` field cannot answer that. It records how far a picture is from
 *  the family — direct, context, enhanced, reconstructed — which is an
 *  honesty grade, not a subject. A photograph of the Shrewsbury
 *  meetinghouse and a page of a 1782 court martial are both `direct`, and
 *  one of them is a picture while the other is paperwork.
 *
 *  So the subject is read off the caption and the file name, in the order
 *  a mistake costs least: a newspaper says so, a document says so, a map
 *  says so, and what is left that names a physical thing is a picture of
 *  one. The grade is never overwritten by this — it is still on every
 *  tile, and it still breaks ties inside a tier. */
export type PictureTier = 0 | 1 | 2 | 3 | 4;

export const TIER_LABEL: Record<PictureTier, string> = {
  0: "People and places",
  1: "Reconstructed and restored",
  2: "Evidence and maps",
  3: "Newspapers",
  4: "Records and paperwork",
};

/** Both generated captions end in two sentences about what the picture is
 *  *not* and who made it, and the words in them are the same words this
 *  reads for the words it is. "Direct image of a family-associated
 *  building or record" put a photograph of a meetinghouse in the records
 *  tier, and "Credit: creator listed on source page" kept it there through
 *  the word "page". Both are stripped before anything is asked of the
 *  text. */
const BOILERPLATE =
  /building or record|it does not depict the family|direct image of a family-associated|context image only/g;
/** The credit runs to the end of the caption, and it is about the
 *  photographer, not the photograph. */
const CREDIT = /\bcredit:[\s\S]*$/;

const NEWSPAPER = /\bnews\b|newspaper|gazette|\bherald\b|tribune|obituar|clipping|masthead/;
const DOCUMENT =
  /census|\bwills?\b|deed|probate|deposition|petition|court|transcription|register|\bindex\b|town orders|\brecords?\b|\broll\b|\blist\b|\btax\b|marriage bond|summons|derivative evidence|printing of|\bpages?\b|\bp\d+|title page|schedule|roster|allotment|warrant|testimony|verdict|arraignment/;
/** Two strengths of map word. A book plate that says "map" in its own
 *  file name is a map however many page numbers are printed on it — the
 *  1881 Atwater plates are "atwater1881-p10-map-new-haven-in-1641", and
 *  reading the page number first filed both of them under paperwork. The
 *  weaker words are the ones that also turn up in prose about documents:
 *  a meadow *surveyor*, a garrison *plan* that does not survive. */
const MAP_NAMED =
  /\bmaps?\b|sanborn|\bchart\b|\batlas\b|\bplat\b|landownership|topograph|cadastr|castello plan|enumeration district/;
const MAPPED = /\bsurvey(s|ed|ing)?\b|\bplan\b|elevation/;
const DEPICTED =
  /photograph|photo\b|portrait|postcard|daguerreotype|stereoscop|painting|engrav|lithograph|drawing|sketch|illustration|panorama|landscape|aerial|streetscape|\bview\b|skyline|meetinghouse|church|\bhouse\b|grave|headstone|cemetery|monument|memorial|building|medal|banner|\bmine\b|temple|station|\bfort\b|\bhall\b|\bsign\b|print depicts/;

/** A page of somebody's handwriting is the hardest thing in the archive to
 *  read at thumbnail size, and there are twenty of them: eight leaves of
 *  the Lippincott court martial, four of Washington's demand. They are
 *  evidence and they stay in the evidence tier — they are just the last
 *  of it, under the maps and the printed pages. */
const HANDWRITTEN =
  /manuscript|\bleaf\b|\bleaves\b|leaf\d|handwritten|in (his|her) own hand|autograph|retained contemporary copy/;

/** The credit is stripped from the caption alone. Taking it off the whole
 *  string swallowed the file name with it — every caption ending in a
 *  credit lost the one part that says "map" or "census" out loud. */
const subject = (i: ArchiveImage) =>
  `${i.caption.toLowerCase().replace(CREDIT, " ")} ${i.file.toLowerCase()}`.replace(
    BOILERPLATE,
    " ",
  );

/** One document, however many pages were photographed of it. The trailing
 *  page, leaf, sheet or excerpt token comes off, and so does the page
 *  range a scanned book carries, so twenty-three pages of an 1892 printed
 *  genealogy are one entry rather than a screenful. */
export function pictureDoc(file: string): string {
  let key = file.replace(/\.[a-z0-9]+$/i, "");
  key = key.replace(/[-_](p?\d{1,4}|leaf\d*|sheet-?\d*|excerpt|page-?\d*)$/i, "");
  key = key.replace(/[-_]pp\d+[-_]\d+$/i, "");
  return key;
}

/** The tier, and the order inside it. Both come out of one pass, because
 *  the second answer depends on which test the first one stopped at: a
 *  document is textual whatever else its words say, and reading the
 *  pictorial words separately made "the settler's house" and "meadow
 *  surveyor" sort as a picture and a map. */
export function classifyPicture(i: ArchiveImage): { tier: PictureTier; look: 0 | 1 | 2 } {
  if (i.kind === "ai-generated" || i.kind === "ai-enhanced") return { tier: 1, look: 0 };
  const text = subject(i);
  const ink = HANDWRITTEN.test(text) ? 2 : 1;
  if (NEWSPAPER.test(text)) return { tier: 3, look: ink };
  if (MAP_NAMED.test(text)) return { tier: 2, look: 0 };
  // A document about this family is evidence; the same kind of document
  // about somebody else is the pile at the bottom. That is the one place
  // the honesty grade earns a say in the subject, and it is the right
  // one: `direct` means the family is named in it.
  if (DOCUMENT.test(text)) return { tier: i.kind === "direct" ? 2 : 4, look: ink };
  if (MAPPED.test(text)) return { tier: 2, look: 0 };
  if (DEPICTED.test(text)) return { tier: 0, look: 0 };
  // Nothing named. A direct image with an unreadable caption is more
  // likely another scan; a context image gathered for a place is more
  // likely a view of it.
  return i.kind === "direct" ? { tier: 4, look: ink } : { tier: 0, look: 0 };
}

export const pictureTier = (i: ArchiveImage): PictureTier => classifyPicture(i).tier;

/** Real things before reconstructions, the same order the gallery uses.
 *  Inside a tier only: this no longer decides which tier. */
const KIND_RANK: Record<ArchiveImage["kind"], number> = {
  direct: 0,
  "ai-enhanced": 1,
  context: 2,
  "ai-generated": 3,
};

export const pictureYear = (i: ArchiveImage): number =>
  Number(i.year?.match(/\d{4}/)?.[0] ?? 0);

/** Every picture the current filter set can honestly show, each pinned to
 *  at most one place. `who` maps the people still on the map to their
 *  names; a picture tagged to one of them survives even with no place. */
export function collectPictures(
  masses: PlaceMass[],
  who: Map<string, string>,
): AtlasPicture[] {
  // Split once per place, not once per place per picture: the inner loop
  // runs 160 times over every place still on the map, and a regex split in
  // there cost a quarter of a second every time the year moved.
  const massWords = masses.map((m) => {
    const words = placeWords(m.label);
    return { mass: m, words: new Set(words), first: words[0] ?? "" };
  });

  const out: AtlasPicture[] = [];
  for (const img of archive) {
    const words = img.place ? placeWords(img.place) : [];
    const has = new Set(words);
    let best: { mass: PlaceMass; rank: [number, number] } | null = null;
    for (const { mass, words: mw, first } of massWords) {
      if (!mw.size) continue;
      let all = true;
      for (const w of mw) {
        if (!has.has(w)) {
          all = false;
          break;
        }
      }
      if (!all) continue;
      const at = first ? words.indexOf(first) : -1;
      const rank: [number, number] = [mw.size, -(at < 0 ? 99 : at)];
      if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && rank[1] > best.rank[1])) {
        best = { mass, rank };
      }
    }

    const kind = classifyPicture(img);
    const tagged = img.people
      .filter((pid) => who.has(pid))
      .map((pid) => ({ pid, name: who.get(pid)! }));
    if (!best && !tagged.length) continue;

    out.push({
      img,
      url: archiveUrl(img),
      placeKey: best?.mass.key ?? null,
      placeLabel: best?.mass.label ?? null,
      lon: best?.mass.lon ?? 0,
      lat: best?.mass.lat ?? 0,
      who: tagged,
      year: pictureYear(img),
      tier: kind.tier,
      look: kind.look,
      doc: pictureDoc(img.file),
    });
  }

  return out.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.look - b.look ||
      KIND_RANK[a.img.kind] - KIND_RANK[b.img.kind] ||
      (a.year || 9999) - (b.year || 9999) ||
      a.img.caption.localeCompare(b.img.caption),
  );
}

export interface PictureDoc {
  key: string;
  /** The page shown for the whole document, and the rest behind it. */
  cover: AtlasPicture;
  pages: AtlasPicture[];
}

/** Pages of one document, gathered. Order is kept: a document sits where
 *  its first page sorted to. */
export function groupByDoc(pics: AtlasPicture[]): PictureDoc[] {
  const out: PictureDoc[] = [];
  const index = new Map<string, PictureDoc>();
  for (const p of pics) {
    const hit = index.get(p.doc);
    if (hit) {
      hit.pages.push(p);
      continue;
    }
    const doc = { key: p.doc, cover: p, pages: [p] };
    index.set(p.doc, doc);
    out.push(doc);
  }
  return out;
}

/** How many pictures each place holds, for the mark the map puts on it. */
export function picturesByPlace(pics: AtlasPicture[]): Map<string, number> {
  const c = new Map<string, number>();
  for (const p of pics) {
    if (p.placeKey) c.set(p.placeKey, (c.get(p.placeKey) ?? 0) + 1);
  }
  return c;
}
