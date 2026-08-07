// Double Duel (checklist 1.5, 2.3.4 - 2.3.6, 3.3.2, 4.1.3, 6.5, 7.2.2).
import { Controller } from '../kernel.js';
import { Display } from '../display.js';
import { GetTick } from '../time.js';
import { ALIGN_CENTERED, ALIGN_LEFT, ALIGN_RIGHT } from '../font.js';
import { TextEvent, ParticleEmitter } from '../events.js';
import { Table } from '../game/table.js';
import { GemGenerator } from '../game/gemgen.js';
import { GEM_SIZE } from '../game/consts.js';
import { Config } from '../config.js';
import {
  A_NOACTION, A_P1UP, A_P1DOWN, A_P1LEFT, A_P1RIGHT, A_P1EXTRA,
  A_P2UP, A_P2DOWN, A_P2LEFT, A_P2RIGHT, A_P2EXTRA, A_QUITLOSE,
} from '../actions.js';
import { Sound, SFX, MUS } from '../sound.js';

const ST_READY = 0, ST_PLAYING = 1, ST_FINISH = 2, ST_CONTINUE = 3;
const WIDTH = 7, HEIGHT = 12;
const XPOS = [32, 384], YPOS = 50;
const NB_ROUNDS = 2;               // 6.5.1
const ROUND_TIME = 90000;          // 6.5.2
const TARGET_GEMS = 150;
const LINE_INTERVAL = 7000;

export class DuelController extends Controller {
  constructor(res, app) {
    super();
    this.res = res; this.app = app;
    this.cups = [0, 1, 2, 3].map(() => res.cup.instance());
  }

  start(c1, c2) {
    this.chars = [c1, c2];
    this.wins = [0, 0];
    this.round = 0;
    this.newRound();
  }

  onEnable() {
    this.bindPlaying();
    Sound.playMusic(MUS.GAME, 80);     // 3.3.2
  }

  bindPlaying() {
    this.clearBindings();
    const c = Config.controls;
    // 4.1.3 - p2 keys drive the LEFT table, p1 keys drive the RIGHT one
    this.bind(c.p2up, A_P2UP); this.bind(c.p2down, A_P2DOWN);
    this.bind(c.p2left, A_P2LEFT); this.bind(c.p2right, A_P2RIGHT);
    this.bind(c.p2extra, A_P2EXTRA);
    this.bind(c.p1up, A_P1UP); this.bind(c.p1down, A_P1DOWN);
    this.bind(c.p1left, A_P1LEFT); this.bind(c.p1right, A_P1RIGHT);
    this.bind(c.p1extra, A_P1EXTRA);
  }

  bindDisabled() {
    this.clearBindings();
    const c = Config.controls;
    for (const k of ['p1up', 'p1down', 'p1extra', 'p2up', 'p2down', 'p2extra']) this.bind(c[k], A_QUITLOSE);
    for (const k of ['p1left', 'p1right', 'p2left', 'p2right']) this.bind(c[k], A_NOACTION);
  }

  newRound() {
    this.tables = [0, 1].map(i => {
      const t = new Table({
        width: WIDTH, height: HEIGHT, xPos: XPOS[i], yPos: YPOS, doors: false,
        res: this.res, character: this.chars[i],
        generator: new GemGenerator(this.res.tableDuelTxt, WIDTH),
        timeBetweenLines: LINE_INTERVAL, autoFillThreshold: 3,
        gemVolume: 50,                                   // 3.3.2
      });
      t.onLose = () => this.endRound(1 - i);
      t.onComboFinished = (n) => this.onCombo(i, n);
      t.fillInitial(3);
      t.keysEnabled = false;
      return t;
    });
    this.state = ST_READY;
    this.stateTick = GetTick();
    this.clearEvents();
    this.winner = -1;
    this.bindPlaying();
    Sound.play(SFX.readyGoSound);
    // 2.3.6
    this.addEvent(new TextEvent(this.res.fonts.big, 'Ready?', 3, {
      x: [320, 320, 320], y: [-50, 240, 240], alpha: [255, 250, 0],
    }, ALIGN_CENTERED));
  }

