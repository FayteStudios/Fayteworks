export interface VisitorItem {
  id: string;
  name?: string;
  icon?: string;
}

export interface VisitorSave {
  visitorId: string;
  nickname?: string;
  avatarId?: string;
  xp: number;
  level: number;
  visited: string[];
  unlocked: Record<string, boolean>;
  items: VisitorItem[];
  notes: Record<string, unknown>;
  preferences: { reducedMotion?: boolean; themeId?: string; sound?: boolean };
  firstVisit: string;
  lastVisit: string;
}

export type VisitorSound = "click" | "snap" | "pageTurn" | "gear" | "blip" | "unlock" | "itemGet";

export interface FayteWorksApi {
  memory: {
    get(): VisitorSave;
    update(patch: Partial<VisitorSave>): void;
    addXp(amount: number): void;
    unlock(flag: string): void;
    has(flag: string): boolean;
    addItem(item: VisitorItem): void;
    visit(path: string): void;
    remember(key: string, value: unknown): void;
    recall<T = unknown>(key: string): T | undefined;
    forget(): void;
    returning: boolean;
    on(fn: (save: VisitorSave) => void): () => void;
  };
  sound: { play(kind: VisitorSound): void; muted(): boolean };
  reducedMotion: boolean;
}

export const fayteworksOf = (win: Window | null | undefined) => (win as (Window & { fayteworks?: FayteWorksApi }) | null | undefined)?.fayteworks;
