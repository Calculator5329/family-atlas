/** The person page is the atom every other surface points at: a story
 *  chip, a tree node, a film stop and a search hit all land here.
 *
 *  Living people reach this page too, and see a stated fence rather than
 *  an empty page. Nothing is hidden by CSS: the parser never emitted the
 *  fields, so there is nothing here to leak. */

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  displayName,
  families,
  formatDate,
  getPerson,
  getPlace,
  lifespan,
  lineageByKey,
  lineageColor,
  placeLabel,
  primaryLineage,
  relationsOf,
  sources,
  storiesFor,
  tree,
} from "@/lib/data";
import { useResearchMode } from "@/lib/mode";
import {
  DEFAULT_ANCHOR,
  descendantDepth,
  lineLabel,
  relationSentence,
  relationTo,
  setAnchor,
  useAnchor,
} from "@/lib/kinship";
import { quotesForPerson } from "@/lib/quotes";
import { recordsForPerson } from "@/lib/records";
import { archiveForPerson, archiveUrl, portraitFor } from "@/lib/archive";
import { Lightbox } from "@/components/Lightbox";
import { PersonChip, Section } from "@/components/bits";
import { QuoteBlock } from "@/components/QuoteBlock";
import { RecordBlock } from "@/components/RecordBlock";
import { ArchiveStrip } from "@/components/ArchiveStrip";
import MediaGallery from "@/components/MediaGallery";
import NotFound from "@/routes/NotFound";
import type { EventRec, Person } from "@/types";
import type { ArchiveImage } from "@/lib/archive";

const TAG_RE = /^([A-Z][A-Z /-]{2,28}):\s*/;

/** " · Hingham, Norfolk, England", linking to the place page when the
 *  gazetteer knows the place. */
function PlaceRef({ pid, raw }: { pid?: string | null; raw?: string }) {
  const label = placeLabel(pid, raw);
  if (!label) return null;
  if (!pid || !getPlace(pid)) return <span className="dim"> · {label}</span>;
  return (
    <span className="dim">
      {" "}
      ·{" "}
      <Link
        to={`/place/${pid}`}
        style={{ color: "inherit", textDecoration: "underline dotted", textUnderlineOffset: 3 }}
      >
        {label}
      </Link>
    </span>
  );
}

function PersonLink({ id, note }: { id: string; note?: string }) {
  const p = getPerson(id);
  if (!p) return null;
  return (
    <Link className="relrow" to={`/person/${id}`}>
      <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <i className="chip__dot" style={{ background: lineageColor(primaryLineage(p)) }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayName(p)}
        </span>
      </span>
      <small>{note ?? lifespan(p)}</small>
    </Link>
  );
}

function timelineOf(p: Person): { key: string; year?: number; label: string; detail: string }[] {
  const rows: { key: string; year?: number; label: string; detail: string }[] = [];

  for (const e of p.events ?? []) {
    rows.push({
      key: `e:${e.type}:${e.date?.raw ?? ""}`,
      year: e.date?.year,
      label: e.label,
      detail: [formatDate(e.date), placeLabel(e.place, e.placeRaw)].filter(Boolean).join(" · "),
    });
  }

  for (const fid of p.fams) {
    const f = families[fid];
    const m: EventRec | undefined = f?.marriage;
    if (!f) continue;
    const other = f.husband === p.id ? f.wife : f.husband;
    const spouse = getPerson(other ?? undefined);
    rows.push({
      key: `m:${fid}`,
      year: m?.date?.year,
      label: spouse ? `Married ${displayName(spouse)}` : "Married",
      detail: m
        ? [formatDate(m.date), placeLabel(m.place, m.placeRaw)].filter(Boolean).join(" · ")
        : "date not recorded",
    });
  }

  return rows.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
}

/** The person's own face, when one exists. Shown before the name, at the
 *  size a photograph deserves, with the identification the caption makes
 *  and the rights it carries, because a face without provenance is a
 *  claim this app does not get to make silently. */
function Portrait({ img, name }: { img: ArchiveImage; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <figure className="personface">
      <button type="button" onClick={() => setOpen(true)} title="Enlarge">
        <img src={archiveUrl(img)} alt={`${name}${img.year ? `, ${img.year}` : ""}`} />
      </button>
      <figcaption>
        {img.year && <b>{img.year}</b>}
        {img.place && ` · ${img.place}`}
        {img.license && ` · ${img.license}`}
        {img.sourceUrl && (
          <>
            {" · "}
            <a href={img.sourceUrl} target="_blank" rel="noreferrer">
              source
            </a>
          </>
        )}
      </figcaption>
      {open && (
        <Lightbox src={archiveUrl(img)} alt={name} onClose={() => setOpen(false)}>
          {img.caption}
        </Lightbox>
      )}
    </figure>
  );
}

