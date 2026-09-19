/** The picture archive: rights-documented images gathered by the
 *  research loop into media/context/, ingested by
 *  scripts/parse_context_media.py.
 *
 *  Two kinds, and the split is honesty, not taxonomy: a `direct` image
 *  shows a family place, record or grave; a `context` image only shows
 *  the time and place the family moved through. Every surface labels
 *  which is which, because a 1933 survey sheet of the family
 *  meetinghouse and a pretty period map deserve different trust.
 */

import { mediaUrl, packetFile } from "@/lib/packet";

export type ArchiveKind = "direct" | "context" | "ai-enhanced" | "ai-generated";

export interface ArchiveImage {
  file: string;
  caption: string;
  sourceUrl: string;
  license: string;
  year: string | null;
  place: string | null;
  people: string[];
  story: string | null;
  kind: ArchiveKind;
  /** For AI kinds: the documented facts the image was built from. */
  evidence: string[];
  /** For AI kinds: how it was made ("AI colorization of the 1933 survey
   *  photo", "AI reconstruction from Sanborn schematics"). */
  method: string | null;
}

/** What each kind is called wherever it is shown. One list, because a
 *  picture labelled "period context" in one surface and "AI
 *  reconstruction" in another is worse than no label. */
export const KIND_LABEL: Record<ArchiveKind, string> = {
  direct: "family record or place",
  context: "period context",
  "ai-enhanced": "AI-enhanced original",
  "ai-generated": "AI reconstruction",
};

export const archive: ArchiveImage[] = packetFile<{ images: ArchiveImage[] }>("archive", {
  images: [],
}).images;

export const archiveUrl = (img: ArchiveImage) => mediaUrl(img.file);

const byStory = new Map<string, ArchiveImage[]>();
const byPerson = new Map<string, ArchiveImage[]>();
for (const img of archive) {
  if (img.story) byStory.set(img.story, [...(byStory.get(img.story) ?? []), img]);
  for (const pid of img.people) {
    byPerson.set(pid, [...(byPerson.get(pid) ?? []), img]);
  }
}

/** Real things outrank reconstructions: the family's actual places and
 *  records, then enhanced originals, then period context, and AI
 *  reconstructions last however striking they are. */
const KIND_RANK: Record<ArchiveKind, number> = {
  direct: 0,
  "ai-enhanced": 1,
  context: 2,
  "ai-generated": 3,
};
const directFirst = (a: ArchiveImage, b: ArchiveImage) =>
  KIND_RANK[a.kind] - KIND_RANK[b.kind];

export const archiveForStory = (id: string): ArchiveImage[] =>
  [...(byStory.get(id) ?? [])].sort(directFirst);

/** Place words that carry no geography of their own. Dropped before
 *  comparing, because they are what makes unrelated places look related:
 *  New Jersey and New York share "new", and half the American records
 *  share "county". */
const PLACE_NOISE = new Set([
  "the",
  "of",
  "and",
  "at",
  "near",
  "between",
  "new",
  "old",
  "north",
  "south",
  "east",
  "west",
  "upper",
  "lower",
  "county",
  "colony",
  "city",
  "town",
  "township",
  "parish",
  "province",
  "state",
]);
/** A place string as its meaningful words, in the order it says them.
 *  The order matters to one caller: the atlas pins a picture to the most
 *  specific place it names, and "Fayette Township outside Lamoni, Decatur
 *  County, Iowa" names Lamoni before it names Decatur. */
export const placeWords = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !PLACE_NOISE.has(t));

const placeTokens = (s: string) => new Set(placeWords(s));

/** Does this image belong at this place? A story's archive spans the
 *  whole story, and a story crosses an ocean: story 2 runs from Hingham
 *  in Norfolk to Lancaster in Massachusetts, so its Lancaster images were
 *  appearing beside the English stop and quietly asserting that a New
 *  England town marker was Norfolk.
 *
 *  The test is one shared place word after the generic ones are stripped,
 *  which is deliberately loose. Coney Weston and Ipswich share Suffolk,
 *  Shrewsbury shares New Jersey with Monmouth County, and both of those
 *  are honest pairings: a picture of the right county at the right moment
 *  is exactly what a period image is for. Hingham and Lancaster share
 *  nothing and stay apart. An image with no recorded place contradicts
 *  nothing, so it passes. */
const placeAgrees = (imagePlace: string | null, stopPlace: string): boolean => {
  if (!imagePlace) return true;
  const a = placeTokens(imagePlace);
  const b = placeTokens(stopPlace);
  if (!a.size || !b.size) return true;
  return [...a].some((t) => b.has(t));
};

