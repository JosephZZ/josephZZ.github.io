// Sprite engine.  Animation descriptions come straight from the original
// .spr files (allowed by the checklist preamble); the *semantics* below are
// re-implemented from checklist 2.1.
import { GetTimeSlice } from './time.js';
import { loadImage, loadText, dirOf } from './resources.js';
import { Display } from './display.js';

export class Anim {
  constructor() {
    this.frames = [];   // {img, xc, yc}
    this.next = null;   // goto anim="N"
    this.onlyOnce = false;
  }
}

export class Sprite {
  constructor(fps) {
    this.fps = fps;
    // 2.1.1 - the frame quantum is an integer number of milliseconds.
    this.msecBetweenFrames = Math.floor(1000 / fps);
    this.anims = [];
  }
  static async load(path) {
    const txt = await loadText(path);
    const doc = new DOMParser().parseFromString(txt, 'text/xml');
    const root = doc.getElementsByTagName('sprite')[0];
    const spr = new Sprite(parseInt(root.getAttribute('fps'), 10) || 1);
    const dir = dirOf(path);
    const jobs = [];
    for (const an of root.getElementsByTagName('anim')) {
      const a = new Anim();
      for (const node of an.children) {
        if (node.tagName === 'file') {
          const fr = {
            img: null,
            xc: parseInt(node.getAttribute('xcenter') || '0', 10),
            yc: parseInt(node.getAttribute('ycenter') || '0', 10),
          };
          a.frames.push(fr);
          jobs.push(loadImage(dir + node.getAttribute('name')).then(im => { fr.img = im; }));
        } else if (node.tagName === 'goto') {
          a.next = parseInt(node.getAttribute('anim'), 10);
        } else if (node.tagName === 'onlyonce') {
          a.onlyOnce = true;
        }
      }
      spr.anims.push(a);
    }
    await Promise.all(jobs);
    return spr;
  }
  instance() { return new SpriteInstance(this); }
}

export class SpriteInstance {
  constructor(sprite) {
    this.sprite = sprite;
    this.currentAnim = 0;
    this.currentFrame = 0;
    this.finished = false;   // "onlyonce" reached its last frame
    this.onFinishAnim = null;
  }

  // 2.1.3 - setAnim resets the frame counter and clears the finished flag.
  setAnim(n) {
    if (n === this.currentAnim && this.currentFrame === 0 && !this.finished) return;
    this.currentAnim = n;
    this.currentFrame = 0;
    this.finished = false;
  }

  getAnim() { return this.currentAnim; }
  isFinished() { return this.finished; }

  update() {
    const spr = this.sprite;
    this.currentFrame += GetTimeSlice(spr.msecBetweenFrames);
    let guard = 0;
    for (;;) {
      const a = spr.anims[this.currentAnim];
      if (!a || a.frames.length === 0) return;
      if (this.currentFrame < a.frames.length) return;
      // 2.1.2
      if (a.onlyOnce || a.next === null) {
        this.currentFrame = a.frames.length - 1;
        if (!this.finished) {
          this.finished = true;
          if (this.onFinishAnim) this.onFinishAnim(this);
        }
        return;
      }
      this.currentFrame -= a.frames.length;
      this.currentAnim = a.next;
      if (++guard > 64) { this.currentFrame = 0; return; }
    }
  }

  frame() {
    const a = this.sprite.anims[this.currentAnim];
    if (!a) return null;
    let i = this.currentFrame;
    if (i < 0) i = 0;
    if (i >= a.frames.length) i = a.frames.length - 1;
    return a.frames[i];
  }

  // Draw with the frame's own pivot subtracted (checklist 1.3.6).
  display(x, y, opts) {
    const f = this.frame();
    if (!f || !f.img) return;
    if (opts) Display.blitEx(f.img, x, y, Object.assign({ cx: f.xc, cy: f.yc }, opts));
    else Display.blit(f.img, x - f.xc, y - f.yc);
  }

  width() { const f = this.frame(); return f && f.img ? f.img.width : 0; }
  height() { const f = this.frame(); return f && f.img ? f.img.height : 0; }
}
