import type { CSSProperties } from "react";
import type { FieldDef } from "../model/fields";
import { linkAttrs } from "../site/richText";
import type { BlockDefinition } from "./types";
import { list, num, Paragraphs, str } from "./util";

const imageFit: FieldDef = {
  key: "fit",
  label: "Image fit",
  kind: "select",
  options: [
    { value: "cover", label: "Fill (crop)" },
    { value: "contain", label: "Fit (no crop)" }
  ]
};

interface VideoSource {
  kind: "youtube" | "vimeo" | "file" | "none";
  id?: string;
  src?: string;
}

function parseVideo(url: string): VideoSource {
  const u = url.trim();
  if (!u) return { kind: "none" };
  const yt = u.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { kind: "youtube", id: yt[1] };
  const vimeo = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { kind: "vimeo", id: vimeo[1] };
  return { kind: "file", src: u };
}

export const interactiveDefinitions: BlockDefinition[] = [
  {
    type: "carousel",
    label: "Carousel",
    category: "Interactive",
    icon: "⇆",
    description: "Slides you swipe or click through, optionally playing by themselves",
    defaultSize: { w: 12, h: 18 },
    defaultProps: {
      slides: [
        { image: "", title: "First slide", text: "Say something about it.", buttonLabel: "", buttonHref: "" },
        { image: "", title: "Second slide", text: "Swipe, drag or use the arrows.", buttonLabel: "", buttonHref: "" },
        { image: "", title: "Third slide", text: "Turn on autoplay in the inspector.", buttonLabel: "", buttonHref: "" }
      ],
      layout: "overlay",
      autoplay: 0,
      loop: true,
      arrows: true,
      dots: true,
      fit: "cover"
    },
    fields: [
      {
        key: "slides",
        label: "Slides",
        kind: "list",
        itemLabel: "slide",
        itemTitleKey: "title",
        newItem: { image: "", title: "New slide", text: "", buttonLabel: "", buttonHref: "" },
        itemFields: [
          { key: "image", label: "Image", kind: "image" },
          { key: "alt", label: "Picture description (alt text)", kind: "text" },
          { key: "title", label: "Title", kind: "text" },
          { key: "text", label: "Text", kind: "textarea" },
          { key: "buttonLabel", label: "Button label", kind: "text", placeholder: "Leave empty for no button" },
          { key: "buttonHref", label: "Button link", kind: "link" }
        ]
      },
      {
        key: "layout",
        label: "Slide layout",
        kind: "select",
        options: [
          { value: "overlay", label: "Text over the image" },
          { value: "below", label: "Text below the image" },
          { value: "image", label: "Image only" }
        ]
      },
      imageFit,
      { key: "autoplay", label: "Autoplay (seconds)", kind: "range", min: 0, max: 15, hint: "0 = off. Pauses while hovered." },
      { key: "loop", label: "Loop back to the start", kind: "toggle" },
      { key: "arrows", label: "Show arrows", kind: "toggle" },
      { key: "dots", label: "Show dots", kind: "toggle" }
    ],
    mobileHeight: "keep",
    render: (p, ctx) => {
      const layout = str(p.layout, "overlay");
      const slides = list(p.slides);
      return (
        <div
          className={`b-carousel b-carousel--${layout}`}
          data-js="carousel"
          data-autoplay={num(p.autoplay, 0) > 0 ? num(p.autoplay, 0) * 1000 : undefined}
          data-loop={p.loop ? "true" : undefined}
        >
          <div className="b-carousel-track" tabIndex={0} aria-label="Slides">
            {slides.map((s, i) => {
              const image = ctx.asset(str(s.image));
              const title = str(s.title);
              const text = str(s.text);
              const button = str(s.buttonLabel);
              return (
                <div key={i} className="b-carousel-slide" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`}>
                  {image ? (
                    <img src={image} alt={str(s.alt) || title} loading={i === 0 ? undefined : "lazy"} style={{ objectFit: str(p.fit, "cover") as CSSProperties["objectFit"] }} />
                  ) : (
                    <div className="b-carousel-empty">Slide {i + 1}: add an image</div>
                  )}
                  {layout !== "image" && (title || text || button) && (
                    <div className="b-carousel-caption">
                      {title && <h3>{title}</h3>}
                      {text && <Paragraphs text={text} ctx={ctx} />}
                      {button && (
                        <a className="b-button b-button--solid b-button--s" {...linkAttrs(ctx.link(str(s.buttonHref)))}>
                          {button}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {p.arrows !== false && slides.length > 1 && (
            <>
              <button type="button" className="b-carousel-arrow b-carousel-prev" data-carousel-prev hidden aria-label="Previous slide">
                ‹
              </button>
              <button type="button" className="b-carousel-arrow b-carousel-next" data-carousel-next hidden aria-label="Next slide">
                ›
              </button>
            </>
          )}
          {p.dots !== false && slides.length > 1 && <div className="b-carousel-dots" />}
        </div>
      );
    }
  },
  {
    type: "gallery",
    label: "Gallery",
    category: "Media",
    icon: "▦",
    description: "A grid of images that open large when clicked",
    defaultSize: { w: 12, h: 14 },
    defaultProps: {
      images: [
        { image: "", alt: "", caption: "" },
        { image: "", alt: "", caption: "" },
        { image: "", alt: "", caption: "" },
        { image: "", alt: "", caption: "" },
        { image: "", alt: "", caption: "" },
        { image: "", alt: "", caption: "" }
      ],
      columns: 3,
      gap: 12,
      aspect: "4 / 3",
      lightbox: true,
      captions: false
    },
    fields: [
      {
        key: "images",
        label: "Images",
        kind: "list",
        itemLabel: "image",
        itemTitleKey: "caption",
        newItem: { image: "", alt: "", caption: "" },
        itemFields: [
          { key: "image", label: "Image", kind: "image" },
          { key: "alt", label: "Alt text", kind: "text", hint: "Describe the image for screen readers." },
          { key: "caption", label: "Caption", kind: "text" }
        ]
      },
      { key: "columns", label: "Columns", kind: "range", min: 1, max: 6, hint: "Fewer columns are used automatically on small screens." },
      { key: "gap", label: "Gap (px)", kind: "range", min: 0, max: 40, step: 2 },
      {
        key: "aspect",
        label: "Shape",
        kind: "select",
        options: [
          { value: "1 / 1", label: "Square" },
          { value: "4 / 3", label: "Landscape 4:3" },
          { value: "16 / 9", label: "Wide 16:9" },
          { value: "3 / 4", label: "Portrait 3:4" },
          { value: "auto", label: "Original shape" }
        ]
      },
      { key: "lightbox", label: "Open large on click", kind: "toggle" },
      { key: "captions", label: "Show captions under images", kind: "toggle" }
    ],
    mobileHeight: "content",
    render: (p, ctx) => {
      const images = list(p.images);
      const aspect = str(p.aspect, "4 / 3");
      const lightbox = p.lightbox !== false;
      return (
        <div
          className="b-gallery"
          data-js={lightbox ? "lightbox" : undefined}
          style={{ "--cols": num(p.columns, 3), "--gap": `${num(p.gap, 12)}px`, "--aspect": aspect } as CSSProperties}
        >
          {images.map((item, i) => {
            const src = ctx.asset(str(item.image));
            const caption = str(item.caption);
            const img = src ? (
              <img src={src} alt={str(item.alt)} loading="lazy" />
            ) : (
              <span className="b-gallery-empty">Image {i + 1}</span>
            );
            const figcaption = p.captions && caption ? <figcaption>{caption}</figcaption> : null;
            return lightbox && src ? (
              <a key={i} className="b-gallery-item" href={src} data-caption={caption || undefined}>
                {img}
                {figcaption}
              </a>
            ) : (
              <figure key={i} className="b-gallery-item">
                {img}
                {figcaption}
              </figure>
            );
          })}
        </div>
      );
    }
  },
  {
    type: "accordion",
    label: "FAQ / Accordion",
    category: "Interactive",
    icon: "≡",
    description: "Questions that open to show their answers",
    defaultSize: { w: 8, h: 12 },
    defaultProps: {
      items: [
        { question: "Is it really free?", answer: "Yes. You own the files and can host them anywhere." },
        { question: "Do I need to code?", answer: "No. Everything is done by dragging and editing." },
        { question: "Can I change it later?", answer: "Open your site file, edit, and export again." }
      ],
      exclusive: true,
      firstOpen: true,
      style: "lines"
    },
    fields: [
      {
        key: "items",
        label: "Questions",
        kind: "list",
        itemLabel: "question",
        itemTitleKey: "question",
        newItem: { question: "A new question?", answer: "The answer." },
        itemFields: [
          { key: "question", label: "Question", kind: "text" },
          { key: "answer", label: "Answer", kind: "textarea", hint: "**bold**, _italic_, [link](https://…)" }
        ]
      },
      { key: "exclusive", label: "Only one open at a time", kind: "toggle" },
      { key: "firstOpen", label: "First one starts open", kind: "toggle" },
      {
        key: "style",
        label: "Style",
        kind: "select",
        options: [
          { value: "lines", label: "Divider lines" },
          { value: "cards", label: "Cards" }
        ]
      }
    ],
    mobileHeight: "content",
    render: (p, ctx, meta) => (
      <div className={`b-accordion b-accordion--${str(p.style, "lines")}`}>
        {list(p.items).map((item, i) => (
          <details key={i} name={p.exclusive ? `faq-${meta.id}` : undefined} open={Boolean(p.firstOpen) && i === 0}>
            <summary>{str(item.question)}</summary>
            <div className="b-accordion-body">
              <Paragraphs text={str(item.answer)} ctx={ctx} />
            </div>
          </details>
        ))}
      </div>
    )
  },
  {
    type: "tabs",
    label: "Tabs",
    category: "Interactive",
    icon: "⊟",
    description: "Switch between panels of content",
    defaultSize: { w: 10, h: 12 },
    defaultProps: {
      tabs: [
        { label: "Overview", content: "What this is, in a sentence or two." },
        { label: "Details", content: "The finer points.\n\nAs many paragraphs as you need." },
        { label: "Pricing", content: "What it costs, and what you get." }
      ],
      style: "underline"
    },
    fields: [
      {
        key: "tabs",
        label: "Tabs",
        kind: "list",
        itemLabel: "tab",
        itemTitleKey: "label",
        newItem: { label: "New tab", content: "Tab content." },
        itemFields: [
          { key: "label", label: "Label", kind: "text" },
          { key: "content", label: "Content", kind: "textarea", hint: "Blank line = new paragraph. **bold**, _italic_, [link](…)" }
        ]
      },
      {
        key: "style",
        label: "Style",
        kind: "select",
        options: [
          { value: "underline", label: "Underlined" },
          { value: "pills", label: "Pills" }
        ]
      }
    ],
    mobileHeight: "content",
    render: (p, ctx) => {
      const tabs = list(p.tabs);
      return (
        <div className={`b-tabs b-tabs--${str(p.style, "underline")}`} data-js="tabs">
          <div className="b-tabs-list" hidden>
            {tabs.map((t, i) => (
              <button key={i} type="button">
                {str(t.label)}
              </button>
            ))}
          </div>
          {tabs.map((t, i) => (
            <section key={i} className="b-tabs-panel">
              <h3 className="b-tabs-fallback-title">{str(t.label)}</h3>
              <div className="b-tabs-content">
                <Paragraphs text={str(t.content)} ctx={ctx} />
              </div>
            </section>
          ))}
        </div>
      );
    }
  },
  {
    type: "video",
    label: "Video",
    category: "Media",
    icon: "▶",
    description: "YouTube, Vimeo or an uploaded video file",
    defaultSize: { w: 8, h: 14 },
    defaultProps: { url: "", title: "", poster: "", youtubeThumb: false, autoplay: false, loop: false },
    fields: [
      {
        key: "url",
        label: "Video",
        kind: "image",
        accept: "video/*",
        placeholder: "https://youtube.com/watch?v=… or upload a file",
        hint: "YouTube and Vimeo players only load when a visitor presses play."
      },
      { key: "title", label: "Title", kind: "text", hint: "Read out by screen readers; shown on the poster." },
      { key: "poster", label: "Poster image", kind: "image", hint: "Shown before playing." },
      {
        key: "youtubeThumb",
        label: "Use YouTube's thumbnail as poster",
        kind: "toggle",
        hint: "Loads the image from Google when the page opens."
      },
      { key: "autoplay", label: "Uploaded video: autoplay muted", kind: "toggle" },
      { key: "loop", label: "Uploaded video: loop", kind: "toggle" }
    ],
    mobileHeight: "keep",
    render: (p, ctx) => {
      const source = parseVideo(ctx.asset(str(p.url)));
      const title = str(p.title);
      const poster = ctx.asset(str(p.poster));
      if (source.kind === "none") {
        return <div className="b-video b-video--empty">Paste a YouTube or Vimeo link, or upload a video</div>;
      }
      if (source.kind === "file") {
        const auto = Boolean(p.autoplay);
        return (
          <video
            className="b-video b-video-file"
            src={source.src}
            poster={poster || undefined}
            controls={!auto}
            autoPlay={auto}
            muted={auto}
            loop={Boolean(p.loop)}
            playsInline
            preload="metadata"
            aria-label={title || undefined}
          >
            {str(p.captions) && (
              <track kind="subtitles" src={ctx.asset(str(p.captions)) || undefined} srcLang={str(p.captionsLang, "en")} label={str(p.captionsLabel, "Captions")} default={Boolean(p.captionsOn)} />
            )}
          </video>
        );
      }
      const embed =
        source.kind === "youtube"
          ? `https://www.youtube-nocookie.com/embed/${source.id}?autoplay=1&rel=0`
          : `https://player.vimeo.com/video/${source.id}?autoplay=1&dnt=1`;
      const watch = source.kind === "youtube" ? `https://www.youtube.com/watch?v=${source.id}` : `https://vimeo.com/${source.id}`;
      const thumb = poster || (source.kind === "youtube" && p.youtubeThumb ? `https://i.ytimg.com/vi/${source.id}/hqdefault.jpg` : "");
      return (
        <div className="b-video" data-js="video" data-embed={embed}>
          <a
            className="b-video-poster"
            href={watch}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={title ? `Play: ${title}` : "Play video"}
            style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
          >
            <span className="b-video-play" aria-hidden />
            {title && <span className="b-video-title">{title}</span>}
          </a>
        </div>
      );
    }
  }
];
