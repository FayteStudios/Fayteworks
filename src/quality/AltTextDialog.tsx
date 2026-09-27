import { openScene } from "../scenes/scenes";

export const openAltText = (blockId?: string) => openScene({ kind: "describe", focus: blockId || undefined });
