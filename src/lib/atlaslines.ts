/** The ancestral lines: the same records, gathered into people.
 *
 *  Ethan's ask, 2026-08-22: "new expiremental tab that is ancestral lines
 *  (people Kinda)". The atlas has always answered in events — a thousand
 *  baptisms, burials and weddings, each one a dot. That is the right unit
 *  for a map and the wrong unit for a family: nobody thinks in baptisms,
 *  they think in ancestors, and "who is on this screen" is a different
 *  question from "what happened on it".
 *
 *  So this folds every event in view back into the person it belongs to,
 *  and every person into the great-grandparent's line they descend
 *  through — the same eight lines and the same colours the map and the
 *  legend already use, so a group here and a colour there cannot
 *  disagree.
 *
 *  Two honesty notes carry into the rows. The relation is measured from
 *  whoever the viewer is anchored on, through `relationTo`, which answers
 *  null rather than guessing for anyone the tree cannot connect; those
 *  people are shown with no relation line rather than an invented one.
 *  And the move counts are a person's *whole* recorded route, not the
 *  part inside the current year window, because a life does not stop at
 *  the edge of a scrubber. The rows say which. */

import { branches, relationTo, familiarName } from "@/lib/kinship";
import { legsFor } from "@/lib/journeys";
import {
  OFF_BRANCH,
  OFF_BRANCH_KEY,
  OFF_BRANCH_NAME,
  type EventDot,
} from "@/lib/atlasevents";

export interface LinePerson {
  pid: string;
  name: string;
  /** "your 9th great-grandmother", or null when the tree cannot connect
   *  them to the anchor at all. */
  term: string | null;
  /** "through Grandpa Smith", when the path runs through a close one. */
  through: string | null;
  /** Generational steps to the anchor; the nearest kin sort first. */
  dist: number;
  color: string;
  branch: string;
  branchLabel: string;
  /** The dot to fly to when this person is picked: their earliest event
   *  in view. */
  first: number;
  /** How much of the record on this screen is theirs. */
  events: number;
  places: number;
  from: number;
  to: number;
  dated: boolean;
  /** Their whole recorded route, however the map is filtered. */
  moves: number;
  miles: number;
}

export interface LineGroup {
  key: string;
  label: string;
  sub: string;
  color: string;
  people: LinePerson[];
}

/** `relationTo` walks two ancestor sets and this runs over every person on
 *  the screen, which changes on every pan. The answer cannot change while
 *  the anchor holds, so it is asked once per person. */
const relCache = new Map<string, { term: string | null; through: string | null; dist: number }>();

function relation(pid: string, anchor: string) {
  const key = `${anchor}:${pid}`;
  const hit = relCache.get(key);
  if (hit) return hit;
  const rel = relationTo(pid, anchor);
  const answer = {
    term: rel?.term ?? null,
    through: rel?.via ? `through ${familiarName(rel.via.id, anchor)}` : null,
    // Unconnected people sort last rather than first.
    dist: rel?.dist ?? 999,
  };
  relCache.set(key, answer);
  return answer;
}

/** Everyone with an event in `keep`, gathered into their lines. */
export function collectLines(
  dots: EventDot[],
  keep: number[],
  anchor: string,
): LineGroup[] {
  const byPid = new Map<string, LinePerson>();
  const places = new Map<string, Set<string>>();

  for (const i of keep) {
    const d = dots[i];
    let p = byPid.get(d.pid);
    if (!p) {
      const rel = relation(d.pid, anchor);
      const legs = legsFor(d.pid);
      p = {
        pid: d.pid,
        name: d.name,
        term: rel.term,
        through: rel.through,
        dist: rel.dist,
        color: d.color,
        branch: d.branch,
        branchLabel: d.branchLabel,
        first: i,
        events: 0,
        places: 0,
        from: Infinity,
        to: -Infinity,
        dated: false,
        moves: legs.length,
        miles: Math.round(legs.reduce((n, l) => n + l.miles, 0)),
      };
      byPid.set(d.pid, p);
      places.set(d.pid, new Set());
    }
    p.events += 1;
    places.get(d.pid)!.add(d.placeId);
    if (d.dated) {
      if (!p.dated || d.year < p.from) {
        // The earliest dated event is the one worth flying to: it is
        // where the person's part of this map starts.
        p.from = d.year;
        p.first = i;
      }
      p.to = Math.max(p.to, d.year);
      p.dated = true;
    }
  }
  for (const [pid, set] of places) byPid.get(pid)!.places = set.size;

  const list = branches(anchor);
  const groups: LineGroup[] = list.map((b) => ({
    key: b.id,
    label: b.label,
    sub: b.sub,
    color: b.color,
    people: [],
  }));
  const off: LineGroup = {
    key: OFF_BRANCH_KEY,
    label: OFF_BRANCH_NAME,
    sub: "Not on a great-grandparent's line",
    color: OFF_BRANCH,
    people: [],
  };
  const index = new Map(groups.map((g) => [g.key, g]));

  for (const p of byPid.values()) (index.get(p.branch) ?? off).people.push(p);

  for (const g of [...groups, off]) {
    // Nearest kin first, then oldest: the top of a line is the person the
    // viewer can place, and the rest of it runs backwards in time.
    g.people.sort(
      (a, b) => a.dist - b.dist || (a.dated ? a.from : 9999) - (b.dated ? b.from : 9999) || a.name.localeCompare(b.name),
    );
  }
  return [...groups, off].filter((g) => g.people.length > 0);
}

export type LineRow =
  | { kind: "head"; group: LineGroup }
  | { kind: "person"; person: LinePerson };

/** One flat array, headers and people alike, because the list only builds
 *  the rows it can see and that costs a fixed row height. */
export function lineRows(groups: LineGroup[]): LineRow[] {
  const rows: LineRow[] = [];
  for (const group of groups) {
    rows.push({ kind: "head", group });
    for (const person of group.people) rows.push({ kind: "person", person });
  }
  return rows;
}
