import { useEffect, useState } from "react";
import { WORLD_TILES } from "@/lib/camera";

/** The map surfaces draw from basemap files that are not in the packet
 *  and not in the repository: a fresh checkout has none until
 *  `npm run basemap` has run once. Without them the film shows a black
 *  world and the console fills with decode errors, and someone who has
 *  just unzipped an email attachment has no way to know why. So the
 *  first map surface asks the dev server for the first byte of the world
 *  archive; an HTML answer is the SPA fallback standing in for a missing
 *  file, and that is the one case worth a sentence on screen. */
export default function BasemapNotice() {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const url = new URL(`tiles/${WORLD_TILES}`, document.baseURI).href;
    fetch(url, { headers: { Range: "bytes=0-0" } })
      .then((r) => {
        const type = r.headers.get("content-type") ?? "";
        if (!cancelled) setMissing(!r.ok || type.startsWith("text/html"));
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!missing) return null;
  return (
    <div className="basemap-notice" role="status">
      <strong>No basemap yet.</strong> The map draws from tile files that are
      not in the packet. In the app folder run <code>npm run basemap</code> once
      (it needs Go on your PATH the first time), then reload. Everything but
      the maps works without it.
    </div>
  );
}
