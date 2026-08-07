// Options / key configuration (checklist 7.3.4).
import { Controller } from '../kernel.js';
import { ALIGN_CENTERED, ALIGN_LEFT, ALIGN_RIGHT } from '../font.js';
import { BouncingText } from '../events.js';
import { Config } from '../config.js';
import { keyName } from '../input.js';
import { Sound, MUS } from '../sound.js';

const KEYS = ['p1up', 'p1down', 'p1left', 'p1right', 'p1extra',
              'p2up', 'p2down', 'p2left', 'p2right', 'p2extra'];
const LABELS = ['P1 drop', 'P1 take', 'P1 left', 'P1 right', 'P1 extra',
                'P2 drop', 'P2 take', 'P2 left', 'P2 right', 'P2 extra'];

export class ControlsController extends Controller {
  constructor(res, app) { super(); this.res = res; this.app = app; }

  onEnable() {
    this.sel = 0;
    this.waiting = false;
    this.clearEvents();
    this.addEvent(new BouncingText(this.res.fonts.big, 'Options', 320, 55));
    Sound.playMusic(MUS.MENU);
  }

  // Raw keys: this screen re-binds them, so the action table is bypassed.
  processKeyDown(sdl) {
    if (this.waiting) {
      Config.controls[KEYS[this.sel]] = sdl;
      Config.save();                       // written back immediately
      this.waiting = false;
      return true;
    }
    const N = KEYS.length + 1;   // + the OK button
    if (sdl === 273) { this.sel = (this.sel + N - 1) % N; return true; }
    if (sdl === 274) { this.sel = (this.sel + 1) % N; return true; }
    if (sdl === 13 || sdl === 32) {
      if (this.sel === KEYS.length) { this.app.gotoTitle(); return true; }
      this.waiting = true;
      return true;
    }
    return true;
  }

  display() {
    const f = this.res.fonts.main;
    for (let i = 0; i < KEYS.length; i++) {
      const y = 130 + i * 30;
      const o = i === this.sel ? null : { alpha: 120 };
      f.draw(LABELS[i], 150, y, ALIGN_LEFT, o);
      const v = (this.waiting && i === this.sel) ? '...' : keyName(Config.controls[KEYS[i]]);
      f.draw(v, 510, y, ALIGN_RIGHT, o);
    }
    f.draw('OK', 320, 440, ALIGN_CENTERED, this.sel === KEYS.length ? null : { alpha: 120 });
    f.draw('up down choose   enter rebind   esc quit', 320, 472, ALIGN_CENTERED, { alpha: 150 });
  }
}
