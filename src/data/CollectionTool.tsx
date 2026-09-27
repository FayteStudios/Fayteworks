import { useEffect, useMemo, useRef, useState } from "react";
import { useClientLock } from "../client/clientMode";
import { askText } from "../editor/askText";
import { TokenField } from "../editor/ExportDialog";
import { FieldControl, FieldList } from "../editor/Fields";
import { Hint } from "../editor/Hint";
import { Icon } from "../editor/icons";
import { openGuide } from "../guides/GuideHost";
import type { FieldDef } from "../model/fields";
import type { Collection, CollectionFieldType, CollectionItem, DataSource } from "../model/types";
import { desktop } from "../platform/desktop";
import { assetUrl, useAssetVersion } from "../state/assets";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import { createId } from "../util/id";
import { slugify } from "../util/slug";
import { coverSvg } from "./blog";
import { itemPageFor } from "./cardDesign";
import { collectionToCsv, contentHash, csvHeaders, parseCsv, rowsToCollection } from "./model";
import { PostEditor } from "./PostEditor";
import { ghostPosts, markdownPosts, wordpressPosts, type ImportedPost } from "./postImport";
import { fetchCollection, SOURCE_KINDS } from "./sources";

type View = "items" | "fields" | "source" | "pages" | "podcast" | "blog";
type CsvSource = Extract<DataSource, { kind: "csv" }>;

const PODCAST_CATEGORIES = ["Arts", "Business", "Comedy", "Education", "Fiction", "Government", "Health & Fitness", "History", "Kids & Family", "Leisure", "Music", "News", "Religion & Spirituality", "Science", "Society & Culture", "Sports", "Technology", "True Crime", "TV & Film"];
const PODCAST_FIELDS: FieldDef[] = [
  { key: "author", label: "Host / author", kind: "text" },
  { key: "email", label: "Owner email", kind: "text", hint: "Podcast directories send a code here to confirm the show is yours. It's in the feed, so use a public address." },
  { key: "image", label: "Cover art (square, 1400–3000 px)", kind: "image" },
  { key: "category", label: "Category", kind: "select", options: PODCAST_CATEGORIES.map((c) => ({ value: c, label: c })) },
  { key: "explicit", label: "Explicit content", kind: "toggle" },
  { key: "description", label: "About the show", kind: "textarea" }
];

const FIELD_TYPES: { value: CollectionFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "longtext", label: "Long text" },
  { value: "markdown", label: "Writing (formatted)" },
  { value: "number", label: "Number" },
  { value: "image", label: "Picture" },
  { value: "link", label: "Link" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes / no" }
];

const SOURCE_INPUTS: Record<DataSource["kind"], { key: string; label: string; placeholder?: string }[]> = {
  manual: [],
  csv: [{ key: "url", label: "Or a link to a .csv", placeholder: "https://…/data.csv" }],
  sheets: [{ key: "url", label: "Sheet link", placeholder: "https://docs.google.com/spreadsheets/d/…" }],
  json: [
    { key: "url", label: "Address", placeholder: "https://…/items.json" },
    { key: "path", label: "Path to the list (optional)", placeholder: "data.items" }
  ],
  github: [
    { key: "repo", label: "Repository", placeholder: "owner/repo" },
    { key: "path", label: "File or folder", placeholder: "content/posts" },
    { key: "branch", label: "Branch (optional)", placeholder: "main" }
  ],
  airtable: [
    { key: "base", label: "Base id", placeholder: "app…" },
    { key: "table", label: "Table", placeholder: "Products" },
    { key: "view", label: "View (optional)" }
  ],
  notion: [{ key: "database", label: "Database id", placeholder: "32 characters from its link" }],
  supabase: [
    { key: "url", label: "Project URL", placeholder: "https://xyz.supabase.co" },
    { key: "table", label: "Table", placeholder: "products" }
  ],
  rest: [
    { key: "url", label: "Address", placeholder: "https://api.example.com/items" },
    { key: "path", label: "Path to the list (optional)", placeholder: "results" },
    { key: "header", label: "Header for the key (optional)", placeholder: "Authorization" }
  ]
};

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

function titleKey(c: Collection): string | undefined {
  return c.fields.find((f) => /title|name|heading/.test(f.key) && f.type === "text")?.key ?? c.fields.find((f) => f.type === "text")?.key;
}

function itemLabel(c: Collection, it: CollectionItem): string {
  const key = titleKey(c);
  const v = key ? it.values[key] : "";
  return typeof v === "string" && v.trim() ? v : it.slug;
}

