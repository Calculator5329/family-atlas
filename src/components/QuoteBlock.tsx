/** The record's own words, set apart from our retelling.
 *
 *  A quote block is deliberately the most formal thing on the page: the
 *  original text large and serif, the chain of custody underneath it,
 *  and period language carrying its gloss right where it is read. In
 *  research mode the evidence grade rides along; in family mode the
 *  words stand alone.
 */

import type { ReactNode } from "react";
import { Fragment } from "react";
import { useResearchMode } from "@/lib/mode";
import { termsIn, type GlossTerm, type Quote } from "@/lib/quotes";
import { Grade } from "@/components/bits";

/** Wrap the first occurrence of each glossary term in a dotted underline
 *  with its definition on hover. Strings only; nested nodes pass through. */
export function glossify(text: string): ReactNode {
  let nodes: ReactNode[] = [text];
  for (const t of termsIn(text)) {
    let done = false;
    nodes = nodes.flatMap((n, i) => {
      if (done || typeof n !== "string") return [n];
      const at = n.toLowerCase().indexOf(t.term.toLowerCase());
      if (at < 0) return [n];
      done = true;
      return [
        n.slice(0, at),
        <span key={`${t.term}-${i}`} className="gloss" title={t.gloss}>
          {n.slice(at, at + t.term.length)}
        </span>,
        n.slice(at + t.term.length),
      ];
    });
  }
  return <>{nodes.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</>;
}

export function QuoteBlock({ q }: { q: Quote }) {
  const research = useResearchMode();
  return (
    <figure className="quoteblock">
      <blockquote>{glossify(q.text)}</blockquote>
      <figcaption>
        <span className="quoteblock__speaker">{q.speaker}</span>
        <span className="quoteblock__source">
          {q.source}
          {research && <Grade grade={q.grade} />}
        </span>
        {q.context && <span className="quoteblock__context">{q.context}</span>}
      </figcaption>
    </figure>
  );
}

/** The period language used in one story, spelled out once at the end. */
export function GlossaryBox({ terms }: { terms: GlossTerm[] }) {
  if (!terms.length) return null;
  return (
    <div className="glossarybox">
      <div className="eyebrow">Words of the period</div>
      <dl>
        {terms.map((t) => (
          <div key={t.term}>
            <dt>{t.term}</dt>
            <dd>{t.gloss}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
