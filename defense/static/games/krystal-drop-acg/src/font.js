// Bitmap font (checklist 1.7).
//   * glyph rectangles come from Slapstick.txt  -> "code x1 x2 y1 y2"
//   * line 2 of that file is "spaceSize returnSize"  (30 58)
//   * four derived sizes are pure scalings of the 1.0x font.
import { loadImage, loadText } from './resources.js';
import { Display } from './display.js';

export const ALIGN_LEFT = 0, ALIGN_CENTERED = 1, ALIGN_RIGHT = 2;

export class Font {
  constructor(img, glyphs, spaceSize, returnSize, scale) {
    this.img = img;
    this.glyphs = glyphs;          // code -> {x,y,w,h}
    this.scale = scale;
    this.spaceSize = Math.floor(spaceSize * scale);
    this.returnSize = Math.floor(returnSize * scale);
    this.def = glyphs[0] || { x: 0, y: 0, w: 4, h: 4 };
    // 1.7.2 - "spacing" is the glyph advance, scaled with the font and
    // truncated to an integer.
    this.spacing = new Map();
    for (const k in glyphs) this.spacing.set(+k, Math.floor(glyphs[k].w * scale));
  }

  static async loadFamily() {
    const [img, txt] = await Promise.all([
      loadImage('Slapstick.png'), loadText('Slapstick.txt'),
    ]);
    const lines = txt.split(/\r?\n/);
    let spaceSize = 30, returnSize = 58, gotHeader = false;
    const glyphs = {};
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) continue;
      const parts = l.split(/\s+/);
      if (!gotHeader) {
        if (parts.length === 2 && parts.every(isInt)) {
          spaceSize = +parts[0]; returnSize = +parts[1]; gotHeader = true;
        }
        continue;
      }
      if (parts.length === 5 && parts.every(isInt)) {
        const code = +parts[0], x1 = +parts[1], x2 = +parts[2], y1 = +parts[3], y2 = +parts[4];
        glyphs[code] = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      }
    }
    return {
      big: new Font(img, glyphs, spaceSize, returnSize, 1.0),
      text: new Font(img, glyphs, spaceSize, returnSize, 0.8),
      medium: new Font(img, glyphs, spaceSize, returnSize, 0.7),
      main: new Font(img, glyphs, spaceSize, returnSize, 0.5),
    };
  }

  advance(code) {
    if (code === 32) return this.spaceSize;
    const s = this.spacing.get(code);
    return s === undefined ? Math.floor(this.def.w * this.scale) : s;
  }

  // 1.7.4 - length of the longest line.
  computeLength(str) {
    let best = 0, cur = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c === 10) { if (cur > best) best = cur; cur = 0; continue; }
      cur += this.advance(c);
    }
    return cur > best ? cur : best;
  }

  height() { return this.returnSize; }

  // 1.7.3 - `y` is the BOTTOM of the glyphs.
  draw(str, x, y, align = ALIGN_LEFT, opts = null) {
    const sX = (opts && opts.scaleX !== undefined) ? opts.scaleX : 1;
    const sY = (opts && opts.scaleY !== undefined) ? opts.scaleY : 1;
    let startX = x;
    if (align === ALIGN_CENTERED) startX = x - (this.computeLength(str) * sX) / 2;
    else if (align === ALIGN_RIGHT) startX = x - this.computeLength(str) * sX;
    let px = startX, py = y;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c === 10) { px = startX; py += this.returnSize * sY; continue; }
      if (c === 32) { px += this.spaceSize * sX; continue; }
      const g = this.glyphs[c] || this.def;
      const w = g.w * this.scale * sX, h = g.h * this.scale * sY;
      if (g.w > 0 && g.h > 0) {
        drawGlyph(this.img, g, px, py - h, w, h, opts);
      }
      px += this.advance(c) * sX;
    }
  }
}

const scratch = document.createElement('canvas');
const sctx = scratch.getContext('2d');

function drawGlyph(img, g, dx, dy, dw, dh, opts) {
  const c = Display.ctx;
  let src = img, sx = g.x, sy = g.y, sw = g.w, sh = g.h;
  // colour modulation (2.3.1): r/g/b are interpolated per event.
  if (opts && opts.r !== undefined && (opts.r < 255 || opts.g < 255 || opts.b < 255)) {
    scratch.width = g.w; scratch.height = g.h;
    sctx.clearRect(0, 0, g.w, g.h);
    sctx.globalCompositeOperation = 'source-over';
    sctx.drawImage(img, g.x, g.y, g.w, g.h, 0, 0, g.w, g.h);
    sctx.globalCompositeOperation = 'multiply';
    sctx.fillStyle = `rgb(${opts.r | 0},${opts.g | 0},${opts.b | 0})`;
    sctx.fillRect(0, 0, g.w, g.h);
    sctx.globalCompositeOperation = 'destination-in';
    sctx.drawImage(img, g.x, g.y, g.w, g.h, 0, 0, g.w, g.h);
    src = scratch; sx = 0; sy = 0;
  }
  c.save();
  if (opts && opts.alpha !== undefined) c.globalAlpha = Math.max(0, Math.min(1, opts.alpha / 255));
  if (opts && opts.angle) {
    c.translate(dx + dw / 2, dy + dh / 2);
    c.rotate(opts.angle);
    c.drawImage(src, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  } else {
    c.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
  }
  c.restore();
}

function isInt(s) { return /^-?\d+$/.test(s); }
