/** The front door. Three layouts live here behind ?variant= because the
 *  chronicle is the one surface whose shape is a taste call, not a
 *  technical one, and a taste call gets shown rather than argued.
 *  Once Ethan picks, the other two go and this file gets much shorter. */

import { Link, useSearchParams } from "react-router-dom";
import {
  filmStops,
  lineageColor,
  lineages,
  stories,
  storyParts,
  tree,
} from "@/lib/data";
import type { Story } from "@/types";
import { PersonChip } from "@/components/bits";
import { familiarName, nearestKin, useAnchor } from "@/lib/kinship";
import { packetManifest } from "@/lib/packet";

/** "through Grandma Stone" for a story's nearest person: the one line
 *  Ethan asked every story to carry, in the words the family uses. */
function storyThrough(s: Story, anchor: string): string | null {
  const near = nearestKin(s.people.filter((p) => p.id).map((p) => p.id!), anchor);
  if (!near) return null;
  if (near.rel.via) return `through ${familiarName(near.rel.via.id, anchor)}`;
  // Already close family: name the relation itself instead of a branch.
  return near.rel.term.replace(/^your /, "your ");
}

const VARIANTS = [
  { key: "ledger", label: "Ledger", note: "dense index, grouped by part" },
  { key: "editorial", label: "Editorial", note: "a lead story, then the rest" },
  { key: "timeline", label: "Timeline", note: "placed on the centuries" },
] as const;

type VariantKey = (typeof VARIANTS)[number]["key"];

/** First sentence or two of a story, for a card. The body is markdown,
 *  so strip the syntax rather than render it small. */
function excerpt(s: Story, chars = 190): string {
  const text = s.body
    .replace(/\[\[\/?cite[^\]]*\]\]/g, "")
    .replace(/^#+\s.*$/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= chars) return text;
  const cut = text.slice(0, chars);
  return cut.slice(0, cut.lastIndexOf(" ")) + "...";
}

/** The year a story sits at, for the timeline variant. Uses the earliest
 *  year the prose names, falling back to the earliest birth among the
 *  people it links. Stories about a whole line have no single year and
 *  are placed at their earliest anchor, which is honest enough for a
 *  reading order and never claims to be a date. */
function storyYear(s: Story): number | null {
  const inText = [...s.body.matchAll(/\b(1[5-9]\d\d|20[0-2]\d)\b/g)].map((m) => Number(m[1]));
  if (inText.length) return Math.min(...inText);
  const births = s.people
    .map((p) => (p.id ? tree.people[p.id]?.birth?.date?.year : undefined))
    .filter((y): y is number => typeof y === "number");
  return births.length ? Math.min(...births) : null;
}

function StoryCard({ s }: { s: Story }) {
  const anchor = useAnchor();
  const through = storyThrough(s, anchor);
  return (
    <Link className="storycard" to={`/story/${s.id}`}>
      <div className="storycard__no">{s.number != null ? String(s.number).padStart(2, "0") : "—"}</div>
      <h3>{s.title}</h3>
      <p>{excerpt(s)}</p>
      {through && <div className="storycard__through">{through}</div>}
      <div className="storycard__foot">
        {s.line && <span className="chip">{s.line}</span>}
        <span>
          {s.people.filter((p) => p.id).length}{" "}
          {s.people.filter((p) => p.id).length === 1 ? "person" : "people"}
        </span>
        <span>{Math.max(1, Math.round(s.wordCount / 220))} min</span>
      </div>
    </Link>
  );
}

function Hero() {
  const c = tree.meta.counts;
  return (
    <div className="hero">
      <div className="eyebrow">A family chronicle</div>
      <h1>{packetManifest().subtitle || packetManifest().title}</h1>
      <p>{packetManifest().intro}</p>
      {packetManifest().livingNote && (
        <p className="dim" style={{ fontSize: 13 }}>{packetManifest().livingNote}</p>
      )}
      <div className="stats">
        <div>
          <b>{stories.length}</b>
          <span>stories</span>
        </div>
        <div>
          <b>{c.people}</b>
          <span>people in the tree</span>
        </div>
        <div>
          <b>{c.places}</b>
          <span>places on the map</span>
        </div>
        <div>
          <b>{c.sources}</b>
          <span>sources cited</span>
        </div>
        <div>
          <b>{filmStops.length}</b>
          <span>stops in the film</span>
        </div>
      </div>
    </div>
  );
}

function LinesStrip() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)", borderRadius: "var(--r)", overflow: "hidden", marginTop: 34 }}>
      {lineages.map((l) => (
        <Link
          key={l.key}
          to={`/tree?lineage=${l.key}`}
          style={{ padding: "14px 16px", background: "var(--ink-050)", borderTop: `2px solid ${l.color}` }}
        >
          <div style={{ color: "var(--text-000)", fontSize: 14, fontWeight: 550 }}>{l.label}</div>
          <div className="dim" style={{ fontSize: 11.5, marginTop: 3 }}>{l.origin}</div>
          <div className="dim" style={{ fontSize: 11, marginTop: 8, fontFamily: "var(--mono)" }}>
            {l.memberCount} people
          </div>
        </Link>
      ))}
    </div>
  );
}

