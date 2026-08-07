// Entry point: fixed 120 Hz physics (E1.1) decoupled from rendering.
import { Assets } from './assets.js';
import { World } from './world.js';
import { Renderer } from './render.js';
import { Camera, HUD, SoundManager } from './view.js';

const KEYS = {
  ArrowUp: 'accel', ArrowDown: 'brake', ArrowLeft: 'left', ArrowRight: 'right',
  KeyN: 'nitro', KeyV: 'drift', Space: 'fire', KeyB: 'lookBack',
  Backspace: 'rescue', Escape: 'pause', KeyR: 'restart', KeyM: 'minimap',
};

const held = new Set();
let game = null;

class Game {
  constructor(assets, opts) {
    this.assets = assets;
    this.opts = opts;
    this.audio = new SoundManager(assets);
    this.canvas3d = document.getElementById('scene');
    this.canvas2d = document.getElementById('hud');
    this.newRace();
    this.renderer = new Renderer(this.canvas3d, assets, this.world);
    this.hud = new HUD(this.canvas2d, assets, this.world);
    this.accumulator = 0;
    this.last = performance.now();
    this.paused = false;
    this.frames = 0;
    this.fpsTime = 0;
    this.fps = 0;
  }

  newRace() {
    this.world = new World({
      config: this.assets.config,
      trackData: this.assets.track,
      kartData: this.assets.karts,
      numKarts: this.opts.karts,
      laps: this.opts.laps,
      difficulty: this.opts.difficulty,
      playerKart: this.opts.kart,
      seed: this.opts.seed,
      sfx: this.audio,
    });
    this.camera = new Camera(this.world.players[0], this.assets.config, 1);
    if (this.renderer) { this.renderer.world = this.world; }
    if (this.hud) { this.hud.world = this.world; this.hud.rankAnim.clear(); }
  }

  applyInput() {
    const kart = this.world.players[0];
    const c = kart.controls;
    c.accel = held.has('ArrowUp') ? 1 : 0;
    c.brake = held.has('ArrowDown');
    c.steer = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
    c.nitro = held.has('KeyN');
    c.skid = held.has('KeyV');
    c.fire = held.has('Space');
    c.lookBack = held.has('KeyB');
    if (held.has('Backspace')) kart.startRescue();
  }

  frame(now) {
    const dt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    const C = this.assets.config;
    if (!this.paused) {
      this.applyInput();
      this.accumulator = Math.min(this.accumulator + dt, 0.25);
      let steps = 0;
      while (this.accumulator >= 1 / C.PHYSICS_FPS && steps < 30) {   // E1.1
        this.world.step(1 / C.PHYSICS_FPS);
        this.accumulator -= 1 / C.PHYSICS_FPS;
        steps++;
      }
      this.world.updateGraphics(dt);
      this.camera.update(dt);
      const player = this.world.players[0];
      for (const k of this.world.karts) {
        const engine = this.assets.karts[k.modelName].engine === 'large' ? 'engine_large' : 'engine_small';
        this.audio.engine(k, player, engine, k.enginePitch);            // C2
        this.audio.loop('nitro', k, k.nitroActive);                     // C3.3
        this.audio.loop('skid', k, k.skidding.isSkidding && k.onGround);// C3.4
      }
    }
    this.world.cameraPosition = this.camera.position;
    this.renderer.render(this.camera);
    this.hud.draw(this.world.players[0], this.paused ? 0 : dt);

    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.frames / this.fpsTime;
      this.frames = 0; this.fpsTime = 0;
      const p = this.world.players[0];
      document.getElementById('stat').textContent =
        `${this.world.phase} | lap ${Math.min(Math.max(p.laps + 1, 1), this.world.laps)}/${this.world.laps}` +
        ` | rank ${p.rank}/${this.world.karts.length} | ${p.speed.toFixed(1)} m/s` +
        ` | nitro ${p.energy.toFixed(1)} | ${this.fps.toFixed(0)} fps`;
    }
    requestAnimationFrame(t => this.frame(t));
  }
}

function resize() {
  for (const id of ['scene', 'hud']) {
    const c = document.getElementById(id);
    const rect = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
  }
}

window.addEventListener('keydown', (e) => {
  if (!(e.code in KEYS)) return;
  e.preventDefault();
  if (e.code === 'KeyR') { game && game.newRace(); return; }
  if (e.code === 'Escape') { if (game) game.paused = !game.paused; return; }
  if (e.code === 'KeyM') { if (game) game.hud.minimapState = (game.hud.minimapState + 1) % 4; return; }
  held.add(e.code);
});
window.addEventListener('keyup', (e) => { held.delete(e.code); });
window.addEventListener('blur', () => held.clear());
window.addEventListener('resize', resize);

async function boot() {
  const status = document.getElementById('status');
  const assets = new Assets('assets/');
  await assets.loadAll(stage => { status.textContent = 'loading ' + stage + '…'; });
  resize();
  const params = new URLSearchParams(location.search);
  game = new Game(assets, {
    karts: parseInt(params.get('karts') || '6', 10),
    laps: parseInt(params.get('laps') || '3', 10),
    difficulty: ['easy', 'medium', 'hard', 'best'].indexOf(params.get('difficulty') || 'hard'),
    kart: params.get('kart') || 'tux',
    seed: parseInt(params.get('seed') || '1234', 10),
  });
  await game.audio.init();
  status.style.display = 'none';
  document.getElementById('game').style.display = 'block';
  resize();
  requestAnimationFrame(t => { game.last = t; game.frame(t); });
}

boot().catch(err => {
  document.getElementById('status').textContent = 'Error: ' + err.message;
  console.error(err);
});
