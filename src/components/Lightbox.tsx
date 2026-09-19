/** One full-screen image viewer for every picture in the app.
 *
 *  There is exactly one of these on purpose. A photograph shown at
 *  thumbnail size is a label; shown full-screen it is the thing itself,
 *  and the caption has to travel with it, because an image that loses its
 *  provenance on the way to full-screen has lost the part that made it
 *  trustworthy. Escape or a click anywhere closes it.
 */

import { useEffect, type ReactNode } from "react";

export function Lightbox({
  src,
  alt,
  children,
  onClose,
}: {
  src: string;
  alt: string;
  children?: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <figure className="lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <img src={src} alt={alt} />
      {children && <figcaption onClick={(e) => e.stopPropagation()}>{children}</figcaption>}
    </figure>
  );
}

export default Lightbox;