function FilmCallout() {
  const first = filmStops[0];
  const last = filmStops[filmStops.length - 1];
  return (
    <Link
      to="/map"
      style={{
        display: "block",
        marginTop: 34,
        padding: "22px 24px",
        background: "var(--ink-050)",
        border: "1px solid var(--rule)",
        borderLeft: "2px solid var(--accent)",
        borderRadius: "var(--r)",
      }}
    >
      <div className="eyebrow" style={{ color: "var(--accent)" }}>The migration film</div>
      <div style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--text-000)", margin: "8px 0 8px" }}>
        Watch the family cross the map, {first.year} to {last.year}
      </div>
      <p className="dim" style={{ margin: 0, maxWidth: "62ch", fontSize: 13.5 }}>
        {filmStops.length} stops, each one a real crossing with a real reason. The camera
        holds while the story is told, then moves on.
      </p>
    </Link>
  );
}

function Ledger() {
  return (
    <>
      {storyParts.map((group) => (
        <div key={group.part}>
          <div className="partline">
            <h2>{group.part}</h2>
          </div>
          <div className="storygrid">
            {group.stories.map((s) => (
              <StoryCard key={s.id} s={s} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function Editorial() {
  const [lead, ...rest] = stories;
  return (
    <>
      <div className="partline">
        <h2>Start here</h2>
      </div>
      <div
        style={{
          padding: "30px 32px",
          background: "var(--ink-050)",
          border: "1px solid var(--rule)",
          borderRadius: "var(--r)",
        }}
      >
        <Link to={`/story/${lead.id}`} style={{ display: "block" }}>
          <div className="storycard__no">{String(lead.number ?? 1).padStart(2, "0")}</div>
          <h3 style={{ fontFamily: "var(--serif)", fontSize: 30, lineHeight: 1.16, margin: "10px 0 14px", maxWidth: "24ch" }}>
            {lead.title}
          </h3>
          <p style={{ fontFamily: "var(--serif)", fontSize: 16, color: "var(--text-200)", maxWidth: "64ch", margin: 0 }}>
            {excerpt(lead, 340)}
          </p>
        </Link>
        <div className="peoplerow" style={{ marginTop: 18 }}>
          {lead.people.filter((p) => p.id).slice(0, 6).map((p) => (
            <PersonChip key={p.id} id={p.id} name={p.name} />
          ))}
        </div>
      </div>

      <div className="partline">
        <h2>The rest</h2>
      </div>
      <div style={{ borderTop: "1px solid var(--rule)" }}>
        {rest.map((s) => (
          <Link
            key={s.id}
            to={`/story/${s.id}`}
            style={{
              display: "grid",
              gridTemplateColumns: "46px minmax(0, 1fr) 120px",
              gap: 20,
              alignItems: "baseline",
              padding: "16px 8px",
              borderBottom: "1px solid var(--rule)",
            }}
          >
            <span className="storycard__no">{String(s.number ?? 0).padStart(2, "0")}</span>
            <span>
              <span style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--text-000)" }}>
                {s.title}
              </span>
              <span className="dim" style={{ display: "block", fontSize: 13, marginTop: 4 }}>
                {excerpt(s, 130)}
              </span>
            </span>
            <span className="dim" style={{ fontSize: 11.5, textAlign: "right", fontFamily: "var(--mono)" }}>
              {s.line ?? ""}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

function Timeline() {
  const dated = stories
    .map((s) => ({ s, year: storyYear(s) }))
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));

  let lastCentury: number | null = null;

  return (
    <div style={{ marginTop: 40 }}>
      {dated.map(({ s, year }) => {
        const century = year ? Math.floor(year / 100) * 100 : null;
        const newCentury = century !== null && century !== lastCentury;
        if (newCentury) lastCentury = century;
        const lineageKey = lineages.find((l) => l.label === s.line)?.key ?? null;
        return (
          <div key={s.id}>
            {newCentury && (
              <div className="partline">
                <h2>{century}s</h2>
              </div>
            )}
            <Link
              to={`/story/${s.id}`}
              style={{
                display: "grid",
                gridTemplateColumns: "72px minmax(0, 1fr)",
                gap: 24,
                padding: "14px 0",
                borderBottom: "1px solid var(--rule)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 12.5,
                  color: "var(--accent)",
                  paddingTop: 3,
                  borderLeft: `2px solid ${lineageColor(lineageKey)}`,
                  paddingLeft: 10,
                }}
              >
                {year ?? "—"}
              </span>
              <span>
                <span style={{ fontFamily: "var(--serif)", fontSize: 19, color: "var(--text-000)" }}>
                  {s.title}
                </span>
                <span className="dim" style={{ display: "block", fontSize: 13, marginTop: 5, maxWidth: "76ch" }}>
                  {excerpt(s, 175)}
                </span>
              </span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}

export default function Chronicle() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("variant");
  const variant: VariantKey = VARIANTS.some((v) => v.key === raw) ? (raw as VariantKey) : "ledger";

  return (
    <div className="page">
      <Hero />
      <LinesStrip />
      <FilmCallout />

      {variant === "ledger" && <Ledger />}
      {variant === "editorial" && <Editorial />}
      {variant === "timeline" && <Timeline />}

      <div className="variantbar">
        <span className="eyebrow">Chronicle layout</span>
        {VARIANTS.map((v) => (
          <button
            key={v.key}
            data-on={v.key === variant}
            title={v.note}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("variant", v.key);
              setParams(next, { replace: true });
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
