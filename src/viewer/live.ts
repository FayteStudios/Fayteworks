import { useEffect, useRef } from "react";
import type { Site } from "../model/types";
import { usingProjectAssets } from "../state/assets";

export const VIEWER_HASH = "#second-window";

export interface LiveMessage {
  kind: "fayteworks-live";
  site: Site;
  pageId: string;
  projectAssets: boolean;
}

let viewer: Window | null = null;

export function openSecondWindow() {
  if (viewer && !viewer.closed) {
    viewer.focus();
    window.dispatchEvent(new Event("fayteworks:live-send"));
    return;
  }
  const url = `${location.href.split("#")[0]}${VIEWER_HASH}`;
  viewer = window.open(url, "fayteworks-second-window", "width=1100,height=900");
}

export function useLiveBroadcast(site: Site, pageId: string) {
  const latest = useRef({ site, pageId });
  latest.current = { site, pageId };
  useEffect(() => {
    const send = () => {
      if (!viewer || viewer.closed) return;
      const message: LiveMessage = { kind: "fayteworks-live", ...latest.current, projectAssets: usingProjectAssets() };
      viewer.postMessage(message, "*");
    };
    const onMessage = (e: MessageEvent) => {
      if (e.data?.kind === "fayteworks-hello" && e.source && e.source === viewer) send();
      else if (e.data?.kind === "fayteworks-hello" && e.source) {
        viewer = e.source as Window;
        send();
      }
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("fayteworks:live-send", send);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("fayteworks:live-send", send);
    };
  }, []);
  useEffect(() => {
    const id = window.setTimeout(() => window.dispatchEvent(new Event("fayteworks:live-send")), 120);
    return () => window.clearTimeout(id);
  }, [site, pageId]);
}
