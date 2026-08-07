// One player's playfield: field + hand + clown + rendering + timers.
import { Display } from '../display.js';
import { GetTimeSlice, GetTick, GetTimeElapsed } from '../time.js';
import { Sound, SFX } from '../sound.js';
import { Set as GemSet } from './set.js';
import { Hand } from './hand.js';
import { Clown } from './clown.js';
import {
  GEM_SIZE, UPDATE_QUANTUM, ANIM_OFFSET_Y, HEIGHT_FIELD_IN_PIXEL,
  DROP_HAND_SPEED, DROP_HAND_ACCEL, FIELD_H,
} from './consts.js';

export const MOOD_GOOD = 0, MOOD_MEDIUM = 1, MOOD_TENSE = 2;

export class Table {
  constructor(o) {
    this.width = o.width;
    this.height = o.height;
    this.xPos = o.xPos;
    this.yPos = o.yPos;
    this.doors = !!o.doors;
    this.res = o.res;
    this.character = o.character;
    this.generator = o.generator;
    this.gemVolume = o.gemVolume;          // 3.3.2 (Duel lowers it to 50)
    this.autoFillThreshold = o.autoFillThreshold === undefined ? 2 : o.autoFillThreshold;

    this.set = new GemSet(this.width, this.height, o.res.gems);
    this.hand = new Hand();
    this.clown = new Clown(this.width, this.doors);
    this.param = { takeHand: false };      // 4.4.1 - one global take lock

    this.chibi = this.character.chibi.instance();
    this.lineInst = this.res.line.instance();
    this.doorLInst = this.res.doorl.instance();
    this.doorRInst = this.res.doorr.instance();
    this.borderInst = {
      bottombar: this.res.bottombar.instance(),
      horizontalbar: this.res.horizontalbar.instance(),
      verticalbar: this.res.verticalbar.instance(),
      upleftcorner: this.res.upleftcorner.instance(),
      uprightcorner: this.res.uprightcorner.instance(),
    };

    this.keysEnabled = true;
    this.timeBetweenLines = o.timeBetweenLines || 11000;
    this.nextLineTime = GetTick() + this.timeBetweenLines;
    this.nbLinesToAdd = 0;
    this.mood = MOOD_GOOD;
    this.maxHeight = 0;
    this.lost = false;

    this.onLose = null;
    this.onComboFinished = null;           // (clashCountFinished)
    this.onLevelWouldChange = null;

    this.finishGems = null;                // 5.5 settle animation
    this.finishMode = 0;                   // 1 = lose (no clip), 2 = win (clip)

    this.set.onTakeComplete = (row, block) => {
      this.hand.add(block.gems);
      this.param.takeHand = false;         // 5.3.5
    };
    this.set.onBurst = (clashBefore) => {
      // 3.2.4 - clash1 for the first burst of a combo ... clash13 and beyond
      const idx = clashBefore < 13 ? clashBefore : 12;
      Sound.play(SFX['clash' + (idx + 1)]);
      // 3.2.5 - character reactions
      const c = clashBefore + 1;
      if (c === 2) this.character.playEvent('attack');
      else if (c === 4) this.character.playEvent('strongattack');
    };
  }

  fillInitial(nbLines) {
    for (let i = 0; i < nbLines; i++) {
      for (let c = 0; c < this.width; c++) {
        this.set.rows[c].addGemAtTop(this.set.makeGem(this.generator.next(c)));
        const b = this.set.rows[c].blocks[0];
        b.posY = 0; b.speed = 0; b.accel = 0; b.state = 0;
      }
    }
  }

