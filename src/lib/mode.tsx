/** Family mode versus research mode, Ethan's "both, layered" ruling.
 *
 *  Family mode is the default: the stories, the people, the places, with
 *  evidence grades and open questions kept quiet. Research mode turns on
 *  the apparatus. This only ever controls what is *shown*. Nothing here
 *  can reveal a living person: that data was never emitted. */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Mode } from "@/types";

const KEY = "family-atlas:mode";

const ModeContext = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({
  mode: "family",
  setMode: () => {},
});

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => {
    const stored = localStorage.getItem(KEY);
    return stored === "research" ? "research" : "family";
  });

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    localStorage.setItem(KEY, m);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export function useMode() {
  return useContext(ModeContext);
}

export function useResearchMode(): boolean {
  return useContext(ModeContext).mode === "research";
}
