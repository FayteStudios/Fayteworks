import { useEffect, useMemo, useRef, useState } from "react";
import { Hint } from "../editor/Hint";
import { Icon } from "../editor/icons";
import { OPEN_COLLECTION } from "../editor/NewMenu";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import { slugify } from "../util/slug";
import { createBlog } from "./blog";

export function BlogWizard({ onClose }: { onClose: () => void }) {
  const { state, commit, setPage } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("Blog");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [inMenu, setInMenu] = useState(true);
  const [examples, setExamples] = useState(false);
  const [comments, setComments] = useState(true);
  const [title, setTitle] = useState("");
  const slug = useMemo(() => {
    const taken = new Set(state.site.pages.map((p) => p.slug));
    let s = slugify(name) || "blog";
    while (taken.has(s)) s += "-1";
    return s;
  }, [name, state.site.pages]);

  function create() {
    const blog = createBlog(state.site, name.trim() || "Blog");
    blog.index.slug = slug;
    blog.post.slug = slug;
    blog.index.hideInNav = !inMenu;
    if (!examples) blog.collection.items = [];
    if (layout === "list") for (const s of blog.index.sections) for (const b of s.blocks) if (b.type === "collection") b.props.columns = 1;
    if (!comments) for (const s of blog.post.sections) s.blocks = s.blocks.filter((b) => b.type !== "comments");
    commit((draft) => {
      (draft.collections ??= []).push(blog.collection);
      (draft.components ??= []).push(blog.card);
      draft.pages.push(blog.index, blog.post);
    });
    setPage(blog.index.id);
    onClose();
    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(OPEN_COLLECTION, { detail: { id: blog.collection.id, newPost: title.trim() || "My first post" } })));
  }

  return (
    <dialog ref={ref} className="dialog wizard" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>New blog</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <ol className="steps">
        <li className={cls(step === 0 ? "is-current" : "is-done")}>
          <span>1</span>Set it up
        </li>
        <li className={cls(step === 1 && "is-current")}>
          <span>2</span>Write your first post
        </li>
      </ol>
      {step === 0 ? (
        <div className="wizard-fields blog-setup">
          <label className="field">
            <span className="field-label">What's it called?</span>
            <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Blog, News, Journal, Stories…" />
          </label>
          <p className="field-hint">
            The blog page will be at <strong>/{slug}</strong>, and each post at /{slug}/post-name.
          </p>
          <span className="field-label">How should the posts be listed?</span>
          <div className="choices choices--2">
            <button className={cls("choice", layout === "grid" && "is-active")} onClick={() => setLayout("grid")}>
              <span className="choice-icon">
                <Icon name="grid" size={22} />
              </span>
              <span className="choice-text">
                <strong>Cards in a grid</strong>
                <small>Three across, with pictures.</small>
              </span>
            </button>
            <button className={cls("choice", layout === "list" && "is-active")} onClick={() => setLayout("list")}>
              <span className="choice-icon">
                <Icon name="fields" size={22} />
              </span>
              <span className="choice-text">
                <strong>One after another</strong>
                <small>A simple list, newest first.</small>
              </span>
            </button>
          </div>
          <label className="catalogue-check">
            <input type="checkbox" checked={inMenu} onChange={(e) => setInMenu(e.target.checked)} /> Show it in the site's menu
          </label>
          <label className="catalogue-check">
            <input type="checkbox" checked={comments} onChange={(e) => setComments(e.target.checked)} /> Let readers reply
            <Hint>Replies come from Bluesky: post a link to your post there, and the replies show under it. You can switch to other comment services later.</Hint>
          </label>
          <label className="catalogue-check">
            <input type="checkbox" checked={examples} onChange={(e) => setExamples(e.target.checked)} /> Add two example posts to see how it looks
          </label>
        </div>
      ) : (
        <div className="wizard-fields">
          <label className="field">
            <span className="field-label">Your first post's title</span>
            <input type="text" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Hello, world" />
          </label>
          <p className="field-hint">The writing editor opens next. Write as much or as little as you like: you can come back to it any time from Data → {name.trim() || "Blog"}.</p>
        </div>
      )}
      <footer className="wizard-actions">
        {step > 0 ? (
          <button className="btn" onClick={() => setStep(0)}>
            Back
          </button>
        ) : (
          <span />
        )}
        {step === 0 ? (
          <button className="btn btn--primary" onClick={() => setStep(1)}>
            Next
          </button>
        ) : (
          <button className="btn btn--primary" onClick={create}>
            Make the blog and start writing
          </button>
        )}
      </footer>
    </dialog>
  );
}
