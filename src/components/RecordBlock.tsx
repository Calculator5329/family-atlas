/** A full record transcription, collapsed behind its own title.
 *
 *  The story above it is the retelling; this is the document. It opens
 *  closed because a 1662 will is long, and the reader chose a story, not
 *  an archive: the summary line says what the document is and one click
 *  gives its every word, archaic spelling intact, glossary on hover.
 */

import { useResearchMode } from "@/lib/mode";
import { PersonChip } from "@/components/bits";
import { Grade } from "@/components/bits";
import { glossify } from "@/components/QuoteBlock";
import type { RecordDoc } from "@/lib/records";

export function RecordBlock({ r }: { r: RecordDoc }) {
  const research = useResearchMode();
  return (
    <details className="recordblock">
      <summary>
        <span className="recordblock__title">
          Read the record · {r.title}
          {research && <Grade grade={r.grade} />}
        </span>
        <span className="recordblock__kind">{r.record}</span>
      </summary>
      <div className="recordblock__body">
        {r.text.split(/\n\n+/).map((para, i) => (
          <p key={i}>{glossify(para)}</p>
        ))}
        <div className="recordblock__foot">
          <span className="recordblock__source">
            {r.source}
            {research && r.cycles?.length > 0 && (
              <span className="dim">
                {" · transcribed for research "}
                {r.cycles.length === 1 ? "cycle" : "cycles"} {r.cycles.join(", ")}
              </span>
            )}
          </span>
          {r.people.length > 0 && (
            <span className="recordblock__people">
              {r.people.map((pid) => (
                <PersonChip key={pid} id={pid} />
              ))}
            </span>
          )}
        </div>
      </div>
    </details>
  );
}
