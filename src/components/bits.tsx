/** Small shared pieces. The person chip is the atom that ties the three
 *  surfaces together: it looks and behaves the same in a story, on a
 *  person page, and in the tree panel, and it always carries the lineage
 *  colour so a reader learns the four lines by seeing them. */

import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { getPerson, lifespan, lineageColor, primaryLineage } from "@/lib/data";
import { relationSentence } from "@/lib/kinship";

export function PersonChip({ id, name }: { id?: string; name?: string }) {
  const p = getPerson(id);
  if (!p) return <span className="chip">{name ?? "unknown"}</span>;
  const label = name ?? p.name.full;
  const rel = relationSentence(p.id);
  return (
    <Link
      className="chip chip--person"
      to={`/person/${p.id}`}
      title={`${lifespan(p)} · ${rel ?? "not in your traced line"}`}
    >
      <i className="chip__dot" style={{ background: lineageColor(primaryLineage(p)) }} />
      {label}
    </Link>
  );
}

export function LineageDot({ lineage }: { lineage?: string | null }) {
  return <i className="chip__dot" style={{ background: lineageColor(lineage) }} />;
}

export function Grade({ grade }: { grade: string }) {
  const g = grade.toLowerCase() === "myth" ? "myth" : grade.toUpperCase();
  const title =
    g === "A"
      ? "Grade A: primary record, directly examined"
      : g === "B"
        ? "Grade B: solid secondary source"
        : g === "C"
          ? "Grade C: tradition or inference, not proven"
          : "A claim the research disproved";
  return (
    <span className="grade" data-g={g} title={title}>
      {g === "myth" ? "!" : g}
    </span>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Back({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="backlink" to={to}>
      <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
        <path d="M6.5 2 3 5.5 6.5 9" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </svg>
      {children}
    </Link>
  );
}
