// Controller stack + main loop (checklist 1.1.3, 4.2.2, 4.2.3, 7.1).
import { Time } from './time.js';
import { Display } from './display.js';
import { toSDL, toUnicode } from './input.js';
import { Sound } from './sound.js';

export const KD_FRONT_POS = 0;
export const KD_LAST_POS = 1;
export const NOACTION = 0;

export class Controller {
  constructor() {
    this.events = [];
    this.keymap = new Map();   // sdl code -> action id
  }
  bind(code, action) { this.keymap.set(code, action); }
  clearBindings() { this.keymap.clear(); }

  onEnable() {}
  onDisable() {}
  update() {}
  display() {}

  // 4.2.4 - unbound keys map to action 0 and ProcessEvent(0) returns false.
  processKeyDown(sdl, ev) {
    const a = this.keymap.get(sdl);
    return this.processEvent(a === undefined ? NOACTION : a, ev);
  }
  processEvent(action, ev) { return false; }

  addEvent(e) { this.events.push(e); return e; }
  clearEvents() { this.events.length = 0; }
  updateEvents(dt) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      e.update(dt);
      if (e.dead) this.events.splice(i, 1);
    }
  }
  displayEvents() { for (const e of this.events) e.display(); }
}

export const Kernel = {
  controllers: [],          // index 0 == front
  _pendingAdd: [],
  _pendingDel: [],
  _keyQueue: [],
  stopEvent: false,
  running: false,

  enableController(c, pos = KD_FRONT_POS) { this._pendingAdd.push([c, pos]); },
  disableController(c) { this._pendingDel.push(c); },
  isEnabled(c) { return this.controllers.indexOf(c) >= 0; },

  pushKey(e) { this._keyQueue.push(e); },

  _applyPending() {
    // 7.1.2 - removals first, then additions.
    if (this._pendingDel.length) {
      for (const c of this._pendingDel) {
        const i = this.controllers.indexOf(c);
        if (i >= 0) { this.controllers.splice(i, 1); c.onDisable(); }
      }
      this._pendingDel.length = 0;
    }
    if (this._pendingAdd.length) {
      for (const [c, pos] of this._pendingAdd) {
        if (this.controllers.indexOf(c) >= 0) continue;
        if (pos === KD_LAST_POS) this.controllers.push(c);
        else this.controllers.unshift(c);
        c.onEnable();
      }
      this._pendingAdd.length = 0;
    }
  },

  start() {
    this.running = true;
    Time.init(performance.now());
    this._applyPending();
    const loop = (now) => {
      if (!this.running) return;
      Time.frame(now);
      this.frame();
      if (this.stopEvent || this.controllers.length === 0) { this.running = false; return; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  frame() {
    // 4.2.2 - all pending input is consumed before anything is drawn.
    const q = this._keyQueue;
    this._keyQueue = [];
    for (const ev of q) {
      const sdl = toSDL(ev);
      ev.sdl = sdl;
      ev.unicode = toUnicode(ev);
      if (sdl === 27) { this.stopEvent = true; continue; }   // 7.1.4 - ESC quits
      Sound.resume(); Sound.retryMusic();
      // 4.2.3 - dispatch front to back, stop at the first consumer.
      for (const c of this.controllers.slice()) {
        if (c.processKeyDown(sdl, ev)) break;
      }
    }

    const dt = Time.elapsed;
    for (const c of this.controllers.slice()) { c.update(); c.updateEvents(dt); }

    Display.updateFlash();
    Display.clearScreen();
    // 1.1.3 - reverse order; each controller draws itself then its events.
    for (let i = this.controllers.length - 1; i >= 0; i--) {
      const c = this.controllers[i];
      c.display();
      c.displayEvents();
    }

    this._applyPending();
  },
};
