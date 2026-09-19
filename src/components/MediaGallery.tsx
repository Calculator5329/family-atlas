/** Attachments a person's record cites.
 *
 *  Two halves, because the export has two kinds. Ancestry writes a full
 *  OBJE record per attachment and an empty FILE value, keeping the bytes
 *  on its own servers, so most of these are known but absent. Anything
 *  dropped into the research repo's media/ directory under its object id
 *  is copied in at build time and shown here instead of described.
 *
 *  The fence has already run: the parser only emits an attachment record
 *  for someone it is willing to describe, so nothing here needs to check
 *  whether a person is living. */

import { useState } from "react";
import { describeMedia, media } from "@/lib/data";
import { Section } from "@/components/bits";
import { Lightbox } from "@/components/Lightbox";
import type { MediaItem } from "@/types";

function Caption({ m }: { m: MediaItem }) {
  const described = describeMedia(m);
  return (
    <>
      <b style={{ color: "var(--text-100)", fontWeight: 500 }}>
        {m.title || "Untitled attachment"}
      </b>
      {described && <> {described}</>}
      {m.provenance && (
        <>
          <br />
          <span className="dim">{m.provenance}</span>
        </>
      )}
    </>
  );
}

export default function MediaGallery({ ids }: { ids: string[] }) {
  const [open, setOpen] = useState<MediaItem | null>(null);
  const items = ids.map((id) => media[id]).filter(Boolean);
  if (items.length === 0) return null;

  const present = items.filter((m) => m.file);
  const absent = items.filter((m) => !m.file);

  return (
    <Section title={`Records and images (${items.length})`}>
      {present.length > 0 && (
        <div className="mediarow">
          {present.map((m) => (
            <figure key={m.id}>
              <button type="button" onClick={() => setOpen(m)} title="Enlarge">
                <img src={m.file} alt={m.title || "Family attachment"} loading="lazy" />
              </button>
              <figcaption>
                <Caption m={m} />
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {absent.map((m) => (
        <div key={m.id} className="media-missing">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            aria-hidden="true"
            style={{ flexShrink: 0, marginTop: 3 }}
          >
            <rect x="1.5" y="2.5" width="13" height="11" fill="none" stroke="currentColor" />
            <path d="M1.5 11l4-3.5 3 2.5 2.5-2 3.5 3" fill="none" stroke="currentColor" />
          </svg>
          <span>
            <Caption m={m} />
          </span>
        </div>
      ))}

      {absent.length > 0 && (
        <p className="dim" style={{ fontSize: 12, marginTop: 6 }}>
          {absent.length === items.length
            ? "The export cites these attachments and carries none of them: the files themselves stay on Ancestry. What is here is everything the GEDCOM knows about each one, so a picture can drop into its slot the day it arrives."
            : `${absent.length} of these ${absent.length === 1 ? "is" : "are"} cited by the export without the file itself, which stayed on Ancestry.`}
        </p>
      )}

      {open && (
        <Lightbox
          src={open.file!}
          alt={open.title || "Family attachment"}
          onClose={() => setOpen(null)}
        >
          <Caption m={open} />
        </Lightbox>
      )}
    </Section>
  );
}
