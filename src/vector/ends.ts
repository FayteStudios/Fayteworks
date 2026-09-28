import type paper from "paper/dist/paper-core";

export type EndKind = "none" | "arrow" | "triangle" | "circle" | "square" | "diamond" | "bar";

export interface Ends {
  start: EndKind;
  end: EndKind;
  size: number;
}

export const END_KINDS: { value: EndKind; label: string }[] = [
  { value: "none", label: "Plain" },
  { value: "arrow", label: "Arrow" },
  { value: "triangle", label: "Triangle" },
  { value: "circle", label: "Dot" },
  { value: "square", label: "Square" },
  { value: "diamond", label: "Diamond" },
  { value: "bar", label: "Bar" }
];

export function buildHead(scope: paper.PaperScope, kind: EndKind, tip: paper.Point, dir: paper.Point, width: number, color: paper.Color | null, size: number): paper.Item | null {
  if (kind === "none" || !color) return null;
  const s = Math.max(4, width * 3.5) * Math.max(0.2, size);
  const n = new scope.Point(-dir.y, dir.x);
  const at = (along: number, across: number) => tip.add(dir.multiply(along * s)).add(n.multiply(across * s));
  const filled = (item: paper.Path) => {
    item.fillColor = color.clone();
    item.strokeColor = null;
    return item;
  };
  const stroked = (item: paper.Path) => {
    item.strokeColor = color.clone();
    item.strokeWidth = width;
    item.strokeCap = "round";
    item.strokeJoin = "round";
    item.fillColor = null;
    return item;
  };
  let head: paper.Path;
  switch (kind) {
    case "arrow":
      head = stroked(new scope.Path({ segments: [at(-1, 0.55), tip, at(-1, -0.55)], insert: false }));
      break;
    case "triangle":
      head = filled(new scope.Path({ segments: [at(0.9, 0), at(-0.1, 0.55), at(-0.1, -0.55)], closed: true, insert: false }));
      break;
    case "circle":
      head = filled(new scope.Path.Circle({ center: tip, radius: s * 0.4, insert: false }));
      break;
    case "square":
      head = filled(new scope.Path({ segments: [at(-0.35, -0.35), at(0.35, -0.35), at(0.35, 0.35), at(-0.35, 0.35)], closed: true, insert: false }));
      break;
    case "diamond":
      head = filled(new scope.Path({ segments: [at(0.55, 0), at(0, 0.38), at(-0.55, 0), at(0, -0.38)], closed: true, insert: false }));
      break;
    default:
      head = stroked(new scope.Path({ segments: [at(0, 0.6), at(0, -0.6)], insert: false }));
  }
  head.data.head = true;
  return head;
}

export function layoutEnds(scope: paper.PaperScope, group: paper.Group) {
  const ends = group.data.ends as Ends;
  for (const kid of [...group.children]) if (kid.data.head) kid.remove();
  const line = group.children.find((c) => c.data.line) as paper.Path | undefined;
  if (!line || !(line instanceof scope.Path) || line.closed || line.length < 0.01) return;
  const color = line.strokeColor;
  const width = line.strokeWidth || 1;
  const startDir = line.getTangentAt(0)?.multiply(-1);
  const endDir = line.getTangentAt(line.length);
  const start = startDir ? buildHead(scope, ends.start, line.firstSegment.point, startDir.normalize(), width, color, ends.size) : null;
  const end = endDir ? buildHead(scope, ends.end, line.lastSegment.point, endDir.normalize(), width, color, ends.size) : null;
  for (const head of [start, end]) if (head) group.addChild(head);
}
