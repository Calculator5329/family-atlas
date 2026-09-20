/** Shapes emitted by scripts/parse_gedcom.py and scripts/parse_stories.py.
 *  Keep these in step with the parsers: they are the contract between the
 *  data layer and every surface. Optional fields on Person are optional
 *  because the living fence strips them, not because they are unreliable. */

export interface GDate {
  raw: string;
  year?: number;
  month?: number;
  day?: number;
  /** The GEDCOM said abt/about/circa/bef/aft/bet. The field used to be
   *  called `approx` here and `approximate` in the parser's output, so it
   *  was always undefined and every estimated date rendered as an exact
   *  one — "1805" for a year that is only a stated age in a marriage deed.
   *  Rule 4 of this repo's contract is that evidence honesty carries
   *  through to the UI, and a hedge silently dropped is the same failure
   *  as a grade silently dropped. */
  approximate?: boolean;
  /** "1642/3" — Julian and Gregorian double dating. */
  dualYear?: string;
}

export interface EventRec {
  type: string;
  label: string;
  date?: GDate;
  placeRaw?: string;
  place?: string;
  note?: string;
}

export interface PersonName {
  full: string;
  given: string;
  surname: string;
  suffix: string;
}

export interface Note {
  text: string;
  isLead?: boolean;
  grade?: string;
}

export interface Person {
  id: string;
  name: PersonName;
  altNames?: PersonName[];
  living: boolean;
  sex?: string;
  /** Parent families, the one the chart leads with first. */
  famc: string[];
  fams: string[];
  /** What kind of link a parent family is ("step", "birth", or a ruling's
   *  label such as "believed birth father"), keyed by family id. */
  parentLinks?: Record<string, string>;
  /** Absent on fenced (living) people. */
  events?: EventRec[];
  birth?: EventRec;
  death?: EventRec;
  notes?: Note[];
  sources?: string[];
  mediaRefs?: string[];
  lineages?: string[];
}

export interface Family {
  id: string;
  husband?: string;
  wife?: string;
  children: string[];
  events?: EventRec[];
  marriage?: EventRec;
}

export interface Source {
  id: string;
  title: string;
  author?: string;
  publication?: string;
}

export interface Place {
  id: string;
  label: string;
  precision: "locality" | "region" | "country";
  locality?: string;
  region?: string;
  country?: string;
  lat: number;
  lon: number;
  approximate?: boolean;
}

export interface Lineage {
  key: string;
  label: string;
  rootPerson: string;
  rootPersonName: string;
  color: string;
  origin: string;
  blurb: string;
  memberCount: number;
}

export interface Tree {
  meta: {
    generatedFrom: string;
    gedcomSha256: string;
    rootPerson: string;
    counts: {
      people: number;
      living: number;
      families: number;
      sources: number;
      places: number;
      media: number;
      mediaWithFile: number;
    };
    livingFence: { rule: string; emitted: string };
  };
  lineages: Lineage[];
  people: Record<string, Person>;
  families: Record<string, Family>;
  sources: Record<string, Source>;
  media: Record<string, MediaItem>;
  places: Record<string, Place>;
}

/** An attachment the GEDCOM cites. `file` is present only once the image
 *  itself lands beside this repo; until then the record describes what is
 *  missing, which is more use than the bare xref id it replaced. */
export interface MediaItem {
  id: string;
  title?: string;
  kind?: string;
  width?: number;
  height?: number;
  format?: string;
  provenance?: string;
  file?: string;
}

export interface StoryPerson {
  name: string;
  id?: string;
  candidates?: string[];
}

export interface Story {
  id: string;
  number: number | null;
  title: string;
  part: string;
  line?: string;
  body: string;
  sourcesNote?: string;
  citationCount: number;
  wordCount: number;
  people: StoryPerson[];
  mentions: StoryPerson[];
}

export interface Stories {
  meta: { generatedFrom: string; counts: { stories: number; sections: number } };
  stories: Story[];
  sections: Story[];
}

export interface FilmStop {
  id: string;
  year: number;
  yearLabel: string;
  title: string;
  /** What the place was called then ("Massachusetts Bay Colony"). The
   *  basemap's modern labels bow out at close zoom; this is what replaces
   *  them, authored because no dataset knows it honestly. */
  era?: string;
  lineage: string | null;
  lat: number;
  lon: number;
  zoom: number;
  hold: number;
  kicker?: string;
  narration: string;
  story: string | null;
  people?: string[];
  /** Hand-authored answer to "how related?" for a stop whose people the
   *  tree cannot connect to the viewer at all. Ethan asked the question of
   *  four stops on 2026-08-16; three of them the kinship code can answer
   *  from the graph, and the Batdorf pair cannot be answered by any graph
   *  because the open question IS the story. Authored rather than
   *  generated, and it must state the evidence grade it rests on. */
  kinNote?: string;
  arc?: { from: string; kind: "sea" | "land" };
  /** Passed through, not stopped at: open ocean, or a waystation on the
   *  way somewhere else. check_film.py requires a route in and a route
   *  out, so the drawn line can never end in the middle of the sea. */
  waypoint?: boolean;
}

export interface Film {
  title: string;
  subtitle: string;
  stops: FilmStop[];
}

/** Family mode hides grades, research notes and open questions.
 *  Research mode shows all of it. Ethan's "both, layered" ruling. */
export type Mode = "family" | "research";
