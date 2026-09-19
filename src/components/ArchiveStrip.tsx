/** A row of archive images with their honesty labels.
 *
 *  Four kinds, four levels of trust, and the figure always says which:
 *  direct images of family places and records lead; AI-enhanced
 *  originals carry their method and source; real period context is
 *  badged as context; AI reconstructions come last, visibly marked, with
 *  the documented evidence they were built from one click away. A
 *  picture without provenance is decoration, and a reconstruction
 *  without a disclaimer is a lie.
 */

import { useState } from "react";
import { archiveUrl, KIND_LABEL, type ArchiveImage, type ArchiveKind } from "@/lib/archive";
import { Lightbox } from "@/components/Lightbox";

const DISCLAIMER: Partial<Record<ArchiveKind, string>> = {
  "ai-enhanced":
    "A real image, machine-restored or colorized. Tones and colors are inferred; the underlying photograph is genuine.",
  "ai-generated":
    "No photograph of this exists. This image was generated from the documented evidence below and shows one plausible rendering, not the place itself.",
};

export function ArchiveStrip({ images, title }: { images: ArchiveImage[]; title?: string }) {
  const [open, setOpen] = useState<ArchiveImage | null>(null);
  if (!images.length) return null;
  return (
    <section className="archive">
      {title && (
        <div className="partline">
          <h2>{title}</h2>
        </div>
      )}
      <div className="archive__grid">
        {images.map((img) => (
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
                {img.method && ` · ${img.method}`}
                {img.sourceUrl && (
                  <>
                    {" · "}
                    <a href={img.sourceUrl} target="_blank" rel="noreferrer">
                      source
                    </a>
                  </>
                )}
              </span>
              {DISCLAIMER[img.kind] && (
                <span className="archive__disclaimer">{DISCLAIMER[img.kind]}</span>
              )}
              {img.evidence.length > 0 && (
                <details className="archive__evidence">
                  <summary>What this is based on</summary>
                  <ul>
                    {img.evidence.map((ev, i) => (
                      <li key={i}>{ev}</li>
                    ))}
                  </ul>
                </details>
              )}
            </figcaption>
          </figure>
        ))}
      </div>

      {open && (
        <Lightbox src={archiveUrl(open)} alt={open.caption} onClose={() => setOpen(null)}>
          <span className="archive__badge" data-kind={open.kind}>
            {KIND_LABEL[open.kind]}
          </span>{" "}
          {open.caption}
          {DISCLAIMER[open.kind] && (
            <span className="archive__disclaimer">{DISCLAIMER[open.kind]}</span>
          )}
        </Lightbox>
      )}
    </section>
  );
}
