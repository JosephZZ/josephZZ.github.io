// One column of the field.  A column is a list of *blocks*; each block is a
// run of gems that moves as a rigid body (checklist 5.3.1).
//
// Coordinate convention: posY is row-local, fieldY == 0 is the ceiling the
// gems hang from, the field bottom is HEIGHT_FIELD_IN_PIXEL (384).
import {
  GEM_SIZE, ST_NONE, ST_DOWN, ST_DROP, ST_UP, ST_TAKE,
  FIELD_Y, HEIGHT_FIELD_IN_PIXEL, ANIM_OFF_SIZE,
  LINE_DOWN_SPEED, LINE_DOWN_ACCEL, GEM_UP_SPEED, GEM_UP_ACCEL,
  TAKE_HAND_SPEED, TAKE_HAND_ACCEL, i16,
} from './consts.js';

export class Gem {
  constructor(kind, sprInst) {
    this.kind = kind;
    this.spr = sprInst;
    this.removing = false;
    this.visited = false;
  }
}

export class Block {
  constructor(gems, posY, speed, accel, state) {
    this.gems = gems;
    this.posY = posY;
    this.speed = speed;
    this.accel = accel;
    this.state = state;
    this.extra = 0;          // spring animation counter (2.2.2)
  }
  get nb() { return this.gems.length; }
}

export class Row {
  constructor(set, index) {
    this.set = set;
    this.index = index;
    this.blocks = [];
  }

  countGems() {
    let n = 0;
    for (const b of this.blocks) n += b.gems.length;
    return n;
  }
  firstBlock() { return this.blocks[0] || null; }
  lastBlock() { return this.blocks[this.blocks.length - 1] || null; }
  maxHeight() { return this.blocks.length ? this.blocks[0].gems.length : 0; }
  isLineDown() { return this.blocks.length > 0 && (this.blocks[0].state & ST_DOWN) !== 0; }
  isUpFinished() {
    for (const b of this.blocks) if (b.state & (ST_UP | ST_DROP)) return false;
    return true;
  }
  isRemoving() {
    for (const b of this.blocks) for (const g of b.gems) if (g.removing) return true;
    return false;
  }

