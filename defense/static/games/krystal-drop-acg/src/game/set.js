// The playfield: a set of columns plus the burst / combo logic
// (checklist 5.3, 5.4, 6.1, 6.2, 6.4).
import { Row, Gem } from './row.js';
import { GEM_SIZE, FIELD_H, ST_NONE } from './consts.js';

export class Set {
  constructor(width, height, gemSprites) {
    this.width = width;
    this.height = height;
    this.gemSprites = gemSprites;          // kind -> Sprite
    this.rows = [];
    for (let i = 0; i < width; i++) this.rows.push(new Row(this, i));

    this.memo = [];                        // gems waiting for a burst test
    this.checkOverflow = false;
    this.clashCount = 0;
    this.clashCountFinished = 0;
    this.hasClashed = false;
    this.score = 0;
    this.nbGemsDropped = 0;
    this.maxHeight = 0;

    this.onTakeComplete = null;            // (row, block) -> void
    this.onBurst = null;                   // (clashCountBeforeIncrement) -> void
  }

  makeGem(kind) { return new Gem(kind, this.gemSprites[kind].instance()); }

  // ---- memo bookkeeping ------------------------------------------------
  memoGem(row, gem) {
    if (!gem || gem.removing) return;
    for (const m of this.memo) if (m.gem === gem) return;
    this.memo.push({ row, gem });
  }
  forgetGem(gem) {
    for (let i = this.memo.length - 1; i >= 0; i--) if (this.memo[i].gem === gem) this.memo.splice(i, 1);
  }
  getMemoSize() { return this.memo.length; }

  onTakeFinished(row, block) { if (this.onTakeComplete) this.onTakeComplete(row, block); }

  // ---- global predicates ----------------------------------------------
  isUpFinished() { for (const r of this.rows) if (!r.isUpFinished()) return false; return true; }
  isLineDown() { for (const r of this.rows) if (r.isLineDown()) return true; return false; }
  isRemoving() { for (const r of this.rows) if (r.isRemoving()) return true; return false; }
  getMaxHeight() {
    let m = 0;
    for (const r of this.rows) { const h = r.maxHeight(); if (h > m) m = h; }
    return m;
  }

  // ---- per-tick update -------------------------------------------------
  update(multiplier) {
    for (const r of this.rows) r.update(multiplier);

    // gems whose burst animation has ended actually vanish now
    let removed = 0;
    for (const r of this.rows) removed += r.processRemovals();
    if (removed > 0) {
      // 6.2.3 - score += nbRemoved * 2^clashCount  (clashCount already bumped)
      this.score += removed * Math.pow(2, this.clashCount);
      this.nbGemsDropped += removed;      // 6.2.4
    }

    // 6.1.1 - burst gate
    this.hasClashed = false;
    if (this.memo.length > 0 && this.isUpFinished() && !this.isLineDown()) {
      this.testBursts();
    }

    // 6.2.2 - end of combo.  Gems that are still playing their burst
    // animation have not "finished going up" yet: without this the counter
    // would reset during the ~0.5 s removal animation and every chain would
    // score 2x (see also 4.4.6 / 6.4.1, which both assume clash_count stays
    // non-zero for the whole chain).
    if (this.clashCount > 0 && this.memo.length === 0
        && this.isUpFinished() && !this.isRemoving()) {
      this.clashCountFinished = this.clashCount;
      this.clashCount = 0;
    }
    return removed;
  }

  testBursts() {
    const pending = this.memo;
    this.memo = [];
    for (const m of pending) {
      if (m.gem.removing) continue;                        // 6.1.5
      if (this.testBurstStart(m.row, m.gem)) {
        if (this.onBurst) this.onBurst(this.clashCount);   // 3.2.4 uses the pre-increment value
        this.clashCount++;                                 // 6.2.1
        this.hasClashed = true;
      }
    }
    // 6.1.5 - clear the visited marks after the round
    for (const r of this.rows) for (const b of r.blocks) for (const g of b.gems) g.visited = false;
  }

  // 6.1.3 - a burst only starts from a vertical run of >= 3 identical gems
  // inside the FIRST block of the column, and that block must be at rest.
  testBurstStart(row, gem) {
    const b = row.firstBlock();
    if (!b || b.state !== ST_NONE) return false;
    const idx = b.gems.indexOf(gem);
    if (idx < 0) return false;
    const kind = gem.kind;
    let lo = idx, hi = idx;
    while (lo - 1 >= 0 && b.gems[lo - 1].kind === kind && !b.gems[lo - 1].removing) lo--;
    while (hi + 1 < b.gems.length && b.gems[hi + 1].kind === kind && !b.gems[hi + 1].removing) hi++;
    if (hi - lo < 2) return false;
    this.recurseBurst(row.index, idx, kind);
    return true;
  }

  // 6.1.4 - four-way flood fill.  Columns are aligned by the *index inside
  // the first block*, not by world coordinates.
  recurseBurst(col, gemPos, kind) {
    if (col < 0 || col >= this.width) return;
    const b = this.rows[col].firstBlock();
    if (!b || b.state !== ST_NONE) return;
    if (gemPos < 0 || gemPos >= b.gems.length) return;   // == GetBlockNb() > gem_pos
    const g = b.gems[gemPos];
    if (g.visited || g.removing || g.kind !== kind) return;
    g.visited = true;
    g.removing = true;
    g.spr.setAnim(1);                                    // 2.2.1
    this.forgetGem(g);
    this.recurseBurst(col - 1, gemPos, kind);
    this.recurseBurst(col + 1, gemPos, kind);
    this.recurseBurst(col, gemPos + 1, kind);
    this.recurseBurst(col, gemPos - 1, kind);
  }

  // ---- line insertion (5.3.6) -----------------------------------------
  addLineAtTop(kindForColumn) {
    if (this.isLineDown()) return false;
    if (this.isRemoving()) return false;
    let added = false;
    for (let i = 0; i < this.width; i++) {
      const r = this.rows[i];
      if (r.countGems() > FIELD_H) continue;              // column is full
      r.addGemAtTop(this.makeGem(kindForColumn(i)));
      added = true;
    }
    if (added) this.checkOverflow = true;
    return added;
  }

  updateSprites() {
    for (const r of this.rows) for (const b of r.blocks) for (const g of b.gems) g.spr.update();
  }

  forEachGem(cb) {
    for (const r of this.rows) {
      for (const b of r.blocks) {
        for (let i = 0; i < b.gems.length; i++) cb(b.gems[i], r.index, b, i);
      }
    }
  }
}

export { GEM_SIZE };
