// ── Module-level reactive store for active text params ────────────────────
// Shared between TextPanel (sidebar), TextToolbar (canvas top), and CanvasArea (live preview)
import type { TextParams } from "./textRender";

type ParamsListener = (uploadId: number | null, params: TextParams | null) => void;
type PreviewListener = (uploadId: number, url: string | null) => void;

const paramsListeners = new Set<ParamsListener>();
const previewListeners = new Set<PreviewListener>();

let _uploadId: number | null = null;
let _params: TextParams | null = null;
const _previews = new Map<number, string>();

export const textParamsStore = {
  // ── Active params ──────────────────────────────────────────────────
  set(uploadId: number, params: TextParams) {
    _uploadId = uploadId;
    _params = params;
    paramsListeners.forEach(l => l(uploadId, params));
  },
  clear() {
    _uploadId = null;
    _params = null;
    paramsListeners.forEach(l => l(null, null));
  },
  get(): { uploadId: number | null; params: TextParams | null } {
    return { uploadId: _uploadId, params: _params };
  },
  subscribeParams(fn: ParamsListener): () => void {
    paramsListeners.add(fn);
    return () => paramsListeners.delete(fn);
  },

  // ── Live preview URLs (blob object URLs) ───────────────────────────
  setPreview(uploadId: number, url: string | null) {
    if (url) _previews.set(uploadId, url);
    else _previews.delete(uploadId);
    previewListeners.forEach(l => l(uploadId, url));
  },
  getPreview(uploadId: number): string | undefined {
    return _previews.get(uploadId);
  },
  subscribePreview(fn: PreviewListener): () => void {
    previewListeners.add(fn);
    return () => previewListeners.delete(fn);
  },
};
