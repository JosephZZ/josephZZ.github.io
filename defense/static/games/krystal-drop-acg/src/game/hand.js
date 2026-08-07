import { MAX_IN_HAND } from './consts.js';

// The gems the clown is carrying (checklist 1.4.2, 4.4.2, 4.4.4).
export class Hand {
  constructor() { this.gems = []; }
  isEmpty() { return this.gems.length === 0; }
  count() { return this.gems.length; }
  freeSpace() { return MAX_IN_HAND - this.gems.length; }
  kind() { return this.gems.length ? this.gems[0].kind : null; }
  add(gems) { for (const g of gems) this.gems.push(g); }
  // 4.4.4 - the whole hand is always dropped at once.
  dropAll() { const g = this.gems; this.gems = []; return g; }
  updateSprites() { for (const g of this.gems) g.spr.update(); }
}
