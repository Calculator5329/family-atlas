/** The packet: where every byte of family data the app shows comes from.
 *
 *  The app bundles no family. At startup main.tsx fetches
 *  `packet/manifest.json` next to index.html, then every file the
 *  manifest lists, and only then imports the rest of the app. The data
 *  modules (data.ts, quotes.ts, records.ts, archive.ts, camera.ts,
 *  mapstyle.ts) read from here at module load, so the ordering is what
 *  makes them safe: by the time any of them runs, `packetFile` has what
 *  it needs or the app was never started.
 *
 *  A packet is a directory. scripts/build_packet.py writes one, and
 *  docs/packet-format.md describes it for anyone writing their own. */

export type PacketRole =
  | "tree"
  | "stories"
  | "film"
  | "transcriptions"
  | "archive"
  | "quotes"
  | "glossary"
  | "basemap";

export interface PacketManifest {
  format: string;
  formatVersion: number;
  title: string;
  subtitle: string;
  intro: string;
  generated: string;
  profile: string;
  /** "fenced": living people appear by name and family link only.
   *  "included": the packet holds everything the tree knows. */
  living: "fenced" | "included";
  livingNote: string;
  source: { generatedFrom: string; gedcomSha256: string };
  counts: Record<string, number>;
  mediaDir: string;
  files: Partial<Record<PacketRole, { path: string; bytes: number; sha256: string }>>;
}

export type PacketStatus =
  | { ok: true; manifest: PacketManifest }
  | { ok: false; reason: "missing" | "format" | "file"; detail: string };

/** Relative to the page, not the origin: the app is opened from a
 *  sub-path, a static server or the filesystem, and `./packet/` is the
 *  one address that works from all three. */
export const PACKET_BASE = new URL("packet/", document.baseURI).href;

const FORMAT = "family-atlas-packet";
const FORMAT_VERSION = 1;

let manifest: PacketManifest | null = null;
const files = new Map<PacketRole, unknown>();

export async function loadPacket(): Promise<PacketStatus> {
  let res: Response;
  try {
    res = await fetch(PACKET_BASE + "manifest.json", { cache: "no-cache" });
  } catch (e) {
    return { ok: false, reason: "missing", detail: String(e) };
  }
  if (!res.ok) return { ok: false, reason: "missing", detail: `${res.status} for manifest.json` };
  let m: PacketManifest;
  try {
    m = (await res.json()) as PacketManifest;
  } catch (e) {
    return { ok: false, reason: "format", detail: `manifest.json is not JSON: ${String(e)}` };
  }
  if (m.format !== FORMAT || m.formatVersion !== FORMAT_VERSION) {
    return {
      ok: false,
      reason: "format",
      detail: `expected ${FORMAT} v${FORMAT_VERSION}, got ${m.format ?? "?"} v${m.formatVersion ?? "?"}`,
    };
  }
  const roles = Object.keys(m.files ?? {}) as PacketRole[];
  const loaded = await Promise.all(
    roles.map(async (role) => {
      const entry = m.files[role]!;
      const r = await fetch(PACKET_BASE + entry.path, { cache: "no-cache" });
      if (!r.ok) throw new Error(`${entry.path}: ${r.status}`);
      return [role, await r.json()] as const;
    }),
  ).catch((e: Error) => e);
  if (loaded instanceof Error) return { ok: false, reason: "file", detail: loaded.message };
  for (const [role, doc] of loaded) files.set(role, doc);
  manifest = m;
  return { ok: true, manifest: m };
}

export function packetManifest(): PacketManifest {
  if (!manifest) throw new Error("packet read before it was loaded");
  return manifest;
}

/** A packet file by role. Missing roles come back as `fallback`, so a
 *  packet without pictures or without quotes is a thinner app rather
 *  than a broken one. */
export function packetFile<T>(role: PacketRole, fallback: T): T {
  if (!manifest) throw new Error(`packet file ${role} read before the packet was loaded`);
  return (files.has(role) ? files.get(role) : fallback) as T;
}

export const mediaUrl = (file: string): string =>
  `${PACKET_BASE}${packetManifest().mediaDir}/${file}`;
