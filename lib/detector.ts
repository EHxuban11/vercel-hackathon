// Browser-side phone detection with YOLOv8n (COCO) via onnxruntime-web.
// Frames never leave the browser — inference is 100% local.

export const CELL_PHONE_CLASS = 67; // COCO class index for "cell phone"
const INPUT_SIZE = 640;

export type Detection = {
  /** confidence for "cell phone" of the best matching anchor, 0..1 */
  score: number;
  /** bounding box in source-video pixel coordinates, or null if below threshold */
  box: { x: number; y: number; w: number; h: number } | null;
};

// ort types are loaded dynamically to keep this module SSR-safe
type OrtModule = typeof import("onnxruntime-web");

export class PhoneDetector {
  private session: import("onnxruntime-web").InferenceSession | null = null;
  private ort: OrtModule | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private busy = false;

  async init(onProgress?: (msg: string) => void) {
    onProgress?.("Loading ONNX runtime…");
    const ort = await import("onnxruntime-web");
    // Serve the wasm binaries from CDN so we don't have to copy them into /public
    ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/";
    this.ort = ort;

    onProgress?.("Loading model (45 MB)…");
    // WebGPU when available (5-10x faster), WASM fallback
    try {
      this.session = await ort.InferenceSession.create("/models/yolov8s.onnx", {
        executionProviders: ["webgpu"],
      });
    } catch {
      onProgress?.("WebGPU unavailable, using WASM…");
      this.session = await ort.InferenceSession.create("/models/yolov8s.onnx", {
        executionProviders: ["wasm"],
      });
    }

    this.canvas = document.createElement("canvas");
    this.canvas.width = INPUT_SIZE;
    this.canvas.height = INPUT_SIZE;
    onProgress?.("Ready");
  }

  get ready() {
    return this.session !== null;
  }

  /**
   * Run one inference on the current video frame.
   * Returns null if the detector is busy (call sites should just skip the frame).
   */
  async detect(video: HTMLVideoElement, threshold = 0.35): Promise<Detection | null> {
    if (!this.session || !this.ort || !this.canvas || this.busy) return null;
    if (video.videoWidth === 0) return null;
    this.busy = true;
    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // Letterbox into 640x640
      const r = Math.min(INPUT_SIZE / vw, INPUT_SIZE / vh);
      const dw = Math.round(vw * r);
      const dh = Math.round(vh * r);
      const dx = Math.floor((INPUT_SIZE - dw) / 2);
      const dy = Math.floor((INPUT_SIZE - dh) / 2);

      const ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.fillStyle = "#727272";
      ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
      ctx.drawImage(video, dx, dy, dw, dh);

      const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
      const n = INPUT_SIZE * INPUT_SIZE;
      const input = new Float32Array(3 * n);
      for (let i = 0; i < n; i++) {
        input[i] = data[i * 4] / 255; // R
        input[n + i] = data[i * 4 + 1] / 255; // G
        input[2 * n + i] = data[i * 4 + 2] / 255; // B
      }

      const tensor = new this.ort.Tensor("float32", input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
      const inputName = this.session.inputNames[0];
      const outputName = this.session.outputNames[0];
      const results = await this.session.run({ [inputName]: tensor });
      const out = results[outputName];

      // YOLOv8 output: [1, 84, 8400] — 4 box coords + 80 class scores per anchor
      const [, channels, anchors] = out.dims as number[];
      const numClasses = channels - 4;
      const d = out.data as Float32Array;

      let bestScore = 0;
      let bestIdx = -1;
      const classOffset = (4 + CELL_PHONE_CLASS) * anchors;
      if (CELL_PHONE_CLASS < numClasses) {
        for (let i = 0; i < anchors; i++) {
          const s = d[classOffset + i];
          if (s > bestScore) {
            bestScore = s;
            bestIdx = i;
          }
        }
      }

      let box: Detection["box"] = null;
      if (bestIdx >= 0 && bestScore >= threshold) {
        const cx = d[bestIdx];
        const cy = d[anchors + bestIdx];
        const w = d[2 * anchors + bestIdx];
        const h = d[3 * anchors + bestIdx];
        // map back from letterboxed 640-space to video pixels
        box = {
          x: (cx - w / 2 - dx) / r,
          y: (cy - h / 2 - dy) / r,
          w: w / r,
          h: h / r,
        };
      }

      return { score: bestScore, box };
    } finally {
      this.busy = false;
    }
  }
}
