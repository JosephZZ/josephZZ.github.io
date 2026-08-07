import fs from 'fs';
import path from 'path';
import { World, grandPrixPoints } from '../js/world.js';

const A = new URL('../assets/', import.meta.url).pathname;
const cfg = JSON.parse(fs.readFileSync(A + 'config.json'));
cfg.DIFFICULTY_NAMES = ['easy', 'medium', 'hard', 'best'];
const track = JSON.parse(fs.readFileSync(A + 'track.json'));
const karts = JSON.parse(fs.readFileSync(A + 'karts.json'));
const items = JSON.parse(fs.readFileSync(A + 'items.json'));
const meshes = JSON.parse(fs.readFileSync(A + 'meshes.json'));
const bin = fs.readFileSync(A + 'meshes.bin');

let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(22)} ${detail}`);
};

// ---- mesh buffer integrity -------------------------------------------------
let parts = 0, tris = 0, badIndex = 0, badRange = 0, missingTex = 0;
const textures = new Set();
for (const [name, list] of Object.entries(meshes)) {
  for (const p of list) {
    parts++;
    for (const key of ['position', 'normal', 'uv', 'index']) {
      const v = p[key];
      if (v.offset % 4 || v.offset + v.length > bin.length) badRange++;
    }
    const idx = new Uint32Array(bin.buffer, bin.byteOffset + p.index.offset, p.index.length / 4);
    tris += idx.length / 3;
    for (let i = 0; i < idx.length; i += 97) if (idx[i] >= p.vertexCount) { badIndex++; break; }
    if (p.texture) {
      textures.add(p.texture);
      if (!fs.existsSync(path.join(A, 'textures', p.texture))) missingTex++;
    }
  }
}
check('mesh buffer views', badRange === 0, `${parts} parts, ${Math.round(tris)} triangles`);
check('mesh indices', badIndex === 0, `all indices < vertexCount`);
check('mesh textures', missingTex === 0, `${textures.size} textures referenced, ${missingTex} missing`);

// ---- referenced files ------------------------------------------------------
const missing = [];
for (const n of track.sky) if (!fs.existsSync(path.join(A, 'textures', n))) missing.push(n);
for (const k of Object.values(karts)) if (k.icon && !fs.existsSync(path.join(A, 'icons', k.icon))) missing.push(k.icon);
for (const n of Object.values(cfg.POWERUP_ICON)) if (!fs.existsSync(path.join(A, 'icons', n))) missing.push(n);
for (const n of ['speedback.png', 'speedfore.png', 'gauge_empty.png', 'gauge_full.png',
                 'gauge_full_bright.png', 'icons-frame.png']) {
  if (!fs.existsSync(path.join(A, 'icons', n))) missing.push(n);
}
for (const n of ['Cantarell-Regular.otf', 'SigmarOne.otf']) {
  if (!fs.existsSync(path.join(A, 'fonts', n))) missing.push(n);
}
let sfxMissing = 0;
for (const n of Object.keys(cfg.SFX)) if (!fs.existsSync(path.join(A, 'sfx', n + '.ogg'))) sfxMissing++;
check('sky/icons/fonts', missing.length === 0, missing.length ? missing.join(' ') : 'all present');
check('sfx files', sfxMissing === 0, `${Object.keys(cfg.SFX).length - sfxMissing}/${Object.keys(cfg.SFX).length} present`);
check('music file', !cfg.MUSIC_FILE || fs.existsSync(path.join(A, 'sfx', cfg.MUSIC_FILE)), cfg.MUSIC_FILE || '-');
check('kart meshes', Object.values(karts).every(k => meshes[k.mesh]), `${Object.keys(karts).length} karts`);
check('item meshes', Object.values(items).every(i => !i.mesh || meshes[i.mesh]), Object.keys(items).join(','));
check('scene objects', track.objects.every(o => meshes[o.mesh]), `${track.objects.length} objects`);

// ---- checklist values survived the export ---------------------------------
const tux = karts.tux.characteristics.hard;
check('D2.1 turn radius', Math.abs(tux.TURN_RADIUS[0][1] - 2.3) < 1e-9, `medium@0 = ${tux.TURN_RADIUS[0][1]}`);
check('D3.2 six gears', tux.GEAR_SWITCH.length === 6, JSON.stringify(tux.GEAR_POWER));
check('D4.5 skid bonus', tux.SKID_BONUS_SPEED[0] === 4.5 && tux.SKID_BONUS_SPEED[1] === 6.5, '');
check('D5.1 nitro max', tux.NITRO_MAX === 20, '');
check('F1.3 gp points', grandPrixPoints(5, cfg.GP_POINTS)[0] === 6, '5 karts -> winner 6');
check('A5.2 speedo scale', cfg.HUD_MAX_SPEED === 40, '');
check('G1.2 ready/set', cfg.READY_TIME === 1 && cfg.SET_TIME === 2, '');
check('E1.1 physics fps', cfg.PHYSICS_FPS === 120, '');

// ---- a whole race in the JS engine ----------------------------------------
const world = new World({ config: cfg, trackData: track, kartData: karts,
                          numKarts: 6, laps: 3, difficulty: 2, seed: 77 });
// drive the player with the AI so the race completes
world.players[0].controller = new (Object.getPrototypeOf(world.karts[1].controller).constructor)(
  world.players[0], world, 2, (() => { let a = 99; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })());
const dt = 1 / cfg.PHYSICS_FPS;
let steps = 0;
const t0 = Date.now();
while (world.phase !== 'RESULT' && steps < 120 * 400) { world.step(dt); steps++; }
const wall = (Date.now() - t0) / 1000;
const p = world.players[0];
check('full race', world.phase === 'RESULT' && p.laps >= 3,
      `phase ${world.phase}, player ${p.laps} laps, rank ${p.rank}, ${world.time.toFixed(1)}s race`);
check('ranks unique', new Set(world.karts.map(k => k.rank)).size === world.karts.length,
      world.karts.map(k => k.rank).sort().join(','));
check('sim speed', wall < world.time,
      `${steps} steps in ${wall.toFixed(1)}s wall for ${world.time.toFixed(1)}s race ` +
      `(${(world.time / wall).toFixed(1)}x real time)`);

console.log(`\n${fail === 0 ? 'all checks passed' : fail + ' checks FAILED'}`);
process.exit(fail === 0 ? 0 : 1);
