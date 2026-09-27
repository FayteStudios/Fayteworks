import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { pageTheme } from "../model/styles";
import { themeVars } from "../model/theme";
import type { Page, Site, Theme } from "../model/types";
import { PageRenderer } from "../site/SiteRenderer";

const WIDTH = 1280;

export function SitePreview({ site, page, theme, label }: { site: Site; page: Page; theme?: Theme; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.5);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setZoom(Math.max(0.2, el.clientWidth / WIDTH));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} className="scene-preview" aria-label={label ?? "Preview"} onClickCapture={(e) => e.preventDefault()}>
      <div className="site-root scene-preview-site" inert style={{ ...themeVars(theme ?? pageTheme(site, page)), width: WIDTH, zoom } as CSSProperties}>
        <PageRenderer site={site} page={page} />
      </div>
    </div>
  );
}
