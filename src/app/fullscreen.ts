type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
export function isFullscreen() {
  const d = document as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}
export function toggleFullscreen() {
  const d = document as FsDoc;
  const el = document.documentElement as FsEl;
  try {
    if (isFullscreen()) { (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d); }
    else (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el);
  } catch { /* unsupported (e.g. iPhone Safari) */ }
}
