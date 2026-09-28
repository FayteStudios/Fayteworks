import "./state/rename";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EditorShell } from "./editor/EditorShell";
import { isDesktop } from "./platform/desktop";
import { DesktopRoot } from "./platform/DesktopRoot";
import { EditorProvider } from "./state/store";
import { VIEWER_HASH } from "./viewer/live";
import { ViewerRoot } from "./viewer/ViewerRoot";
import "@fontsource-variable/dm-sans";
import "./site/site.css";
import "./editor/editor.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {location.hash === VIEWER_HASH ? (
      <ViewerRoot />
    ) : isDesktop ? (
      <DesktopRoot />
    ) : (
      <EditorProvider>
        <EditorShell />
      </EditorProvider>
    )}
  </StrictMode>
);
