// Survival mode (checklist 1.3, 1.4, 2.3.2, 2.3.3, 4.1.2, 4.2.5, 6.3, 7.2.1).
import { Controller } from '../kernel.js';
import { Display } from '../display.js';
import { GetTick } from '../time.js';
import { ALIGN_CENTERED, ALIGN_RIGHT } from '../font.js';
import { TextEvent } from '../events.js';
import { Table } from '../game/table.js';
import { GemGenerator } from '../game/gemgen.js';
import { GEMS_TO_LEVEL, SPEED_OF_LEVEL, GEM_SIZE } from '../game/consts.js';
import { Config } from '../config.js';
import {
  A_NOACTION, A_P1UP, A_P1DOWN, A_P1LEFT, A_P1RIGHT, A_P1EXTRA, A_QUITLOSE,
} from '../actions.js';
import { Sound, MUS } from '../sound.js';
import { toUnicode } from '../input.js';

const ST_PLAYING = 0, ST_LOSE = 1, ST_HIGHSCORE = 2;
const WIDTH = 9, HEIGHT = 12;
const XPOS = (640 - WIDTH * GEM_SIZE) / 2;   // 176
const YPOS = 50;

export class SurvivalController extends Controller {
  constructor(res, app) { super(); this.res = res; this.app = app; }

  start(character) {
    this.character = character;
    this.generator = new GemGenerator(this.res.tableTxt, WIDTH);
    this.table = new Table({
      width: WIDTH, height: HEIGHT, xPos: XPOS, yPos: YPOS, doors: true,
      res: this.res, character, generator: this.generator,
      timeBetweenLines: SPEED_OF_LEVEL[0], autoFillThreshold: 2,
    });
    this.level = 0;
    this.maxCombo = 0;
    this.startTick = GetTick();
    this.pausedTime = 0;
    this.state = ST_PLAYING;
    this.name = '';
    this.table.onLose = () => this.enterLose();
    this.table.onComboFinished = (n) => this.onCombo(n);
    this.table.fillInitial(3);
  }

  onEnable() {
    this.bindPlaying();
    this.clearEvents();
    Sound.playMusic(MUS.GAME);
  }

  bindPlaying() {
    this.clearBindings();
    const c = Config.controls;
    // 4.1.2 - up drops, down takes
    this.bind(c.p1up, A_P1UP);
    this.bind(c.p1down, A_P1DOWN);
    this.bind(c.p1left, A_P1LEFT);
    this.bind(c.p1right, A_P1RIGHT);
    this.bind(c.p1extra, A_P1EXTRA);
  }

  bindLost() {
    // 4.2.5 - everything is dead except ESC
    this.clearBindings();
    const c = Config.controls;
    this.bind(c.p1up, A_QUITLOSE);
    this.bind(c.p1down, A_QUITLOSE);
    this.bind(c.p1extra, A_QUITLOSE);
    this.bind(c.p1left, A_NOACTION);
    this.bind(c.p1right, A_NOACTION);
  }

  processKeyDown(sdl, ev) {
    if (this.state === ST_HIGHSCORE) return this.nameInput(sdl, ev);
    return super.processKeyDown(sdl, ev);
  }

  // 4.2.6 - 3 characters max; backspace always runs first
  nameInput(sdl, ev) {
    if (sdl === 13) {
      this.app.finishSurvival(this.name.trim() || '   ', this.table.set.score, this.character.name);
      return true;
    }
    if (sdl === 8) { this.name = this.name.slice(0, -1); return true; }
    const u = toUnicode(ev);
    if (u >= 32 && u < 128) {
      if (this.name.length < 3) this.name += String.fromCharCode(u);
      return true;
    }
    return true;
  }

  processEvent(action) {
    if (action === A_NOACTION || action === A_QUITLOSE) return false;
    switch (action) {
      case A_P1UP: this.table.dropGems(); return true;
      case A_P1DOWN: this.table.takeGems(); return true;
      case A_P1LEFT: this.table.moveLeft(); return true;
      case A_P1RIGHT: this.table.moveRight(); return true;
      case A_P1EXTRA: this.table.extraLine(false); return true;
    }
    return false;
  }

  onCombo(n) {
    if (n > this.maxCombo) this.maxCombo = n;
    if (n >= 2) {
      // 2.3.3
      this.addEvent(new TextEvent(this.res.fonts.big, n + ' combo hits!', 3, {
        x: [640, 640, 640], y: [460, 380, 360], alpha: [255, 128, 0],
      }, ALIGN_RIGHT));
    }
  }

  update() {
    this.table.update();

    if (this.state === ST_PLAYING) {
      // 6.3.3 - the level is only re-evaluated on a frame that burst something
      if (this.table.set.hasClashed) {
        let lvl = GEMS_TO_LEVEL.length - 1;
        for (let i = 0; i < GEMS_TO_LEVEL.length; i++) {
          if (this.table.set.nbGemsDropped < GEMS_TO_LEVEL[i]) { lvl = i; break; }
        }
        if (lvl !== this.level) {
          this.level = lvl;
          this.table.timeBetweenLines = SPEED_OF_LEVEL[lvl];
          // 2.3.2
          this.addEvent(new TextEvent(this.res.fonts.big, 'Level ' + (lvl + 1) + '!', 3, {
            x: [320, 320, 320], y: [-50, 100, 80], alpha: [255, 250, 0],
            scaleX: [0.5, 1, 2], scaleY: [0.5, 1, 2],
          }, ALIGN_CENTERED));
        }
      }
    } else if (this.state === ST_LOSE) {
      if (GetTick() - this.loseTick > 4000) {          // 7.2.1
        if (this.app.highScores.isBetterScore(this.table.set.score)) this.state = ST_HIGHSCORE;
        else this.app.finishSurvival(null, this.table.set.score, this.character.name);
      }
    }
  }

  enterLose() {
    this.state = ST_LOSE;
    this.loseTick = GetTick();
    this.pausedTime = GetTick() - this.startTick;
    this.table.keysEnabled = false;
    this.table.prepareFinish(true);     // 5.5.1
    this.bindLost();
  }

  display() {
    // 1.3.1 - opaque background
    Display.blitOpaque(this.res.img.terrain2, 0, 0);
    this.table.display();

    const f = this.res.fonts.big;
    const s = this.table.set;
    // 1.3.8
    f.draw(String(s.clashCount), 565, 150, ALIGN_CENTERED);
    f.draw(String(this.maxCombo), 565, 380, ALIGN_CENTERED);
    f.draw(String(s.score), 70, 130, ALIGN_CENTERED);
    f.draw(String(this.level + 1), 70, 290, ALIGN_CENTERED);
    f.draw(this.timeString(), 75, 450, ALIGN_CENTERED);

    if (this.state === ST_HIGHSCORE) {
      const m = this.res.fonts.text;
      m.draw('New high score!', 320, 200, ALIGN_CENTERED);
      m.draw('Enter your name', 320, 250, ALIGN_CENTERED);
      f.draw(this.name + (Math.floor(GetTick() / 400) % 2 ? '_' : ''), 320, 330, ALIGN_CENTERED);
    }
  }

  // 7.2.4 - m'ss
  timeString() {
    const ms = this.state === ST_PLAYING ? GetTick() - this.startTick : this.pausedTime;
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60), sec = total % 60;
    return m + "'" + (sec < 10 ? '0' : '') + sec;
  }
}
