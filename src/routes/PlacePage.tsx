/** One place, and everyone the record puts there.
 *
 *  A place page answers the question a map dot raises: who of ours was
 *  here, when, and doing what. Rows are the same dated events the atlas
 *  plots, told as a ledger for a single town, oldest first, so four
 *  generations passing through Hingham read as a residency. */

import { Link, useParams } from "react-router-dom";
import {
  displayName,
  families,
  getPerson,
  lineageColor,
  people,
  places,
  primaryLineage,
  storiesFor,
} from "@/lib/data";
import { Back, PersonChip } from "@/components/bits";
import NotFound from "@/routes/NotFound";
import type { Story } from "@/types";

interface Visit {
  pid: string;
  year?: number;
  label: string;
}

function visitsTo(placeId: string): Visit[] {
  const rows: Visit[] = [];
  for (const p of Object.values(people)) {
    for (const e of p.events ?? []) {
      if (e.place === placeId) rows.push({ pid: p.id, year: e.date?.year, label: e.label });
    }
  }
  for (const f of Object.values(families)) {
    if (f.marriage?.place !== placeId) continue;
    for (const pid of [f.husband, f.wife]) {
      if (pid) rows.push({ pid, year: f.marriage.date?.year, label: "Married" });
    }
  }
  return rows.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
}

export default function PlacePage() {
  const { id } = useParams();
  const place = id ? places[id] : undefined;
  if (!place || !id) return <NotFound />;

  const visits = visitsTo(id);
  const visitors = [...new Set(visits.map((v) => v.pid))];

  // Stories that involve anyone recorded at this place.
  const storySet = new Map<string, Story>();
  for (const pid of visitors) {
    for (const s of storiesFor(pid)) storySet.set(s.id, s);
  }
  const relatedStories = [...storySet.values()].sort(
    (a, b) => (a.number ?? 99) - (b.number ?? 99),
  );

  const span =
    visits.length > 1 && visits[0].year && visits[visits.length - 1].year
      ? `${visits[0].year} to ${visits[visits.length - 1].year}`
      : null;

  return (
    <div className="page">
      <Back to="/atlas">The atlas</Back>

      <div className="storyhead">
        <div className="eyebrow" style={{ marginTop: 18 }}>
          {place.precision === "locality" ? "A place" : place.precision === "region" ? "A region" : "A country"}
          {place.approximate && " · location approximate"}
        </div>
        <h1>{place.label}</h1>
        <div className="dim" style={{ fontSize: 13 }}>
          {visitors.length} {visitors.length === 1 ? "person" : "people"} recorded here
          {span && ` · ${span}`}
        </div>
      </div>

      <div className="person">
        <div>
          {visits.length > 0 ? (
            <ul className="timeline" style={{ padding: "0 0 0 20px", margin: 0 }}>
              {visits.map((v, i) => {
                const p = getPerson(v.pid);
                return (
                  <li key={`${v.pid}-${v.label}-${i}`}>
                    <b>{v.year ?? "?"}</b>
                    <em>
                      <Link
                        to={`/person/${v.pid}`}
                        style={{
                          color: "var(--text-000)",
                          borderBottom: `1px solid ${lineageColor(primaryLineage(p))}`,
                        }}
                      >
                        {displayName(p)}
                      </Link>{" "}
                      · {v.label}
                    </em>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dim">No dated events are recorded at this place.</p>
          )}
        </div>

        <aside className="rail">
          {relatedStories.length > 0 && (
            <div className="railbox">
              <h3>Stories through here</h3>
              {relatedStories.slice(0, 8).map((s) => (
                <Link key={s.id} className="relrow" to={`/story/${s.id}`}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
                  <small>{s.number != null ? String(s.number).padStart(2, "0") : ""}</small>
                </Link>
              ))}
            </div>
          )}

          <div className="railbox">
            <h3>People here</h3>
            <div className="peoplerow" style={{ padding: "4px 0" }}>
              {visitors.slice(0, 14).map((pid) => (
                <PersonChip key={pid} id={pid} />
              ))}
              {visitors.length > 14 && (
                <span className="dim" style={{ fontSize: 12 }}>
                  and {visitors.length - 14} more above
                </span>
              )}
            </div>
          </div>

          <div className="railbox">
            <h3>Explore</h3>
            <Link className="relrow" to={`/map?place=${id}`}>
              <span>Show on the map</span>
              <small>→</small>
            </Link>
            <Link className="relrow" to="/atlas">
              <span>All events in the atlas</span>
              <small>→</small>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