  // ---- physics ---------------------------------------------------------
  update(multiplier) {
    // 2.2.4 - the spring counter ticks down once per update
    for (const b of this.blocks) if (b.extra > 0) b.extra--;

    // 5.1.2 - speed += accel*m ; posY += speed*m  (one multiply, 16 bit ints)
    for (const b of this.blocks) {
      if (b.state === ST_NONE) continue;
      b.speed = i16(b.speed + b.accel * multiplier);
      b.posY = i16(b.posY + b.speed * multiplier);
    }

    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      if (b.state === ST_NONE) continue;

      if (b.state & ST_DOWN) {
        // 5.3.2
        if (i === 0 && b.posY >= FIELD_Y) {
          b.posY = FIELD_Y; b.speed = 0; b.accel = 0; b.state = ST_NONE;
          this.set.checkOverflow = true;
        }
        continue;
      }

      if (b.state & ST_TAKE) {
        // 5.3.5
        if (i === this.blocks.length - 1 && b.posY > FIELD_Y + HEIGHT_FIELD_IN_PIXEL) {
          this.blocks.splice(i, 1);
          this.set.onTakeFinished(this, b);
          i--;
        }
        continue;
      }

      if (b.state & (ST_UP | ST_DROP)) {
        // 5.3.3
        const prev = i > 0 ? this.blocks[i - 1] : null;
        const yCompar = prev ? prev.posY + prev.gems.length * GEM_SIZE : FIELD_Y;
        if (b.posY <= yCompar) {
          // 5.3.4
          this.set.checkOverflow = true;
          const wasDrop = (b.state & ST_DROP) !== 0;
          if (!prev) {
            b.posY = yCompar; b.speed = 0; b.accel = 0; b.state = ST_NONE;
            if (wasDrop) b.extra = ANIM_OFF_SIZE;
            this.set.memoGem(this, b.gems[0]);
          } else {
            const joinAt = prev.gems.length;
            prev.gems = prev.gems.concat(b.gems);
            this.blocks.splice(i, 1);
            if (wasDrop) prev.extra = ANIM_OFF_SIZE;   // 2.2.3 (2)
            this.set.memoGem(this, prev.gems[joinAt]); // 6.1.2
            i--;
          }
        }
      }
    }
  }

  // ---- removal / re-split (5.4) ---------------------------------------
  processRemovals() {
    const b = this.blocks[0];
    if (!b) return 0;
    let any = false;
    for (const g of b.gems) if (g.removing && g.spr.isFinished()) { any = true; break; }
    if (!any) return 0;

    const old = b.gems;
    const gone = old.filter(g => g.removing && g.spr.isFinished());
    const topRemoved = old[0].removing && old[0].spr.isFinished();

    const newBlocks = [];
    let y = b.posY;
    let i = 0;
    while (i < old.length) {
      const g = old[i];
      if (g.removing && g.spr.isFinished()) { y += GEM_SIZE; i++; continue; }
      const start = i;
      while (i < old.length && !(old[i].removing && old[i].spr.isFinished())) i++;
      const run = old.slice(start, i);
      newBlocks.push(new Block(run, y, b.speed, b.accel, b.state));
      y += run.length * GEM_SIZE;
    }

    // 5.4.2
    for (let k = 0; k < newBlocks.length; k++) {
      const nb = newBlocks[k];
      if (k === 0 && !topRemoved) continue;   // keeps the original motion
      nb.state = ST_UP; nb.speed = GEM_UP_SPEED; nb.accel = GEM_UP_ACCEL;
    }
    for (const g of gone) this.set.forgetGem(g);

    this.blocks.splice(0, 1, ...newBlocks);
    this.set.checkOverflow = true;
    return gone.length;
  }

  // ---- line insertion (5.3.7) -----------------------------------------
  addGemAtTop(gem) {
    const b = this.blocks[0];
    if (!b || b.state !== ST_NONE) {
      this.blocks.unshift(new Block([gem], FIELD_Y - GEM_SIZE,
        LINE_DOWN_SPEED, LINE_DOWN_ACCEL, ST_DOWN));
    } else {
      b.gems.unshift(gem);
      b.posY = FIELD_Y - GEM_SIZE;
      b.speed = LINE_DOWN_SPEED;
      b.accel = LINE_DOWN_ACCEL;
      b.state = ST_DOWN;
    }
  }

  // ---- taking gems into the hand (4.4.2) ------------------------------
  // Returns the array of gems pulled out, or null.
  takeGems(maxCount, handKind) {
    const b = this.lastBlock();
    if (!b || b.gems.length === 0) return null;
    if (b.state !== ST_NONE && b.state !== ST_DOWN) return null;
    const bottom = b.gems[b.gems.length - 1];
    if (bottom.removing) return null;                        // being burst
    if (handKind !== null && handKind !== bottom.kind) return null;

    let n = 0;
    for (let i = b.gems.length - 1; i >= 0; i--) {
      const g = b.gems[i];
      if (g.kind === bottom.kind && !g.removing) n++; else break;
    }
    n = Math.min(n, maxCount);
    if (n <= 0) return null;

    const takenPosY = b.posY + (b.gems.length - n) * GEM_SIZE;
    const taken = b.gems.splice(b.gems.length - n, n);
    if (b.gems.length === 0) {
      this.blocks.splice(this.blocks.indexOf(b), 1);
    } else {
      b.extra = ANIM_OFF_SIZE;                               // 2.2.3 (1)
    }
    const nb = new Block(taken, takenPosY, TAKE_HAND_SPEED, TAKE_HAND_ACCEL, ST_TAKE);
    this.blocks.push(nb);
    return taken;
  }

  // ---- throwing gems back (4.4.4) -------------------------------------
  dropGems(gems, speed, accel) {
    const nb = new Block(gems, HEIGHT_FIELD_IN_PIXEL, speed, accel, ST_DROP);
    this.blocks.push(nb);
    return nb;
  }
}