  // ---------------------------------------------------------------- update
  update() {
    // sprites advance on their own global grid, independent of the 20 ms tick
    this.set.updateSprites();
    this.hand.updateSprites();
    this.chibi.update();
    this.lineInst.update();
    this.doorLInst.update();
    this.doorRInst.update();
    this.clown.update(GetTimeElapsed());

    if (this.finishGems) { this.updateFinish(); return; }

    // 5.1.1 - integer number of 20 ms ticks elapsed; nothing moves otherwise
    const multiplier = GetTimeSlice(UPDATE_QUANTUM);
    if (multiplier === 0) { this.set.hasClashed = false; return; }   // 6.2.1

    this.set.update(multiplier);

    if (this.set.hasClashed) this.onClashed();

    if (this.set.clashCountFinished > 0) {
      const n = this.set.clashCountFinished;
      this.set.clashCountFinished = 0;
      if (this.onComboFinished) this.onComboFinished(n);
    }

    // ---- automatic new lines
    const now = GetTick();
    if (now >= this.nextLineTime) {
      this.nbLinesToAdd++;
      this.nextLineTime = now + this.timeBetweenLines;
    }
    // 4.4.6 - no new line while a combo is running
    if (this.nbLinesToAdd > 0 && this.set.clashCount === 0) {
      if (this.doAddLine()) this.nbLinesToAdd--;
    }

    // ---- overflow / auto refill (6.3.4, 6.4.1)
    if (this.set.checkOverflow) {
      if (this.set.clashCount === 0 && this.set.getMemoSize() === 0) {
        this.set.checkOverflow = false;
        this.maxHeight = this.set.getMaxHeight();
        this.updateMood();
        if (this.maxHeight <= this.autoFillThreshold && this.nbLinesToAdd === 0
            && this.hand.isEmpty() && this.set.clashCount === 0) {
          if (this.doAddLine()) this.nextLineTime = GetTick() + this.timeBetweenLines;
        }
        if (this.maxHeight > this.height && !this.lost) {   // 6.4.2 strictly greater
          this.lost = true;
          if (this.onLose) this.onLose();
        }
      }
    }
  }

  onClashed() {}

  updateMood() {
    // 6.4.3
    const h = this.maxHeight, H = this.height;
    let m;
    if (h * 4 > H * 3) m = MOOD_TENSE;
    else if (h * 2 > H) m = MOOD_MEDIUM;
    else m = MOOD_GOOD;
    if (m === MOOD_TENSE && this.mood !== MOOD_TENSE) this.character.playEvent('danger');
    this.mood = m;
  }

  doAddLine() {
    const ok = this.set.addLineAtTop(c => this.generator.next(c));
    // 3.2.1 - the drop sound only plays when a line really appeared
    if (ok) Sound.play(SFX.clapSound);
    return ok;
  }

  // ------------------------------------------------------------- commands
  moveLeft() {
    if (!this.keysEnabled) return;
    this.clown.moveLeft();
    // 4.3.5 - the walk animation only plays with empty hands
    if (this.hand.isEmpty()) this.chibi.setAnim(2);
  }
  moveRight() {
    if (!this.keysEnabled) return;
    this.clown.moveRight();
    if (this.hand.isEmpty()) this.chibi.setAnim(1);
  }

  takeGems() {
    if (!this.keysEnabled) return;
    if (this.param.takeHand) { this.failAction(); return; }      // 4.4.1
    if (this.hand.freeSpace() <= 0) { this.failAction(); return; }
    const row = this.set.rows[this.clown.pos];
    const taken = row.takeGems(this.hand.freeSpace(), this.hand.isEmpty() ? null : this.hand.kind());
    if (!taken) { this.failAction(); return; }
    for (const g of taken) this.set.forgetGem(g);                // 4.4.3
    this.param.takeHand = true;
    Sound.play(SFX.gemsDownSound, this.gemVolume);               // 3.1.2 / 3.2.2
    this.chibi.setAnim(5);
    this.lineInst.setAnim(1);
  }

  dropGems() {
    if (!this.keysEnabled) return;
    if (this.hand.isEmpty()) { this.failAction(); return; }      // 3.2.3
    const gems = this.hand.dropAll();
    this.set.rows[this.clown.pos].dropGems(gems, DROP_HAND_SPEED, DROP_HAND_ACCEL);
    Sound.play(SFX.gemsUpSound, this.gemVolume);
    this.chibi.setAnim(6);
    this.lineInst.setAnim(2);
  }

  failAction() { this.chibi.setAnim(3); }   // 4.3.6 - no sound on failure

  // 4.4.5
  extraLine(duel) {
    if (!this.keysEnabled) return;
    if (duel) {
      if (this.set.getMaxHeight() < this.height) {
        this.nbLinesToAdd++;
        this.nextLineTime = GetTick() + this.timeBetweenLines;
      }
    } else {
      this.nbLinesToAdd++;
    }
  }

  // Duel: receive an attack of n lines.
  receiveLines(n) {
    this.nbLinesToAdd += n;
    this.nextLineTime = GetTick() + this.timeBetweenLines;
    if (n >= 3) this.character.playEvent('attacked');            // 3.2.5
  }