export default function PersonPage() {
  const { id } = useParams();
  const research = useResearchMode();
  const anchor = useAnchor();
  const p = getPerson(id);
  if (!p || !id) return <NotFound />;

  const kin = id === anchor ? null : relationSentence(id, anchor);
  const personQuotes = quotesForPerson(id);
  const personRecords = recordsForPerson(id);

  const rel = relationsOf(id);
  const lin = primaryLineage(p);
  const lineage = lin ? lineageByKey.get(lin) : undefined;
  const personStories = storiesFor(id);
  const notes = p.notes ?? [];
  const shownNotes = research ? notes : notes.filter((n) => !n.isLead);
  const leads = notes.filter((n) => n.isLead);
  const timeline = timelineOf(p);
  const birthPlace = getPlace(p.birth?.place);
  const portrait = portraitFor(id, displayName(p));

  return (
    <div className="page">
      <div className="person">
        <div>
          <div className="personhead">
            {portrait && <Portrait img={portrait} name={displayName(p)} />}
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <i
                className="chip__dot"
                style={{ width: 8, height: 8, background: lineageColor(lin) }}
              />
              <span className="eyebrow">
                {lineLabel(id, p, anchor)}
              </span>
            </div>
            <h1>{displayName(p)}</h1>
            <div className="personhead__life">
              {p.living ? "Living" : lifespan(p)}
              {birthPlace && !p.living && ` · ${birthPlace.label}`}
            </div>
            {kin && (
              <div className="kinline" style={{ marginTop: 10, marginBottom: 0 }}>
                <i className="kinline__mark" aria-hidden="true" />
                {kin}
              </div>
            )}
          </div>

          {p.living && !p.events ? (
            <div className="fenced">
              <strong style={{ color: "var(--text-000)" }}>
                This person is living, so the record stops here.
              </strong>
              <p style={{ margin: "8px 0 0" }}>
                Names and family links are shown. Dates, places, records and notes for
                living people are stripped when the data is built, not hidden by the
                page, so nothing about them is in this app to be found.
              </p>
            </div>
          ) : (
            <>
              {p.living && (
                <div className="localonly">
                  <strong>A living relative, shown in full.</strong> Their dates,
                  places and notes are built into this app because you asked to
                  read about the family at every distance. That makes this copy
                  personal data: it is meant for this machine, and nothing here
                  should be deployed or published.
                </div>
              )}
              <dl className="facts">
                {p.birth && (
                  <>
                    <dt>Born</dt>
                    <dd>
                      {formatDate(p.birth.date) || "date unknown"}
                      <PlaceRef pid={p.birth.place} raw={p.birth.placeRaw} />
                    </dd>
                  </>
                )}
                {p.death && (
                  <>
                    <dt>Died</dt>
                    <dd>
                      {formatDate(p.death.date) || "date unknown"}
                      <PlaceRef pid={p.death.place} raw={p.death.placeRaw} />
                    </dd>
                  </>
                )}
                {p.altNames && p.altNames.length > 0 && (
                  <>
                    <dt>Also known as</dt>
                    <dd>{p.altNames.map((n) => n.full).join(", ")}</dd>
                  </>
                )}
                {lineage && (
                  <>
                    <dt>Line</dt>
                    <dd>
                      <Link to={`/tree?lineage=${lineage.key}`} style={{ color: "var(--text-000)" }}>
                        {lineage.label}
                      </Link>
                      <span className="dim"> · {lineage.origin}</span>
                    </dd>
                  </>
                )}
              </dl>

              {timeline.length > 0 && (
                <Section title="Life">
                  <ul className="timeline" style={{ padding: "0 0 0 20px", margin: 0 }}>
                    {timeline.map((row) => (
                      <li key={row.key}>
                        <b>{row.year ?? "?"}</b>
                        <em>{row.label}</em>
                        <small>{row.detail}</small>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {shownNotes.length > 0 && (
                <Section title={research ? "Research notes" : "What is known"}>
                  {shownNotes.map((n, i) => {
                    const tag = TAG_RE.exec(n.text);
                    return (
                      <div key={i} className="notecard" data-lead={n.isLead === true}>
                        {tag && <span className="notecard__tag">{tag[1].toLowerCase()}</span>}
                        {tag ? n.text.slice(tag[0].length) : n.text}
                      </div>
                    );
                  })}
                </Section>
              )}

              {!research && leads.length > 0 && (
                <p className="dim" style={{ fontSize: 12.5, marginTop: 18 }}>
                  {leads.length} open research {leads.length === 1 ? "question" : "questions"}{" "}
                  about this person are hidden in family mode.
                </p>
              )}

              {(personQuotes.length > 0 || personRecords.length > 0) && (
                <Section title="From the record">
                  {personQuotes.map((q) => (
                    <QuoteBlock key={q.id} q={q} />
                  ))}
                  {personRecords.map((r) => (
                    <RecordBlock key={r.id} r={r} />
                  ))}
                </Section>
              )}

              {p.mediaRefs && p.mediaRefs.length > 0 && (
                <MediaGallery ids={p.mediaRefs} />
              )}

              {archiveForPerson(id).filter((i) => i !== portrait).length > 0 && (
                <Section title="From the archive">
                  <ArchiveStrip images={archiveForPerson(id).filter((i) => i !== portrait)} />
                </Section>
              )}

              {research && p.sources && p.sources.length > 0 && (
                <Section title={`Sources (${p.sources.length})`}>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text-200)" }}>
                    {p.sources.map((sid) => {
                      const s = sources[sid];
                      return (
                        <li key={sid} style={{ marginBottom: 5 }}>
                          <span style={{ color: "var(--text-100)" }}>{s?.title ?? sid}</span>
                          {s?.author && <span className="dim"> · {s.author}</span>}
                        </li>
                      );
                    })}
                  </ol>
                </Section>
              )}
            </>
          )}
        </div>

        <aside className="rail">
          {personStories.length > 0 && (
            <div className="railbox">
              <h3>Appears in</h3>
              {personStories.map((s) => (
                <Link key={s.id} className="relrow" to={`/story/${s.id}`}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
                  <small>{s.number != null ? String(s.number).padStart(2, "0") : ""}</small>
                </Link>
              ))}
            </div>
          )}

          {rel.primaryParents.length > 0 && (
            <div className="railbox">
              <h3>Parents</h3>
              {rel.primaryParents.map((pid) => (
                <PersonLink key={pid} id={pid} />
              ))}
            </div>
          )}

          {rel.otherParents.length > 0 && (
            <div className="railbox">
              <h3>Also</h3>
              {rel.otherParents.map((o) => (
                <PersonLink key={o.id} id={o.id} note={o.label} />
              ))}
            </div>
          )}

          {rel.spouses.length > 0 && (
            <div className="railbox">
              <h3>{rel.spouses.length > 1 ? "Spouses" : "Spouse"}</h3>
              {rel.spouses.map((s) => (
                <PersonLink
                  key={s.id}
                  id={s.id}
                  note={s.family.marriage?.date?.year ? `m. ${s.family.marriage.date.year}` : undefined}
                />
              ))}
            </div>
          )}

          {rel.children.length > 0 && (
            <div className="railbox">
              <h3>Children ({rel.children.length})</h3>
              {rel.children.map((cid) => (
                <PersonLink key={cid} id={cid} />
              ))}
            </div>
          )}

          {rel.siblings.length > 0 && (
            <div className="railbox">
              <h3>Siblings ({rel.siblings.length})</h3>
              {rel.siblings.map((sid) => (
                <PersonLink key={sid} id={sid} />
              ))}
            </div>
          )}

          <div className="railbox">
            <h3>Explore</h3>
            <Link
              className="relrow"
              to={
                rel.children.length > 0
                  ? `/tree?focus=${id}&dir=descendants&depth=${Math.min(
                      14,
                      Math.max(3, descendantDepth(id)),
                    )}`
                  : `/tree?focus=${id}`
              }
            >
              <span>
                {rel.children.length > 0 ? "Show their descendants in the tree" : "Show in the tree"}
              </span>
              <small>→</small>
            </Link>
            {id !== anchor && relationTo(id, anchor) && (
              <Link
                className="relrow"
                to={`/tree?thread=${id}&focus=${anchor}&dir=ancestors&depth=${Math.min(
                  12,
                  Math.max(5, (relationTo(id, anchor)?.dist ?? 5) + 1),
                )}`}
              >
                <span>Light the thread from you</span>
                <small>→</small>
              </Link>
            )}
            {!p.living && (p.events ?? []).some((e) => e.place) && (
              <Link className="relrow" to={`/map?person=${id}`}>
                <span>Show on the map</span>
                <small>→</small>
              </Link>
            )}
            {id !== anchor ? (
              <button className="relrow relrow--btn" onClick={() => setAnchor(id)}>
                <span>Measure the tree from this person</span>
                <small>→</small>
              </button>
            ) : (
              id !== DEFAULT_ANCHOR && (
                <button className="relrow relrow--btn" onClick={() => setAnchor(null)}>
                  <span>Relations are measured from here · reset</span>
                  <small>×</small>
                </button>
              )
            )}
          </div>

          {research && (
            <div className="railbox">
              <h3>Record</h3>
              <div className="dim" style={{ fontSize: 11.5, fontFamily: "var(--mono)", lineHeight: 1.7 }}>
                <div>{p.id}</div>
                <div>gedcom {tree.meta.gedcomSha256}</div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {rel.spouses.length === 0 && rel.children.length === 0 && (
        <p className="dim" style={{ fontSize: 12.5, marginTop: 40 }}>
          <PersonChip id={id} /> has no recorded marriage or children in this file. That is
          often a gap in the record rather than a fact about the person.
        </p>
      )}
    </div>
  );
}
