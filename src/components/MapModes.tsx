/** The two ways of watching the family move.
 *
 *  Ethan, 2026-08-21: the migration lines belong in the migration tab, and
 *  the atlas should be the map of what happened where. So this tab holds
 *  both moving pictures and the atlas holds none: the film is the written
 *  story of the crossings that matter, and the journeys sequence is every
 *  recorded move in the tree, flown one line at a time. */

import { Link } from "react-router-dom";

const MODES = [
  { key: "film", to: "/map", label: "The film", hint: "The scripted crossings, told in order" },
  {
    key: "journeys",
    to: "/map?mode=journeys",
    label: "Every journey",
    hint: "All recorded movement, a line at a time",
  },
] as const;

export function MapModes({ mode }: { mode: "film" | "journeys" }) {
  return (
    <div className="mapmodes">
      {MODES.map((m) => (
        <Link
          key={m.key}
          to={m.to}
          className="mapmodes__tab"
          aria-current={m.key === mode ? "page" : undefined}
          title={m.hint}
        >
          {m.label}
        </Link>
      ))}
    </div>
  );
}
