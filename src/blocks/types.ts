import type { ReactNode } from "react";
import type { FieldDef } from "../model/fields";
import type { BlockProps, Site } from "../model/types";
import type { RenderContext } from "../site/renderContext";

export type BlockCategory = "Navigation" | "Text" | "Media" | "Interactive" | "Content" | "Layout" | "Actions" | "Social" | "Services" | "Toybox";

export interface BlockMeta {
  id: string;
}

export interface BlockDefinition {
  type: string;
  label: string;
  category: BlockCategory;
  icon: string;
  description: string;
  defaultSize: { w: number; h: number };
  defaultProps: BlockProps;
  fields: FieldDef[];
  extraFields?: (props: BlockProps, site?: Site) => FieldDef[];
  hidden?: boolean;
  mobileHeight: "content" | "keep";
  grows?: boolean;
  render: (props: BlockProps, ctx: RenderContext, meta: BlockMeta) => ReactNode;
  /** Short facts shown as badges in the inspector (see editor/Hint.tsx). */
  badges?: ("free" | "noServer" | "account" | "markdown" | "grows" | "github" | "desktop")[];
  inlineEdit?: InlineEditTarget[];
}

export interface InlineEditTarget {
  key: string;
  selector: string;
  mode: "rich" | "plain";
  lines: "paragraphs" | "lines" | "single";
}