  processEvent(action) {
    if (this.state === ST_CONTINUE) return this.continueEvent(action);
    if (action === A_NOACTION || action === A_QUITLOSE) return false;
    const t = this.tables;
    switch (action) {
      case A_P2UP: t[0].dropGems(); return true;
      case A_P2DOWN: t[0].takeGems(); return true;
      case A_P2LEFT: t[0].moveLeft(); return true;
      case A_P2RIGHT: t[0].moveRight(); return true;
      case A_P2EXTRA: t[0].extraLine(true); return true;
      case A_P1UP: t[1].dropGems(); return true;
      case A_P1DOWN: t[1].takeGems(); return true;
      case A_P1LEFT: t[1].moveLeft(); return true;
      case A_P1RIGHT: t[1].moveRight(); return true;
      case A_P1EXTRA: t[1].extraLine(true); return true;
    }
    return false;
  }

  // 7.2.3
  continueEvent(action) {
    if (action === A_NOACTION) return false;
    if (action === A_P1LEFT || action === A_P1RIGHT || action === A_P2LEFT || action === A_P2RIGHT) {
      this.timeOfNewState -= 1000;
      return true;
    }
    this.app.gotoCharSel2P();
    return true;
  }

  onCombo(i, n) {
    // 2.3.4
    if (n >= 2) {
      if (i === 0) {
        this.addEvent(new TextEvent(this.res.fonts.text, n + ' combo hits!', 3, {
          x: [-320, 0, 20], y: [40, 40, 40], alpha: [255, 150, 0],
        }, ALIGN_LEFT));
      } else {
        this.addEvent(new TextEvent(this.res.fonts.text, n + ' combo hits!', 3, {
          x: [960, 640, 620], y: [40, 40, 40], alpha: [255, 150, 0],
        }, ALIGN_RIGHT));
      }
    }
    // 6.5.3 - attack the opponent
    if (n > 1 && this.state === ST_PLAYING) {
      const other = 1 - i;
      this.tables[other].receiveLines(n);
      // 2.3.5 - warning on the attacked side
      const left = other === 0;
      this.addEvent(new TextEvent(this.res.fonts.text,
        'Warning!\n' + n + ' lines\ncoming!', 3, {
          x: left ? [20, 20, 20] : [620, 620, 620],
          y: [80, 80, 80],
          blinkVisible: 200, blinkInvisible: 200,
        }, left ? ALIGN_LEFT : ALIGN_RIGHT));
    }
  }

  update() {
    const now = GetTick();
    switch (this.state) {
      case ST_READY:
        for (const t of this.tables) t.update();
        if (now - this.stateTick > 3000) {                 // 7.2.2
          this.state = ST_PLAYING;
          this.stateTick = now;
          for (const t of this.tables) {
            t.keysEnabled = true;
            t.nextLineTime = now + LINE_INTERVAL;
          }
          this.addEvent(new TextEvent(this.res.fonts.big, 'GO!', 1, {
            x: [320, 320, 320], y: [240, 240, 240], alpha: [255, 250, 0],
            scaleX: [0.5, 1, 2], scaleY: [0.5, 1, 2],
          }, ALIGN_CENTERED));
        }
        break;

      case ST_PLAYING: {
        for (const t of this.tables) t.update();
        const g0 = this.tables[0].set.nbGemsDropped, g1 = this.tables[1].set.nbGemsDropped;
        // 6.5.2
        if (g0 >= TARGET_GEMS || g1 >= TARGET_GEMS) {
          if (g0 >= TARGET_GEMS && g1 >= TARGET_GEMS) this.endRound(-1);
          else this.endRound(g0 >= TARGET_GEMS ? 0 : 1);
        } else if (now - this.stateTick > ROUND_TIME) {
          if (g0 === g1) this.endRound(-1);
          else this.endRound(g0 > g1 ? 0 : 1);
        }
        break;
      }

      case ST_FINISH:
        for (const t of this.tables) t.update();
        if (!this.shownResult && now - this.stateTick > 2000) {
          this.shownResult = true;
          this.showResultText();
        }
        if (now - this.stateTick > 7000) {
          if (this.wins[0] >= NB_ROUNDS || this.wins[1] >= NB_ROUNDS) this.enterContinue();
          else this.newRound();
        }
        break;

      case ST_CONTINUE:
        if (now > this.timeOfNewState) this.app.gotoTitle();
        break;
    }
  }

