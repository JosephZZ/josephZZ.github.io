// Title screen (checklist 1.2.2, 1.2.3, 2.5.2, 2.5.4, 2.6.2 - 2.6.4, 7.1.3).
import { Controller, Kernel } from '../kernel.js';
import { Display } from '../display.js';
import { GetTick, GetTimeElapsed } from '../time.js';
import { ALIGN_CENTERED } from '../font.js';
import { ParticleEmitter } from '../events.js';
import { ANIM_OFFSET, ANIM_OFFSET_SIZE } from '../game/consts.js';
import { A_SPACE, A_ENTER, A_NOACTION } from '../actions.js';
import { Sound, MUS } from '../sound.js';

const IDLE_TIMEOUT = 36200;     // 7.1.3

export class TitleController extends Controller {
  constructor(res, app) {
    super();
    this.res = res;
    this.app = app;
    this.bind(32, A_SPACE);
    this.bind(13, A_ENTER);
  }

  onEnable() {
    this.firstTick = GetTick();
    this.krystalX = -1100;      // 2.6.2
    this.dropY = -550;
    this.landedK = false;
    this.landedD = false;
    this.flashed = false;
    this.idxK = 0;
    this.idxD = 0;
    this.clearEvents();
    Sound.playMusic(MUS.TITLE);
  }

  processEvent(action) {
    if (action === A_NOACTION) return false;
    if (action === A_SPACE || action === A_ENTER) {
      Display.flash();          // 2.5.4
      this.app.gotoMenu();
      return true;
    }
    return false;
  }

  update() {
    const t = GetTick() - this.firstTick;
    const dt = GetTimeElapsed();

    if (t > 1000) {
      if (!this.landedK) {
        this.krystalX += 650 * dt;
        if (this.krystalX >= 70) { this.krystalX = 70; this.landedK = true; }
      } else if (this.idxK < ANIM_OFFSET_SIZE - 1) {
        this.idxK = Math.min(ANIM_OFFSET_SIZE - 1, this.idxK + 90 * dt);
      }
      if (!this.landedD) {
        this.dropY += 450 * dt;
        if (this.dropY >= 185) { this.dropY = 185; this.landedD = true; }
      } else if (this.idxD < ANIM_OFFSET_SIZE - 1) {
        this.idxD = Math.min(ANIM_OFFSET_SIZE - 1, this.idxD + 120 * dt);
      }
    }

    if (this.landedK && this.landedD && !this.flashed) {
      this.flashed = true;
      Display.flash();
      this.spawnFountains();    // 2.5.2
    }

    if (t > IDLE_TIMEOUT) this.app.gotoHighScores();
  }

  spawnFountains() {
    const s = this.res.star;
    const W = [255, 255, 255, 255];
    this.addEvent(new ParticleEmitter({
      sprite: s, x: 320, y: 480, vx: 0, vy: -400.5, gravity: 90,
      ttl: 11, interval: 20, color0: W, color1: [255, 0, 0, 0],
    }));
    this.addEvent(new ParticleEmitter({
      sprite: s, x: 0, y: 480, vx: 40, vy: -200.5, gravity: 90,
      ttl: 11, interval: 20, color0: W, color1: [0, 255, 255, 0],
    }));
    this.addEvent(new ParticleEmitter({
      sprite: s, x: 640, y: 480, vx: -40, vy: -200.5, gravity: 90,
      ttl: 11, interval: 20, color0: W, color1: [0, 255, 255, 0],
    }));
  }

  display() {
    const t = GetTick() - this.firstTick;
    // 1.2.2 / 2.6.3
    const kx = this.landedK ? 70 - ANIM_OFFSET[Math.floor(this.idxK)] : this.krystalX;
    const dy = this.landedD ? 185 - ANIM_OFFSET[Math.floor(this.idxD)] : this.dropY;
    Display.blit(this.res.img.title2, kx, 140);
    Display.blit(this.res.img.title3, 300, dy);

    const f = this.res.fonts.main;
    // 1.2.3 / 2.6.4
    if (t > 2000 && GetTick() % 1500 < 950) {
      f.draw('insert coin' + ' '.repeat(29) + 'insert coin', 320, 470, ALIGN_CENTERED);
    }
    if (t > 9000) f.draw('Press any key', 320, 340, ALIGN_CENTERED);
  }
}
