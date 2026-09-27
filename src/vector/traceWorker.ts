import tracer from "imagetracerjs";

self.onmessage = (e: MessageEvent<{ width: number; height: number; data: ArrayBuffer; options: Record<string, unknown> }>) => {
  try {
    const { width, height, data, options } = e.data;
    const svg = tracer.imagedataToSVG({ width, height, data: new Uint8ClampedArray(data) }, options);
    self.postMessage({ svg });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
