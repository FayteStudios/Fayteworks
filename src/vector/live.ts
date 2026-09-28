import type paper from "paper/dist/paper-core";

export type Repeat =
  | { kind: "grid"; cols: number; rows: number; gapX: number; gapY: number }
  | { kind: "radial"; count: number; radius: number }
  | { kind: "mirror"; axis: "v" | "h" | "both"; atX: number; atY: number }
  | { kind: "path"; count: number; rotate: boolean };

export interface Blend {
  steps: number;
}

function strip(scope: paper.PaperScope, item: paper.Item): paper.Item {
  const copy = item.clone({ insert: false });
  copy.name = "";
  for (const i of [copy, ...copy.getItems({ recursive: true })]) {
    delete i.data.source;
    delete i.data.blendEnd;
    delete i.data.symbol;
    delete i.data.along;
    if (i !== copy && i.name) (i as unknown as { name: string | null }).name = null;
  }
  copy.data.gen = true;
  return copy;
}

export function layoutRepeat(scope: paper.PaperScope, group: paper.Group) {
  const r = group.data.repeat as Repeat;
  for (const kid of [...group.children]) if (kid.data.gen) kid.remove();
  const source = group.children.find((c) => c.data.source);
  if (!source) return;
  const b = source.bounds;
  const add = (fn: (c: paper.Item) => void) => {
    const c = strip(scope, source);
    fn(c);
    group.addChild(c);
  };
  if (r.kind === "grid") {
    for (let j = 0; j < Math.max(1, r.rows); j++) for (let i = 0; i < Math.max(1, r.cols); i++) if (i || j) add((c) => c.translate(new scope.Point(i * (b.width + r.gapX), j * (b.height + r.gapY))));
  } else if (r.kind === "radial") {
    const centre = b.center.add(new scope.Point(0, r.radius));
    for (let k = 1; k < Math.max(1, r.count); k++) add((c) => c.rotate((k * 360) / r.count, centre));
  } else if (r.kind === "mirror") {
    if (r.axis === "v" || r.axis === "both") add((c) => c.scale(-1, 1, new scope.Point(r.atX, b.center.y)));
    if (r.axis === "h" || r.axis === "both") add((c) => c.scale(1, -1, new scope.Point(b.center.x, r.atY)));
    if (r.axis === "both") add((c) => c.scale(-1, -1, new scope.Point(r.atX, r.atY)));
  } else if (r.kind === "path") {
    const guide = group.children.find((c) => c.data.along) as paper.Path | undefined;
    if (!guide || !(guide instanceof scope.Path) || !guide.length) return;
    const L = guide.length;
    const n = Math.max(1, r.count);
    const step = guide.closed ? L / n : n > 1 ? L / (n - 1) : 0;
    for (let k = 0; k < n; k++) {
      const off = Math.min(L, k * step);
      const at = guide.getPointAt(off);
      const tangent = guide.getTangentAt(off);
      if (!at) continue;
      add((c) => {
        c.position = at;
        if (r.rotate && tangent) c.rotate(tangent.angle, at);
      });
    }
  }
}

function mix(scope: paper.PaperScope, a: paper.Color | null, b: paper.Color | null, t: number): paper.Color | null {
  if (!a && !b) return null;
  if (!a || !b || a.gradient || b.gradient) return (t < 0.5 ? a : b)?.clone() ?? null;
  const ca = a.convert("rgb") as paper.Color;
  const cb = b.convert("rgb") as paper.Color;
  return new scope.Color(ca.red + (cb.red - ca.red) * t, ca.green + (cb.green - ca.green) * t, ca.blue + (cb.blue - ca.blue) * t, ca.alpha + (cb.alpha - ca.alpha) * t);
}

interface Seg {
  p: paper.Point;
  i: paper.Point;
  o: paper.Point;
}

function sample(scope: paper.PaperScope, path: paper.Path, n: number): Seg[] {
  const L = path.length;
  const out: Seg[] = [];
  const zero = new scope.Point(0, 0);
  const steps = path.closed ? n : n + 1;
  for (let k = 0; k < steps; k++) {
    const off = path.closed ? (L * k) / n : Math.min(L, (L * k) / n);
    out.push({ p: path.getPointAt(off) ?? path.firstSegment.point, i: zero, o: zero });
  }
  return out;
}

