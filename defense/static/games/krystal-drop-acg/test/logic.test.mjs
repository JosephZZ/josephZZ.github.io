// Node test for the DOM-free parts of the rules engine.
// Run:  node test/logic.test.mjs
import { Set as GemSet } from '../src/game/set.js';
import { Block } from '../src/game/row.js';
import {
  ANIM_OFFSET_Y, ST_NONE, ST_UP, GEM_SIZE, UPDATE_QUANTUM,
  GEMS_TO_LEVEL, SPEED_OF_LEVEL, MAX_IN_HAND, i16,
} from '../src/game/consts.js';
import { GemGenerator } from '../src/game/gemgen.js';
import { Clown } from '../src/game/clown.js';
import { computeChecksum } from '../src/highscore.js';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function eq(name, a, b) { ok(name, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} != ${JSON.stringify(b)}`); }

// ---- fake sprites -------------------------------------------------------
class FakeInstance {
  constructor() { this.anim = 0; this.done = false; }
  setAnim(n) { this.anim = n; this.done = false; }
  isFinished() { return this.anim === 1 && this.done; }
  update() {}
  finish() { this.done = true; }
}
const fakeSprites = {};
for (let i = 0; i < 4; i++) fakeSprites[i] = { instance: () => new FakeInstance() };

function mkSet(cols) {
  // cols: array of arrays of kinds, index 0 = top of column
  const s = new GemSet(cols.length, 12, fakeSprites);
  cols.forEach((col, i) => {
    if (!col.length) return;
    s.rows[i].blocks = [new Block(col.map(k => s.makeGem(k)), 0, 0, 0, ST_NONE)];
  });
  return s;
}
function finishAllRemoving(s) {
  s.forEachGem(g => { if (g.removing) g.spr.finish(); });
}

console.log('animation tables');
eq('ANIM_OFFSET_Y length', ANIM_OFFSET_Y.length, 31);
{
  const expect = [];
  for (let i = 1; i <= 30; i++) expect[30 - i] = Math.trunc(8 * Math.cos(4 * i / (2 * Math.PI)) * Math.exp(-0.03 * i));
  expect[30] = 0;
  eq('ANIM_OFFSET_Y values', Array.from(ANIM_OFFSET_Y), expect);
}

console.log('constants');
eq('UPDATE_QUANTUM', UPDATE_QUANTUM, 20);
eq('MAX_IN_HAND', MAX_IN_HAND, 14);
eq('gemsToLevel', GEMS_TO_LEVEL, [20, 50, 80, 120, 160, 200, 250, 300, 350, 400, 500, 600, 700, 800, 1000]);
eq('speedOfLevel', SPEED_OF_LEVEL, [11000, 9500, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3100, 2700, 2300, 2000, 1700, 1500]);
eq('i16 wraps', i16(40000), -25536);

console.log('C2 - horizontal 3 must NOT burst');
{
  // three reds side by side, same depth, nothing vertical
  const s = mkSet([[0, 1, 1], [0, 1, 1], [0, 1, 1]]);
  s.memoGem(s.rows[1], s.rows[1].blocks[0].gems[0]);
  s.testBursts();
  let removing = 0; s.forEachGem(g => { if (g.removing) removing++; });
  eq('nothing removed', removing, 0);
  eq('clashCount stays 0', s.clashCount, 0);
}

console.log('C2 - vertical 3 bursts');
{
  const s = mkSet([[1, 1, 1], [0, 2, 3], [0, 2, 3]]);
  s.memoGem(s.rows[0], s.rows[0].blocks[0].gems[0]);
  s.testBursts();
  let removing = 0; s.forEachGem(g => { if (g.removing) removing++; });
  eq('3 removed', removing, 3);
  eq('clashCount 1', s.clashCount, 1);
}

console.log('6.1.4 - flood fill spreads sideways once a vertical run ignites');
{
  //  col0: R R R   col1: R x x   -> the col1 top R is connected at index 0
  const s = mkSet([[0, 0, 0], [0, 1, 2], [1, 1, 2]]);
  s.memoGem(s.rows[0], s.rows[0].blocks[0].gems[0]);
  s.testBursts();
  let removing = 0; s.forEachGem(g => { if (g.removing) removing++; });
  eq('4 removed (3 vertical + 1 lateral)', removing, 4);
}

console.log('6.1.4 - cross-column alignment uses the block index, not screen Y');
{
  // col1 is shorter than the index we try to reach
  const s = mkSet([[1, 0, 0, 0], [0]]);
  s.memoGem(s.rows[0], s.rows[0].blocks[0].gems[1]);
  s.testBursts();
  const c1 = s.rows[1].blocks[0].gems[0];
  ok('col1 gem at index 0 not touched (indices 1..3 burst)', !c1.removing);
}

console.log('C5 - scoring 2^clashCount');
{
  const s = mkSet([[0, 0, 0], [1, 2, 3], [1, 2, 3]]);
  s.memoGem(s.rows[0], s.rows[0].blocks[0].gems[0]);
  s.testBursts();
  eq('clashCount after first burst', s.clashCount, 1);
  finishAllRemoving(s);
  s.update(1);
  eq('score 3 gems x 2^1', s.score, 6);
  eq('nbGemsDropped', s.nbGemsDropped, 3);
  // simulate a second burst of the same combo
  const s2 = mkSet([[0, 0, 0, 0], [1, 2, 3, 3]]);
  s2.clashCount = 1;
  s2.memoGem(s2.rows[0], s2.rows[0].blocks[0].gems[0]);
  s2.testBursts();
  eq('clashCount 2', s2.clashCount, 2);
  finishAllRemoving(s2);
  s2.update(1);
  eq('score 4 gems x 2^2', s2.score, 16);
}

console.log('5.4 - re-split after a burst');
{
  //         idx: 0 1 2 3 4      burst removes 1,2,3
  const s = mkSet([[3, 0, 0, 0, 2]]);
  s.memoGem(s.rows[0], s.rows[0].blocks[0].gems[1]);
  s.testBursts();
  finishAllRemoving(s);
  s.update(1);
  const r = s.rows[0];
  eq('two blocks left', r.blocks.length, 2);
  eq('first block keeps posY 0', r.blocks[0].posY, 0);
  eq('first block keeps state (top gem survived)', r.blocks[0].state, ST_NONE);
  eq('second block is UP', r.blocks[1].state, ST_UP);
  eq('second block posY', r.blocks[1].posY, 4 * GEM_SIZE);
}

console.log('5.4.2 - first block becomes UP when its top gem is destroyed');
{
  const s = mkSet([[0, 0, 0, 3]]);
  s.memoGem(s.rows[0], s.rows[0].blocks[0].gems[0]);
  s.testBursts();
  finishAllRemoving(s);
  s.update(1);
  eq('one block', s.rows[0].blocks.length, 1);
  eq('is UP', s.rows[0].blocks[0].state, ST_UP);
  eq('posY pushed down by 3 holes', s.rows[0].blocks[0].posY, 3 * GEM_SIZE);
}

console.log('6.2.2 - combo end');
{
  const s = mkSet([[0, 0, 0]]);
  s.memoGem(s.rows[0], s.rows[0].blocks[0].gems[0]);
  s.testBursts();
  finishAllRemoving(s);
  s.update(1);          // gems vanish, column empties
  s.update(1);          // memo empty + nothing moving -> combo closes
  eq('clashCountFinished', s.clashCountFinished, 1);
  eq('clashCount reset', s.clashCount, 0);
}

console.log('5.3.6 - AddLineAtTop refuses while removing / while a line falls');
{
  const s = mkSet([[0, 0, 0]]);
  s.memoGem(s.rows[0], s.rows[0].blocks[0].gems[0]);
  s.testBursts();
  ok('refused while removing', s.addLineAtTop(() => 1) === false);
  finishAllRemoving(s); s.update(1); s.update(1);
  ok('accepted afterwards', s.addLineAtTop(() => 1) === true);
  ok('IsLineDown now true', s.isLineDown());
  ok('refused while a line is falling', s.addLineAtTop(() => 1) === false);
}

console.log('5.3.7 - line insertion joins the first block when it is at rest');
{
  const s = mkSet([[0, 1]]);
  s.addLineAtTop(() => 2);
  const r = s.rows[0];
  eq('single block', r.blocks.length, 1);
  eq('3 gems', r.blocks[0].gems.length, 3);
  eq('new gem on top', r.blocks[0].gems[0].kind, 2);
  eq('posY reset above the field', r.blocks[0].posY, -32);
  eq('speed 3', r.blocks[0].speed, 3);
}

console.log('5.3.2 - falling line stops exactly at fieldY');
{
  const s = mkSet([[0]]);
  s.addLineAtTop(() => 0);
  const b = s.rows[0].blocks[0];
  s.update(1);                    // -32 + 3 = -29
  eq('after 1 tick', b.posY, -29);
  for (let i = 0; i < 20; i++) s.update(1);
  eq('clamped', b.posY, 0);
  eq('state cleared', b.state, ST_NONE);
}

console.log('5.1.2 - one multiply, not a loop');
{
  const s = mkSet([[0]]);
  s.addLineAtTop(() => 0);
  const b = s.rows[0].blocks[0];
  s.update(5);                    // speed 3, accel 0 -> -32 + 15
  eq('posY after multiplier 5', b.posY, -17);
}

console.log('4.4.2 / 5.3.5 - take, and 4.4.1 global lock');
{
  const s = mkSet([[1, 0, 0, 0]]);
  const taken = s.rows[0].takeGems(14, null);
  eq('took the 3 bottom reds', taken.length, 3);
  eq('remainder has spring extra=30', s.rows[0].blocks[0].extra, 30);
  eq('two blocks', s.rows[0].blocks.length, 2);
  let done = null;
  s.onTakeComplete = (row, blk) => { done = blk; };
  for (let i = 0; i < 200 && !done; i++) s.update(1);
  ok('take block eventually leaves the field', done !== null);
  eq('one block left', s.rows[0].blocks.length, 1);
}

console.log('4.4.2 - colour mismatch is refused');
{
  const s = mkSet([[1, 1, 0]]);
  ok('wrong colour refused', s.rows[0].takeGems(14, 2) === null);
  ok('matching colour accepted', s.rows[0].takeGems(14, 0) !== null);
}

console.log('4.4.2 - hand capacity clamps the take');
{
  const s = mkSet([[0, 0, 0, 0, 0]]);
  const t = s.rows[0].takeGems(2, 0);
  eq('only 2 taken', t.length, 2);
}

console.log('6.4.2 - maxHeight uses the first block only, loses above 12');
{
  const s = mkSet([new Array(13).fill(0)]);
  eq('maxHeight 13', s.getMaxHeight(), 13);
  ok('13 > 12 is a loss', s.getMaxHeight() > 12);
  const s2 = mkSet([new Array(12).fill(0)]);
  ok('exactly 12 survives', !(s2.getMaxHeight() > 12));
}

console.log('C15 - per column generator pointers');
{
  const tbl = 'rgb\nbgr\ngrb';
  const g = new GemGenerator(tbl, 3);
  eq('col0 row0', g.next(0), 0);
  eq('col0 row1', g.next(0), 2);
  eq('col0 row2', g.next(0), 1);
  eq('col1 still on row0', g.next(1), 1);
  const r = g.next(0);
  ok('col0 exhausted -> random', r >= 0 && r < 4);
  eq('col1 row1', g.next(1), 1);
}

console.log('4.3 - clown movement');
{
  const c = new Clown(9, true);
  c.posInPixels = 17;                 // mid-slide
  c.moveRight();
  eq('snap before move (4.3.2)', c.posInPixels, 0);
  eq('pos advanced', c.pos, 1);
  c.pos = 0; c.posInPixels = 0;
  c.moveLeft();
  eq('door wrap to last column', c.pos, 8);
  eq('door offset +16', c.posInPixels, 8 * 32 + 16);
  c.pos = 8; c.posInPixels = 256;
  c.moveRight();
  eq('door wrap to first column', c.pos, 0);
  eq('door offset -16', c.posInPixels, -16);
  const d = new Clown(7, false);
  d.pos = 0; d.posInPixels = 5;
  d.moveLeft();
  eq('no doors: pos unchanged', d.pos, 0);
  eq('no doors: still snapped', d.posInPixels, 0);
  // 20 columns per second
  const e = new Clown(9, false);
  e.pos = 5; e.posInPixels = 0;
  e.update(0.1);                       // 64 px
  eq('640 px/s', e.posInPixels, 64);
}

console.log('7.3.2 - high score checksum');
{
  const entries = [
    { name: 'Ark', score: 10000, info: 1 }, { name: 'Krs', score: 9000, info: 2 },
    { name: 'Imp', score: 8000, info: 3 }, { name: 'Ssb', score: 7000, info: 4 },
    { name: 'Keo', score: 6000, info: 5 }, { name: 'Tux', score: 5000, info: 6 },
    { name: 'Gpl', score: 2000, info: 7 }, { name: 'Ssh', score: 500, info: 8 },
    { name: 'XP!', score: 50, info: 9 },
  ];
  eq('matches the original survival.sco checksum', computeChecksum(entries).toString(16), '270c5');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