/** The story's archive, narrowed to one stop on the map. Never widen this
 *  to the whole story: a picture shown beside a place is a claim about
 *  that place. */
export const archiveForStop = (
  storyId: string | null,
  stopPlace: string,
  stopYear?: number,
): ArchiveImage[] => {
  const fromStory = storyId
    ? archiveForStory(storyId).filter((i) => placeAgrees(i.place, stopPlace))
    : [];
  // Then anything in the archive of this exact place, whichever story it
  // was gathered for. The archive is tagged by place as well as by story,
  // and a picture of Hingham belongs at the Hingham stop even though it
  // was collected while writing a different story about the same town.
  const stopWords = placeTokens(stopPlace);
  const exact = stopWords.size
    ? archive.filter(
        (i) =>
          !fromStory.includes(i) &&
          i.place &&
          [...stopWords].every((t) => placeTokens(i.place!).has(t)),
      )
    : [];
  // Then the wider region. A stop titled "Michigan, Iowa, Missouri" names
  // three states and matches none of them exactly, and the 1710 Palatine
  // camp in New York harbour had no pictures at all while the archive held
  // the Hudson valley the same people were sent to. So one shared
  // place word is enough here, ranked by how near in time the picture is,
  // and it fills in after the exact matches rather than displacing them.
  // The gate that matters still holds: an image whose place shares nothing
  // with the stop never appears beside it.
  //
  // A shared state name is a weak claim, so this tier also has to agree
  // about the century: "New York" matched the 1782 Lippincott court-martial
  // papers to the 1710 Palatine camp, which is the same wrong-context bug
  // as showing Massachusetts at a Norfolk stop. Both years must be known
  // and within a long lifetime of each other.
  const near = (i: ArchiveImage) => {
    const y = Number(i.year?.match(/\d{4}/)?.[0]);
    return stopYear && y ? Math.abs(y - stopYear) : Infinity;
  };
  const region =
    stopWords.size && stopYear
      ? archive
          .filter(
            (i) =>
              !fromStory.includes(i) &&
              !exact.includes(i) &&
              i.place &&
              // An image gathered for another story is about that story's
              // event, not this place: the 1782 court-martial papers were
              // collected for the hanging and share only the words "New
              // York" with a 1710 refugee camp.
              !i.story &&
              near(i) <= 50 &&
              [...placeTokens(i.place)].some((t) => t.length > 3 && stopWords.has(t)),
          )
          .sort((a, b) => near(a) - near(b))
          .slice(0, 10)
      : [];
  return [...[...fromStory, ...exact].sort(directFirst), ...region.sort(directFirst)];
};

/** This person's own face, if the archive has one.
 *
 *  Cycle 055 upstream is a reminder of how rare this is: after a deep
 *  open-record pass over the whole tree, exactly one person in it has a
 *  registered likeness. So a face is not just another archive image, and
 *  it should not sit in a strip between two photographs of a
 *  meetinghouse.
 *
 *  The test is deliberately strict, because captioning a building with a
 *  person's name is the failure that matters: the image must be a real
 *  photograph (never a reconstruction), tagged to this person alone, and
 *  its caption must open by naming them. An identification the caption
 *  does not make in its first breath is not one this page will make for
 *  it. */
export const portraitFor = (id: string, name: string): ArchiveImage | null => {
  const parts = name.toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2);
  if (parts.length < 2) return null;
  const given = parts[0];
  const surname = parts[parts.length - 1];
  return (
    (byPerson.get(id) ?? []).find((i) => {
      if (i.kind !== "direct" && i.kind !== "ai-enhanced") return false;
      if (i.people.length !== 1) return false;
      const opening = i.caption.toLowerCase().slice(0, 90);
      return opening.includes(given) && opening.includes(surname);
    }) ?? null
  );
};

/** Real images of this person's own places and records always; the
 *  standing-in kinds capped, because the research loop tags whole-lineage
 *  context sets onto every person in a chain and a person page is not a
 *  slideshow. An enhanced original counts as real: the photograph is
 *  theirs, only its tones were inferred. */
export const archiveForPerson = (id: string, contextCap = 3): ArchiveImage[] => {
  const all = [...(byPerson.get(id) ?? [])];
  // The cap falls on period context alone. A reconstruction was built for
  // one documented scene in this person's life, so it never loses its
  // place to a third interchangeable picture of the right century.
  const kept = [
    ...all.filter((i) => i.kind !== "context"),
    ...all.filter((i) => i.kind === "context").slice(0, contextCap),
  ];
  return kept.sort(directFirst);
};
