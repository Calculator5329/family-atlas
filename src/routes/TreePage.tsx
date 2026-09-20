/** The tree explorer. Pan with a drag, zoom with the wheel, click a
 *  person to fill the panel, double-click to re-root the chart on them.
 *
 *  The tree is going to keep growing, so nothing here is hand-placed:
 *  depth and direction are controls, and the layout is recomputed from
 *  whatever the parser last emitted. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  displayName,
  getPerson,
  lifespan,
  lineages,
  lineageColor,
  primaryLineage,
  relationsOf,
  storiesFor,
  tree,
} from "@/lib/data";
import {
  buildLayout,
  linkPath,
  NODE_H,
  NODE_W,
  type Direction,
  type LayoutNode,
  type Orientation,
} from "@/lib/pedigree";
import { lineLabel, relationSentence, relationTo, threadTo, useAnchor } from "@/lib/kinship";

/** 20 because 10 was not enough (Ethan, 2026-08-21). The deepest line in
 *  the file reaches the 1530s, about sixteen generations, so 20 is a
 *  ceiling the data cannot embarrass rather than a round number. */
const DEPTHS = [3, 5, 7, 10, 20];

interface View {
  k: number;
  x: number;
  y: number;
}

export default function TreePage() {
  const [params, setParams] = useSearchParams();
  const focus = params.get("focus") ?? tree.meta.rootPerson;
  const dir = (params.get("dir") as Direction) ?? "ancestors";
  const depth = Number(params.get("depth") ?? 5);
  const orient: Orientation = params.get("orient") === "up" ? "up" : "sideways";
  const lineageFilter = params.get("lineage");
  const threadTarget = params.get("thread");
  const anchor = useAnchor();

  const [selected, setSelected] = useState<string>(focus);
  const [view, setView] = useState<View>({ k: 0.85, x: 60, y: 60 });
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const layout = useMemo(
    // The buttons offer DEPTHS; a thread link may ask deeper, so any
    // sane explicit depth is honoured.
    () =>
      buildLayout(
        focus,
        dir,
        Number.isInteger(depth) && depth >= 1 && depth <= 20 ? depth : 5,
        orient,
      ),
    [focus, dir, depth, orient],
  );

  // The thread: every person on the path from the anchor to the target,
  // lit across the chart. Nodes off the thread dim while it is on.
  const thread = useMemo(
    () => (threadTarget ? new Set(threadTo(threadTarget, anchor)) : null),
    [threadTarget, anchor],
  );

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params);
      if (value === null) next.delete(key);
      else next.set(key, value);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  // Fit the chart whenever its shape changes, so a re-root never leaves
  // the reader looking at empty canvas.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const pad = 48;
    const k = Math.min(
      1.1,
      (el.clientWidth - pad * 2) / Math.max(layout.width, 1),
      (el.clientHeight - pad * 2) / Math.max(layout.height, 1),
    );
    const scale = Math.max(0.25, k);
    // A sideways chart is wide and short, so it hugs the left edge and
    // centres vertically. Upward it is tall and narrow, and centring the
    // other axis is what keeps the root on screen.
    setView({
      k: scale,
      x: orient === "up" ? Math.max(pad, (el.clientWidth - layout.width * scale) / 2) : pad,
      y: orient === "up" ? pad : Math.max(pad, (el.clientHeight - layout.height * scale) / 2),
    });
    setSelected(focus);
  }, [layout, focus, orient]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const el = canvas.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setView((v) => {
      const k = Math.min(2.4, Math.max(0.16, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      // Keep the point under the cursor fixed while scaling.
      return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
    });
  }, []);

  const person = getPerson(selected);
  const rel = person ? relationsOf(person.id) : null;
  const panelStories = person ? storiesFor(person.id) : [];

  return (
    <div className="treewrap">
      <div
        className="treecanvas"
        ref={canvas}
        onWheel={onWheel}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
      >
        <div className="treetools">
          <div className="toolgroup">
            <button data-on={dir === "ancestors"} onClick={() => setParam("dir", "ancestors")}>
              Ancestors
            </button>
            <button data-on={dir === "descendants"} onClick={() => setParam("dir", "descendants")}>
              Descendants
            </button>
          </div>
          <div className="toolgroup">
            {DEPTHS.map((d) => (
              <button key={d} data-on={depth === d} onClick={() => setParam("depth", String(d))}>
                {d} gen
              </button>
            ))}
          </div>
          <div className="toolgroup">
            <button data-on={orient === "sideways"} onClick={() => setParam("orient", null)}>
              Sideways
            </button>
            <button data-on={orient === "up"} onClick={() => setParam("orient", "up")}>
              Upward
            </button>
          </div>
          <div className="legend">
            {lineages.map((l) => (
              <span
                key={l.key}
                style={{ cursor: "pointer", color: lineageFilter === l.key ? "var(--text-000)" : undefined }}
                onClick={() => setParam("lineage", lineageFilter === l.key ? null : l.key)}
              >
                <i style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
            {lineageFilter && (
              <span style={{ cursor: "pointer" }} onClick={() => setParam("lineage", null)}>
                clear
              </span>
            )}
          </div>
        </div>

        <svg
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0 }}
          role="presentation"
        >
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {layout.links.map((l) => (
              <path
                key={`${l.from.key}-${l.to.key}`}
                className="link"
                data-thread={!!thread && thread.has(l.from.id) && thread.has(l.to.id)}
                d={linkPath(l.from, l.to, orient)}
              />
            ))}
            {layout.nodes.map((n) => (
              <Node
                key={n.key}
                node={n}
                selected={n.id === selected}
                onThread={!!thread && thread.has(n.id)}
                dimmed={
                  (!!lineageFilter && !getPerson(n.id)?.lineages?.includes(lineageFilter)) ||
                  (!!thread && !thread.has(n.id))
                }
                onSelect={() => setSelected(n.id)}
                onReroot={() => setParam("focus", n.id)}
              />
            ))}
          </g>
        </svg>
      </div>

      <aside className="treepanel">
        {person ? (
          <>
            <div className="eyebrow">
              {lineLabel(person.id, person, anchor)}
            </div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 24, margin: "8px 0 6px" }}>
              {displayName(person)}
            </h2>
            <div className="dim" style={{ fontSize: 13, marginBottom: 18 }}>
              {lifespan(person)}
              {person.birth?.placeRaw && !person.living && (
                <>
                  <br />
                  {person.birth.placeRaw}
                </>
              )}
            </div>

            {person.id !== anchor && relationSentence(person.id, anchor) && (
              <div className="kinline" style={{ marginTop: -8 }}>
                <i className="kinline__mark" aria-hidden="true" />
                {relationSentence(person.id, anchor)}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
              <Link className="chip chip--person" to={`/person/${person.id}`}>
                Full page
              </Link>
              {person.id !== focus && (
                <button className="chip chip--person" onClick={() => setParam("focus", person.id)}>
                  Centre the tree here
                </button>
              )}
              {person.id !== anchor && relationTo(person.id, anchor) && threadTarget !== person.id && (
                <button
                  className="chip chip--person"
                  onClick={() => {
                    const rel = relationTo(person.id, anchor);
                    const need = Math.min(12, Math.max(5, (rel?.dist ?? 5) + 1));
                    const next = new URLSearchParams(params);
                    next.set("thread", person.id);
                    next.set("focus", anchor);
                    next.set("dir", "ancestors");
                    next.set("depth", String(need));
                    setParams(next, { replace: true });
                  }}
                >
                  Light the thread to you
                </button>
              )}
              {threadTarget && (
                <button className="chip chip--person" onClick={() => setParam("thread", null)}>
                  Clear the thread
                </button>
              )}
            </div>

            {person.living && (
              <div className="fenced" style={{ marginBottom: 22 }}>
                Living. Name and family links only.
              </div>
            )}

            {rel && rel.primaryParents.length > 0 && (
              <div className="railbox" style={{ marginBottom: 14 }}>
                <h3>Parents</h3>
                {rel.primaryParents.map((id) => (
                  <button
                    key={id}
                    className="relrow"
                    style={{ width: "100%", textAlign: "left" }}
                    onClick={() => setSelected(id)}
                  >
                    <span>{displayName(getPerson(id))}</span>
                    <small>{getPerson(id) ? lifespan(getPerson(id)!) : ""}</small>
                  </button>
                ))}
              </div>
            )}

            {rel && rel.otherParents.length > 0 && (
              <div className="railbox" style={{ marginBottom: 14 }}>
                <h3>Also</h3>
                {rel.otherParents.map((o) => (
                  <button
                    key={o.id}
                    className="relrow"
                    style={{ width: "100%", textAlign: "left" }}
                    onClick={() => setSelected(o.id)}
                  >
                    <span>{displayName(getPerson(o.id))}</span>
                    <small>{o.label ?? (getPerson(o.id) ? lifespan(getPerson(o.id)!) : "")}</small>
                  </button>
                ))}
              </div>
            )}

            {rel && rel.children.length > 0 && (
              <div className="railbox" style={{ marginBottom: 14 }}>
                <h3>Children ({rel.children.length})</h3>
                {rel.children.map((id) => (
                  <button
                    key={id}
                    className="relrow"
                    style={{ width: "100%", textAlign: "left" }}
                    onClick={() => setSelected(id)}
                  >
                    <span>{displayName(getPerson(id))}</span>
                    <small>{getPerson(id) ? lifespan(getPerson(id)!) : ""}</small>
                  </button>
                ))}
              </div>
            )}

            {panelStories.length > 0 && (
              <div className="railbox">
                <h3>Stories</h3>
                {panelStories.map((s) => (
                  <Link key={s.id} className="relrow" to={`/story/${s.id}`}>
                    <span>{s.title}</span>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="dim">Select a person.</p>
        )}

        <p className="dim" style={{ fontSize: 11.5, marginTop: 28, lineHeight: 1.6 }}>
          Drag to pan, scroll to zoom, double-click a box to centre the chart on that
          person. A dashed box is a living person: name and links only.
          <br />
          <br />
          Showing {layout.nodes.length} of {tree.meta.counts.people} people.
        </p>
      </aside>
    </div>
  );
}

function Node({
  node,
  selected,
  dimmed,
  onThread,
  onSelect,
  onReroot,
}: {
  node: LayoutNode;
  selected: boolean;
  dimmed: boolean;
  onThread: boolean;
  onSelect: () => void;
  onReroot: () => void;
}) {
  const p = getPerson(node.id);
  if (!p) return null;
  const color = lineageColor(primaryLineage(p));
  return (
    <g
      className="node"
      data-sel={selected}
      data-thread={onThread}
      data-living={p.living}
      transform={`translate(${node.x},${node.y})`}
      opacity={dimmed ? 0.28 : 1}
      onClick={onSelect}
      onDoubleClick={onReroot}
      style={{ cursor: "pointer" }}
    >
      <rect className="box" width={NODE_W} height={NODE_H} rx="2" />
      <rect className="bar" width="3" height={NODE_H} fill={color} />
      <text x="13" y="18">
        {displayName(p).slice(0, 26)}
      </text>
      <text className="yrs" x="13" y="32">
        {lifespan(p)}
      </text>
      {node.truncated && (
        <text className="yrs" x={NODE_W - 16} y={NODE_H / 2 + 4} textAnchor="middle">
          +
        </text>
      )}
    </g>
  );
}
