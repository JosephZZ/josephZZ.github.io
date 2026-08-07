// 2 player character select (checklist 1.6.3, 2.6.6, 4.1.5).
import { Controller } from '../kernel.js';
import { Display } from '../display.js';
import { GetTimeElapsed, GetTick } from '../time.js';
import { BouncingText } from '../events.js';
import { CHARACTERS } from '../game/consts.js';
import { Config } from '../config.js';
import {
  A_NOACTION, A_P1UP, A_P1LEFT, A_P1RIGHT, A_P1EXTRA,
  A_P2UP, A_P2LEFT, A_P2RIGHT, A_P2EXTRA,
} from '../actions.js';
import { Sound, MUS } from '../sound.js';

const N = 10;
const XS = (640 - 90 * 5) / 2;     // 95
const YS = 320;
const STEP = 90;

class Side {
  constructor(sel) {
    this.sel = sel; this.shown = sel;
    this.angle = 0; this.flipping = false; this.swapped = false;
    this.confirmed = false;
  }
  change(d) {
    if (this.confirmed) return;
    this.sel = (this.sel + d + N) % N;
    if (this.sel !== this.shown) { this.flipping = true; this.swapped = false; this.angle = 0; }
  }
  update(dt) {
    if (!this.flipping) return;
    // 2.6.6 - 200 deg/s, image swap at 90 deg, mirrored fall back to 0
    if (!this.swapped) {
      this.angle += 200 * dt;
      if (this.angle >= 90) { this.shown = this.sel; this.angle = 180 - this.angle; this.swapped = true; }
    } else {
      this.angle -= 200 * dt;
      if (this.angle <= 0) { this.angle = 0; this.flipping = false; this.swapped = false; }
    }
  }
  scale() { return Math.abs(Math.cos(this.angle * Math.PI / 180)); }
}

export class CharSel2PController extends Controller {
  constructor(res, app) { super(); this.res = res; this.app = app; }

  onEnable() {
    this.p = [new Side(0), new Side(1)];
    this.headAngle = new Float64Array(N);
    this.readyTime = 0;
    this.clearBindings();
    const c = Config.controls;
    // 4.1.5 - directions reversed AND players swapped
    this.bind(c.p1right, A_P1RIGHT); this.bind(c.p1left, A_P1LEFT);
    this.bind(c.p1up, A_P1UP); this.bind(c.p1extra, A_P1EXTRA);
    this.bind(c.p2right, A_P2RIGHT); this.bind(c.p2left, A_P2LEFT);
    this.bind(c.p2up, A_P2UP); this.bind(c.p2extra, A_P2EXTRA);
    this.clearEvents();
    this.addEvent(new BouncingText(this.res.fonts.big, 'Character select', 320, 60));
    Sound.playMusic(MUS.CHARSEL);
  }

  processEvent(action) {
    switch (action) {
      case A_NOACTION: return false;
      case A_P1RIGHT: this.p[1].change(-1); return true;
      case A_P1LEFT: this.p[1].change(+1); return true;
      case A_P1UP: case A_P1EXTRA: this.confirm(1); return true;
      case A_P2RIGHT: this.p[0].change(-1); return true;
      case A_P2LEFT: this.p[0].change(+1); return true;
      case A_P2UP: case A_P2EXTRA: this.confirm(0); return true;
    }
    return false;
  }

  confirm(i) {
    if (this.p[i].confirmed) return;
    this.p[i].confirmed = true;
    this.headAngle[this.p[i].sel] = i === 0 ? 1800 : -1800;   // 2.6.6
    Display.flash();                                          // 2.5.4
    if (this.p[0].confirmed && this.p[1].confirmed) this.readyTime = GetTick();
  }

  update() {
    const dt = GetTimeElapsed();
    for (const s of this.p) s.update(dt);
    for (let i = 0; i < N; i++) {
      if (i === this.p[0].sel) this.headAngle[i] += 250 * dt;
      else if (i === this.p[1].sel) this.headAngle[i] -= 250 * dt;
      else this.headAngle[i] /= 1 + dt;
    }
    if (this.readyTime && GetTick() - this.readyTime > 2000) {
      this.app.startDuel(CHARACTERS[this.p[0].sel], CHARACTERS[this.p[1].sel]);
      this.readyTime = 0;
    }
  }

  display() {
    const chars = this.app.charCache;
    // 1.6.3 - big portraits (left compresses on Y, right on X)
    const bigPos = [[30, 50], [354, 50]];
    for (let i = 0; i < 2; i++) {
      const c = chars[CHARACTERS[this.p[i].shown]];
      if (!c || !c.big) continue;
      const k = this.p[i].scale();
      const w = c.big.width, h = c.big.height;
      const [x, y] = bigPos[i];
      if (i === 0) Display.blitEx(c.big, x, y + h * (1 - k) / 2, { scaleY: k });
      else Display.blitEx(c.big, x + w * (1 - k) / 2, y, { scaleX: k });
    }

    Display.blit(this.res.img.vs, 260, 210);

    // small heads: 5 x 2 grid
    for (let i = 0; i < N; i++) {
      const gx = XS + (i % 5) * STEP, gy = YS + Math.floor(i / 5) * STEP;
      const c = chars[CHARACTERS[i]];
      if (c && c.small) {
        Display.blitEx(c.small, gx + 32, gy + 32,
          { cx: 32, cy: 32, angle: this.headAngle[i] * Math.PI / 180 });
      }
      if (i === this.p[0].sel) Display.blit(this.res.img.borders1p, gx - 3, gy - 3);
      if (i === this.p[1].sel) Display.blit(this.res.img.borders2p, gx - 3, gy - 3);
    }
  }
}
