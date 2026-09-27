export const LIBRARY_MIME = "application/x-fayteworks-block";

import type { BlockProps } from "../model/types";

export const activeLibraryDrag: { type: string | null; props?: BlockProps; size?: { w: number; h: number } } = { type: null };
