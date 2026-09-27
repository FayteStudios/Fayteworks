declare module "imagetracerjs" {
  interface ImageTracer {
    imagedataToSVG(image: { width: number; height: number; data: Uint8ClampedArray }, options?: Record<string, unknown> | string): string;
  }
  const tracer: ImageTracer;
  export default tracer;
}
