// 1 player character select (checklist 1.6.1, 1.6.2, 2.6.5, 4.1.4).
import { Controller } from '../kernel.js';
import { Display } from '../display.js';
import { GetTimeElapsed } from '../time.js';
import { ALIGN_CENTERED, ALIGN_LEFT } from '../font.js';
import { BouncingText, MessageText } from '../events.js';
import { CHARACTERS } from '../game/consts.js';
import { Config } from '../config.js';
import {
  A_NOACTION, A_P1UP, A_P1DOWN, A_P1LEFT, A_P1RIGHT, A_P1EXTRA, A_ENTER, A_SPACE,
} from '../actions.js';
import { Sound, MUS } from '../sound.js';

const N = 10;
const OUT_CX = 845, OUT_CY = 350, OUT_R = 900, OUT_E = 1, OUT_OFF = -0.35;
const IN_CX = 380, IN_CY = 300, IN_R = 120, IN_E = 1.3;

export class CharSel1PController extends Controller {
  constructor(res, app) {
    super();
    this.res = res; this.app = app;
    this.arrow = res.arrowL.instance();
  }

  onEnable() {
    this.sel = 0;
    this.angle = Math.PI;
    this.clearBindings();
    const c = Config.controls;
    this.bind(c.p1left, A_P1LEFT); this.bind(c.p1right, A_P1RIGHT);
    this.bind(c.p1up, A_P1UP); this.bind(c.p1down, A_P1DOWN);
    this.bind(c.p1extra, A_P1EXTRA);
    this.bind(276, A_P1LEFT); this.bind(275, A_P1RIGHT);
    this.bind(13, A_ENTER); this.bind(32, A_SPACE);
    this.clearEvents();
    this.addEvent(new BouncingText(this.res.fonts.big, 'Character select', 320, 90));
    this.nameEvent = null;
    this.showName();
    Sound.playMusic(MUS.CHARSEL);
  }

  displayedIndex() {
    // 4.1.4 - reversed mapping
    return (N + (N - this.sel) % N) % N;
  }

  showName() {
    if (this.nameEvent) this.nameEvent.leave();     // 2.4.2
    const nm = CHARACTERS[this.displayedIndex()];
    this.nameEvent = this.addEvent(new MessageText(this.res.fonts.main, nm, 138, 120));
  }

  processEvent(action) {
    switch (action) {
      case A_NOACTION: return false;
      case A_P1LEFT: this.sel--; this.showName(); return true;
      case A_P1RIGHT: this.sel++; this.showName(); return true;
      case A_P1UP: case A_P1DOWN: case A_P1EXTRA: case A_ENTER: case A_SPACE:
        Display.flash();                       // 2.5.4
        this.app.startSurvival(CHARACTERS[this.displayedIndex()]);
        return true;
    }
    return false;
  }

  update() {
    // 2.6.5
    const wanted = this.sel * 2 * Math.PI / N + Math.PI;
    const d = Math.abs(wanted - this.angle);
    let speed;
    if (d < 0.001) speed = 0;
    else if (d < 0.03) speed = wanted > this.angle ? 0.0006 : -0.0006;
    else speed = (wanted - this.angle) * 0.03;
    this.angle += speed * (GetTimeElapsed() * 100);
    this.arrow.update();
  }

  display() {
    const chars = this.app.charCache;
    // Screen Y grows downwards, so the ellipse maps sin() with a minus sign.
    // That is what makes the -0.35 offset meaningful: at rest the SELECTED
    // character (the one the arrow points at on the inner ring) lands at
    // (-0.4, 41.4) on the left edge, and both of its neighbours are fully
    // off screen.  With +sin the ring is one step out of phase and the big
    // picture shows the wrong character.
    for (let i = 0; i < N; i++) {
      const a = this.angle + i * 2 * Math.PI / N + OUT_OFF;
      const x = OUT_CX + Math.cos(a) * OUT_R;
      const y = OUT_CY - Math.sin(a) * OUT_R / OUT_E;
      if (x > 640 || x < -300 || y > 480 || y < -400) continue;
      const c = chars[CHARACTERS[i]];
      if (c && c.big) Display.blit(c.big, x, y);
    }
    // inner ring - small heads
    for (let i = 0; i < N; i++) {
      const a = this.angle + i * 2 * Math.PI / N;
      const x = IN_CX + Math.cos(a) * IN_R;
      const y = IN_CY - Math.sin(a) * IN_R / IN_E;
      const c = chars[CHARACTERS[i]];
      if (c && c.small) Display.blit(c.small, x, y);
    }
    // 1.6.1 - left arrow
    this.arrow.display(IN_CX - 96, 312);
  }
}
