// High score table screen (checklist 1.6.4, 2.6.7, 7.1.3).
import { Controller } from '../kernel.js';
import { Display } from '../display.js';
import { GetTick, GetTimeElapsed } from '../time.js';
import { ALIGN_CENTERED, ALIGN_LEFT } from '../font.js';
import { CHARACTERS } from '../game/consts.js';
import { Sound, MUS } from '../sound.js';
import { A_NOACTION } from '../actions.js';

const TIMEOUT = 80000;

export class HighScoresController extends Controller {
  constructor(res, app) { super(); this.res = res; this.app = app; }

  onEnable() {
    this.firstTick = GetTick();
    this.R = 400;
    this.A = 0;
    this.clearBindings();
    for (let c = 32; c < 127; c++) this.bind(c, 1);
    this.bind(13, 1);
    for (const c of [273, 274, 275, 276, 303, 304, 305, 306]) this.bind(c, 1);
    this.clearEvents();
    Sound.playMusic(MUS.MENU);
  }

  processEvent(action) {
    if (action === A_NOACTION) return false;
    this.app.gotoTitle();
    return true;
  }

  update() {
    // 2.6.7 - spiral convergence
    const inc = GetTimeElapsed() * 100;
    this.R -= inc * 1.1;
    if (this.R <= 1) this.R = 0;
    this.A += inc * 0.04;
    if (GetTick() - this.firstTick > TIMEOUT) this.app.gotoTitle();
  }

  display() {
    const f = this.res.fonts.big;
    f.draw('High Scores\nSurvival mode', 320, 55, ALIGN_CENTERED);

    // Entries use the main font: at 0.5x a digit glyph is exactly 16 px wide,
    // which is the score column pitch given in 1.6.4.
    const e_ = this.res.fonts.main;
    const entries = this.app.highScores.entries;
    const dx = Math.cos(this.A) * this.R, dy = Math.sin(this.A) * this.R;
    const chars = this.app.charCache;

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const Y = 170 + i * 36;

      // name: 3 letters at X = 200 + j*30
      for (let j = 0; j < 3; j++) {
        const ch = e.name[j] || ' ';
        if (ch === ' ') continue;
        e_.draw(ch, 200 + j * 30 + dx, Y + dy, ALIGN_LEFT);
      }
      // score: digits laid out from the right, X = 430 - pos*16
      const s = String(e.score);
      for (let p = 0; p < s.length; p++) {
        const ch = s[s.length - 1 - p];
        e_.draw(ch, 430 - p * 16 + dx, Y + dy, ALIGN_LEFT);
      }
      // portrait slide-in
      let l = 2200 + (this.firstTick - GetTick()) / 2 + i * 100;
      if (l < 0) l = 0;
      const x = (i % 2 === 1) ? 460 + l : 105 - l;
      const c = chars[CHARACTERS[(e.info - 1 + 10) % 10]];
      if (c && c.small) Display.blit(c.small, x, 124 + i * 36);
    }
  }
}
