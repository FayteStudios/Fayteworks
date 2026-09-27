import { Icon } from "../editor/icons";
import type { Block } from "../model/types";
import { openScene } from "../scenes/scenes";
import { spriteCss, spriteStyle, stateClass } from "../sprites/sprites";
import type { BlockDefinition } from "./types";
import { str } from "./util";

function SpriteTools({ block }: { block: Block }) {
  return (
    <button className="inspector-door" onClick={() => openScene({ kind: "sprites", id: str(block.props.setId) || undefined })}>
      <Icon name="motion" size={20} />
      <span>
        <strong>{block.props.setId ? "Sprites and animations" : "Bring in sprites"}</strong>
        <small>Import sheets, GIFs or packs, and make states like idle and walk.</small>
      </span>
    </button>
  );
}

export const mediaDefinitions: BlockDefinition[] = [
  {
    type: "audio",
    label: "Audio",
    category: "Media",
    icon: "♪",
    description: "An uploaded sound file: music, a podcast episode, a voice note",
    defaultSize: { w: 6, h: 4 },
    defaultProps: { src: "", title: "", loop: false },
    fields: [
      { key: "src", label: "Audio file", kind: "image", accept: "audio/*", placeholder: "Upload an MP3, M4A, OGG or WAV" },
      { key: "title", label: "Title", kind: "text", hint: "Shown above the player and read out by screen readers." },
      { key: "loop", label: "Loop", kind: "toggle" }
    ],
    mobileHeight: "content",
    render: (p, ctx) => {
      const src = ctx.asset(str(p.src));
      const title = str(p.title);
      if (!str(p.src)) return <div className="b-audio b-audio--empty">Upload an audio file</div>;
      return (
        <figure className="b-audio">
          {title && <figcaption className="b-audio-title">{title}</figcaption>}
          <audio className="b-audio-player" src={src || undefined} controls preload="metadata" loop={Boolean(p.loop)} aria-label={title || undefined} />
        </figure>
      );
    }
  },
  {
    type: "sprite",
    label: "Sprite",
    category: "Media",
    icon: "👾",
    description: "An animated character or object from a sprite sheet, a GIF or frames",
    defaultSize: { w: 3, h: 4 },
    defaultProps: { setId: "", stateId: "", alt: "", flip: false },
    fields: [
      { key: "alt", label: "Description", kind: "text", hint: "What it is, for screen readers. Leave empty if it's only decoration." },
      { key: "flip", label: "Face the other way", kind: "toggle" }
    ],
    extraFields: (p, site) => {
      const sets = site?.sprites ?? [];
      if (!sets.length) return [];
      const set = sets.find((s) => s.id === p.setId);
      return [
        { key: "setId", label: "Sprite", kind: "select", options: [{ value: "", label: "Choose…" }, ...sets.map((s) => ({ value: s.id, label: s.name }))] },
        ...(set ? [{ key: "stateId", label: "Animation", kind: "select" as const, options: [{ value: "", label: "First one" }, ...set.states.map((s) => ({ value: s.id, label: s.name }))] }] : [])
      ];
    },
    mobileHeight: "keep",
    render: (p, ctx) => {
      const set = ctx.sprites?.find((s) => s.id === p.setId);
      if (!set) return <div className="b-sprite b-sprite--empty">Choose a sprite</div>;
      const state = set.states.find((s) => s.id === p.stateId) ?? set.states[0];
      const alt = str(p.alt);
      return (
        <div className="b-sprite">
          <style>{spriteCss(set)}</style>
          <span
            className={`fw-sprite${state ? ` ${stateClass(set, state)}` : ""}`}
            role={alt ? "img" : undefined}
            aria-label={alt || undefined}
            aria-hidden={alt ? undefined : true}
            style={{ ...spriteStyle(set, ctx.asset(set.sheet), state?.frames[0] ?? 0), transform: p.flip ? "scaleX(-1)" : undefined }}
          />
        </div>
      );
    },
    Tools: SpriteTools
  }
];
