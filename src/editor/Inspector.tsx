import { openScene } from "../scenes/scenes";
import { getBlockDefinition } from "../blocks/registry";
import { localizedProps, useEditingLang, writeProp } from "../i18n/i18n";
import { needsDescription } from "../quality/altText";
import { openAltText } from "../quality/AltTextDialog";
import { DescribePicture } from "../quality/DescribePicture";
import { ProtectSetting } from "../client/ProtectSetting";
import { GUIDES_FOR_BLOCK, guideById } from "../guides/guides";
import { openGuide } from "../guides/GuideHost";
import { desktop } from "../platform/desktop";
import { saveMine } from "../catalogue/mine";
import { askText } from "./askText";
import { VectorTools } from "../vector/VectorTools";
import { DesignPanel } from "../design/DesignPanel";
import { MediaTools } from "../media/MediaTools";
import { SectionSvgTools } from "../vector/SectionSvgTools";
import { ShareButton } from "../share/ShareButton";
import type { FieldDef } from "../model/fields";
import { layerIdOf, reorderWithinLayer, placeInStack } from "../model/layers";
import { cloneBlock, findPage, findSection, componentSection } from "../model/ops";
import type { ComponentDef, PageSeo, Orientation } from "../model/types";
import { useEffect, useState, type ReactNode } from "react";
import { type Block, type PropValue, type Section, type SectionSettings } from "../model/types";
import { hasCustomLayout, isHiddenAt, isStacked, rectFor, setHiddenAndReflow, setRect, TIER_LABEL } from "../model/responsive";
import { editorTier, selectedBlockIds, useEditor } from "../state/store";
import { getBlockDefinition as defOf } from "../blocks/registry";
import { describeBlock } from "./layoutCheck";
import { alignBlocks, copyBlocks, insertBlocks, removeBlocks, type AlignMode } from "./selectionOps";
import { promptSaveBlocks, promptSaveComponent } from "./ComponentsGroup";
import { ChangeDesign, ComponentInspector, MakeComponentButton, useExposure } from "./ComponentMaker";
import { ItemFieldsCtx, itemFieldsOf, useCardSource } from "./cardSource";
import { componentUses, findComponent } from "../model/components";
import { settleBlocks } from "../model/collisions";
import { densityOf, gridOf, setGridDensity } from "../model/grid";
import { GridPrecisionField } from "./GridPrecisionField";
import { FieldList } from "./Fields";
import { openFramesFor, openTimelineFor } from "./focusTools";
import { SoundTools } from "../motion/SoundTools";
import { CollectionTools, ItemPageSetting } from "../data/CollectionTools";
import { isCardShell, SHELL_OPTIONS, shellFields, shellOf } from "../model/shells";
import { cardLayouts, extensions } from "../model/extras";
import type { PageShell } from "../model/types";
import { Badge, BADGES, Hint } from "./Hint";
import { Icon } from "./icons";
import { cls } from "../util/cls";

const SECTION_FIELDS: FieldDef[] = [
  { key: "background", label: "Background", kind: "color", hint: "Any CSS colour or gradient." },
  { key: "backgroundImage", label: "Background image", kind: "image" },
  {
    key: "backgroundMotion",
    label: "Background while scrolling",
    kind: "select",
    options: [
      { value: "", label: "Scrolls with the page" },
      { value: "slow", label: "Parallax (gentle)" },
      { value: "strong", label: "Parallax (strong)" },
      { value: "fixed", label: "Fixed (stays put)" }
    ],
    hint: "Parallax plays in Preview and on the site; visitors who prefer reduced motion see a still background."
  },
  { key: "paddingY", label: "Vertical padding", kind: "range", min: 0, max: 240, step: 4 },
  { key: "minRows", label: "Minimum height (rows)", kind: "number", min: 1, max: 200 },
  { key: "fullBleed", label: "Full width content", kind: "toggle" },
  { key: "sticky", label: "Stick to top when scrolling", kind: "toggle" }
];

const PAGE_FIELDS: FieldDef[] = [
  {
    key: "description",
    label: "Search description",
    kind: "textarea",
    hint: "Shown under the title in search results and link previews. Aim for one or two sentences."
  },
  { key: "image", label: "Social preview image", kind: "image", hint: "Used when the page is shared. 1200 × 630 works best: make one under Designs in the left bar → Link preview, then “Use as the share picture”." }
];

const MOTION_FIELDS: FieldDef[] = [
  {
    key: "reveal",
    label: "Appear on scroll",
    kind: "select",
    options: [
      { value: "", label: "No animation" },
      { value: "fade", label: "Fade in" },
      { value: "fade-up", label: "Fade up" },
      { value: "zoom", label: "Zoom in" },
      { value: "slide-left", label: "Slide from left" },
      { value: "slide-right", label: "Slide from right" }
    ],
    hint: "Plays in Preview and on the published site. Visitors who prefer reduced motion see no animation."
  },
  { key: "delay", label: "Delay (ms)", kind: "range", min: 0, max: 1200, step: 100, hint: "Stagger blocks for a cascading entrance." },
  {
    key: "parallax",
    label: "Parallax",
    kind: "range",
    min: -50,
    max: 50,
    step: 5,
    hint: "Drifts while the page scrolls: below 0 moves slower than the page (feels further away), above 0 faster. 0 is off."
  },
  {
    key: "hover",
    label: "On hover",
    kind: "select",
    options: [
      { value: "", label: "Nothing" },
      { value: "lift", label: "Lift" },
      { value: "grow", label: "Grow" },
      { value: "glow", label: "Glow (accent colour)" },
      { value: "tilt", label: "Tilt" }
    ]
  }
];


const layoutFields = (cols: number): FieldDef[] => [
  { key: "x", label: "Column", kind: "number", min: 1, max: cols },
  { key: "w", label: "Width", kind: "number", min: 1, max: cols },
  { key: "y", label: "Row", kind: "number", min: 1 },
  { key: "h", label: "Height", kind: "number", min: 1 }
];

const hasCompanions = extensions.some((e) => e.blocks?.some((b) => b.placement === "companion"));