  endRound(winner) {
    if (this.state === ST_FINISH) return;
    this.state = ST_FINISH;
    this.stateTick = GetTick();
    this.shownResult = false;
    this.winner = winner;
    for (const t of this.tables) t.keysEnabled = false;
    this.bindDisabled();
    if (winner >= 0) {
      this.wins[winner]++;
      this.tables[winner].prepareFinish(false);          // 5.5.3 rise
      this.tables[1 - winner].prepareFinish(true);       // 5.5.1 fall
      this.chars[winner].playEvent('winning');
      this.chars[1 - winner].playEvent('loosing');
      // 2.5.3 - victory fountains at the bottom corners of the winner's field
      const x0 = XPOS[winner], W = WIDTH * GEM_SIZE;
      for (const [x, vx] of [[x0, 50], [x0 + W, -50]]) {
        this.addEvent(new ParticleEmitter({
          sprite: this.res.star, x, y: YPOS + 384, vx, vy: -250, gravity: 90,
          ttl: 2, interval: 20, color0: [255, 255, 255, 255], color1: [255, 0, 0, 0],
        }));
      }
    } else {
      for (const t of this.tables) t.prepareFinish(true);
    }
  }

  showResultText() {
    const f = this.res.fonts.big;
    const say = (side, txt) => this.addEvent(new TextEvent(f, txt, 5, {
      x: [XPOS[side] + 112, XPOS[side] + 112, XPOS[side] + 112],
      y: [240, 240, 240], alpha: [255, 255, 255],
    }, ALIGN_CENTERED));
    // 1.5.4
    if (this.winner < 0) { say(0, 'Draw'); say(1, 'Draw'); }
    else { say(this.winner, 'Winner'); say(1 - this.winner, 'Loser'); }
  }

  enterContinue() {
    this.state = ST_CONTINUE;
    this.stateTick = GetTick();
    this.timeOfNewState = GetTick() + 15000;             // 7.2.2
    Sound.playMusic(MUS.LOSE, 80);
  }

  display() {
    Display.blitOpaque(this.res.img.terrainMulti, 0, 0);
    for (const t of this.tables) t.display();

    const f = this.res.fonts.big;
    // 1.5.2
    if (this.state === ST_PLAYING || this.state === ST_READY) {
      const left = Math.max(0, ROUND_TIME - (this.state === ST_PLAYING ? GetTick() - this.stateTick : 0));
      f.draw(String(Math.ceil(left / 1000)), 320, 182, ALIGN_CENTERED);
    }
    f.draw(String(Math.max(0, TARGET_GEMS - this.tables[0].set.nbGemsDropped)), 320, 310, ALIGN_CENTERED);
    f.draw(String(Math.max(0, TARGET_GEMS - this.tables[1].set.nbGemsDropped)), 320, 440, ALIGN_CENTERED);

    // 1.5.3 - trophies
    for (let i = 0; i < 4; i++) {
      const x = i < 2 ? 32 + 224 - (2 - i) * 32 : 384 + (i - 2) * 32;
      const owner = i < 2 ? 0 : 1;
      const idx = i < 2 ? i : i - 2;
      this.cups[i].setAnim(this.wins[owner] > idx ? 2 : 0);
      this.cups[i].update();
      this.cups[i].display(x, 442);
    }

    if (this.state === ST_CONTINUE) {
      const left = Math.max(0, Math.ceil((this.timeOfNewState - GetTick()) / 1000));
      const t = this.res.fonts.text;
      t.draw('Continue?', 320, 180, ALIGN_CENTERED);
      f.draw(String(Math.min(10, left)), 320, 280, ALIGN_CENTERED);
    }
  }
}
