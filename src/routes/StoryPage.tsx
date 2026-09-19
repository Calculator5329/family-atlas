/** One story, read at full width of a comfortable measure.
 *
 *  Two things happen to the prose before it renders. People the parser
 *  matched to the tree become inline chips, so a reader can leave the
 *  story for a person and come back. Citation markers become a quiet
 *  dagger in research mode and disappear entirely in family mode: they
 *  came from the research tooling and are not footnotes a reader can
 *  follow, so pretending otherwise would be dishonest. */

import { Children, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  displayName,
  getPerson,
  lifespan,
  lineageColor,
  primaryLineage,
  stories,
  storyById,
  stopsForStory,
} from "@/lib/data";
import { useResearchMode } from "@/lib/mode";
import { familiarName, relationSentence, relationTo, useAnchor } from "@/lib/kinship";
import { quotesForStory, termsIn } from "@/lib/quotes";
import { recordsForStory } from "@/lib/records";
import { archiveForStory } from "@/lib/archive";
import { Back } from "@/components/bits";
import { QuoteBlock, glossify } from "@/components/QuoteBlock";
import { RecordBlock } from "@/components/RecordBlock";
import { ArchiveStrip } from "@/components/ArchiveStrip";
import NotFound from "@/routes/NotFound";
import type { Story } from "@/types";

const CITE_OPEN = /\[\[cite:([^\]]*)\]\]/g;
const CITE_CLOSE = /\[\[\/cite\]\]/g;
// The house style writes its sources as GFM footnotes under an "Evidence"
// heading. remark-gfm collects the definitions itself and emits its own
// labelled section, so the authored heading would render above an empty
// space. Drop it and label the generated section instead.
const EVIDENCE_HEADING = /^#{2,4}\s*Evidence\s*$/m;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function prepare(story: Story, research: boolean): string {
  let body = story.body.replace(EVIDENCE_HEADING, "");

  body = research
    ? body.replace(CITE_OPEN, "").replace(CITE_CLOSE, "[†](#cite)")
    : body.replace(CITE_OPEN, "").replace(CITE_CLOSE, "");

  // Link the first mention of each person the parser resolved. Longest
  // names first so "John Smith Jr" is not eaten by "John Smith".
  const linkable = [...story.mentions, ...story.people]
    .filter((p) => p.id)
    .sort((a, b) => b.name.length - a.name.length);

  const used = new Set<string>();
  for (const person of linkable) {
    if (used.has(person.id!)) continue;
    const re = new RegExp(`(?<![[(\\w])${escapeRe(person.name)}(?![\\w\\]])`);
    if (!re.test(body)) continue;
    body = body.replace(re, `[${person.name}](#person:${person.id})`);
    used.add(person.id!);
  }

  return body;
}