export function layoutBlend(scope: paper.PaperScope, group: paper.Group) {
  const blend = group.data.blend as Blend;
  for (const kid of [...group.children]) if (kid.data.gen) kid.remove();
  const ends = group.children.filter((c) => typeof c.data.blendEnd === "number").sort((x, y) => x.data.blendEnd - y.data.blendEnd);
  if (ends.length < 2) return;
  const [a, b] = ends;
  const steps = Math.max(1, Math.min(200, Math.round(blend.steps)));
  const paths = a instanceof scope.Path && b instanceof scope.Path;
  let sa: Seg[] = [];
  let sb: Seg[] = [];
  let resampled = false;
  if (paths) {
    const pa = a as paper.Path;
    const pb = b as paper.Path;
    if (pa.segments.length === pb.segments.length && pa.closed === pb.closed) {
      sa = pa.segments.map((s) => ({ p: s.point, i: s.handleIn, o: s.handleOut }));
      sb = pb.segments.map((s) => ({ p: s.point, i: s.handleIn, o: s.handleOut }));
    } else {
      const n = Math.min(160, Math.max(pa.segments.length, pb.segments.length, 8) * 4);
      sa = sample(scope, pa, n);
      sb = sample(scope, pb, n);
      resampled = true;
    }
    if (pa.closed && pb.closed) {
      let best = 0;
      let bestD = Infinity;
      for (let shift = 0; shift < sb.length; shift++) {
        let d = 0;
        for (let k = 0; k < sa.length; k += Math.max(1, Math.floor(sa.length / 16))) d += sa[k].p.getDistance(sb[(k + shift) % sb.length].p);
        if (d < bestD) {
          bestD = d;
          best = shift;
        }
      }
      sb = sb.map((_, k) => sb[(k + best) % sb.length]);
    }
  }
  for (let k = 1; k <= steps; k++) {
    const t = k / (steps + 1);
    let item: paper.Item;
    if (paths) {
      const lerp = (p: paper.Point, q: paper.Point) => p.add(q.subtract(p).multiply(t));
      const path = new scope.Path({
        segments: sa.map((s, i) => new scope.Segment(lerp(s.p, sb[i].p), lerp(s.i, sb[i].i), lerp(s.o, sb[i].o))),
        closed: (a as paper.Path).closed,
        insert: false
      });
      if (resampled) path.smooth({ type: "catmull-rom" });
      path.fillColor = mix(scope, a.fillColor, b.fillColor, t);
      path.strokeColor = mix(scope, a.strokeColor, b.strokeColor, t);
      path.strokeWidth = a.strokeWidth + (b.strokeWidth - a.strokeWidth) * t;
      path.strokeCap = a.strokeCap;
      path.strokeJoin = a.strokeJoin;
      item = path;
    } else {
      item = strip(scope, t < 0.5 ? a : b);
      item.position = a.bounds.center.add(b.bounds.center.subtract(a.bounds.center).multiply(t));
    }
    item.opacity = a.opacity + (b.opacity - a.opacity) * t;
    item.data.gen = true;
    item.insertBelow(b);
  }
}

export function layoutSymbols(scope: paper.PaperScope, art: paper.Item) {
  const masters = new Map<string, paper.Item>();
  for (const item of art.getItems({ recursive: true, match: (i: paper.Item) => typeof i.data?.symbol === "string" })) masters.set(item.data.symbol, item);
  for (const [id, master] of masters) {
    const at = master.bounds.center;
    const last = master.data.symbolAt as [number, number] | undefined;
    const moved = last ? at.subtract(new scope.Point(last[0], last[1])) : null;
    for (const inst of art.getItems({ recursive: true, match: (i: paper.Item) => i.data?.instanceOf === id }) as paper.Group[]) {
      if (moved && !moved.isZero()) inst.matrix = inst.matrix.clone().translate(moved.multiply(-1));
      inst.removeChildren();
      inst.addChild(strip(scope, master));
    }
    master.data.symbolAt = [at.x, at.y];
  }
}
