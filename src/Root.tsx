import { StrictMode } from "react";
import { HashRouter } from "react-router-dom";
import App from "@/App";
import { ModeProvider } from "@/lib/mode";

/** Everything below the packet gate. main.tsx imports this file only
 *  after the packet has loaded, which is what lets the data modules read
 *  it synchronously at module load. */
export default function Root() {
  return (
    <StrictMode>
      <HashRouter>
        <ModeProvider>
          <App />
        </ModeProvider>
      </HashRouter>
    </StrictMode>
  );
}
