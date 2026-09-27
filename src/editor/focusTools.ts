import { setFocusTool } from "./workspace";

const FOCUS_REQUEST = "fayteworks:focus-request";

export interface FocusRequest {
  sectionId: string;
  blockId: string;
}

export function onFocusRequest(fn: (req: FocusRequest) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<FocusRequest>).detail);
  window.addEventListener(FOCUS_REQUEST, handler);
  return () => window.removeEventListener(FOCUS_REQUEST, handler);
}

function focusOn(sectionId: string, blockId: string) {
  window.dispatchEvent(new CustomEvent<FocusRequest>(FOCUS_REQUEST, { detail: { sectionId, blockId } }));
}

export function openTimelineFor(sectionId: string, blockId: string) {
  focusOn(sectionId, blockId);
  setFocusTool("timeline");
}

export function openFramesFor(sectionId: string, blockId: string) {
  focusOn(sectionId, blockId);
  setFocusTool("frames");
}