  // ------------------------------------------------------------- finish fx
  prepareFinish(lose) {
    const list = [];
    this.set.forEachGem((g, col, block, idx) => {
      const f = g.spr.frame();
      if (!f || !f.img) return;
      const x = this.xPos + col * GEM_SIZE;
      const y = this.yPos + block.posY + ANIM_OFFSET_Y[block.extra] + idx * GEM_SIZE;
      if (lose) {
        // 5.5.1 - vx, vy uniform in [-640, 640] px/s ; gravity 960 px/s^2
        list.push({ img: f.img, x, y, vx: -640 + 1280 * Math.random(), vy: -640 + 1280 * Math.random() });
      } else {
        // 5.5.3
        list.push({ img: f.img, x, y, vx: 0, vy: -1 });
      }
    });
    this.finishGems = list;
    this.finishMode = lose ? 1 : 2;
  }

  updateFinish() {
    const dt = GetTimeElapsed();
    const bottom = (this.height - 1) * GEM_SIZE;                 // 352
    const right = (this.width - 1) * GEM_SIZE;
    for (const g of this.finishGems) {
      if (this.finishMode === 1) {
        g.vy += 960 * dt;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        // 5.5.2 - bounce with a 0.6 damping factor
        if (g.y - this.yPos > bottom) { g.y = this.yPos + bottom; g.vy = -g.vy * 0.6; }
        if (g.x < this.xPos) { g.x = this.xPos; g.vx = -g.vx * 0.6; }
        else if (g.x - this.xPos > right) { g.x = this.xPos + right; g.vx = -g.vx * 0.6; }
      } else {
        if (g.y >= this.yPos - GEM_SIZE) {
          g.vy += -40 * dt;
          g.y += g.vy * dt;
        }
      }
    }
  }

  // ---------------------------------------------------------------- render
  display() {
    const X = this.xPos, Y = this.yPos, W = this.width * GEM_SIZE, H = this.height * GEM_SIZE;

    // 1.3.3 - character picture: above the terrain, below border and gems
    if (this.character.bg) {
      Display.pushClip(X, Y, X + W, Y + H);
      Display.blit(this.character.bg, X, Y);
      Display.popClip();
    }

    // traction line (1.3.7): height-1 tiles
    Display.pushClip(X, Y, X + W, Y + H);
    for (let i = 0; i <= this.height - 2; i++) {
      this.lineInst.display(X + this.clown.posInPixels, Y + GEM_SIZE * i);
    }
    Display.popClip();

    // gems
    if (this.finishGems) {
      // 1.4.4 - losing is NOT clipped, winning IS
      if (this.finishMode === 2) Display.pushClip(X, Y, X + W, Y + H);
      for (const g of this.finishGems) Display.blit(g.img, g.x, g.y);
      if (this.finishMode === 2) Display.popClip();
    } else {
      Display.pushClip(X, Y, X + W, Y + H);
      this.set.forEachGem((g, col, block, idx) => {
        g.spr.display(X + col * GEM_SIZE,
          Y + block.posY + ANIM_OFFSET_Y[block.extra] + idx * GEM_SIZE);
      });
      Display.popClip();
    }

    this.displayBorder();

    // 1.3.5 - doors only exist in Survival
    if (this.doors) {
      this.doorLInst.display(X - 16, Y + H - 64);
      this.doorRInst.display(X + W - 16, Y + H - 64);
    }

    if (!this.finishGems) {
      // 1.3.6 - clown
      this.chibi.display(X + this.clown.posInPixels + 16, Y + H);
      this.displayHand();
    }
  }

  displayBorder() {
    const X = this.xPos, Y = this.yPos, W = this.width * GEM_SIZE, H = this.height * GEM_SIZE;
    const b = this.borderInst;
    // 1.3.4
    for (let x = X - 16; x < X + W; x += 32) b.bottombar.display(x, Y + H);
    for (let x = X; x < X + W; x += 32) b.horizontalbar.display(x, Y - 16);
    for (let y = Y; y < Y + H; y += 32) {
      b.verticalbar.display(X - 16, y);
      b.verticalbar.display(X + W, y);
    }
    b.upleftcorner.display(X - 16, Y - 16);
    b.uprightcorner.display(X + W, Y - 16);
  }

  displayHand() {
    // 1.4.1 / 1.4.2
    const XC = this.xPos + this.clown.posInPixels;
    const YC = this.yPos + this.height * GEM_SIZE - 48 + 3;
    const g = this.hand.gems;
    if (g.length === 0) return;
    if (g.length === 1) {
      g[0].spr.display(XC, YC);
    } else if (g.length === 2) {
      g[0].spr.display(XC - 6, YC);
      g[1].spr.display(XC + 6, YC);
    } else {
      g[2].spr.display(XC, YC - 6);
      g[1].spr.display(XC + 7, YC + 5);
      g[0].spr.display(XC - 7, YC + 5);
    }
  }
}

export { HEIGHT_FIELD_IN_PIXEL, FIELD_H };
