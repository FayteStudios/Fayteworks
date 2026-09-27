import type { ReactNode } from "react";
import { Markdown } from "../site/markdown";
import type { BlockDefinition } from "./types";
import { str } from "./util";

export const GISCUS_REPO = /^[\w.-]+\/[\w.-]+$/;
export const GISCUS_ID = /^[\w=+/-]{4,80}$/;
export const BLUESKY_POST = /^https:\/\/bsky\.app\/profile\/[\w.:-]+\/post\/[\w]+$/;
export const MASTODON_POST = /^https:\/\/[\w.-]+\/@[\w.@-]+\/\d+$/;

export const blogDefinitions: BlockDefinition[] = [
  {
    type: "article",
    badges: ["markdown", "grows"],
    label: "Article",
    category: "Text",
    icon: "¶",
    description: "Long writing with headings, quotes, lists and pictures (Markdown). Grows to fit its text.",
    defaultSize: { w: 8, h: 16 },
    defaultProps: {
      markdown: "## A heading\n\nWrite as much as you like. **Bold**, _italic_ and [links](https://example.com) work, and so do lists:\n\n- one\n- two\n\n> And quotes.",
      size: "m"
    },
    fields: [
      { key: "markdown", label: "Text (Markdown)", kind: "textarea", hint: "## heading · **bold** · _italic_ · [link](address) · - list · > quote · ![alt](image). On a post page, use {{item.body}}." },
      {
        key: "size",
        label: "Text size",
        kind: "select",
        options: [
          { value: "m", label: "Comfortable" },
          { value: "l", label: "Large" }
        ]
      }
    ],
    mobileHeight: "content",
    grows: true,
    render: (p, ctx) => (
      <div className={`b-article b-article--${str(p.size, "m")}${ctx.isEditor && !ctx.isPreview ? " is-clipped" : ""}`}>
        <Markdown text={str(p.markdown)} ctx={ctx} />
      </div>
    )
  },
  {
    type: "comments",
    badges: ["free", "noServer"],
    label: "Comments",
    category: "Services",
    icon: "💬",
    description: "Comments from Giscus (GitHub), Cusdis, or replies to a Bluesky or Mastodon post. Free, no server.",
    defaultSize: { w: 8, h: 12 },
    defaultProps: { provider: "giscus", heading: "Comments", repo: "", repoId: "", category: "", categoryId: "", cusdisId: "", cusdisHost: "https://cusdis.com", post: "", theme: "preferred_color_scheme" },
    fields: [
      {
        key: "provider",
        label: "Comments from",
        kind: "select",
        options: [
          { value: "giscus", label: "Giscus (GitHub Discussions)" },
          { value: "cusdis", label: "Cusdis" },
          { value: "bluesky", label: "Bluesky replies" },
          { value: "mastodon", label: "Mastodon replies" }
        ],
        hint: "Not sure? The Guide button below walks you through each."
      },
      { key: "heading", label: "Heading", kind: "text" },
      { key: "repo", label: "Repository", kind: "text", placeholder: "you/your-site", showWhen: { key: "provider", is: ["giscus"] } },
      { key: "repoId", label: "Repository id", kind: "text", placeholder: "R_kgDO…", showWhen: { key: "provider", is: ["giscus"] } },
      { key: "category", label: "Category", kind: "text", placeholder: "Comments", showWhen: { key: "provider", is: ["giscus"] } },
      { key: "categoryId", label: "Category id", kind: "text", placeholder: "DIC_kwDO…", showWhen: { key: "provider", is: ["giscus"] } },
      {
        key: "theme",
        label: "Colours",
        kind: "select",
        showWhen: { key: "provider", is: ["giscus"] },
        options: [
          { value: "preferred_color_scheme", label: "Follow the visitor (light or dark)" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" }
        ]
      },
      { key: "cusdisId", label: "App id", kind: "text", showWhen: { key: "provider", is: ["cusdis"] } },
      { key: "cusdisHost", label: "Cusdis address", kind: "text", hint: "Leave as is unless you host Cusdis yourself.", showWhen: { key: "provider", is: ["cusdis"] } },
      { key: "post", label: "The post to show replies to", kind: "text", placeholder: "https://bsky.app/profile/you/post/…", hint: "On a post page, use a field: {{item.bluesky}}.", showWhen: { key: "provider", is: ["bluesky", "mastodon"] } }
    ],
    mobileHeight: "content",
    grows: true,
    render: (p, ctx) => {
      const provider = str(p.provider, "giscus");
      const heading = str(p.heading);
      const shell = (body: ReactNode, note?: string) => (
        <div className="b-comments">
          {heading && <h3 className="b-comments-heading">{heading}</h3>}
          {body}
          {note && ctx.isEditor && <p className="b-comments-note">{note}</p>}
        </div>
      );
      const live = !ctx.isEditor;
      if (provider === "giscus") {
        const ok = GISCUS_REPO.test(str(p.repo)) && GISCUS_ID.test(str(p.repoId)) && GISCUS_ID.test(str(p.categoryId)) && str(p.category).length > 0;
        if (!ok) return ctx.isEditor ? shell(null, "Add your Giscus settings (the guide shows where they come from).") : null;
        return shell(
          live ? (
            <script
              src="https://giscus.app/client.js"
              data-repo={str(p.repo)}
              data-repo-id={str(p.repoId)}
              data-category={str(p.category)}
              data-category-id={str(p.categoryId)}
              data-mapping="pathname"
              data-strict="1"
              data-reactions-enabled="1"
              data-emit-metadata="0"
              data-input-position="bottom"
              data-theme={["light", "dark"].includes(str(p.theme)) ? str(p.theme) : "preferred_color_scheme"}
              data-lang="en"
              crossOrigin="anonymous"
              async
            />
          ) : null,
          "Giscus comments load here on the published site."
        );
      }
      if (provider === "cusdis") {
        const id = str(p.cusdisId);
        const host = str(p.cusdisHost, "https://cusdis.com").replace(/\/+$/, "");
        if (!/^[\w-]{8,64}$/.test(id) || !/^https:\/\/[\w.-]+(:\d+)?$/.test(host)) return ctx.isEditor ? shell(null, "Add your Cusdis app id.") : null;
        return shell(
          live ? (
            <>
              <div id="cusdis_thread" data-host={host} data-app-id={id} data-page-id={ctx.pageUrl || ctx.currentPageId} data-page-url={ctx.pageUrl || undefined} />
              <script src={`${host}/js/cusdis.es.js`} async defer />
            </>
          ) : null,
          "Cusdis comments load here on the published site."
        );
      }
      const post = str(p.post);
      const valid = provider === "bluesky" ? BLUESKY_POST.test(post) : MASTODON_POST.test(post);
      if (!valid) return ctx.isEditor ? shell(null, provider === "bluesky" ? "Paste the Bluesky post to collect replies from (https://bsky.app/profile/…/post/…)." : "Paste the Mastodon post to collect replies from (https://instance/@you/123…).") : null;
      const where = provider === "bluesky" ? "Bluesky" : "Mastodon";
      return shell(
        <div className="b-social-comments" data-js="social-comments" data-provider={provider} data-post={post}>
          <p className="b-social-comments-intro">
            Replies to this post on {where} show up here.{" "}
            <a href={post} target="_blank" rel="noopener noreferrer">
              Join the conversation on {where} ↗
            </a>
          </p>
          <ol className="b-social-comments-list" />
        </div>,
        `Replies load from ${where} on the published site (and in Preview).`
      );
    }
  }
];
