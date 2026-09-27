export type FieldKind = "text" | "textarea" | "number" | "range" | "color" | "select" | "toggle" | "image" | "link" | "font" | "list" | "code";

export interface FieldOption {
  value: string;
  label: string;
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
