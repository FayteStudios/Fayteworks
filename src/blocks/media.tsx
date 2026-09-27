import type { BlockDefinition } from "./types";
import { str } from "./util";

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
  }
];
