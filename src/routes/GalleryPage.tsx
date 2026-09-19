/** Every picture the project holds, in one place.
 *
 *  Ethan asked for a tab where he can see all of them (2026-08-16). The
 *  archive is scattered across person pages, story pages and the
 *  migration film's sidebar by design, because a picture beside a name or
 *  a place is a claim about that name or place. This page is the other
 *  view: the collection as a collection, so it is obvious what the family
 *  actually has, what it is missing, and how much of what looks like a
 *  photograph is a reconstruction.
 *
 *  The honesty labels come with them. Filtering by kind is the point of
 *  the filters, not a nicety: "show me only the real ones" has to be one
 *  click. */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  archive,
  archiveUrl,
  KIND_LABEL,
  type ArchiveImage,
  type ArchiveKind,
} from "@/lib/archive";
import { displayName, getPerson, media, storyById } from "@/lib/data";
import { Lightbox } from "@/components/Lightbox";

const KIND_ORDER: ArchiveKind[] = ["direct", "ai-enhanced", "context", "ai-generated"];

/** The year a picture carries, as a number, for sorting only. */
const yearOf = (i: ArchiveImage) => Number(i.year?.match(/\d{4}/)?.[0] ?? 0);

type Sort = "year" | "place" | "kind";

export default function GalleryPage() {
  const [kinds, setKinds] = useState<Set<ArchiveKind>>(new Set());
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("year");
  const [open, setOpen] = useState<ArchiveImage | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of archive) c[i.kind] = (c[i.kind] ?? 0) + 1;
    return c;
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = archive.filter((i) => {
      if (kinds.size && !kinds.has(i.kind)) return false;
      if (!needle) return true;
      const people = i.people.map((p) => displayName(getPerson(p))).join(" ");
      return `${i.caption} ${i.place ?? ""} ${i.year ?? ""} ${people}`
        .toLowerCase()
        .includes(needle);
    });
    return out.sort((a, b) => {
      if (sort === "year") return yearOf(a) - yearOf(b);
      if (sort === "place") return (a.place ?? "~").localeCompare(b.place ?? "~");
      return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    });
  }, [kinds, q, sort]);

  // Attachments that came in with the GEDCOM rather than through the
  // picture archive. They have no rights record of their own, so they are
  // counted here and shown on the people they belong to, never mixed into
  // the archive's grid as though they carried the same provenance.
  const attachments = useMemo(
    () => Object.values(media).filter((m) => m.file).length,
    [],
  );

  function toggle(k: ArchiveKind) {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  return (
    <div className="gallery">
      <div className="partline">
        <h2>Every picture</h2>
      </div>
      <p className="dim gallery__lede">
        {archive.length} pictures gathered with a source and a licence for each,
        plus {attachments} attachment{attachments === 1 ? "" : "s"} that came in
        with the tree itself. A picture is only worth as much as what is known
        about it, so each one says which kind it is: a family place or record, a
        restored original, period context, or a reconstruction that shows a
        plausible scene and not the place itself.
      </p>

      <div className="gallery__bar">
        <div className="gallery__kinds">
          {KIND_ORDER.map((k) => (
            <button
              key={k}
              className="chip"
              data-on={kinds.has(k)}
              onClick={() => toggle(k)}
              title={`Show only ${KIND_LABEL[k]}`}
            >
              {KIND_LABEL[k]} <span className="dim">{counts[k] ?? 0}</span>
            </button>
          ))}
          {kinds.size > 0 && (
            <button className="chip" onClick={() => setKinds(new Set())}>
              All kinds
            </button>
          )}
        </div>
        <input
          className="searchinput gallery__search"
          value={q}
          placeholder="Filter by place, person, year or caption"
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="gallery__sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          title="Order"
        >
          <option value="year">By year</option>
          <option value="place">By place</option>
          <option value="kind">By kind</option>
        </select>
      </div>

      <div className="dim gallery__count">
        {shown.length} of {archive.length} shown
      </div>

      <div className="gallery__grid">
        {shown.map((img) => (
          <figure key={img.file} className="archive__fig" data-kind={img.kind}>
            <button type="button" onClick={() => setOpen(img)} title="Enlarge">
              <img src={archiveUrl(img)} alt={img.caption} loading="lazy" />
            </button>
            <figcaption>
              <span className="archive__badge" data-kind={img.kind}>
                {KIND_LABEL[img.kind]}
              </span>
              <span className="archive__caption">{img.caption}</span>
              <span className="archive__meta">
                {[img.year, img.place].filter(Boolean).join(" · ")}
                {img.license && ` · ${img.license}`}
                {img.sourceUrl && (
                  <>
                    {" · "}
                    <a href={img.sourceUrl} target="_blank" rel="noreferrer">
                      source
                    </a>
                  </>
                )}
              </span>
              <span className="gallery__links">
                {img.people.map((pid) =>
                  getPerson(pid) ? (
                    <Link key={pid} className="chip chip--person" to={`/person/${pid}`}>
                      {displayName(getPerson(pid))}
                    </Link>
                  ) : null,
                )}
                {img.story && storyById.get(img.story) && (
                  <Link className="chip" to={`/story/${img.story}`}>
                    {storyById.get(img.story)!.title}
                  </Link>
                )}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>

      {shown.length === 0 && (
        <p className="dim">
          Nothing matches that. The archive is uneven on purpose: it holds what
          the research rounds could find with a licence, which is a great deal
          for Shrewsbury and Lancaster and nothing at all for some stops.
        </p>
      )}

      {open && (
        <Lightbox src={archiveUrl(open)} alt={open.caption} onClose={() => setOpen(null)}>
          <span className="archive__badge" data-kind={open.kind}>
            {KIND_LABEL[open.kind]}
          </span>{" "}
          {open.caption}
          {open.method && <span className="dim"> · {open.method}</span>}
        </Lightbox>
      )}
    </div>
  );
}
