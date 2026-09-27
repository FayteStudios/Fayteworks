export interface TraceOptions {
  colors: number;
  omit: number;
  blur: number;
  corners: boolean;
}

export const TRACE_PRESETS: { id: string; label: string; options: TraceOptions }[] = [
  { id: "logo", label: "Logo / flat colours", options: { colors: 6, omit: 8, blur: 0, corners: false } },
  { id: "line", label: "Line art (black and white)", options: { colors: 2, omit: 12, blur: 0, corners: false } },
  { id: "smooth", label: "Smooth illustration", options: { colors: 8, omit: 16, blur: 4, corners: false } },
  { id: "detailed", label: "Detailed photo", options: { colors: 24, omit: 2, blur: 0, corners: false } }
];

export const TRACE_MAX_SIDE = 900;

type Rgba = { r: number; g: number; b: number; a: number };

export function dominantColors(image: ImageData, count: number): Rgba[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let transparent = 0;
  const { data } = image;
  const total = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) {
      transparent++;
      continue;
    }
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    b.n++;
    b.r += data[i];
    b.g += data[i + 1];
    b.b += data[i + 2];
    buckets.set(key, b);
  }
  const palette: Rgba[] = [];
  if (transparent / total > 0.01) palette.push({ r: 255, g: 255, b: 255, a: 0 });
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
  for (const b of sorted) {
    if (palette.length >= count) break;
    if (b.n / total < 0.001 && palette.length >= 2) break;
    const c = { r: Math.round(b.r / b.n), g: Math.round(b.g / b.n), b: Math.round(b.b / b.n), a: 255 };
    if (palette.some((p) => p.a > 0 && Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < 48)) continue;
    palette.push(c);
  }
  return palette;
}

export function tracerOptions(o: TraceOptions, palette?: Rgba[]): Record<string, unknown> {
  return {
    ...(palette?.length ? { pal: palette, numberofcolors: palette.length, colorquantcycles: 1, colorsampling: 0 } : { numberofcolors: Math.max(2, Math.min(64, Math.round(o.colors))), colorsampling: 2, colorquantcycles: 3 }),
    pathomit: Math.max(0, Math.round(o.omit)),
    blurradius: Math.max(0, Math.min(5, Math.round(o.blur))),
    blurdelta: 64,
    ltres: 0.5,
    qtres: 0.5,
    rightangleenhance: o.corners,
    linefilter: !o.corners,
    strokewidth: 1,
    roundcoords: 1,
    viewbox: true
  };
}

async function traceHere(image: ImageData, options: Record<string, unknown>): Promise<string> {
  const { default: tracer } = await import("imagetracerjs");
  return tracer.imagedataToSVG(image, options);
}

export function traceImageData(image: ImageData, options: TraceOptions): Promise<string> {
  const tracer = tracerOptions(options, options.colors <= 16 ? dominantColors(image, options.colors) : undefined);
  let worker: Worker;
  try {
    worker = new Worker(new URL("./traceWorker.ts", import.meta.url), { type: "module" });
  } catch {
    return traceHere(image, tracer);
  }
  return new Promise<string>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ svg?: string; error?: string }>) => {
      worker.terminate();
      if (e.data.svg !== undefined) resolve(e.data.svg);
      else reject(new Error(e.data.error ?? "Tracing failed."));
    };
    worker.onerror = () => {
      worker.terminate();
      traceHere(image, tracer).then(resolve, reject);
    };
    const pixels = image.data.slice().buffer;
    worker.postMessage({ width: image.width, height: image.height, data: pixels, options: tracer }, [pixels]);
  });
}
