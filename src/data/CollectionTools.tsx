import type { Block, Page } from "../model/types";
import { useEditor } from "../state/store";
import { cardDesignFor } from "./cardDesign";

export function CollectionTools({ block, mutate }: { block: Block; mutate: (recipe: (b: Block) => void) => void }) {
  const { state, commit } = useEditor();
  const collection = state.site.collections?.find((c) => c.id === block.props.collectionId);
  const componentId = String(block.props.componentId ?? "");
  const card = componentId ? state.site.components?.find((c) => c.id === componentId) : undefined;
  if (!collection) {
    return (
      <section className="inspector-group">
        <p className="field-hint">Make a collection in the Data panel, then choose it above.</p>
      </section>
    );
  }
  return (
    <section className="inspector-group">
      <button
        className="btn btn--block"
        onClick={() => {
          const def = cardDesignFor(collection);
          commit((draft) => {
            (draft.components ??= []).push(def);
          });
          mutate((b) => void (b.props.componentId = def.id));
        }}
      >
        {card ? "Make a new card design" : "Make a card design"}
      </button>
    </section>
  );
}

export function ItemPageSetting({ page, mutatePage }: { page: Page; mutatePage: (recipe: (p: Page) => void, key: string) => void }) {
  const { state } = useEditor();
  const collections = state.site.collections ?? [];
  if (!collections.length && !page.collectionId) return null;
  const collection = collections.find((c) => c.id === page.collectionId);
  const takenBy = (id: string) => state.site.pages.find((p) => p.collectionId === id && p.id !== page.id);
  return (
    <section className="inspector-group">
      <h3 className="panel-heading">Item page</h3>
      <div className="field">
        <span className="field-label">One page per item of</span>
        <select
          value={page.collectionId ?? ""}
          onChange={(e) =>
            mutatePage((p) => {
              if (e.target.value) p.collectionId = e.target.value;
              else delete p.collectionId;
            }, "collectionId")
          }
        >
          <option value="">— (an ordinary page)</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id} disabled={Boolean(takenBy(c.id))}>
              {c.name}
              {takenBy(c.id) ? ` (already “${takenBy(c.id)!.title}”)` : ""}
            </option>
          ))}
        </select>
        {collection && (
          <span className="field-hint">
            Published at /{page.slug}/&lt;item&gt;/ for each of its {collection.items.length} items; showing the first one here. Use{" "}
            {collection.fields.map((f) => `{{item.${f.key}}}`).join(", ")} in text, pictures, links, the title and the description.
          </span>
        )}
      </div>
    </section>
  );
}
