import { GEM_CHAR, NB_KINDS } from './consts.js';

// 6.3.5 - gem source.  Every column keeps its OWN pointer into the fixed
// pattern (table.txt / tableDuel.txt).  Because loopGems is false, a column
// that runs off the end of the table switches to weighted random for good,
// while the other columns keep walking the table.
export class GemGenerator {
  constructor(tableText, width) {
    this.width = width;
    this.rows = tableText.split(/\r?\n/)
      .map(l => l.replace(/[^rgby]/g, ''))
      .filter(l => l.length >= width);
    this.ptr = new Array(width).fill(0);
    this.weights = new Array(NB_KINDS).fill(12);   // equal probability
    this.weightSum = this.weights.reduce((a, b) => a + b, 0);
  }

  next(col) {
    if (this.ptr[col] < this.rows.length) {
      const ch = this.rows[this.ptr[col]][col];
      this.ptr[col]++;
      const k = GEM_CHAR[ch];
      if (k !== undefined) return k;
    }
    return this.random();
  }

  random() {
    let r = Math.random() * this.weightSum;
    for (let i = 0; i < this.weights.length; i++) {
      r -= this.weights[i];
      if (r < 0) return i;
    }
    return this.weights.length - 1;
  }
}
