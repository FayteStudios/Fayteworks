import { useEffect } from "react";

export function useStyleText(id: string, css: string): void {
  useEffect(() => {
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!css) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
  }, [id, css]);
}

export function useStylesheet(id: string, href: string | null): void {
  useEffect(() => {
    const existing = document.getElementById(id) as HTMLLinkElement | null;
    if (!href) {
      existing?.remove();
      return;
    }
    if (existing) {
      if (existing.href !== href) existing.href = href;
      return;
    }
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }, [id, href]);
}
