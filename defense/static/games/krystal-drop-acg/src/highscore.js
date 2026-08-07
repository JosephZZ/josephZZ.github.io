// High score table (checklist 7.3.1 - 7.3.3).
// Format:  "%hx %hx %hx\n"  (max_scores, name_len, nb_scores)
//          <3 raw name bytes>" %x %x\n"  (score, character id)
//          "%x\n"            (checksum)
// Checksum: check = 1 ; m = 0 ; for every name byte: m ^= c, check += m ;
//           then check += score * info   (m persists across entries)
import { loadText } from './resources.js';

export const MAX_SCORES = 9;
export const NAME_LEN = 3;
const LS_KEY = 'krystaldrop.survival.sco';

export function computeChecksum(entries) {
  let check = 1, m = 0;
  for (const e of entries) {
    const n = padName(e.name);
    for (let i = 0; i < NAME_LEN; i++) { m ^= n.charCodeAt(i); check += m; }
    check += e.score * e.info;
  }
  return check >>> 0;
}

function padName(n) { return (n + '   ').slice(0, NAME_LEN); }

export function serialize(entries) {
  let s = `${MAX_SCORES.toString(16)} ${NAME_LEN.toString(16)} ${entries.length.toString(16)}\n`;
  for (const e of entries) s += `${padName(e.name)} ${e.score.toString(16)} ${e.info.toString(16)}\n`;
  s += computeChecksum(entries).toString(16) + '\n';
  return s;
}

export function parse(text) {
  const lines = text.split(/\r?\n/);
  const head = lines[0].trim().split(/\s+/);
  if (head.length < 3) return null;
  const nb = parseInt(head[2], 16);
  if (!(nb > 0 && nb <= 64)) return null;
  const entries = [];
  for (let i = 0; i < nb; i++) {
    const l = lines[1 + i];
    if (l === undefined || l.length < NAME_LEN + 1) return null;
    const name = l.slice(0, NAME_LEN);
    const rest = l.slice(NAME_LEN).trim().split(/\s+/);
    if (rest.length < 2) return null;
    entries.push({ name, score: parseInt(rest[0], 16), info: parseInt(rest[1], 16) });
  }
  const sum = parseInt((lines[1 + nb] || '').trim(), 16);
  if (!Number.isFinite(sum) || (computeChecksum(entries) >>> 0) !== (sum >>> 0)) return null;  // corrupt
  return entries;
}

export class HighScoreTable {
  constructor(entries) { this.entries = entries; }

  static async load() {
    // 7.3.1 - local save first, then the shipped default table.
    const local = localStorage.getItem(LS_KEY);
    if (local) { const e = parse(local); if (e) return new HighScoreTable(e); }
    try {
      const txt = await loadText('survival.sco');
      const e = parse(txt);
      if (e) return new HighScoreTable(e);
    } catch (err) { /* fall through */ }
    return new HighScoreTable(DEFAULT_TABLE.map(x => Object.assign({}, x)));
  }

  save() { localStorage.setItem(LS_KEY, serialize(this.entries)); }

  isBetterScore(score) {
    return this.entries.length < MAX_SCORES || score > this.entries[this.entries.length - 1].score;
  }
  positionOf(score) {
    let i = 0;
    while (i < this.entries.length && this.entries[i].score >= score) i++;
    return i;
  }
  insert(name, score, info) {
    const i = this.positionOf(score);
    this.entries.splice(i, 0, { name, score, info });
    if (this.entries.length > MAX_SCORES) this.entries.length = MAX_SCORES;
    return i;
  }
}

// 7.3.3
export const DEFAULT_TABLE = [
  { name: 'Ark', score: 10000, info: 1 },
  { name: 'Krs', score: 9000, info: 2 },
  { name: 'Imp', score: 8000, info: 3 },
  { name: 'Ssb', score: 7000, info: 4 },
  { name: 'Keo', score: 6000, info: 5 },
  { name: 'Tux', score: 5000, info: 6 },
  { name: 'Gpl', score: 2000, info: 7 },
  { name: '   ', score: 1536, info: 3 },
  { name: 'Ssh', score: 500, info: 8 },
];
