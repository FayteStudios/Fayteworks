import { isCardShell, sectionAnchors, sectionTitle, shellOf } from "../model/shells";
import type { Page, Section } from "../model/types";
import { StaticSection } from "./SiteRenderer";

export function ShellRenderer({ page, sections }: { page: Page; sections: Section[] }) {
  const shell = shellOf(page);
  const anchors = sectionAnchors(sections);

  if (shell.type === "scroll" || isCardShell(shell.type)) {
    return (
      <main className="site-main">
        {sections.map((section) => (
          <StaticSection key={section.id} section={section} role="page" />
        ))}
      </main>
    );
  }

  const sideways = shell.type === "sideways";
  const horizontal = shell.type === "horizontal" || sideways;
  return (
    <main
      className={`site-main site-shell site-shell--${shell.type}${sideways ? " site-shell--horizontal" : ""}`}
      data-js="shell-scroll"
      data-direction={horizontal ? "x" : "y"}
      data-glide={sideways ? "" : undefined}
    >
      {sections.map((section, i) => (
        <div key={section.id} className="shell-slide" id={anchors[i]}>
          <StaticSection section={section} role="page" />
        </div>
      ))}
      {shell.dots !== false && sections.length > 1 && (
        <nav className="shell-dots" aria-label="Sections">
          {sections.map((section, i) => (
            <a key={section.id} href={`#${anchors[i]}`} aria-label={sectionTitle(section)} />
          ))}
        </nav>
      )}
    </main>
  );
}
