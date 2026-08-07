import fs from 'fs';
import { World } from '../js/world.js';
const A = new URL('../assets/', import.meta.url).pathname;
const config = JSON.parse(fs.readFileSync(A + 'config.json'));
config.DIFFICULTY_NAMES = ['easy', 'medium', 'hard', 'best'];
const w = new World({ config,
  trackData: JSON.parse(fs.readFileSync(A + 'track.json')),
  kartData: JSON.parse(fs.readFileSync(A + 'karts.json')),
  numKarts: 1, laps: 99, difficulty: 2, seed: 4 });
w.phase = 'RACE';
const k = w.players[0];
k.startBoostGiven = true;                 // keep the F1.6 boost out of the comparison
const dt = 1 / config.PHYSICS_FPS;
const out = [];
for (let i = 0; i < 120 * 10; i++) {
  k.controls.accel = 1;
  k.controls.steer = i > 120 * 4 ? 0.5 : 0;
  k.controls.skid = i > 120 * 6;
  w.step(dt);
  if (i % 120 === 0) out.push([+w.time.toFixed(3), +k.speed.toFixed(4), k.currentGear(),
                               +k.skidding.factor.toFixed(4), +k.steerValue.toFixed(4),
                               k.position.map(v => +v.toFixed(3))]);
}
console.log(JSON.stringify(out));