function initials(text: string): string {
  return text
    .split(/[\s,]+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

const TINTS = ["#7c5cff", "#2f6bff", "#d9542c", "#1f9d8b", "#c0398a", "#8a6a2f", "#3d7a3a", "#6b4f9e", "#9e4f4f", "#2f7f9e"];

export function CollectionTool({ collectionId, onClose, startPost }: { collectionId: string; onClose: () => void; startPost?: string }) {
  const { state, commit, setPage } = useEditor();
  useAssetVersion();
  const collection = state.site.collections?.find((c) => c.id === collectionId);
  const locked = useClientLock();
  const [view, setView] = useState<View>("items");
  const [layout, setLayout] = useState<"grid" | "table">("grid");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [writing, setWriting] = useState<{ itemId: string; fieldKey: string } | null>(null);
  useEffect(() => {
    if (!collection) onClose();
  }, [collection, onClose]);
  const started = useRef(false);
  useEffect(() => {
    if (!startPost || started.current || !collection || collection.kind !== "posts") return;
    started.current = true;
    const itemId = createId("itm");
    const key = collection.fields.find((f) => f.type === "markdown")?.key;
    commit((draft) => {
      const c = draft.collections?.find((x) => x.id === collection.id);
      if (!c) return;
      let slug = slugify(startPost) || "post";
      while (c.items.some((it) => it.slug === slug)) slug += "-2";
      c.items.unshift({ id: itemId, slug, values: { title: startPost, date: new Date().toISOString().slice(0, 10), cover: coverSvg("#6b655c", "#d9d4cc"), body: "" } });
    });
    if (key) setWriting({ itemId, fieldKey: key });
  }, [startPost, collection, commit]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("dialog[open]") && !editing && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, editing]);
  if (!collection) return null;
  const id = collection.id;

  function mutate(recipe: (c: Collection) => void, key?: string) {
    commit((draft) => {
      const c = draft.collections?.find((x) => x.id === id);
      if (c) recipe(c);
    }, key ? `${id}.${key}` : undefined);
  }

  const isPosts = collection.kind === "posts";
  const writeKey = collection.fields.find((f) => f.type === "markdown")?.key;
  const source = collection.source;
  const fileIsMain = source.kind === "csv" && Boolean(source.file) && source.main === "file";
  const fetched = source.kind !== "manual" && !(source.kind === "csv" && !source.url);
  const readOnly = fileIsMain;
  const imageKey = collection.fields.find((f) => f.type === "image")?.key;
  const tKey = titleKey(collection);
  const subKey = collection.fields.find((f) => f.key !== tKey && ["text", "date", "number"].includes(f.type))?.key;
  const q = query.trim().toLowerCase();
  const items = q ? collection.items.filter((it) => Object.values(it.values).some((v) => String(v).toLowerCase().includes(q))) : collection.items;
  const itemPage = state.site.pages.find((p) => p.collectionId === id);
  const writingItem = writing && collection.items.find((it) => it.id === writing.itemId);
  const editingItem = editing ? collection.items.find((it) => it.id === editing) : undefined;

  function addItem() {
    const itemId = createId("itm");
    mutate((c) => {
      let slug = isPosts ? `new-post-${c.items.length + 1}` : `item-${c.items.length + 1}`;
      while (c.items.some((it) => it.slug === slug)) slug += "-1";
      const values: Record<string, string> = isPosts ? { title: "New post", date: new Date().toISOString().slice(0, 10), cover: coverSvg("#6b655c", "#d9d4cc"), body: "" } : {};
      c.items.push({ id: itemId, slug, values });
    });
    if (isPosts && writeKey) setWriting({ itemId, fieldKey: writeKey });
    else setEditing(itemId);
  }

  function removeItem(itemId: string) {
    const it = collection!.items.find((x) => x.id === itemId);
    if (!it || !window.confirm(`Delete “${itemLabel(collection!, it)}”? You can undo this.`)) return;
    mutate((c) => void (c.items = c.items.filter((x) => x.id !== itemId)));
    if (editing === itemId) setEditing(null);
  }

  const setValue = (itemId: string, key: string, value: string | number | boolean) =>
    mutate((c) => {
      const it = c.items.find((x) => x.id === itemId);
      if (it) it.values[key] = value;
    }, `item.${itemId}.${key}`);

  const nav: { id: View; label: string; count?: number; show: boolean }[] = [
    { id: "items", label: isPosts ? "Posts" : "Items", count: collection.items.length, show: true },
    { id: "blog", label: "Blog settings", show: isPosts && !collection.podcast && !locked },
    { id: "fields", label: "Fields", count: collection.fields.length, show: !locked },
    { id: "source", label: "Where it comes from", show: !locked },
    { id: "pages", label: "Pages that use it", show: !locked },
    { id: "podcast", label: "Podcast feed", show: Boolean(collection.podcast) && !locked }
  ];

  return (
    <div className="room" role="dialog" aria-label={`${collection.name} collection`}>
      <header className="room-head">
        <button className="btn btn--ghost room-back" onClick={onClose}>
          <Icon name="back" size={16} />
          Back to the site
        </button>
        <span className="room-crumbs">
          <span>Data</span>
          <span aria-hidden>/</span>
          {locked ? <strong>{collection.name}</strong> : <input className="room-title" aria-label="Collection name" value={collection.name} onChange={(e) => mutate((c) => void (c.name = e.target.value), "name")} />}
        </span>
      </header>
      <div className="room-body">
        <nav className="room-nav">
          {nav
            .filter((n) => n.show)
            .map((n) => (
              <button key={n.id} className={cls(view === n.id && "is-active")} onClick={() => setView(n.id)}>
                {n.label}
                {n.count !== undefined && <span>{n.count}</span>}
              </button>
            ))}
          <span className="room-nav-spacer" />
          <SourceSummary collection={collection} />
          {!locked && (
            <button
              className="room-danger"
              onClick={() => {
                if (!window.confirm(`Delete the “${collection.name}” collection? You can undo this.`)) return;
                commit((draft) => {
                  draft.collections = draft.collections?.filter((c) => c.id !== id);
                  for (const p of draft.pages) if (p.collectionId === id) delete p.collectionId;
                });
                if (desktop) void desktop.setToken(`data:${id}`, null);
                onClose();
              }}
            >
              Delete collection
            </button>
          )}
        </nav>
        <main className="room-main">
          {view === "items" && (
            <>
              <div className="room-toolbar">
                <h1>
                  {collection.name} <small>{collection.items.length} {isPosts ? "posts" : "items"}</small>
                </h1>
                <label className="room-search">
                  <Icon name="search" size={16} />
                  <input type="search" aria-label="Search items" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
                </label>
                <div className="segmented room-layout" role="tablist" aria-label="View">
                  <button role="tab" aria-selected={layout === "grid"} className={cls(layout === "grid" && "is-active")} onClick={() => setLayout("grid")}>
                    <Icon name="grid" size={15} /> Grid
                  </button>
                  <button role="tab" aria-selected={layout === "table"} className={cls(layout === "table" && "is-active")} onClick={() => setLayout("table")}>
                    <Icon name="table" size={15} /> Table
                  </button>
                </div>
                {isPosts && !locked && <ImportPosts mutate={mutate} />}
                {!readOnly && (
                  <button className="btn btn--primary" onClick={addItem}>
                    <Icon name="plus" size={16} />
                    {isPosts ? "New post" : "Add item"}
                  </button>
                )}
              </div>
              {readOnly && (
                <p className="room-notice">
                  {fileName((source as CsvSource).file!)} is the main copy, so items are changed there.{" "}
                  <button className="link-button" onClick={() => setView("source")}>
                    Change this
                  </button>
                </p>
              )}
              {fetched && collection.items.length > 0 && <p className="room-notice">These items come from {SOURCE_KINDS.find((k) => k.kind === source.kind)?.label}. Changes made here are replaced the next time they're fetched.</p>}
              {items.length === 0 ? (
                <div className="room-empty">
                  <p>{q ? `Nothing matches “${query.trim()}”.` : isPosts ? "No posts yet." : "No items yet."}</p>
                  {!q && !readOnly && (
                    <div className="field-row">
                      <button className="btn btn--primary" onClick={addItem}>
                        {isPosts ? "Write the first post" : "Add the first item"}
                      </button>
                      {!locked && !isPosts && (
                        <button className="btn" onClick={() => setView("source")}>
                          Bring them in from a spreadsheet…
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : layout === "grid" ? (
                <div className="item-grid">
                  {items.map((it, i) => {
                    const label = itemLabel(collection, it);
                    const pic = imageKey ? String(it.values[imageKey] ?? "") : "";
                    return (
                      <article key={it.id} className="item-card">
                        <button className="item-card-pic" style={{ background: TINTS[i % TINTS.length] }} onClick={() => (isPosts && writeKey ? setWriting({ itemId: it.id, fieldKey: writeKey }) : setEditing(it.id))} aria-label={`Open ${label}`}>
                          {pic ? <img src={assetUrl(pic)} alt="" loading="lazy" /> : <span>{initials(label)}</span>}
                        </button>
                        <div className="item-card-text">
                          <strong>{label}</strong>
                          {subKey && <small>{String(it.values[subKey] ?? "")}</small>}
                        </div>
                        <div className="item-card-actions">
                          {isPosts && writeKey && (
                            <button className="icon-button" aria-label="Write" title="Write" onClick={() => setWriting({ itemId: it.id, fieldKey: writeKey })}>
                              <Icon name="blog" size={16} />
                            </button>
                          )}
                          <button className="icon-button" aria-label={isPosts ? "Details" : "Edit"} title={isPosts ? "Details" : "Edit"} onClick={() => setEditing(it.id)}>
                            <Icon name={isPosts ? "fields" : "edit"} size={16} />
                          </button>
                          {!readOnly && (
                            <button className="icon-button" aria-label="Delete" title="Delete" onClick={() => removeItem(it.id)}>
                              <Icon name="trash" size={16} />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="item-table-wrap">
                  <table className="item-table">
                    <thead>
                      <tr>
                        {collection.fields.map((f) => (
                          <th key={f.key}>{f.label}</th>
                        ))}
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id}>
                          {collection.fields.map((f) => {
                            const v = it.values[f.key];
                            return (
                              <td key={f.key} className={`cell--${f.type}`}>
                                {f.type === "image" ? (
                                  <button className="cell-pic" onClick={() => setEditing(it.id)} aria-label={`Change ${f.label}`}>
                                    {v ? <img src={assetUrl(String(v))} alt="" loading="lazy" /> : <Icon name="picture" size={16} />}
                                  </button>
                                ) : f.type === "markdown" ? (
                                  <button className="btn btn--small" onClick={() => setWriting({ itemId: it.id, fieldKey: f.key })}>
                                    Write
                                  </button>
                                ) : f.type === "boolean" ? (
                                  <input type="checkbox" disabled={readOnly} checked={v === true} onChange={(e) => setValue(it.id, f.key, e.target.checked)} aria-label={f.label} />
                                ) : (
                                  <input
                                    type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                                    readOnly={readOnly}
                                    aria-label={f.label}
                                    value={String(v ?? "")}
                                    onChange={(e) => setValue(it.id, f.key, f.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
                                  />
                                )}
                              </td>
                            );
                          })}
                          <td className="cell-actions">
                            <button className="icon-button" aria-label="Edit" onClick={() => setEditing(it.id)}>
                              <Icon name="edit" size={15} />
                            </button>
                            {!readOnly && (
                              <button className="icon-button" aria-label="Delete" onClick={() => removeItem(it.id)}>
                                <Icon name="trash" size={15} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {view === "fields" && <FieldsView collection={collection} mutate={mutate} />}
          {view === "blog" && <BlogSettings collection={collection} mutate={mutate} />}
          {view === "source" && <SourceView collection={collection} mutate={mutate} />}
          {view === "pages" && (
            <PagesView
              collection={collection}
              openPage={(pageId) => {
                setPage(pageId);
                onClose();
              }}
              makeItemPage={() => {
                let slug = slugify(collection.name) || "items";
                while (state.site.pages.some((p) => p.slug === slug)) slug += "-1";
                const page = itemPageFor(collection, slug);
                commit((draft) => void draft.pages.push(page));
                setPage(page.id);
                onClose();
              }}
              itemPageId={itemPage?.id}
            />
          )}
          {view === "podcast" && collection.podcast && (
            <section className="room-section">
              <h1>Podcast feed</h1>
              <FieldList fields={PODCAST_FIELDS} values={collection.podcast as unknown as Record<string, string | boolean>} onChange={(key, value) => mutate((c) => void (c.podcast = { ...c.podcast!, [key]: value }), `podcast.${key}`)} />
              <button className="link-button" onClick={() => openGuide("podcast")}>
                Get listed on Apple Podcasts and Spotify →
              </button>
            </section>
          )}
        </main>
        {editingItem && (
          <ItemDrawer
            collection={collection}
            item={editingItem}
            readOnly={readOnly}
            onClose={() => setEditing(null)}
            onWrite={(fieldKey) => setWriting({ itemId: editingItem.id, fieldKey })}
            setValue={(key, value) => setValue(editingItem.id, key, value)}
            setSlug={(slug) => mutate((c) => void (c.items.find((x) => x.id === editingItem.id)!.slug = slug), `item.${editingItem.id}.slug`)}
          />
        )}
      </div>
      {writing && writingItem && (
        <PostEditor
          collection={collection}
          item={writingItem}
          fieldKey={writing.fieldKey}
          siteUrl={state.site.settings.baseUrl}
          itemUrl={state.site.settings.baseUrl && itemPage ? `${state.site.settings.baseUrl.replace(/\/+$/, "")}/${itemPage.slug}/${writingItem.slug}/` : ""}
          onSave={(values) =>
            mutate((c) => {
              const it = c.items.find((x) => x.id === writing.itemId);
              if (!it) return;
              Object.assign(it.values, values);
              if (/^new-post-\d+/.test(it.slug) && values.title) {
                let slug = slugify(values.title) || it.slug;
                while (c.items.some((x) => x !== it && x.slug === slug)) slug += "-2";
                it.slug = slug;
              }
            })
          }
          onClose={() => setWriting(null)}
        />
      )}
    </div>
  );
}

const COMMENT_CHOICES = [
  { value: "", label: "No replies" },
  { value: "bluesky", label: "Replies from Bluesky" },
  { value: "mastodon", label: "Replies from Mastodon" },
  { value: "giscus", label: "Comments with Giscus (GitHub)" },
  { value: "cusdis", label: "Comments with Cusdis" }
];

function BlogSettings({ collection, mutate }: { collection: Collection; mutate: (recipe: (c: Collection) => void, key?: string) => void }) {
  const { state, commit } = useEditor();
  const postPage = state.site.pages.find((p) => p.collectionId === collection.id);
  const commentsBlock = postPage?.sections.flatMap((s) => s.blocks).find((b) => b.type === "comments");
  const provider = commentsBlock ? String(commentsBlock.props.provider ?? "") : "";
  const address = state.site.settings.baseUrl.trim();

  function setComments(next: string) {
    if (!postPage) return;
    commit((draft) => {
      const page = draft.pages.find((p) => p.id === postPage.id);
      if (!page) return;
      const found = page.sections.flatMap((s) => s.blocks).find((b) => b.type === "comments");
      if (!next) {
        for (const s of page.sections) s.blocks = s.blocks.filter((b) => b.type !== "comments");
        return;
      }
      if (found) {
        found.props.provider = next;
        return;
      }
      const target = page.sections[page.sections.length - 1];
      if (!target) return;
      const y = target.blocks.reduce((m, b) => Math.max(m, b.y + b.h), 0);
      target.blocks.push({ id: createId("blk"), type: "comments", x: 2, y: y + 1, w: 8, h: 10, layerId: target.layers[0]?.id, props: { provider: next, post: "{{item.bluesky}}", heading: "Replies", theme: "preferred_color_scheme", cusdisHost: "https://cusdis.com" } });
    });
  }

  return (
    <section className="room-section">
      <h1>Blog settings</h1>
      <div className="room-card">
        <label className="catalogue-check">
          <input type="checkbox" checked={Boolean(collection.feed)} onChange={(e) => mutate((c) => void (c.feed = e.target.checked))} /> Publish a feed of the posts (RSS)
          <Hint>Feed readers, newsletter services and apps like Zapier read it to see new posts.</Hint>
        </label>
        {collection.feed && !address && <p className="field-hint">The feed needs the site's public address: click empty canvas → Site settings → Public address.</p>}
        {collection.feed && address && postPage && <p className="field-hint">It will be at {address.replace(/\/+$/, "")}/{postPage.slug}/feed.xml</p>}
      </div>
      <div className="room-card">
        <span className="field-label">Replies under each post</span>
        <select value={provider} onChange={(e) => setComments(e.target.value)} disabled={!postPage}>
          {COMMENT_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {provider && (
          <button className="link-button" onClick={() => openGuide(provider === "giscus" ? "comments-giscus" : provider === "cusdis" ? "comments-giscus" : "comments-social")}>
            How to set it up →
          </button>
        )}
      </div>
      <div className="room-card">
        <strong>Send posts by email</strong>
        <p className="field-hint">A newsletter service can email each new post to your subscribers.</p>
        <button className="link-button" onClick={() => openGuide("rss-email")}>
          Guide: email your posts →
        </button>
      </div>
    </section>
  );
}

function SourceSummary({ collection }: { collection: Collection }) {
  const s = collection.source;
  const text = s.kind === "csv" && s.file ? `From ${fileName(s.file)}` : s.kind === "manual" ? "Typed in here" : `From ${SOURCE_KINDS.find((k) => k.kind === s.kind)?.label}`;
  return <span className="room-source">{text}</span>;
}

function ItemDrawer({ collection, item, readOnly, onClose, onWrite, setValue, setSlug }: { collection: Collection; item: CollectionItem; readOnly: boolean; onClose: () => void; onWrite: (fieldKey: string) => void; setValue: (key: string, value: string | number | boolean) => void; setSlug: (slug: string) => void }) {
  return (
    <aside className="room-drawer" aria-label="Item">
      <header>
        <h2>{itemLabel(collection, item)}</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <fieldset disabled={readOnly} className="room-drawer-fields">
        {collection.fields.map((f) => {
          const v = item.values[f.key];
          return (
            <div key={f.key} className="field">
              <span className="field-label">{f.label}</span>
              {f.type === "image" ? (
                <FieldControl field={{ key: f.key, label: f.label, kind: "image" }} value={String(v ?? "")} onChange={(next) => setValue(f.key, String(next ?? ""))} />
              ) : f.type === "markdown" ? (
                <div className="data-writing">
                  <button className="btn btn--small btn--primary" onClick={() => onWrite(f.key)}>
                    ✎ Write
                  </button>
                  <span className="field-hint">{String(v ?? "").slice(0, 90) || "Nothing written yet."}</span>
                </div>
              ) : f.type === "boolean" ? (
                <input type="checkbox" checked={v === true} onChange={(e) => setValue(f.key, e.target.checked)} />
              ) : f.type === "longtext" ? (
                <textarea rows={4} value={String(v ?? "")} onChange={(e) => setValue(f.key, e.target.value)} />
              ) : (
                <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={String(v ?? "")} onChange={(e) => setValue(f.key, f.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)} />
              )}
            </div>
          );
        })}
        <div className="field">
          <span className="field-label">
            Its address <Hint>The last part of this item's page address, when the collection has item pages.</Hint>
          </span>
          <input type="text" value={item.slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))} />
        </div>
      </fieldset>
    </aside>
  );
}

function FieldsView({ collection, mutate }: { collection: Collection; mutate: (recipe: (c: Collection) => void, key?: string) => void }) {
  return (
    <section className="room-section">
      <h1>Fields</h1>
      <p className="room-lead">The kinds of information each item has. Pictures, words, dates, prices…</p>
      <div className="field-rows">
        {collection.fields.map((field, index) => (
          <div className="field-rowline" key={field.key}>
            <input type="text" value={field.label} aria-label="Field name" onChange={(e) => mutate((c) => void (c.fields[index].label = e.target.value), `field.${field.key}`)} />
            <select value={field.type} aria-label="Field type" onChange={(e) => mutate((c) => void (c.fields[index].type = e.target.value as CollectionFieldType))}>
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <code className="data-token" title="For typing into text on cards and item pages">{`{{item.${field.key}}}`}</code>
            <button
              className="icon-button"
              aria-label={`Remove ${field.label}`}
              onClick={() => {
                if (!window.confirm(`Remove the “${field.label}” field from every item?`)) return;
                mutate((c) => {
                  c.fields.splice(index, 1);
                  for (const it of c.items) delete it.values[field.key];
                });
              }}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="btn"
        onClick={() =>
          void askText("Name the new field", "Price").then((name) => {
            if (!name?.trim()) return;
            let key = slugify(name).replace(/-/g, "_") || "field";
            while (collection.fields.some((f) => f.key === key)) key += "_2";
            mutate((c) => void c.fields.push({ key, label: name.trim(), type: "text" }));
          })
        }
      >
        <Icon name="plus" size={16} /> Add a field
      </button>
    </section>
  );
}

function SourceView({ collection, mutate }: { collection: Collection; mutate: (recipe: (c: Collection) => void, key?: string) => void }) {
  const id = collection.id;
  const source = collection.source;
  const kind = SOURCE_KINDS.find((k) => k.kind === source.kind)!;
  const secretName = `data:${id}` as const;
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [clash, setClash] = useState(false);
  const refreshKey = () => void desktop?.hasToken(secretName).then(setHasKey);
  useEffect(refreshKey, [secretName]);
  const csv = source.kind === "csv" ? source : null;
  const hash = useMemo(() => contentHash(collection), [collection]);
  const unsaved = Boolean(csv?.file && csv.main !== "file" && csv.savedHash !== hash);
  useEffect(() => {
    if (!desktop || !csv?.file || csv.modified === undefined) return;
    void desktop.dataFileModified(csv.file).then((m) => setClash(m !== null && Math.abs(m - (csv.modified ?? 0)) > 1));
  }, [csv?.file, csv?.modified]);

  const run = async (label: string, task: () => Promise<string>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await task());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
    return label;
  };

  function takeRows(text: string, extra: Partial<CsvSource>) {
    const rows = parseCsv(text);
    if (!rows.length) throw new Error("That file has no rows.");
    const fresh = rowsToCollection(rows, collection);
    mutate((c) => {
      Object.assign(c, fresh);
      c.synced = new Date().toISOString();
      c.source = { ...(c.source.kind === "csv" ? c.source : {}), kind: "csv", headers: csvHeaders(text), ...extra };
      c.source.savedHash = contentHash(c);
    });
    return fresh.items.length;
  }

  const useFile = () =>
    run("open", async () => {
      const picked = await desktop!.openDataFile();
      if (!picked) return "";
      const n = takeRows(picked.text, { file: picked.path, modified: picked.modified, main: "app", url: undefined });
      return `✓ ${n} items from ${fileName(picked.path)}.`;
    });

  const reloadFile = () =>
    run("reload", async () => {
      const read = await desktop!.readDataFile(csv!.file!);
      const n = takeRows(read.text, { modified: read.modified });
      setClash(false);
      return `✓ ${n} items from ${fileName(read.path)}.`;
    });

  const saveBack = () =>
    run("save", async () => {
      if (!window.confirm(`Save your changes into ${csv!.file}? This replaces what's in that file.`)) return "";
      const modified = await desktop!.writeDataFile(csv!.file!, collectionToCsv(collection, csv!.headers));
      mutate((c) => {
        if (c.source.kind === "csv") Object.assign(c.source, { modified, savedHash: contentHash(c) });
      });
      setClash(false);
      return `✓ Saved to ${fileName(csv!.file!)}.`;
    });

  const saveCopy = () =>
    run("copy", async () => {
      const text = collectionToCsv(collection, csv?.headers);
      const name = `${slugify(collection.name) || "collection"}.csv`;
      if (desktop) {
        const saved = await desktop.saveDataFileAs(name, text);
        return saved ? `✓ Saved a copy as ${fileName(saved.path)}.` : "";
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" }));
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return `✓ Downloaded ${name}.`;
    });

  const sourceValues = source as unknown as Record<string, string | undefined>;
  return (
    <section className="room-section">
      <h1>Where it comes from</h1>
      {clash && csv?.file && (
        <div className="room-clash">
          <Icon name="info" size={20} />
          <span>
            <strong>{fileName(csv.file)} changed on your computer</strong> since it was loaded here. Which version should win?
          </span>
          <button className="btn btn--small" disabled={busy} onClick={() => void saveBack()}>
            Keep mine
          </button>
          <button className="btn btn--small" disabled={busy} onClick={() => void reloadFile()}>
            Use the file's
          </button>
        </div>
      )}
      {csv?.file ? (
        <div className="room-card">
          <div className="room-file">
            <Icon name="file" size={22} />
            <span>
              <strong>{fileName(csv.file)}</strong>
              <small>{csv.file}</small>
            </span>
          </div>
          <span className="field-label">Which copy is the main one?</span>
          <div className="choices choices--2">
            <button className={cls("choice", csv.main !== "file" && "is-active")} onClick={() => mutate((c) => void (c.source.kind === "csv" && (c.source.main = "app")))}>
              <span className="choice-text">
                <strong>Edit here, save back to the file</strong>
                <small>Add and change items in FayteWorks. The file is updated when you save.</small>
              </span>
            </button>
            <button className={cls("choice", csv.main === "file" && "is-active")} onClick={() => mutate((c) => void (c.source.kind === "csv" && (c.source.main = "file")))}>
              <span className="choice-text">
                <strong>The file is the main copy</strong>
                <small>Edit it in Excel or elsewhere, then bring the changes in here.</small>
              </span>
            </button>
          </div>
          {csv.main !== "file" ? (
            <div className="room-actions">
              <span>{unsaved ? <strong>Changes not saved to the file yet</strong> : "Everything is saved to the file."}</span>
              <button className="btn" disabled={busy} onClick={() => void saveCopy()}>
                Save as a new copy…
              </button>
              <button className="btn btn--primary" disabled={busy || !unsaved} onClick={() => void saveBack()}>
                Save back to {fileName(csv.file)}
              </button>
            </div>
          ) : (
            <div className="room-actions">
              <span>Changed the file? Bring the changes in.</span>
              <button className="btn btn--primary" disabled={busy} onClick={() => void reloadFile()}>
                Refresh from the file
              </button>
            </div>
          )}
          <button className="link-button" onClick={() => mutate((c) => void (c.source = { kind: "manual" }))}>
            Stop using this file (keep the items here)
          </button>
        </div>
      ) : (
        <>
          <div className="field">
            <span className="field-label">The items come from</span>
            <select value={source.kind} onChange={(e) => mutate((c) => void (c.source = { kind: e.target.value } as DataSource))}>
              {SOURCE_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                  {k.desktopOnly && !desktop ? " (desktop app)" : ""}
                </option>
              ))}
            </select>
            <span className="field-hint">{kind.help}</span>
          </div>
          {source.kind === "csv" && (
            <div className="room-card">
              <strong>A spreadsheet file</strong>
              {desktop ? (
                <>
                  <p className="field-hint">Pick a .csv on this computer (Excel and Google Sheets can save one). You can keep editing here and save back to it.</p>
                  <button className="btn btn--primary" disabled={busy} onClick={() => void useFile()}>
                    Choose a .csv file…
                  </button>
                </>
              ) : (
                <label className="btn">
                  Upload a .csv…
                  <input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && void e.target.files[0].text().then((t) => run("upload", async () => `✓ ${takeRows(t, {})} items.`))} />
                </label>
              )}
            </div>
          )}
          {SOURCE_INPUTS[source.kind].map((input) => (
            <div className="field" key={input.key}>
              <span className="field-label">{input.label}</span>
              <input type="text" placeholder={input.placeholder} value={sourceValues[input.key] ?? ""} onChange={(e) => mutate((c) => void ((c.source as unknown as Record<string, string>)[input.key] = e.target.value.trim()), `source.${input.key}`)} />
            </div>
          ))}
          {kind.secret &&
            (desktop ? (
              <div className="field">
                <span className="field-label">{kind.secret}</span>
                <TokenField service={secretName} connected={hasKey} onChange={refreshKey} label="Paste the key" />
                <span className="field-hint">Kept encrypted on this computer, never in the project or the published site.</span>
              </div>
            ) : kind.desktopOnly ? (
              <p className="field-hint">This one needs the desktop app, where its key can be kept safe.</p>
            ) : null)}
          {source.kind !== "manual" && (source.kind !== "csv" || sourceValues.url) && (
            <button
              className="btn btn--primary"
              disabled={busy || (kind.desktopOnly && !desktop)}
              onClick={() =>
                void run("fetch", async () => {
                  const fresh = await fetchCollection(collection);
                  mutate((c) => Object.assign(c, fresh));
                  return `✓ ${fresh.items.length} items, ${fresh.fields.length} fields.`;
                })
              }
            >
              {busy ? "Fetching…" : collection.synced ? "Refresh the items" : "Fetch the items"}
            </button>
          )}
          {source.kind !== "manual" && desktop && source.kind !== "csv" && (
            <label className="catalogue-check">
              <input type="checkbox" checked={Boolean(collection.refreshOnPublish)} onChange={(e) => mutate((c) => void (c.refreshOnPublish = e.target.checked))} /> Fetch fresh items before each publish
            </label>
          )}
          {collection.synced && source.kind !== "manual" && <p className="field-hint">Last fetched {new Date(collection.synced).toLocaleString()}.</p>}
          <div className="room-actions">
            <span>Keep a copy of the items as a spreadsheet.</span>
            <button className="btn" disabled={busy} onClick={() => void saveCopy()}>
              {desktop ? "Save as a .csv…" : "Download as .csv"}
            </button>
          </div>
        </>
      )}
      {message && <p className="field-hint data-ok">{message}</p>}
      {error && <p className="dialog-status dialog-status--error">{error}</p>}
    </section>
  );
}

function PagesView({ collection, openPage, makeItemPage, itemPageId }: { collection: Collection; openPage: (id: string) => void; makeItemPage: () => void; itemPageId?: string }) {
  const { state } = useEditor();
  const lists = state.site.pages.filter((p) => p.sections.some((s) => s.blocks.some((b) => b.type === "collection" && b.props.collectionId === collection.id)));
  const itemPage = state.site.pages.find((p) => p.id === itemPageId);
  return (
    <section className="room-section">
      <h1>Pages that use it</h1>
      <div className="room-card">
        <strong>Lists</strong>
        {lists.length ? (
          lists.map((p) => (
            <button key={p.id} className="choice-row" onClick={() => openPage(p.id)}>
              <strong>{p.title}</strong>
              <small>Shows the items with a Collection list</small>
            </button>
          ))
        ) : (
          <p className="field-hint">No page shows these items yet. Add a Collection list block to a page (Add → Content).</p>
        )}
      </div>
      <div className="room-card">
        <strong>A page for each item</strong>
        {itemPage ? (
          <button className="choice-row" onClick={() => openPage(itemPage.id)}>
            <strong>{itemPage.title}</strong>
            <small>
              /{itemPage.slug}/&lt;item&gt;/ · one design, published once per item
            </small>
          </button>
        ) : (
          <>
            <p className="field-hint">One page design, published once for every item, like a product or post page.</p>
            <button className="btn" onClick={makeItemPage}>
              Make an item page
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function ImportPosts({ mutate }: { mutate: (recipe: (c: Collection) => void) => void }) {
  const [error, setError] = useState("");
  async function importPosts(files: File[]) {
    setError("");
    try {
      let posts: ImportedPost[] = [];
      const md = files.filter((f) => /\.(md|markdown)$/i.test(f.name));
      for (const f of files) {
        if (/\.xml$/i.test(f.name)) posts.push(...wordpressPosts(await f.text()));
        else if (/\.json$/i.test(f.name)) posts.push(...ghostPosts(await f.text()));
      }
      if (md.length) posts = posts.concat(markdownPosts(await Promise.all(md.map(async (f) => ({ name: f.name, text: await f.text() })))));
      if (!posts.length) throw new Error("No published posts found in that file.");
      mutate((c) => {
        for (const p of posts) {
          let slug = slugify(p.title) || "post";
          while (c.items.some((it) => it.slug === slug)) slug += "-2";
          c.items.push({ id: createId("itm"), slug, values: { title: p.title, date: p.date, excerpt: p.excerpt, cover: p.cover || coverSvg("#6b655c", "#d9d4cc"), tags: p.tags, body: p.body } });
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <label className="btn" title={error || "From WordPress (Tools → Export, .xml), Ghost (.json) or Markdown files"}>
      Import posts…
      <input type="file" accept=".xml,.json,.md,.markdown" multiple hidden onChange={(e) => (e.target.files?.length && void importPosts([...e.target.files]), (e.target.value = ""))} />
    </label>
  );
}
