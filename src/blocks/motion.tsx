import type { ListItem } from "../model/types";
import { renderSvg } from "../vector/svg";
import { colorMapOf } from "./vector";
import type { BlockDefinition } from "./types";
import { list, num, str } from "./util";

function starterFrames(): ListItem[] {
  const ys = [40, 70, 110, 150, 150, 110, 70];
  const squash = [1, 1, 1.05, 1.25, 1.25, 1.05, 1];
  return ys.map((y, i) => {
    const rx = 26 * squash[i];
    const ry = 26 / squash[i];
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><ellipse cx="100" cy="186" rx="${20 + (y - 40) / 5}" ry="6" fill="#1d1b18" opacity="0.18"/><ellipse id="Ball" cx="100" cy="${y + 26 - ry}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="#e0633a"/></svg>`
    };
  });
}

export const motionDefinitions: BlockDefinition[] = [
  {
    type: "flipbook",
    label: "Flipbook",
    category: "Media",
    icon: "🎞",
    description: "Frame-by-frame animation: draw each frame (with onion skin), or turn a drawing's layers into frames.",
    defaultSize: { w: 3, h: 8 },
    defaultProps: {
      frames: starterFrames(),
      fps: 12,
      play: "loop",
      pingpong: false,
      fit: "contain",
      alt: "",
      colors: [
        { color: "#e0633a", token: "var(--accent)" },
        { color: "#1d1b18", token: "var(--text)" }
      ],
      editFrame: 0
    },
    fields: [
      {
        key: "play",
        label: "Plays",
        kind: "select",
        options: [
          { value: "loop", label: "Over and over" },
          { value: "view", label: "Once, when it comes into view" },
          { value: "hover", label: "While hovered" },
          { value: "click", label: "Once per click" },
          { value: "scroll", label: "With scrolling (frame by frame)" }
        ]
      },
      { key: "fps", label: "Frames per second", kind: "range", min: 1, max: 60 },
      { key: "pingpong", label: "Back and forth", kind: "toggle" },
      {
        key: "fit",
        label: "Fit",
        kind: "select",
        options: [
          { value: "contain", label: "Fit (whole frame)" },
          { value: "cover", label: "Fill (crop)" },
          { value: "stretch", label: "Stretch" }
        ]
      },
      { key: "alt", label: "Alt text", kind: "text", hint: "Describe the animation for screen readers. Leave empty if it's decoration." }
    ],
    mobileHeight: "keep",
    render: (p, ctx, meta) => {
      const frames = list(p.frames).map((f) => str(f.svg as string)).filter(Boolean);
      const alt = str(p.alt);
      const fit = str(p.fit, "contain") as "contain" | "cover" | "stretch";
      const colorMap = colorMapOf(p);
      const shown = ctx.isEditor && !ctx.isPreview ? Math.min(frames.length - 1, Math.max(0, num(p.editFrame, 0))) : 0;
      return (
        <div
          className="b-flipbook"
          data-js="flipbook"
          data-fps={Math.min(60, Math.max(1, num(p.fps, 12)))}
          data-play={str(p.play, "loop")}
          data-pingpong={p.pingpong ? "" : undefined}
          role={alt ? "img" : undefined}
          aria-label={alt || undefined}
        >
          {frames.map((svg, i) => (
            <div
              key={i}
              className={`fb-frame${i === shown ? " is-current" : ""}`}
              aria-hidden
              dangerouslySetInnerHTML={{ __html: renderSvg(svg, { scope: `${meta.id}-f${i}`, colorMap, values: p, fit, animations: [] }) }}
            />
          ))}
        </div>
      );
    }
  },
  {
    type: "sound-toggle",
    label: "Sound on/off",
    category: "Media",
    icon: "🔊",
    description: "Lets visitors turn the site's sounds off (and back on). Remembered on their device.",
    defaultSize: { w: 2, h: 2 },
    defaultProps: { on: "Sound on", off: "Sound off", align: "right" },
    fields: [
      { key: "on", label: "Label while on", kind: "text" },
      { key: "off", label: "Label while off", kind: "text" }
    ],
    mobileHeight: "content",
    render: (p) => (
      <div className="b-button-wrap" style={{ justifyContent: str(p.align, "right") === "left" ? "flex-start" : str(p.align) === "center" ? "center" : "flex-end" }}>
        <button type="button" className="b-button b-button--ghost b-button--s b-sound-toggle" data-js="sound-toggle" aria-pressed="true">
          <span className="b-sound-on" aria-hidden>
            🔊
          </span>
          <span className="b-sound-off" aria-hidden>
            🔇
          </span>
          <span className="b-sound-on">{str(p.on, "Sound on")}</span>
          <span className="b-sound-off">{str(p.off, "Sound off")}</span>
        </button>
      </div>
    )
  }
];
