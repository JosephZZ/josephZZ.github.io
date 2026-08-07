// Display layer.  Logical resolution is always 640x480 (checklist 1.1.1);
// the canvas may be up-scaled by CSS but every coordinate below is in the
// 640x480 space.
import { Time } from './time.js';

export const SCREEN_W = 640;
export const SCREEN_H = 480;

export const Display = {
  canvas: null,
  ctx: null,
  clearR: 0, clearG: 0, clearB: 0,
  flashTime: 0,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = true;
  },

  // 1.1.4 - every frame starts by filling the screen with clearColor.
  clearScreen() {
    const c = this.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = `rgb(${this.clearR | 0},${this.clearG | 0},${this.clearB | 0})`;
    c.fillRect(0, 0, SCREEN_W, SCREEN_H);
    c.restore();
  },

  // 2.5.4 - Flash(): clear colour goes white and decays to black in 0.25 s.
  flash() { this.flashTime = 0.25; },

  updateFlash() {
    if (this.flashTime > 0) {
      this.flashTime -= Time.elapsed;
      if (this.flashTime < 0) this.flashTime = 0;
      const v = Math.min(1, this.flashTime * 4) * 255;
      this.clearR = this.clearG = this.clearB = v;
    } else {
      this.clearR = this.clearG = this.clearB = 0;
    }
  },

  setClearColor(r, g, b) { this.clearR = r; this.clearG = g; this.clearB = b; },

  pushClip(x, y, x2, y2) {
    const c = this.ctx;
    c.save();
    c.beginPath();
    c.rect(x, y, x2 - x, y2 - y);
    c.clip();
  },
  popClip() { this.ctx.restore(); },

  // Straight blit, top-left anchored.
  blit(img, x, y) {
    if (!img) return;
    this.ctx.drawImage(img, Math.round(x), Math.round(y));
  },

  // 1.3.1 / 1.8.2 - the terrain backgrounds are drawn with alpha blending
  // disabled: they completely overwrite whatever is below them.
  blitOpaque(img, x, y) {
    if (!img) return;
    const c = this.ctx;
    const prev = c.globalCompositeOperation;
    c.globalCompositeOperation = 'copy';
    c.drawImage(img, Math.round(x), Math.round(y));
    c.globalCompositeOperation = prev;
  },

  // General blit with alpha / scale / rotation / colour modulation.
  // (cx, cy) is the sprite pivot expressed in source pixels.
  blitEx(img, x, y, o) {
    if (!img) return;
    const c = this.ctx;
    const alpha = o.alpha === undefined ? 255 : o.alpha;
    if (alpha <= 0) return;
    const sx = o.scaleX === undefined ? 1 : o.scaleX;
    const sy = o.scaleY === undefined ? 1 : o.scaleY;
    if (sx === 0 || sy === 0) return;
    const cx = o.cx || 0, cy = o.cy || 0;
    const src = (o.r !== undefined && (o.r < 255 || o.g < 255 || o.b < 255))
      ? tint(img, o.r, o.g, o.b) : img;
    c.save();
    c.globalAlpha = Math.max(0, Math.min(1, alpha / 255));
    c.translate(x, y);
    if (o.angle) c.rotate(o.angle);
    if (sx !== 1 || sy !== 1) c.scale(sx, sy);
    c.drawImage(src, -cx, -cy);
    c.restore();
  },
};

// ---- colour modulation cache -------------------------------------------
const tintCache = new Map();
function tint(img, r, g, b) {
  const key = (img.__kdid || (img.__kdid = ++tintId)) + ':' + (r | 0) + ',' + (g | 0) + ',' + (b | 0);
  let cv = tintCache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const c = cv.getContext('2d');
  c.drawImage(img, 0, 0);
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
  c.fillRect(0, 0, cv.width, cv.height);
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(img, 0, 0);
  if (tintCache.size > 512) tintCache.clear();
  tintCache.set(key, cv);
  return cv;
}
let tintId = 0;
