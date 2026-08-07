// Game-select menu (checklist 1.2.4, 7.1.3).
import { Controller } from '../kernel.js';
import { ALIGN_CENTERED } from '../font.js';
import { BouncingText, MessageText } from '../events.js';
import { A_NOACTION, A_MENUUP, A_MENUDOWN, A_ENTER, A_SPACE } from '../actions.js';
import { Config } from '../config.js';
import { Sound, MUS } from '../sound.js';

const ITEMS = ['Survival', 'Double Duel', 'Options'];
const HELP = ['Solo game', '2 players vs', 'Options'];
const Y = [220, 280, 340];

export class MenuController extends Controller {
  constructor(res, app) {
    super();
    this.res = res; this.app = app; this.sel = 0;
  }

  onEnable() {
    this.sel = 0;
    this.clearBindings();
    const c = Config.controls;
    this.bind(c.p1up, A_MENUUP); this.bind(c.p1down, A_MENUDOWN);
    this.bind(c.p2up, A_MENUUP); this.bind(c.p2down, A_MENUDOWN);
    this.bind(273, A_MENUUP); this.bind(274, A_MENUDOWN);
    this.bind(13, A_ENTER); this.bind(32, A_SPACE);
    this.bind(c.p1extra, A_ENTER); this.bind(c.p2extra, A_ENTER);
    this.clearEvents();
    this.title = this.addEvent(new BouncingText(this.res.fonts.big, 'Game select', 320, 90));
    this.help = this.addEvent(new MessageText(this.res.fonts.main, HELP[0], 320, 420));
    if (Sound._musicPath !== MUS.TITLE) Sound.playMusic(MUS.TITLE);
  }

  setSel(n) {
    this.sel = (n + ITEMS.length) % ITEMS.length;
    this.help.leave();          // 2.4.2 - fly-apart exit, then self destruct
    this.help = this.addEvent(new MessageText(this.res.fonts.main, HELP[this.sel], 320, 420));
  }

  processEvent(action) {
    switch (action) {
      case A_NOACTION: return false;
      case A_MENUUP: this.setSel(this.sel - 1); return true;
      case A_MENUDOWN: this.setSel(this.sel + 1); return true;
      case A_ENTER: case A_SPACE:
        if (this.sel === 0) this.app.gotoCharSel1P();
        else if (this.sel === 1) this.app.gotoCharSel2P();
        else this.app.gotoControls();
        return true;
    }
    return false;
  }

  display() {
    const f = this.res.fonts.text;
    for (let i = 0; i < ITEMS.length; i++) {
      f.draw(ITEMS[i], 320, Y[i], ALIGN_CENTERED, i === this.sel ? null : { alpha: 110 });
    }
  }
}
