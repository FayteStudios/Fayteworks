import { useClientLock } from "../client/clientMode";
import { askText } from "../editor/askText";
import { OPEN_COLLECTION, openNew } from "../editor/NewMenu";
import { Icon } from "../editor/icons";
import { openGuide } from "../guides/GuideHost";
import { useEditor } from "../state/store";
import { newCollection } from "./model";
import { SOURCE_KINDS } from "./sources";

export const openCollection = (id: string) => window.dispatchEvent(new CustomEvent(OPEN_COLLECTION, { detail: id }));

export function DataPanel() {
  const { state, commit } = useEditor();
  const clientLocked = useClientLock();
  const collections = state.site.collections ?? [];

  async function add() {
    const name = await askText("Name the collection (e.g. Products, Team, Events)", "Products");
    if (!name?.trim()) return;
    const collection = newCollection(name.trim());
    commit((draft) => void (draft.collections ??= []).push(collection));
    openCollection(collection.id);
  }

  return (
    <div className="data-panel">
      {collections.length > 0 ? (
        <ul className="data-list">
          {collections.map((c) => {
            const from = c.source.kind === "csv" && c.source.file ? c.source.file.split(/[\\/]/).pop() : SOURCE_KINDS.find((k) => k.kind === c.source.kind)?.label;
            return (
              <li key={c.id}>
                <button className="data-list-item" onClick={() => openCollection(c.id)}>
                  <Icon name={c.kind === "posts" ? "blog" : "data"} size={18} />
                  <span>
                    <strong>{c.name}</strong>
                    <small>
                      {c.items.length} {c.kind === "posts" ? "post" : "item"}
                      {c.items.length === 1 ? "" : "s"} · {from}
                    </small>
                  </span>
                  <Icon name="chevronRight" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="panel-hint">A collection is a list of things: products, team members, events, characters, posts. Type them in or bring them from a spreadsheet, then show them on any page.</p>
      )}
      {!clientLocked && (
        <div className="field-row data-new">
          <button className="btn" onClick={() => void add()}>
            + New collection
          </button>
          <button className="btn" onClick={() => openNew("blog")}>
            + New blog
          </button>
        </div>
      )}
      <button className="link-button data-guides" onClick={() => openGuide()}>
        Guides: blogs, newsletters, comments, forms…
      </button>
    </div>
  );
}