function SpotField({ block, mutate }: { block: Block; mutate: (recipe: (b: Block) => void, key?: string) => void }) {
  return (
    <section className="inspector-group">
      <label className="field">
        <span className="field-label field-label--row">
          <span>Spot name</span>
          <Hint align="end">Companions like Dot can sit here. Give it a short name, like shelf or contact.</Hint>
        </span>
        <input
          type="text"
          value={block.spot ?? ""}
          placeholder="none"
          onChange={(e) =>
            mutate((b) => {
              const v = e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
              if (v) b.spot = v;
              else delete b.spot;
            }, "spot")
          }
        />
      </label>
    </section>
  );
}

function FlipbookEntry({ section, block }: { section: Section; block: Block }) {
  const frames = Array.isArray(block.props.frames) ? block.props.frames.length : 0;
  return (
    <section className="inspector-group">
      <p className="field-hint">
        {frames} frame{frames === 1 ? "" : "s"} at {Number(block.props.fps ?? 12)} a second.
      </p>
      <button className="btn btn--block btn--primary" onClick={() => openFramesFor(section.id, block.id)}>
        Edit the frames
      </button>
    </section>
  );
}

function BlockInspector({ section, blockId }: { section: Section; blockId: string }) {
  const { state, page, commit, select } = useEditor();
  const tier = editorTier(state);
  const block = section.blocks.find((b) => b.id === blockId);
  const inComponentSection = Boolean(componentSection(state.site, section.id));
  const exposureHook = useExposure(inComponentSection ? section : null, blockId);
  const editLang = useEditingLang(state.site);
  const [moreSettings, setMoreSettings] = useState(false);
  const [sheet, setSheet] = useState<null | "motion" | "sound" | "sizes" | "share">(null);
  useEffect(() => {
    setMoreSettings(false);
    setSheet(null);
  }, [blockId]);
  if (!block) {
    return null;
  }
  const def = getBlockDefinition(block.type);
  const pageId = page.id;
  const placed = block.type === "component" ? findComponent(state.site.components, block.props.componentId) : undefined;
  const inComponent = inComponentSection;
  const design = placed ?? (block.type === "collection" ? findComponent(state.site.components, block.props.componentId) : undefined);
  const exposure = exposureHook;

  function mutateBlock(recipe: (b: Block) => void, key?: string) {
    commit((draft) => {
      const b = findSection(draft, pageId, section.id)?.blocks.find((x) => x.id === blockId);
      if (b) {
        recipe(b);
      }
    }, key);
  }

  function setLayout(key: string, value: PropValue) {
    const n = Math.round(Number(value));
    commit((draft) => {
      const s = findSection(draft, pageId, section.id);
      const b = s?.blocks.find((x) => x.id === blockId);
      if (!s || !b) return;
      const r = rectFor(s, b, tier);
      const cols = gridOf(s).cols;
      if (key === "x") r.x = Math.max(0, Math.min(n - 1, cols - r.w));
      if (key === "w") r.w = Math.max(1, Math.min(n, cols - r.x));
      if (key === "y") r.y = Math.max(0, n - 1);
      if (key === "h") r.h = Math.max(1, n);
      setRect(s, b, tier, r);
      if (!state.freeform) settleBlocks(s, tier, [b.id], { settle: false });
    }, `${blockId}.layout.${tier}.${key}`);
  }

  const focusing = state.focusedBlock?.blockId === blockId;
  const allFields = def ? [...(def.extraFields?.(block.props, state.site) ?? []), ...def.fields] : [];
  const essentials = ESSENTIALS[block.type];
  const extraKeys = new Set((def?.extraFields?.(block.props, state.site) ?? []).map((x) => x.key));
  const shownFields = focusing || moreSettings || !essentials ? allFields : allFields.filter((x) => extraKeys.has(x.key) || essentials.includes(x.key));
  const hiddenCount = allFields.length - shownFields.length;
  const rect = rectFor(section, block, tier);
  const stacked = isStacked(section, tier);
  const layoutNote =
    tier === "desktop"
      ? null
      : hasCustomLayout(section, tier)
        ? `Custom ${TIER_LABEL[tier].toLowerCase()} layout: changes here only affect this size.`
        : stacked
          ? "On phones this section stacks blocks automatically. Use “Customize for phone” on the section toolbar to arrange it by hand."
          : "Tablets use the desktop arrangement, so changes here also move it on desktop. Use “Customize for tablet” on the section toolbar to arrange it separately.";

  function reorder(direction: 1 | -1) {
    commit((draft) => {
      const s = findSection(draft, pageId, section.id);
      if (s) reorderWithinLayer(s, blockId, direction);
    });
  }

  const layerId = layerIdOf(section, block);
  const sameLayer = section.blocks.filter((b) => layerIdOf(section, b) === layerId);
  const layerIndex = sameLayer.indexOf(block);

  function duplicate() {
    const copy = cloneBlock(block!);
    copy.x = Math.min(copy.x + 1, gridOf(section).cols - copy.w);
    copy.y += 1;
    commit((draft) => {
      findSection(draft, pageId, section.id)?.blocks.push(copy);
    });
    select({ kind: "block", sectionId: section.id, blockId: copy.id });
  }

  function remove() {
    commit((draft) => {
      const s = findSection(draft, pageId, section.id);
      if (s) {
        s.blocks = s.blocks.filter((b) => b.id !== blockId);
      }
    });
    select({ kind: "section", sectionId: section.id });
  }

  if (focusing) {
    const cols = gridOf(section).cols;
    const hasAlign = allFields.some((x) => x.key === "align");
    const hAlign = String(block.props.align ?? "left");
    const vAlign = block.valign ?? "";
    const H = ["left", "center", "right"] as const;
    const V = ["", "middle", "bottom"] as const;
    const heading = (
      <header className="inspector-header">
        <span className="inspector-kind">{placed?.icon || def?.icon}</span>
        <div>
          <h2>
            {placed?.name ?? def?.label ?? block.type}
            {def?.description && !placed && <Hint>{def.description}</Hint>}
          </h2>
          <span className="inspector-sub">Working on this piece only</span>
        </div>
      </header>
    );
    if (sheet) {
      const titles = { motion: "Animation", sound: "Sound", sizes: "Screen sizes", share: "Save or share" };
      return (
        <div className="focus-sheet">
          <button className="btn btn--ghost focus-sheet-back" onClick={() => setSheet(null)}>
            <Icon name="back" size={16} />
            {placed?.name ?? def?.label ?? block.type}
          </button>
          <h2 className="focus-sheet-title">{titles[sheet]}</h2>
          {sheet === "motion" && (
            <>
              <FieldList
                fields={MOTION_FIELDS}
                values={{ reveal: block.motion?.reveal ?? "", delay: block.motion?.delay ?? 0, parallax: block.motion?.parallax ?? 0, hover: block.motion?.hover ?? "" }}
                onChange={(key, value) =>
                  mutateBlock((b) => {
                    b.motion = { ...b.motion, [key]: value };
                  }, `${blockId}.motion.${key}`)
                }
              />
              <button className="btn btn--block btn--primary" onClick={() => openTimelineFor(section.id, block.id)}>
                {block.animations?.length ? `Open its timeline (${block.animations.length})` : "Make your own animation in the timeline"}
              </button>
            </>
          )}
          {sheet === "sound" && <SoundTools block={block} mutate={mutateBlock} />}
          {sheet === "sizes" && (
            <>
              {tier === "desktop" ? (
                <p className="field-hint">Switch to Tablet or Phone at the top to arrange or hide this piece for that size.</p>
              ) : (
                <label className="catalogue-check">
                  <input
                    type="checkbox"
                    checked={isHiddenAt(block, tier)}
                    onChange={(e) =>
                      commit((draft) => {
                        const sd = findSection(draft, pageId, section.id);
                        const b = sd?.blocks.find((x) => x.id === blockId);
                        if (sd && b) setHiddenAndReflow(sd, b, tier, e.target.checked);
                      })
                    }
                  />{" "}
                  Hide it on {TIER_LABEL[tier].toLowerCase()}
                </label>
              )}
              <label className="field">
                <span className="field-label">Show it when the screen is</span>
                <select
                  value={block.orientation ?? ""}
                  onChange={(e) =>
                    mutateBlock((b) => {
                      if (e.target.value) b.orientation = e.target.value as Orientation;
                      else delete b.orientation;
                    })
                  }
                >
                  <option value="">Either way round</option>
                  <option value="portrait">Upright only</option>
                  <option value="landscape">Sideways only</option>
                </select>
              </label>
            </>
          )}
          {sheet === "share" && (
            <>
              <ShareButton section={section} block={block} />
              {(block.type === "code" || block.type === "vector") && <SaveToMyCatalogue section={section} block={block} />}
              {!inComponent && (
                <>
                  <MakeComponentButton section={section} ids={[blockId]} />
                  <button className="btn btn--block" onClick={() => promptSaveBlocks(section, [blockId])}>
                    ★ Save a copy for other sites
                  </button>
                </>
              )}
            </>
          )}
        </div>
      );
    }
    return (
      <>
        {heading}
        {design && <ChangeDesign section={section} block={block} def={design} />}
        <section className="rect-panel" aria-label="Placement">
          <div className="rect-anchor" role="group" aria-label={hasAlign ? "Alignment" : "Vertical alignment"}>
            {V.map((v) =>
              H.map((h) => {
                const on = vAlign === v && (!hasAlign || hAlign === h);
                return (
                  <button
                    key={`${v}-${h}`}
                    className={cls(on && "is-active")}
                    aria-label={`${v || "top"} ${h}`}
                    disabled={!hasAlign && h !== "center"}
                    onClick={() =>
                      mutateBlock((b) => {
                        if (v) b.valign = v;
                        else delete b.valign;
                        if (hasAlign) b.props.align = h;
                      })
                    }
                  >
                    <span />
                  </button>
                );
              })
            )}
          </div>
          {stacked ? (
            <p className="field-hint rect-note">On phones this section stacks its pieces. Use Customize for phone on the section bar to place them by hand.</p>
          ) : (
            <div className="rect-fields">
              {(
                [
                  ["x", "X", rect.x + 1, cols],
                  ["y", "Y", rect.y + 1, 999],
                  ["w", "W", rect.w, cols],
                  ["h", "H", rect.h, 999]
                ] as const
              ).map(([key, label, value, max]) => (
                <label key={key} className="rect-field">
                  <span>{label}</span>
                  <input type="number" min={1} max={max} value={value} onChange={(e) => setLayout(key, e.target.value)} />
                </label>
              ))}
            </div>
          )}
          {!stacked && (
            <div className="rect-quick">
              <button className="btn btn--small" onClick={() => (setLayout("x", 1), setLayout("w", cols))}>
                Fill width
              </button>
              <button className="btn btn--small" onClick={() => setLayout("x", Math.floor((cols - rect.w) / 2) + 1)}>
                Centre
              </button>
              <Hint align="end">X and W count the page's {cols} columns; Y and H count rows. The dot grid places the content inside its box.</Hint>
            </div>
          )}
        </section>
        {(block.type === "image" || block.type === "card") && needsDescription(block) && <DescribePicture block={block} mutate={mutateBlock} />}
        {def && (
          <section className="inspector-group">
            <FieldList
              fields={shownFields.filter((x) => x.key !== "align")}
              values={editLang ? localizedProps(block, editLang) : block.props}
              expose={exposure}
              onChange={(key, value) =>
                mutateBlock((b) => {
                  writeProp(b, key, value, editLang, state.site);
                }, `${blockId}.${key}`)
              }
            />
            {essentials && (hiddenCount > 0 || moreSettings) && (
              <button className="link-button inspector-more" onClick={() => setMoreSettings(!moreSettings)}>
                {moreSettings ? "Fewer settings" : `More settings (${hiddenCount})`}
              </button>
            )}
          </section>
        )}
        {block.type === "collection" && !design && <CollectionTools block={block} mutate={mutateBlock} />}
        {block.type === "vector" && <VectorTools block={block} mutate={mutateBlock} />}
        {def?.Tools && <def.Tools block={block} section={section} mutate={mutateBlock} />}
        {hasCompanions && <SpotField block={block} mutate={mutateBlock} />}
        {block.type === "flipbook" && <FlipbookEntry section={section} block={block} />}
        {(block.type === "video" || block.type === "audio") && <MediaTools block={block} mutate={mutateBlock} />}
        <div className="focus-extras">
          <button onClick={() => setSheet("motion")}>
            <Icon name="motion" size={16} />
            Animation{block.motion?.reveal || block.motion?.hover || block.animations?.length ? " ●" : ""}
          </button>
          <button onClick={() => setSheet("sound")}>
            <Icon name="sound" size={16} />
            Sound{block.sounds?.length ? " ●" : ""}
          </button>
          <button onClick={() => setSheet("sizes")}>
            <Icon name="grid" size={16} />
            Screen sizes
          </button>
          <button onClick={() => setSheet("share")}>
            <Icon name="copy" size={16} />
            Save or share
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="inspector-header">
        <span className="inspector-kind">{placed?.icon || def?.icon}</span>
        <div>
          <h2>
            {placed?.name ?? def?.label ?? block.type}
            {def?.description && !placed && <Hint>{def.description}</Hint>}
          </h2>
          <button className="link-button" onClick={() => select(inComponent ? { kind: "none" } : { kind: "section", sectionId: section.id })}>
            {inComponent ? "piece of this component" : `in ${section.name}`}
          </button>
        </div>
      </header>
      {def?.badges && !placed && (
        <div className="badges inspector-badges">
          {def.badges.map((b) => (
            <Badge key={b} info={BADGES[b]} />
          ))}
        </div>
      )}

      {(block.type === "image" || block.type === "card") && needsDescription(block) && <DescribePicture block={block} mutate={mutateBlock} />}
      {(block.type === "gallery" || block.type === "carousel") && needsDescription(block) && (
        <section className="inspector-group describe-picture">
          <p className="field-hint">Some pictures here have no description.</p>
          <button className="btn btn--small" onClick={() => openAltText(block.id)}>
            Describe them
          </button>
        </section>
      )}
      {def && (
        <section className="inspector-group">
          <h3 className="panel-heading">Content</h3>
          <FieldList
            fields={shownFields}
            values={editLang ? localizedProps(block, editLang) : block.props}
            expose={exposure}
            onChange={(key, value) =>
              mutateBlock((b) => {
                writeProp(b, key, value, editLang, state.site);
              }, `${blockId}.${key}`)
            }
          />
          {!focusing && essentials && (hiddenCount > 0 || moreSettings) && (
            <button className="link-button inspector-more" onClick={() => setMoreSettings(!moreSettings)}>
              {moreSettings ? "Fewer settings" : `More settings (${hiddenCount})`}
            </button>
          )}
        </section>
      )}

      <Fold id="valign" title="Box alignment" forceOpen={focusing}>
        <div className="field">
          <span className="field-label">Vertical align</span>
          <div className="segmented" role="radiogroup" aria-label="Vertical align">
            {(
              [
                ["", "Top"],
                ["middle", "Middle"],
                ["bottom", "Bottom"]
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                role="radio"
                aria-checked={(block.valign ?? "") === value}
                className={(block.valign ?? "") === value ? "is-active" : undefined}
                onClick={() =>
                  mutateBlock((b) => {
                    if (value) b.valign = value;
                    else delete b.valign;
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
          <span className="field-hint">Where the content sits in its box when the box is taller than the content.</span>
        </div>
      </Fold>

      {design && <ChangeDesign section={section} block={block} def={design} />}
      {block.type === "collection" && <CollectionTools block={block} mutate={mutateBlock} />}
      {GUIDES_FOR_BLOCK[block.type] && (
        <section className="inspector-group inspector-guides">
          {GUIDES_FOR_BLOCK[block.type].map((id) => (
            <button key={id} className="btn btn--block" onClick={() => openGuide(id)}>
              📘 {guideById(id)?.title}
            </button>
          ))}
        </section>
      )}
      {block.type === "vector" && <VectorTools block={block} mutate={mutateBlock} />}
      {def?.Tools && <def.Tools block={block} section={section} mutate={mutateBlock} />}
      {hasCompanions && <SpotField block={block} mutate={mutateBlock} />}
      {block.type === "flipbook" && <FlipbookEntry section={section} block={block} />}
      {(block.type === "video" || block.type === "audio") && <MediaTools block={block} mutate={mutateBlock} />}
      {block.type === "code" && /^https?:\/\//.test(String(block.props.source ?? "")) && <ViewOriginal url={String(block.props.source)} />}
      {block.type === "code" && block.props.licence === "Reference only" && (
        <section className="inspector-group reference-note">
          <strong>Captured for reference</strong>
          <p className="field-hint">
            From {String(block.props.source || "another website")}. Its text and pictures were left out, and it can't be published as it is: rebuild it your
            own way (swap in your content, change the look), then set the licence to Own work below. If you have permission, pick the licence you were given.
          </p>
        </section>
      )}
      {(block.type === "code" || block.type === "vector") && <SaveToMyCatalogue section={section} block={block} />}
      <ShareButton section={section} block={block} />

      <Fold id="motion" title={block.motion?.reveal || block.motion?.hover || block.animations?.length ? "Motion ●" : "Motion"} forceOpen={focusing}>
        <FieldList
          fields={MOTION_FIELDS}
          values={{ reveal: block.motion?.reveal ?? "", delay: block.motion?.delay ?? 0, parallax: block.motion?.parallax ?? 0, hover: block.motion?.hover ?? "" }}
          onChange={(key, value) =>
            mutateBlock((b) => {
              b.motion = { ...b.motion, [key]: value };
            }, `${blockId}.motion.${key}`)
          }
        />
        <button className="btn btn--block motion-timeline-open" onClick={() => openTimelineFor(section.id, block.id)}>
          {block.animations?.length ? `◷ Timeline (${block.animations.length} animation${block.animations.length === 1 ? "" : "s"})` : "◷ Make your own in the timeline"}
        </button>
      </Fold>

      <Fold id="sound" title={block.sounds?.length ? "Sound ●" : "Sound"} forceOpen={focusing}>
        <SoundTools block={block} mutate={mutateBlock} />
      </Fold>

      <Fold id="position" title={`Position and size${tier !== "desktop" ? ` · ${TIER_LABEL[tier]}` : ""}`} forceOpen={focusing}>
        {layoutNote && <p className="field-hint inspector-tier-note">{layoutNote}</p>}
        {!stacked && (
          <div className="inspector-layout">
            <FieldList
              fields={layoutFields(gridOf(section).cols)}
              values={{ x: rect.x + 1, y: rect.y + 1, w: rect.w, h: rect.h }}
              onChange={setLayout}
            />
          </div>
        )}
        {tier !== "desktop" && (
          <div className="field field--toggle inspector-hide-tier">
            <span className="field-label">Hide on {TIER_LABEL[tier].toLowerCase()}</span>
            <input
              type="checkbox"
              checked={isHiddenAt(block, tier)}
              onChange={(e) =>
                commit((draft) => {
                  const s = findSection(draft, pageId, section.id);
                  const b = s?.blocks.find((x) => x.id === blockId);
                  if (s && b) setHiddenAndReflow(s, b, tier, e.target.checked);
                })
              }
            />
            {tier === "tablet" && !hasCustomLayout(section, tier) && (
              <span className="field-hint">Tablets follow the desktop arrangement here, so hiding leaves a gap. Customize for tablet to close it up.</span>
            )}
          </div>
        )}
        {!stacked && (
          <div className="field-row inspector-overhang">
            {(["top", "bottom"] as const).map((edge) => (
              <label key={edge} className="field">
                <span className="field-label">{edge === "top" ? "Extend up (rows)" : "Extend down (rows)"}</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={block.overhang?.[edge] ?? 0}
                  title={edge === "top" ? "Grow the block upwards without moving anything; past the section's edge it draws over the section above" : "Grow the block downwards without moving anything; past the section's edge it draws over the section below"}
                  onChange={(e) =>
                    mutateBlock((b) => {
                      const n = Math.max(0, Math.min(60, Math.round(Number(e.target.value) || 0)));
                      const next = { ...b.overhang, [edge]: n || undefined };
                      if (!next.top && !next.bottom) delete b.overhang;
                      else b.overhang = next;
                    }, `${blockId}.overhang.${edge}`)
                  }
                />
              </label>
            ))}
          </div>
        )}
        <TurnFields block={block} mutateBlock={mutateBlock} />
        <label className="field">
          <span className="field-label">Show in</span>
          <select
            value={block.orientation ?? ""}
            onChange={(e) =>
              mutateBlock((b) => {
                if (e.target.value) b.orientation = e.target.value as Orientation;
                else delete b.orientation;
              })
            }
          >
            <option value="">Any orientation</option>
            <option value="portrait">Portrait only (upright phones and tablets)</option>
            <option value="landscape">Landscape only (sideways phones, desktops)</option>
          </select>
          <span className="field-hint">Rotate the preview device (▯/▭ in the top bar) to see each version.</span>
        </label>
        {section.layers.length > 1 && (
        <div className="field inspector-layer">
          <span className="field-label">Group</span>
          <select
            value={layerId}
            onChange={(e) =>
              commit((draft) => {
                const s = findSection(draft, pageId, section.id);
                const b = s?.blocks.find((x) => x.id === blockId);
                if (s && b) placeInStack(s, b, { layerId: e.target.value });
              })
            }
          >
            {[...section.layers].reverse().map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layer.name}
                {layer.hidden ? " (hidden)" : ""}
              </option>
            ))}
          </select>
        </div>
        )}
        <div className="field-row">
          <button className="btn btn--small" disabled={layerIndex === sameLayer.length - 1} onClick={() => reorder(1)}>
            Bring forward
          </button>
          <button className="btn btn--small" disabled={layerIndex === 0} onClick={() => reorder(-1)}>
            Send backward
          </button>
        </div>
      </Fold>

      <section className="inspector-group">
        <div className="field-row">
          <button className="btn" onClick={duplicate}>
            Duplicate <kbd>Ctrl D</kbd>
          </button>
          <button className="btn btn--danger" onClick={remove}>
            Delete <kbd>Del</kbd>
          </button>
        </div>
        {!inComponent && (
          <>
            <MakeComponentButton section={section} ids={[blockId]} />
            <button className="btn btn--block inspector-save-blocks" onClick={() => promptSaveBlocks(section, [blockId])}>
              ★ Save a copy
            </button>
          </>
        )}
      </section>
    </>
  );
}

const ESSENTIALS: Record<string, string[]> = {
  heading: ["text", "size", "align", "color"],
  text: ["text", "size", "align", "color"],
  button: ["label", "href", "variant"],
  image: ["src", "alt"],
  card: ["image", "title", "text", "href"],
  box: ["fill"],
  divider: ["color", "thickness"],
  marquee: ["text", "speed"],
  list: ["items", "style"],
  video: ["url"],
  audio: ["src"],
  map: ["address"],
  testimonial: ["quote", "name", "role", "avatar"],
  pricing: ["plan", "price", "description", "features", "buttonLabel", "buttonHref"],
  "social-links": ["links", "style"],
  countdown: ["at", "done"],
  qr: ["url", "label"],
  support: ["provider", "account"],
  stream: ["provider", "channel"],
  "social-post": ["url"]
};

function Fold({ id, title, forceOpen, children }: { id: string; title: string; forceOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(`fayteworks:fold:${id}`) === "1";
    } catch {
      return false;
    }
  });
  const shown = Boolean(forceOpen) || open;
  return (
    <section className={cls("inspector-fold", shown && "is-open")}>
      <button
        className="inspector-fold-head"
        aria-expanded={shown}
        onClick={() => {
          if (forceOpen) return;
          setOpen(!open);
          try {
            localStorage.setItem(`fayteworks:fold:${id}`, open ? "0" : "1");
          } catch {
            return;
          }
        }}
      >
        <Icon name={shown ? "chevronDown" : "chevronRight"} size={14} />
        {title}
      </button>
      {shown && <div className="inspector-fold-body">{children}</div>}
    </section>
  );
}

function SectionInspector({ section }: { section: Section }) {
  const { state, page, commit } = useEditor();
  const pageId = page.id;
  const shared = state.site.header?.id === section.id ? "header" : state.site.footer?.id === section.id ? "footer" : null;

  function mutateSection(recipe: (s: Section) => void, key: string) {
    commit((draft) => {
      const s = findSection(draft, pageId, section.id);
      if (s) {
        recipe(s);
      }
    }, key);
  }

  return (
    <>
      <header className="inspector-header">
        <span className="inspector-kind">§</span>
        <div>
          <h2>{shared ? `Shared ${shared}` : "Section"}</h2>
          <span className="inspector-sub">
            {shared ? "Appears on every page · " : ""}
            {section.blocks.length} block{section.blocks.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>
      <section className="inspector-group">
        <div className="field">
          <span className="field-label">Name</span>
          <input
            type="text"
            value={section.name}
            onChange={(e) => mutateSection((s) => void (s.name = e.target.value), `${section.id}.name`)}
          />
        </div>
        <GridPrecisionField value={densityOf(section)} onChange={(d) => mutateSection((s) => setGridDensity(s, d), `${section.id}.grid`)} />
        <FieldList
          fields={SECTION_FIELDS}
          values={section.settings as unknown as Record<string, PropValue>}
          onChange={(key, value) =>
            mutateSection((s) => {
              (s.settings as unknown as Record<string, PropValue>)[key as keyof SectionSettings] =
                key === "minRows" ? Math.max(1, Math.round(Number(value))) : value;
            }, `${section.id}.${key}`)
          }
        />
      </section>
      {!shared && cardLayouts && isCardShell(shellOf(page).type) && <cardLayouts.SectionSettings page={page} section={section} mutateSection={mutateSection} />}
      <section className="inspector-group">
        <button className="btn btn--block" onClick={() => promptSaveComponent(section)}>
          ★ Save a copy of this section
        </button>
        <p className="field-hint inspector-note">Reuse it on any page or site from Add → Saved sections.</p>
      </section>
      <SectionSvgTools section={section} />
      <ShareButton section={section} />
    </>
  );
}

function PageSummary() {
  const { state, page } = useEditor();
  const isHome = state.site.pages[0].id === page.id;
  const doors = [
    { icon: "page", title: "Page settings", what: "Name, address, layout, password and sharing", open: () => openScene({ kind: "page", pageId: page.id }) },
    { icon: "palette", title: "Look", what: "Colours, fonts, corners and style sets", open: () => openScene({ kind: "look", tab: "colours" }) },
    { icon: "settings", title: "Site settings", what: "Site name, address, tab icon, connections", open: () => openScene({ kind: "site", tab: "site" }) }
  ];
  return (
    <>
      <header className="inspector-header">
        <span className="inspector-kind">◰</span>
        <div>
          <h2>{page.title}</h2>
          <span className="inspector-sub">{isHome ? "The home page" : `/${page.slug}`}</span>
        </div>
      </header>
      <div className="inspector-doors">
        {doors.map((d) => (
          <button key={d.title} className="inspector-door" onClick={d.open}>
            <Icon name={d.icon} size={20} />
            <span>
              <strong>{d.title}</strong>
              <small>{d.what}</small>
            </span>
          </button>
        ))}
      </div>
      <p className="field-hint">Click a section or a piece on the canvas to change it.</p>
    </>
  );
}

function PageAndThemeInspector() {
  const { state, page, commit } = useEditor();
  const pageEditLang = useEditingLang(state.site);
  if (!page.design) return <PageSummary />;
  const pageId = page.id;
  const isHome = state.site.pages[0].id === pageId;

  function mutatePage(recipe: (p: typeof page) => void, key: string) {
    commit((draft) => {
      const p = findPage(draft, pageId);
      if (p) recipe(p);
    }, `${pageId}.${key}`);
  }

  return (
    <>
      <header className="inspector-header">
        <span className="inspector-kind">◰</span>
        <div>
          <h2>{page.title}</h2>
          <span className="inspector-sub">{page.design ? "Design (not part of the website)" : `/${page.slug}`}</span>
        </div>
      </header>
      {page.design && <DesignPanel key={page.id} page={page as typeof page & { design: NonNullable<typeof page.design> }} />}
      <section className="inspector-group">
        <h3 className="panel-heading">{page.design ? "Name" : "Page"}</h3>
        <div className="field">
          <span className="field-label">Title</span>
          <input
            type="text"
            value={pageEditLang ? page.translations?.[pageEditLang]?.title ?? "" : page.title}
            placeholder={pageEditLang ? page.title : undefined}
            onChange={(e) =>
              commit((draft) => {
                const p = findPage(draft, pageId);
                if (!p) return;
                if (pageEditLang) ((p.translations ??= {})[pageEditLang] ??= {}).title = e.target.value;
                else p.title = e.target.value;
              }, `${pageId}.title`)
            }
          />
        </div>
        {!page.design && (
        <div className="field">
          <span className="field-label">URL</span>
          <input
            type="text"
            value={page.slug}
            disabled={isHome}
            placeholder={isHome ? "Home page lives at /" : ""}
            onChange={(e) =>
              commit((draft) => {
                const p = findPage(draft, pageId);
                if (p) p.slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
              }, `${pageId}.slug`)
            }
          />
        </div>
        )}
      </section>
      {!page.design && (
        <>
      {!isHome && <ItemPageSetting page={page} mutatePage={mutatePage} />}
      <ProtectSetting page={page} mutatePage={mutatePage} />
      {!isHome && (
        <div className="field field--toggle inspector-toggle">
          <span className="field-label">Hide from navigation</span>
          <input type="checkbox" checked={page.hideInNav} onChange={(e) => mutatePage((p) => void (p.hideInNav = e.target.checked), "hideInNav")} />
        </div>
      )}
      <div className="field field--toggle inspector-toggle">
        <span className="field-label" title="For a link-in-bio or coming-soon page">Without the site's header and footer</span>
        <input type="checkbox" checked={Boolean(page.standalone)} onChange={(e) => mutatePage((p) => void (p.standalone = e.target.checked || undefined), "standalone")} />
      </div>
      <section className="inspector-group">
        <h3 className="panel-heading">Page layout</h3>
        <div className="shell-options" role="radiogroup" aria-label="Page layout">
          {[...SHELL_OPTIONS, ...(cardLayouts?.options ?? [])].map((option) => (
            <button
              key={option.value}
              role="radio"
              aria-checked={shellOf(page).type === option.value}
              className={`shell-option${shellOf(page).type === option.value ? " is-active" : ""}`}
              onClick={() =>
                mutatePage((p) => {
                  p.shell = { dots: true, ...p.shell, type: option.value };
                }, "shell.type")
              }
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>
        {shellFields(shellOf(page).type).length > 0 && (
          <FieldList
            fields={shellFields(shellOf(page).type)}
            values={{ dots: true, ...shellOf(page) } as unknown as Record<string, PropValue>}
            onChange={(key, value) =>
              mutatePage((p) => {
                p.shell = { ...shellOf(p), [key as keyof PageShell]: value } as PageShell;
              }, `shell.${key}`)
            }
          />
        )}
        <p className="field-hint">Your sections stay exactly as they are; the layout only changes how they are presented. Try it in Preview.</p>
      </section>
      {cardLayouts && isCardShell(shellOf(page).type) && <cardLayouts.PageSettings page={page} mutatePage={mutatePage} />}
      <section className="inspector-group">
        <h3 className="panel-heading">Search & sharing</h3>
        <FieldList
          fields={PAGE_FIELDS}
          values={{ ...page.seo, ...(pageEditLang ? { description: page.translations?.[pageEditLang]?.description ?? "" } : {}) } as unknown as Record<string, PropValue>}
          onChange={(key, value) =>
            mutatePage((p) => {
              if (pageEditLang && key === "description") ((p.translations ??= {})[pageEditLang] ??= {}).description = String(value);
              else p.seo[key as keyof PageSeo] = String(value);
            }, `seo.${key}`)
          }
        />
      </section>
        </>
      )}
      <button className="inspector-door" onClick={() => openScene({ kind: "look", tab: "colours" })}>
        <Icon name="palette" size={20} />
        <span>
          <strong>Colours and fonts</strong>
          <small>Designs use the site's Look, so they match the website.</small>
        </span>
      </button>
    </>
  );
}

const ALIGN_BUTTONS: { mode: AlignMode; label: string; title: string }[] = [
  { mode: "left", label: "⇤", title: "Align left edges" },
  { mode: "center", label: "↔", title: "Centre horizontally" },
  { mode: "right", label: "⇥", title: "Align right edges" },
  { mode: "top", label: "⤒", title: "Align top edges" },
  { mode: "middle", label: "↕", title: "Centre vertically" },
  { mode: "bottom", label: "⤓", title: "Align bottom edges" }
];

function MultiBlockInspector({ section, ids }: { section: Section; ids: string[] }) {
  const { state, page, commit, select } = useEditor();
  const tier = editorTier(state);
  const blocks = section.blocks.filter((b) => ids.includes(b.id));
  const layerIds = new Set(blocks.map((b) => layerIdOf(section, b)));

  function apply(recipe: (s: Section) => void) {
    commit((draft) => {
      const s = findSection(draft, page.id, section.id);
      if (s) recipe(s);
    });
  }

  function duplicate() {
    const copies = copyBlocks(blocks);
    apply((s) => insertBlocks(s, copies, tier, 1, 1, layerIdOf(s, blocks[0])));
    select({ kind: "block", sectionId: section.id, blockId: copies[0].id, blockIds: copies.map((c) => c.id) });
  }

  return (
    <>
      <header className="inspector-header">
        <span className="inspector-kind">⧉</span>
        <div>
          <h2>{blocks.length} blocks</h2>
          <button className="link-button" onClick={() => select({ kind: "section", sectionId: section.id })}>
            in {section.name}
          </button>
        </div>
      </header>

      <ul className="multi-list">
        {blocks.map((b) => (
          <li key={b.id}>
            <button
              title="Select just this block"
              onClick={() => select({ kind: "block", sectionId: section.id, blockId: b.id })}
            >
              <span>{defOf(b.type)?.icon}</span>
              {describeBlock(b)}
            </button>
          </li>
        ))}
      </ul>
      <p className="field-hint">Shift-click blocks to add or remove them. Drag any of them to move the group.</p>

      {!isStacked(section, tier) && (
        <section className="inspector-group">
          <h3 className="panel-heading">Align{tier !== "desktop" ? ` · ${TIER_LABEL[tier]}` : ""}</h3>
          <div className="align-buttons">
            {ALIGN_BUTTONS.map((b) => (
              <button key={b.mode} className="btn" title={b.title} onClick={() => apply((s) => alignBlocks(s, ids, tier, b.mode))}>
                {b.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="inspector-group">
        <div className="field">
          <span className="field-label">Group</span>
          <select
            value={layerIds.size === 1 ? [...layerIds][0] : ""}
            onChange={(e) =>
              apply((s) => {
                for (const b of s.blocks) if (ids.includes(b.id)) b.layerId = e.target.value;
              })
            }
          >
            {layerIds.size > 1 && <option value="">Mixed layers</option>}
            {[...section.layers].reverse().map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layer.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="inspector-group">
        <div className="field-row">
          <button className="btn" onClick={duplicate}>
            Duplicate <kbd>Ctrl D</kbd>
          </button>
          <button
            className="btn btn--danger"
            onClick={() => {
              apply((s) => removeBlocks(s, ids));
              select({ kind: "section", sectionId: section.id });
            }}
          >
            Delete <kbd>Del</kbd>
          </button>
        </div>
        {!componentSection(state.site, section.id) && <MakeComponentButton section={section} ids={ids} />}
        <button className="btn btn--block inspector-save-blocks" onClick={() => promptSaveBlocks(section, ids)}>
          ★ Save group
        </button>
      </section>
    </>
  );
}

function MakingInPlace({ def }: { def: ComponentDef }) {
  const { state, editComponent } = useEditor();
  const uses = componentUses(state.site, def.id);
  const card = useCardSource();
  return (
    <>
      <header className="inspector-header">
        <span className="inspector-kind">{def.icon || "◆"}</span>
        <div>
          <h2>{def.name}</h2>
          <span className="inspector-sub">Changing its design</span>
        </div>
      </header>
      <ol className="making-steps">
        <li>Click a piece to change it. Drag it to move it, or its edges to resize it.</li>
        <li>
          <strong>Add a piece</strong> at the top puts something new in.
        </li>
        {card && <li>Each piece can show one of the {card.collection.name} fields, like the title or the picture: drag a dot from the fields box onto it, or pick the field under its settings.</li>}
      </ol>
      <p className="field-hint">{uses > 1 ? `Changes show in all ${uses} places it's used.` : "It's only used here."}</p>
      <button className="btn btn--primary btn--block" onClick={() => editComponent(null)}>
        Done
      </button>
      <Fold id="component-settings" title="Name, fields and other settings">
        <ComponentInspector key={def.id} def={def} />
      </Fold>
    </>
  );
}

export function Inspector() {
  const { state, page } = useEditor();
  const { selection } = state;
  const section = selection.kind === "none" ? undefined : findSection(state.site, page.id, selection.sectionId);
  const making = findComponent(state.site.components, state.componentId);
  const card = useCardSource();
  const itemFields = card && (making || page.collectionId) ? itemFieldsOf(card.collection) : null;

  return (
    <ItemFieldsCtx.Provider value={itemFields}>
    <div className="inspector">
      {making && state.componentAnchor && (selection.kind === "none" || (selection.kind === "section" && section && componentSection(state.site, section.id))) ? (
        <MakingInPlace def={making} />
      ) : making && (selection.kind === "none" || (selection.kind === "section" && section && componentSection(state.site, section.id))) ? (
        <ComponentInspector key={making.id} def={making} />
      ) : selection.kind === "block" && section && selectedBlockIds(selection).length > 1 ? (
        <MultiBlockInspector section={section} ids={selectedBlockIds(selection)} />
      ) : selection.kind === "block" && section ? (
        <BlockInspector key={selection.blockId} section={section} blockId={selection.blockId} />
      ) : selection.kind === "section" && section ? (
        <SectionInspector key={section.id} section={section} />
      ) : (
        <PageAndThemeInspector />
      )}
    </div>
    </ItemFieldsCtx.Provider>
  );
}

function SaveToMyCatalogue({ section, block }: { section: Section; block: Block }) {
  const [saved, setSaved] = useState("");
  async function save() {
    const name = await askText("Name it in your catalogue", String(block.props.name || block.name || (block.type === "vector" ? "Drawing" : "Custom code")));
    if (name === null) return;
    const d = densityOf(section);
    await saveMine(block.type, block.props, { w: Math.max(1, Math.round(block.w / d)), h: Math.max(1, Math.round(block.h / d)) }, name);
    setSaved(name);
  }
  return (
    <section className="inspector-group">
      <button className="btn btn--small" onClick={() => void save()}>
        ☆ Save to my catalogue
      </button>
      {saved && <p className="field-hint">Saved as “{saved}”: find it in the catalogue under Mine, on any site.</p>}
    </section>
  );
}

function ViewOriginal({ url }: { url: string }) {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
  }
  return (
    <section className="inspector-group view-original">
      <button
        className="btn btn--small btn--block"
        title={url}
        onClick={() => (desktop ? void desktop.openExternal(url) : void window.open(url, "_blank", "noopener"))}
      >
        ↗ View the original on {host}
      </button>
      <p className="field-hint">Hover effects, animations and scripts stay with the original: see how it moves there.</p>
    </section>
  );
}

const TURN_FIELDS: { key: "z" | "x" | "y"; label: string; title: string }[] = [
  { key: "z", label: "Turn °", title: "Turn it flat, like a card on a table (or drag the round handle above it)" },
  { key: "x", label: "Tip back °", title: "Tip the top away from you (minus tips it towards you)" },
  { key: "y", label: "Turn sideways °", title: "Swing it round like a door (minus swings the other way)" }
];

function TurnFields({ block, mutateBlock }: { block: Block; mutateBlock: (recipe: (b: Block) => void, key?: string) => void }) {
  const turn = block.turn ?? {};
  const set = (key: "z" | "x" | "y" | "depth", raw: string) =>
    mutateBlock((b) => {
      const n = Number(raw);
      const next = { ...(b.turn ?? {}), [key]: Number.isFinite(n) && n ? Math.max(-360, Math.min(key === "depth" ? 5000 : 360, n)) : undefined };
      if (!next.z && !next.x && !next.y) delete b.turn;
      else b.turn = next;
    }, `${block.id}.turn.${key}`);
  return (
    <div className="field inspector-turn">
      <div className="field-row">
        {TURN_FIELDS.map((f) => (
          <label key={f.key} className="field" title={f.title}>
            <span className="field-label">{f.label}</span>
            <input type="number" step={1} value={turn[f.key] ?? 0} onChange={(e) => set(f.key, e.target.value)} />
          </label>
        ))}
      </div>
      {(turn.x || turn.y) && (
        <label className="field">
          <span className="field-label">Depth</span>
          <input type="range" min={200} max={3000} step={50} value={turn.depth || 800} onChange={(e) => set("depth", e.target.value)} />
          <span className="field-hint">Less depth makes the tilt look stronger, as if you were closer.</span>
        </label>
      )}
      {(turn.z || turn.x || turn.y) && (
        <button className="link-button" onClick={() => mutateBlock((b) => void delete b.turn)}>
          Straighten
        </button>
      )}
    </div>
  );
}
