import { createRoot } from "react-dom/client";
import { loadPacket, PACKET_BASE, type PacketStatus } from "@/lib/packet";
import "@/styles.css";

// Hash routing: the app is opened from the filesystem or a throwaway
// static server, and neither rewrites paths for a history router.
//
// The packet comes first. Nothing under App is imported until it has
// loaded, because the data modules read it at module load.
const root = createRoot(document.getElementById("root")!);

function NoPacket({ status }: { status: Exclude<PacketStatus, { ok: true }> }) {
  const where = PACKET_BASE.replace(/^file:\/\//, "");
  return (
    <div className="nopacket">
      <div className="eyebrow">Family atlas</div>
      <h1>No packet loaded.</h1>
      <p>
        This program holds no family of its own. It reads a packet: a folder named{" "}
        <code>packet</code> with a <code>manifest.json</code> in it, placed next to this page.
      </p>
      <ol>
        <li>Unzip the packet you were sent.</li>
        <li>
          Put the <code>packet</code> folder inside the app&apos;s <code>public</code> folder (a
          checkout) or beside its <code>index.html</code> (a built copy).
        </li>
        <li>Reload this page.</li>
      </ol>
      <p className="dim">
        Looked for <code>{where}manifest.json</code>
        {status.reason === "missing" ? " and found nothing there." : ":"}
        {status.reason !== "missing" && <> {status.detail}</>}
      </p>
    </div>
  );
}

loadPacket().then(async (status) => {
  if (!status.ok) {
    document.title = "Family atlas";
    root.render(<NoPacket status={status} />);
    return;
  }
  document.title = status.manifest.title;
  const { default: Root } = await import("@/Root");
  root.render(<Root />);
});
