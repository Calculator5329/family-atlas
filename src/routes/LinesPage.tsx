/** The curated lines, side by side. This is the page that teaches the
 *  colour code: after reading it, a reader knows what the dot on a chip
 *  means everywhere else. */

import { Link } from "react-router-dom";
import { getPerson, lifespan, lineageCountWord, lineages, relationsOf, tree } from "@/lib/data";
import { PersonChip } from "@/components/bits";

export default function LinesPage() {
  const unassigned =
    tree.meta.counts.people - lineages.reduce((n, l) => n + l.memberCount, 0);

  return (
    <div className="page">
      <div className="eyebrow" style={{ marginBottom: 10 }}>The {lineageCountWord} lines</div>
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 34, maxWidth: "20ch", marginBottom: 14 }}>
        {lineageCountWord.charAt(0).toUpperCase() + lineageCountWord.slice(1)} lines,{" "}
        {lineageCountWord} points of origin.
      </h1>
      <p className="dim" style={{ maxWidth: "62ch", fontSize: 14.5, marginBottom: 40 }}>
        Every person in this tree is coloured by the line they descend from. The colour
        means one thing and only one thing: which of these {lineageCountWord} it is. People
        who married in, and the collateral kin the research picked up along the way, carry
        no colour.
      </p>

      <div style={{ display: "grid", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)", borderRadius: "var(--r)", overflow: "hidden" }}>
        {lineages.map((l) => {
          const root = getPerson(l.rootPerson);
          const parents = relationsOf(l.rootPerson).parents;
          return (
            <div key={l.key} style={{ background: "var(--ink-050)", padding: "24px 26px", borderLeft: `3px solid ${l.color}` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <h2 style={{ fontFamily: "var(--serif)", fontSize: 24 }}>{l.label}</h2>
                <span className="dim" style={{ fontSize: 12, fontFamily: "var(--mono)" }}>
                  {l.memberCount} people
                </span>
                <span className="dim" style={{ fontSize: 12.5 }}>{l.origin}</span>
              </div>

              <p style={{ maxWidth: "70ch", margin: "12px 0 16px", fontSize: 14, color: "var(--text-100)" }}>
                {l.blurb}
              </p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <span className="dim" style={{ fontSize: 11.5 }}>Line runs to</span>
                <PersonChip id={l.rootPerson} />
                {root && <span className="dim" style={{ fontSize: 11.5 }}>{lifespan(root)}</span>}
                {parents.length > 0 && (
                  <>
                    <span className="dim" style={{ fontSize: 11.5, marginLeft: 8 }}>from</span>
                    {parents.map((pid) => (
                      <PersonChip key={pid} id={pid} />
                    ))}
                  </>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                <Link className="chip" to={`/tree?lineage=${l.key}&focus=${l.rootPerson}`}>
                  Open in the tree
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <p className="dim" style={{ fontSize: 13, marginTop: 26, maxWidth: "70ch" }}>
        {unassigned} people in the file sit outside every line: spouses who married
        in, and collateral relatives the research followed to prove a link. Everyone
        descended from one of the {lineageCountWord} roots carries its colour, in both
        directions, so the generations nearest today belong to all of them at once. Nobody is removed for
        being outside a line, because removing them would remove the evidence.
      </p>
    </div>
  );
}
