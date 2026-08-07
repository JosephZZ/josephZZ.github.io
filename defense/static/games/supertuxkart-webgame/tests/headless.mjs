import fs from 'fs';
import { World } from '../js/world.js';
const A = new URL('../assets/', import.meta.url).pathname;
const config = JSON.parse(fs.readFileSync(A + 'config.json'));
const trackData = JSON.parse(fs.readFileSync(A + 'track.json'));
const kartData = JSON.parse(fs.readFileSync(A + 'karts.json'));
config.DIFFICULTY_NAMES = ['easy', 'medium', 'hard', 'best'];

const w = new World({ config, trackData, kartData, numKarts: 3, laps: 3, difficulty: 2, seed: 4 });
w.phase = 'RACE';
const k = w.players[0];
const dt = 1 / config.PHYSICS_FPS;
const samples = [];
for (let i = 0; i < 120 * 12; i++) {
  k.controls.accel = 1; k.controls.steer = (i > 120 * 6) ? 0.6 : 0;
  k.controls.skid = i > 120 * 8;
  w.step(dt);
  if (i % 240 === 0) samples.push([+(w.time.toFixed(3)), +k.speed.toFixed(4), k.currentGear(),
                                   +k.skidding.factor.toFixed(4), +k.enginePitch.toFixed(4)]);
}
console.log(JSON.stringify({ samples, pos: k.position.map(v => +v.toFixed(3)),
                             laps: k.laps, rank: k.rank }));
