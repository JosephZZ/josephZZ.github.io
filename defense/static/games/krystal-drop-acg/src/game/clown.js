import { GEM_SIZE } from './consts.js';

// 4.3 - the clown.  `pos` is the logical column and changes instantly;
// `posInPixels` chases it at 20 columns per second.
export const CLOWN_SPEED_COLUMNS = 20;
export const CLOWN_SPEED_PX = CLOWN_SPEED_COLUMNS * GEM_SIZE;   // 640 px/s

export class Clown {
  constructor(width, doors) {
    this.width = width;
    this.doors = doors;
    this.pos = 0;
    this.posInPixels = 0;
  }

  // 4.3.2 - EVERY move first snaps the visual position onto the current
  // column, so repeated taps never accumulate lag.
  moveLeft() {
    this.posInPixels = this.pos * GEM_SIZE;
    if (this.pos > 0) {
      this.pos--;
    } else if (this.doors) {
      // 4.3.3 - walk out of the left door, in through the right one
      this.pos = this.width - 1;
      this.posInPixels = (this.width - 1) * GEM_SIZE + 16;
    }
  }

  moveRight() {
    this.posInPixels = this.pos * GEM_SIZE;
    if (this.pos < this.width - 1) {
      this.pos++;
    } else if (this.doors) {
      this.pos = 0;
      this.posInPixels = -16;
    }
  }

  update(dt) {
    const target = this.pos * GEM_SIZE;
    const step = CLOWN_SPEED_PX * dt;
    if (this.posInPixels < target) {
      this.posInPixels += step;
      if (this.posInPixels > target) this.posInPixels = target;   // exact snap
    } else if (this.posInPixels > target) {
      this.posInPixels -= step;
      if (this.posInPixels < target) this.posInPixels = target;
    }
  }
}