export default function StoryPage() {
  const { id } = useParams();
  const research = useResearchMode();
  const story = id ? storyById.get(id) : undefined;

  const body = useMemo(
    () => (story ? prepare(story, research) : ""),
    [story, research],
  );

  const anchor = useAnchor();

  if (!story) return <NotFound />;

  const index = stories.findIndex((s) => s.id === story.id);
  const prev = index > 0 ? stories[index - 1] : null;
  const next = index >= 0 && index < stories.length - 1 ? stories[index + 1] : null;
  const filmStops = stopsForStory(story.id);
  const cast = story.people.filter((p) => p.id);

  const quotes = quotesForStory(story.id);
  const storyRecords = recordsForStory(story.id);
  const glossTerms = termsIn(story.body + " " + quotes.map((q) => q.text).join(" "));

  // The preface: everyone in the story with their relation to the reader,
  // sorted closest first, plus the period words the prose will use.
  const prefacePeople = cast
    .map((c) => {
      const p = getPerson(c.id)!;
      const isAnchor = p.id === anchor;
      const rel = isAnchor ? null : relationTo(p.id!, anchor);
      return { p, name: c.name, rel, isAnchor };
    })
    .sort(
      (a, b) =>
        (a.isAnchor ? 0 : (a.rel?.dist ?? 99)) - (b.isAnchor ? 0 : (b.rel?.dist ?? 99)),
    );

  return (
    <div className="page page--narrow">
      <Back to="/">The chronicle</Back>

      <div className="storyhead">
        <div className="eyebrow" style={{ marginTop: 18 }}>
          {story.part}
          {story.number != null && ` · Story ${story.number}`}
        </div>
        <h1>{story.title}</h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {story.line && <span className="chip">{story.line}</span>}
          <span className="dim" style={{ fontSize: 12 }}>
            {Math.max(1, Math.round(story.wordCount / 220))} min read
          </span>
          {research && story.citationCount > 0 && (
            <span className="dim" style={{ fontSize: 12 }}>
              {story.citationCount} cited passages
            </span>
          )}
        </div>
      </div>

      {(prefacePeople.length > 0 || glossTerms.length > 0) && (
        <div className="preface">
          {prefacePeople.length > 0 && (
            <div
              className={`preface__col${glossTerms.length === 0 ? " preface__col--wide" : ""}`}
            >
              <div className="eyebrow" style={{ marginBottom: 10 }}>The people</div>
              {prefacePeople.map(({ p, name, rel, isAnchor }) => (
                <div className="preface__person" key={p.id}>
                  <Link to={`/person/${p.id}`}>
                    <i
                      className="chip__dot"
                      style={{ background: lineageColor(primaryLineage(p)) }}
                    />
                    {name ?? displayName(p)}
                  </Link>
                  <span className="preface__rel">
                    {isAnchor
                      ? "you"
                      : rel
                        ? [
                            rel.term,
                            rel.via ? `through ${familiarName(rel.via.id, anchor)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "not in your traced line"}
                  </span>
                </div>
              ))}
            </div>
          )}
          {glossTerms.length > 0 && (
            <div
              className={`preface__col${prefacePeople.length === 0 ? " preface__col--wide" : ""}`}
            >
              <div className="eyebrow" style={{ marginBottom: 10 }}>Words of the period</div>
              <dl>
                {glossTerms.map((t) => (
                  <span key={t.term}>
                    <dt>{t.term}</dt>
                    <dd>{t.gloss}</dd>
                  </span>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}

      <article className="prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          remarkRehypeOptions={{
            footnoteLabel: "Evidence",
            footnoteLabelTagName: "h2",
            footnoteBackLabel: "Back to where this was cited",
          }}
          components={{
            a: ({ href, children, node: _node, ...rest }) => {
              if (href?.startsWith("#person:")) {
                const pid = href.slice("#person:".length);
                const p = getPerson(pid);
                if (!p) return <>{children}</>;
                // A relative gets their lineage colour under the name; a
                // person the tree cannot connect to the reader (a namesake
                // who is not the ancestor) reads dotted and grey, so the
                // two are never confused mid-sentence.
                const rel = relationSentence(pid, anchor);
                return (
                  <Link
                    to={`/person/${pid}`}
                    title={[lifespan(p), rel ?? "not in your traced line"].join(" · ")}
                    style={
                      rel
                        ? {
                            color: "var(--text-000)",
                            borderBottom: `1px solid ${lineageColor(primaryLineage(p))}`,
                          }
                        : {
                            color: "var(--text-100)",
                            borderBottom: "1px dotted var(--text-300)",
                          }
                    }
                  >
                    {children}
                  </Link>
                );
              }
              // Footnote jumps are same-page anchors, and this app is on a
              // hash router: letting the browser follow "#user-content-fn-3"
              // would replace the route and leave the story. Scroll instead.
              if (href?.startsWith("#user-content-")) {
                return (
                  <a
                    {...rest}
                    href={href}
                    onClick={(e) => {
                      e.preventDefault();
                      const el = document.getElementById(href.slice(1));
                      if (!el) return;
                      el.scrollIntoView({ behavior: "smooth", block: "center" });
                      // :target does the highlight when the browser follows
                      // the anchor; nothing sets it when we scroll by hand.
                      document
                        .querySelectorAll(".footnotes .is-target")
                        .forEach((n) => n.classList.remove("is-target"));
                      el.classList.add("is-target");
                    }}
                  >
                    {children}
                  </a>
                );
              }
              if (href === "#cite") {
                return (
                  <sup
                    className="dim"
                    style={{ fontSize: 10, marginLeft: 1 }}
                    title="This passage carried a citation marker from the research tooling"
                  >
                    †
                  </sup>
                );
              }
              return <a href={href}>{children}</a>;
            },
            p: ({ children }) => (
              <p>
                {Children.map(children, (c) => (typeof c === "string" ? glossify(c) : c))}
              </p>
            ),
          }}
        >
          {body}
        </ReactMarkdown>
      </article>

      {(quotes.length > 0 || storyRecords.length > 0) && (
        <section className="quotes">
          <div className="partline">
            <h2>From the record</h2>
          </div>
          {quotes.map((q) => (
            <QuoteBlock key={q.id} q={q} />
          ))}
          {storyRecords.map((r) => (
            <RecordBlock key={r.id} r={r} />
          ))}
        </section>
      )}

      <ArchiveStrip images={archiveForStory(story.id)} title="From the archive" />

      {filmStops.length > 0 && (
        <Link
          to={`/map?stop=${filmStops[0].id}`}
          style={{
            display: "block",
            marginTop: 36,
            padding: "16px 18px",
            background: "var(--ink-050)",
            border: "1px solid var(--rule)",
            borderLeft: "2px solid var(--accent)",
            borderRadius: "var(--r)",
          }}
        >
          <div className="eyebrow" style={{ color: "var(--accent)" }}>On the map</div>
          <div style={{ color: "var(--text-000)", marginTop: 6, fontSize: 14.5 }}>
            {filmStops[0].title}, {filmStops[0].yearLabel}
          </div>
          <div className="dim" style={{ fontSize: 12.5, marginTop: 3 }}>
            Watch this crossing in the migration film
          </div>
        </Link>
      )}

      {prefacePeople.length > 0 && (
        <section className="castledger">
          <div className="partline">
            <h2>The cast</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Lived</th>
                <th>Relation to you</th>
              </tr>
            </thead>
            <tbody>
              {prefacePeople.map(({ p, name, rel, isAnchor }) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/person/${p.id}`}>
                      <i
                        className="chip__dot"
                        style={{ background: lineageColor(primaryLineage(p)) }}
                      />
                      {name ?? displayName(p)}
                    </Link>
                  </td>
                  <td className="dim">{lifespan(p)}</td>
                  <td>
                    {isAnchor
                      ? "you"
                      : rel
                        ? [
                            rel.term,
                            rel.via ? `through ${familiarName(rel.via.id, anchor)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "not in your traced line"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {story.sourcesNote && (
        <div className="sourcenote">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Sources</div>
          {story.sourcesNote}
        </div>
      )}

      <nav className="storynav">
        {prev ? (
          <Link to={`/story/${prev.id}`}>
            <span>Previous</span>
            {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={`/story/${next.id}`} style={{ textAlign: "right" }}>
            <span>Next</span>
            {next.title}
          </Link>
        )}
      </nav>
    </div>
  );
}
