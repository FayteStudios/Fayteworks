import { findSection } from "../model/ops";
import { openAltText } from "../quality/AltTextDialog";
import { openPrepublish } from "../quality/PrepublishDialog";
import { editorTier, useEditor } from "../state/store";
import { useIssues } from "./issues";
import { applyFix, describeBlock, fixesFor, FIX_LABELS, type LayoutIssue } from "./layoutCheck";

export function CheckPanel() {
  const { state, page, commit, select, setFreeform } = useEditor();
  const { issues, dismiss } = useIssues();
  const pageId = page.id;

  function blockOf(sectionId: string, blockId: string) {
    return findSection(state.site, pageId, sectionId)?.blocks.find((b) => b.id === blockId);
  }

  function reveal(issue: LayoutIssue) {
    select({ kind: "block", sectionId: issue.sectionId, blockId: issue.blockId });
    document.querySelector(`[data-block-id="${issue.blockId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function describe(issue: LayoutIssue): string {
    const block = blockOf(issue.sectionId, issue.blockId);
    if (issue.kind === "overflow") {
      return `${describeBlock(block)} needs ${issue.neededRows} rows but its box is ${block?.h ?? "?"}.`;
    }
    return `${describeBlock(block)} overlaps ${describeBlock(blockOf(issue.sectionId, issue.otherId))}.`;
  }

  const tier = editorTier(state);

  return (
    <div className="check-panel">
      <button className="btn btn--block check-prepublish" onClick={openPrepublish}>
        ✓ Check before publishing (links, pictures, search engines…)
      </button>
      <button className="btn btn--block check-prepublish" onClick={() => openAltText()}>
        Picture descriptions (alt text)
      </button>
      <div className="field field--toggle check-freeform">
        <span className="field-label">Freeform editing</span>
        <input type="checkbox" checked={state.freeform} onChange={(e) => setFreeform(e.target.checked)} />
        <span className="field-hint">
          Rows stay a fixed size while you arrange, so blocks land exactly where you drop them and text may spill out.
          Tidy up here when you're ready. Published sites always grow rows to fit, so nothing is ever cut off.
        </span>
      </div>

      {issues.length === 0 ? (
        <p className="check-ok">✓ No layout problems at this screen size.</p>
      ) : (
        <>
          <div className="check-summary">
            <span>
              {issues.length} thing{issues.length === 1 ? "" : "s"} to look at
            </span>
            <button
              className="btn btn--small btn--primary"
              title="Applies the first suggestion to each item"
              onClick={() =>
                commit((draft) => {
                  for (const issue of issues) applyFix(draft, pageId, issue, fixesFor(issue)[0], tier);
                })
              }
            >
              Fix all
            </button>
          </div>
          <ul className="check-list">
            {issues.map((issue) => (
              <li key={issue.key} className="check-item">
                <button className="check-text" onClick={() => reveal(issue)} title="Select on canvas">
                  <span className={`check-icon check-icon--${issue.kind}`}>{issue.kind === "overflow" ? "↕" : "⧉"}</span>
                  {describe(issue)}
                </button>
                <div className="field-row">
                  {fixesFor(issue).map((fix, i) => (
                    <button
                      key={fix}
                      className={`btn btn--small${i === 0 ? " btn--accent" : ""}`}
                      onClick={() => commit((draft) => applyFix(draft, pageId, issue, fix, tier))}
                    >
                      {FIX_LABELS[fix]}
                    </button>
                  ))}
                  <button className="btn btn--small btn--ghost" onClick={() => dismiss(issue.key)} title="Keep it as it is">
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="panel-hint">Results are for the current screen size. Sections that stack automatically on phones are skipped.</p>
        </>
      )}
    </div>
  );
}
