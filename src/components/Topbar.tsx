import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { search, treeSpan, type SearchHit } from "@/lib/data";
import { useMode } from "@/lib/mode";
import { packetManifest } from "@/lib/packet";
import { LineageDot } from "@/components/bits";

function hitPath(h: SearchHit): string {
  if (h.kind === "person") return `/person/${h.id}`;
  if (h.kind === "story") return `/story/${h.id}`;
  return `/map?place=${encodeURIComponent(h.id)}`;
}

function Search() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const hits = open ? search(q) : [];

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      // "/" focuses search the way every reading app does it.
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        input.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function go(hit: SearchHit) {
    navigate(hitPath(hit));
    setOpen(false);
    setQ("");
    input.current?.blur();
  }

  return (
    <div className="searchwrap" ref={wrap}>
      <input
        ref={input}
        className="searchinput"
        value={q}
        placeholder="Search people, stories, places"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && hits[active]) {
            go(hits[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && q.trim().length >= 2 && (
        <div className="results">
          {hits.length === 0 ? (
            <div className="results__empty">Nothing matches "{q}".</div>
          ) : (
            hits.map((h, i) => (
              <Link
                key={`${h.kind}:${h.id}`}
                to={hitPath(h)}
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  setOpen(false);
                  setQ("");
                }}
              >
                <span>
                  {h.kind === "person" && <LineageDot lineage={h.lineage} />} {h.label}
                </span>
                <small>{h.detail}</small>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function Topbar() {
  const { mode, setMode } = useMode();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <header className="topbar">
      <Link className="topbar__mark" to="/">
        <strong>{packetManifest().title.toUpperCase()}</strong>
        <span>{treeSpan}</span>
      </Link>
      <nav className="topbar__nav">
        <NavLink to="/" end>
          Chronicle
        </NavLink>
        <NavLink to="/map">Migration</NavLink>
        <NavLink to="/atlas">Atlas</NavLink>
        <NavLink to="/gallery">Pictures</NavLink>
        <NavLink to="/tree">Tree</NavLink>
        <NavLink to="/lines">Lines</NavLink>
      </nav>
      <div className="topbar__right">
        <Search />
        <div className="modeswitch" title="Research mode shows evidence grades, sources and open questions">
          <button data-on={mode === "family"} onClick={() => setMode("family")}>
            Family
          </button>
          <button data-on={mode === "research"} onClick={() => setMode("research")}>
            Research
          </button>
        </div>
        <button
          className="iconbtn"
          title="Toggle light and dark"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="3.2" fill="currentColor" />
              <g stroke="currentColor" strokeWidth="1.2">
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13" />
              </g>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M13 9.5A5.6 5.6 0 0 1 6.5 3a5.6 5.6 0 1 0 6.5 6.5z"
                fill="currentColor"
              />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
