export type FieldKind = "text" | "textarea" | "number" | "range" | "color" | "select" | "toggle" | "image" | "link" | "font" | "list" | "code";

export interface FieldOption {
  value: string;
  label: string;
  /** A brand mark (an SVG path in a 24 × 24 box and its colour); choices with icons show as buttons. */
  icon?: { path: string; hex: string };
}

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  hint?: string;
  accept?: string;
  itemFields?: FieldDef[];
  itemLabel?: string;
  itemTitleKey?: string;
  newItem?: Record<string, string | number | boolean>;
  /** Only shown when another setting has one of these values (e.g. provider-specific settings). */
  showWhen?: { key: string; is: string[] };
}
