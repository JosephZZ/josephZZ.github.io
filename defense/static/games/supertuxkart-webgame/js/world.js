// Race rules: phases, laps, ranks, items, powerups, AI (F, G, E3.3).
import { V, Q, clamp, interpolate, Track } from './core.js';
import { Kart, ATTACH } from './kart.js';

// -------------------------------------------------------------- powerups
export class PowerupManager {                              // F2
  constructor(config, rng) {
    this.config = config;
    this.rng = rng;
    this.tables = config.RACE_WEIGHTS;
    this.names = config.POWERUPS;
  }
  interpRows(rows, rank, numKarts) {
    if (rows.length === 1) return { single: rows[0].single.slice(), multi: rows[0].multi.slice() };
    const pos = numKarts <= 1 ? 0 : (rank - 1) / (numKarts - 1) * (rows.length - 1);
    const i0 = Math.floor(clamp(pos, 0, rows.length - 1));
    const i1 = Math.min(rows.length - 1, i0 + 1);
    const t = pos - i0;
    const out = {};
    for (const key of ['single', 'multi']) {
      out[key] = rows[i0][key].map((v, k) => v * (1 - t) + rows[i1][key][k] * t);
    }
    return out;
  }
  weights(rank, numKarts) {                                 // F2.1 / S-15
    const tables = this.tables;
    if (!tables.length) return { single: [], multi: [] };
    const counts = tables.map(t => t[0]);
    if (tables.length === 1 || numKarts <= counts[0]) return this.interpRows(tables[0][1], rank, numKarts);
    if (numKarts >= counts[counts.length - 1]) return this.interpRows(tables[tables.length - 1][1], rank, numKarts);
    for (let i = 1; i < counts.length; i++) {
      if (numKarts <= counts[i]) {
        const t = (numKarts - counts[i - 1]) / (counts[i] - counts[i - 1]);
        const a = this.interpRows(tables[i - 1][1], rank, numKarts);
        const b = this.interpRows(tables[i][1], rank, numKarts);
        const out = {};
        for (const key of ['single', 'multi']) out[key] = a[key].map((v, k) => v * (1 - t) + b[key][k] * t);
        return out;
      }
    }
    return this.interpRows(tables[tables.length - 1][1], rank, numKarts);
  }
  draw(rank, numKarts, raceTime) {                          // F2.4 / F2.5
    const w = this.weights(rank, numKarts);
    const entries = [];
    for (const kind of ['single', 'multi']) {
      this.names.forEach((name, i) => {
        const weight = w[kind][i];
        if (!weight || weight <= 0) return;
        if ((name === 'cake' || name === 'rubber-ball') &&
            raceTime < this.config.NO_EXPLOSIVE_ITEMS_TIMEOUT) return;
        entries.push([name, kind === 'multi' ? 3 : 1, weight]);
      });
    }
    if (!entries.length) return ['zipper', 1];
    const total = entries.reduce((s, e) => s + e[2], 0);
    let r = this.rng() * total, acc = 0;
    for (const [name, count, weight] of entries) {
      acc += weight;
      if (r <= acc) return [name, count];
    }
    return [entries[entries.length - 1][0], entries[entries.length - 1][1]];
  }
}

class Item {                                                // A3
  constructor(kind, position, index, config) {
    this.kind = kind; this.originalKind = kind;
    this.position = position; this.index = index;
    this.ticksUntilReturn = 0; this.rotation = 0; this.config = config;
    this.disappearCounter = null;
  }
  get available() { return this.ticksUntilReturn <= 0; }
  get rotates() { return !this.kind.startsWith('bubblegum'); }   // A3.3
  returnTime() {
    const t = this.config.ITEM_RETURN_TIME;
    if (this.kind === 'bonus-box') return t.bonusbox;
    if (this.kind.startsWith('nitro')) return t.nitro;
    if (this.kind === 'banana') return t.banana;
    return t.bubblegum;
  }
  collected(world, time) { this.ticksUntilReturn = world.time2ticks(time ?? this.returnTime()); }
  update(dt) {
    if (this.ticksUntilReturn > 0) this.ticksUntilReturn -= 1;
    if (this.rotates) this.rotation = (this.rotation + dt * 2) % (Math.PI * 2);
  }
}

// -------------------------------------------------------------- projectiles
class Flyable {
  constructor(name, owner, world) {
    this.name = name; this.owner = owner; this.world = world; this.alive = true;
    this.position = V.add(V.addScaled(owner.position, owner.forward, 1.5), [0, 0.5, 0]);
    this.velocity = [0, 0, 0]; this.age = 0;
  }
  hitKarts(radius) {
    for (const k of this.world.karts) {
      if (k === this.owner && this.age < 0.3) continue;
      if (V.len(V.sub(k.position, this.position)) < radius) return k;
    }
    return null;
  }
}

class Cake extends Flyable {                                // E6.1
  constructor(owner, world) {
    super('cake', owner, world);
    this.p = world.config.PROJECTILE.cake;
    this.target = this.acquire();
    this.velocity = V.add(V.scale(owner.forward, this.p.speed), owner.velocity);
    this.velocity[1] += this.p.force_up * 0.1;
  }
  acquire() {
    let best = null, bestD = this.p.max_distance;
    for (const k of this.world.karts) {
      if (k === this.owner) continue;
      const d = V.len(V.sub(k.position, this.owner.position));
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }
  update(dt) {
    this.age += dt;
    if (this.target) {
      const to = V.sub(V.add(this.target.position, [0, 0.5, 0]), this.position);
      const d = V.len(to);
      if (d > 1e-3) {
        const speed = V.len(this.velocity);
        this.velocity = V.scale(V.norm(V.addScaled(this.velocity, V.scale(to, 1 / d), dt * 40)), speed);
      }
    }
    this.velocity[1] -= 9.81 * dt;
    this.position = V.addScaled(this.position, this.velocity, dt);
    const [h] = this.world.track.surfaceHeight(this.position, null);
    const hit = this.hitKarts(1.3);
    if (hit || this.position[1] < h + this.p.min_height) {
      this.alive = false;
      this.world.explodeAt(this.position, this.owner);
    }
  }
}

class Bowling extends Flyable {                             // E6.2
  constructor(owner, world, backwards) {
    super('bowling', owner, world);
    this.p = world.config.PROJECTILE.bowling;
    const d = backwards ? -1 : 1;
    this.velocity = V.scale(owner.forward, (this.p.speed + Math.abs(owner.speed)) * d);
    this.velocity[1] = this.p.force_up * 0.1;
  }
  update(dt) {
    this.age += dt;
    let best = null, bestD = this.p.max_distance;
    for (const k of this.world.karts) {
      if (k === this.owner) continue;
      const d = V.len(V.sub(k.position, this.position));
      if (d < bestD) { bestD = d; best = k; }
    }
    if (best) this.velocity = V.addScaled(this.velocity, V.norm(V.sub(best.position, this.position)),
                                          this.p.force_to_target * dt);
    this.velocity[1] -= 9.81 * dt;
    this.position = V.addScaled(this.position, this.velocity, dt);
    const [h] = this.world.track.surfaceHeight(this.position, null);
    if (this.position[1] < h + 0.25) { this.position[1] = h + 0.25; this.velocity[1] = Math.abs(this.velocity[1]) * 0.5; }
    const hit = this.hitKarts(1.1);
    if (hit) { hit.startExplosion(); this.alive = false; }
    if (this.age > 8) this.alive = false;
  }
}

class Plunger extends Flyable {                             // E6.3
  constructor(owner, world, backwards) {
    super('plunger', owner, world);
    this.p = world.config.PROJECTILE.plunger;
    this.velocity = V.scale(owner.forward, this.p.speed * (backwards ? -1 : 1));
    this.attachedTo = null;
  }
  update(dt) {
    this.age += dt;
    if (this.attachedTo) {
      this.position = V.add(this.attachedTo.position, [0, 0.6, 0]);
      if (this.attachedTo.plungerFaceTicks <= 0) this.alive = false;
      return;
    }
    this.position = V.addScaled(this.position, this.velocity, dt);
    const hit = this.hitKarts(1.2);
    if (hit) {
      this.attachedTo = hit;
      hit.plungerFaceTicks = this.world.time2ticks(
        this.world.config.PLUNGER_IN_FACE_TIME[this.world.difficulty]);
      this.world.playSfx('plunger', hit);
    }
    if (this.age > 4) this.alive = false;
  }
}

class RubberBall extends Flyable {                          // E6.4 - E6.6
  constructor(owner, world) {
    super('rubber-ball', owner, world);
    this.p = world.config.PROJECTILE['rubber-ball'];
    this.target = this.acquire();
    this.direction = V.copy(owner.forward);
    this.timer = 0; this.noTarget = 0; this.height = 0;
  }
  acquire() {
    let best = null, bestRank = 1e9;
    for (const k of this.world.karts) {
      if (k === this.owner || k.finished) continue;
      if (k.rank < bestRank) { bestRank = k.rank; best = k; }
    }
    return best;
  }
  update(dt) {
    this.age += dt;
    if (!this.target || this.target.finished) {
      this.target = this.acquire();
      this.noTarget += dt;
      if (this.noTarget > this.p.delete_time) { this.alive = false; return; }   // E6.6
    } else this.noTarget = 0;
    if (!this.target) return;
    const to = V.sub(this.target.position, this.position);
    const dist = V.len(to);
    const want = V.norm(to);
    const maxTurn = this.p.max_turn_deg * Math.PI / 180 * dt;                    // E6.5
    const cur = V.norm(this.direction);
    const ang = Math.acos(clamp(V.dot(cur, want), -1, 1));
    this.direction = ang > maxTurn && ang > 1e-6
      ? V.norm(V.add(V.scale(cur, 1 - maxTurn / ang), V.scale(want, maxTurn / ang)))
      : want;
    const speed = this.p.speed + interpolate(this.p.speed_offset, dist);         // E6.4
    this.position = V.addScaled(this.position, this.direction, speed * dt);
    let interval = this.p.interval, maxH = this.p.max_height;
    if (dist < this.p.fast_ping_distance) { interval *= 0.5; maxH *= 0.5; }
    if (dist < this.p.target_distance) maxH = 0.5;
    this.timer = (this.timer + dt) % interval;
    this.height = Math.sin(this.timer / interval * Math.PI) * maxH;
    const [ground] = this.world.track.surfaceHeight(this.position, null);
    this.position[1] = ground + 0.3 + this.height;
    const hit = this.hitKarts(1.4);
    if (hit && hit === this.target) { hit.startExplosion(); this.alive = false; }
  }
}

// -------------------------------------------------------------- AI  (F5)
class AIController {
  constructor(kart, world, difficulty, rng) {
    this.kart = kart; this.world = world;
    this.p = world.config.AI_PARAMS[world.config.DIFFICULTY_NAMES[difficulty]] ||
             Object.values(world.config.AI_PARAMS)[difficulty];
    this.rng = rng;
    const prob = parseFloat(this.p['false-start-probability'] ?? 0);
    this.jumpsStart = rng() < prob;
    const lo = parseFloat(this.p['min-start-delay'] ?? 0.2);
    const hi = parseFloat(this.p['max-start-delay'] ?? 0.4);
    this.startDelay = lo + rng() * (hi - lo);                 // F5.2
    this.timeSinceGo = -1;
    this.skidDecision = false; this.skidTimer = 0;
    this.speedCapCurve = this.parseCurve(this.p['first-speed-cap']);
    this.lastSpeedCap = this.parseCurve(this.p['last-speed-cap']);
    this.skidProb = this.parseCurve(this.p['rb-skid-probability']);
    this.maxItemAngle = parseFloat(this.p['max-item-angle'] ?? 0.7);
    this.straightZipper = parseFloat(this.p['straight-length-for-zipper'] ?? 35);
    this.nitroUsage = parseInt(this.p['nitro-usage'] ?? 1, 10);
    this.itemSkill = parseInt(this.p['item-skill'] ?? 2, 10);
  }
  parseCurve(text) {
    if (!text) return [[0, 1]];
    return String(text).trim().split(/\s+/).map(tok => {
      const [x, y] = tok.split(':');
      return [parseFloat(x), parseFloat(y)];
    });
  }
  distanceToPlayer() {
    const p = this.world.firstPlayer();
    return p ? this.kart.overallDistance - p.overallDistance : 0;
  }
  speedCap() {                                              // F5.3
    const d = this.distanceToPlayer();
    const first = interpolate(this.speedCapCurve, d);
    const last = interpolate(this.lastSpeedCap, d);
    const n = this.world.karts.length;
    if (this.kart.rank <= 1) return first;
    if (this.kart.rank >= n) return last;
    return 0.5 * (first + last);
  }
  update(dt, racing) {
    const k = this.kart, c = k.controls, track = this.world.track;
    c.reset();
    if (!racing) {
      if (this.jumpsStart && (this.world.phase === 'SET' || this.world.phase === 'READY')) c.accel = 1;
      return;
    }
    if (this.timeSinceGo < 0) this.timeSinceGo = 0;
    this.timeSinceGo += dt;
    if (this.timeSinceGo < this.startDelay) return;

    const speed = Math.abs(k.speed);
    const lookahead = 8 + speed * 0.8;
    const n = track.quads.length;
    const step = Math.max(1, Math.round(lookahead / Math.max(1e-3, track.totalDistance / n)));
    const target = track.quads[(k.hint + step) % n];
    const to = V.sub(target.center, k.position);
    const lat = V.dot(to, k.right), lon = Math.max(1e-3, V.dot(to, k.forward));
    const steer = clamp(Math.atan2(lat, lon) * 2, -1, 1);
    c.steer = steer;

    const far = track.quads[(k.hint + step * 2) % n];
    const curve = Math.abs(V.dot(V.norm(V.sub(far.center, target.center)), k.right));
    const cap = this.speedCap();
    const targetSpeed = k.ch('BASE_MAX_SPEED') * cap * (1 - 0.55 * curve);
    if (speed > targetSpeed * 1.15) { c.brake = true; c.accel = 0; } else c.accel = 1;
    k.maxSpeed.setSlowdown('ai', clamp(cap, 0.1, 1), 0);

    const prob = interpolate(this.skidProb, this.distanceToPlayer());   // F5.4
    this.skidTimer -= dt;
    if (this.skidTimer <= 0) { this.skidTimer = 0.5; this.skidDecision = this.rng() < prob; }
    c.skid = this.skidDecision && Math.abs(steer) > 0.35 && speed > k.ch('SKID_MIN_SPEED') + 1;

    if (this.nitroUsage > 0 && k.energy > 0) {                          // F5.5
      const straight = curve < 0.05;
      if (this.nitroUsage >= 3) c.nitro = k.energy > 1;
      else if (this.nitroUsage === 2) c.nitro = straight && k.energy > 2;
      else c.nitro = straight && k.energy >= k.ch('NITRO_MAX') * 0.5;
    }
    if (k.powerup) {
      const [name] = k.powerup;
      if (name === 'zipper') c.fire = curve < 0.03;                     // F5.8
      else c.fire = this.itemSkill >= 2;
    }
  }
}

// -------------------------------------------------------------- world
export const PHASES = ['SETUP', 'TRACK_INTRO', 'READY', 'SET', 'GO', 'MUSIC', 'RACE',
                       'DELAY_FINISH', 'RESULT'];

export function grandPrixPoints(numKarts, list) {          // F1.3 / I-22
  const used = list.slice(0, numKarts).sort((a, b) => a - b);
  const scores = new Array(numKarts).fill(0);
  let total = used[0];
  scores[numKarts - 1] = total;
  for (let i = numKarts - 2; i >= 0; i--) { total += used[numKarts - 1 - i]; scores[i] = total; }
  return scores;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  constructor({ config, trackData, kartData, numKarts = 6, laps = 3, difficulty = 2,
                playerKart = 'tux', aiKarts = null, seed = 1234, sfx = null }) {
    this.config = config;
    this.kartData = kartData;
    this.track = new Track(trackData);
    this.laps = laps;
    this.difficulty = difficulty;
    this.rng = mulberry32(seed);
    this.sfx = sfx;
    this.powerups = new PowerupManager(config, this.rng);
    this.flyables = [];
    this.skidmarks = [];
    this.time = 0; this.ticks = 0; this.ticksSinceStart = 0;
    this.phase = 'READY'; this.auxTicks = 0;
    this.finishOrder = [];
    this.gpPoints = null;
    this.events = [];
    this.difficultyName = config.DIFFICULTY_NAMES[difficulty];

    const pool = aiKarts || Object.keys(kartData).filter(k => k !== playerKart);
    this.karts = []; this.players = [];
    for (let i = 0; i < numKarts; i++) {
      const isPlayer = i === 0;
      const model = isPlayer ? playerKart : pool[(i - 1) % pool.length];
      const k = new Kart(i, this, model, this.difficultyName);
      k.isPlayer = isPlayer;
      k.plungerFaceTicks = 0;
      k.lives = config.THREE_STRIKES_LIVES;
      k.score = 0;
      const [pos, fwd] = this.track.startTransform(i);
      k.place(pos, fwd);
      k.laps = -1;                                          // F1.1 grid is behind the line
      k.prevDistance = k.distanceAlong;
      k.overallDistance = k.distanceAlong - this.track.totalDistance;
      if (!isPlayer) k.controller = new AIController(k, this, difficulty, mulberry32(seed + i * 977));
      else this.players.push(k);
      this.karts.push(k);
    }
    this.items = trackData.items.map((it, i) => new Item(it.kind, it.pos.slice(), i, config));
    this.updateRanks();
    this.startEngines();
  }

  time2ticks(t) { return Math.round(t * this.config.PHYSICS_FPS); }
  ticks2time(t) { return t / this.config.PHYSICS_FPS; }
  firstPlayer() { return this.players[0] || null; }
  playSfx(name, kart = null) {
    this.events.push([this.time, 'sfx', name]);
    if (this.sfx) this.sfx.play(name, kart, this.firstPlayer());
  }
  startEngines() { this.events.push([this.time, 'phase', 'startEngines']); }   // G1.4
  onSkidBonus(kart, level) { this.events.push([this.time, 'skid-bonus', [kart.index, level]]); }
  onExplosion(kart) { this.events.push([this.time, 'explosion', kart.index]); }

  updatePhase() {                                            // G1.1 / G1.2
    this.auxTicks += 1;
    const fps = this.config.PHYSICS_FPS;
    if (this.phase === 'READY') {
      if (this.auxTicks > fps * this.config.READY_TIME) {
        this.phase = 'SET'; this.auxTicks = 0; this.playSfx('pre_start_race');
      }
    } else if (this.phase === 'SET') {
      if (this.auxTicks > fps * this.config.SET_TIME) {
        this.phase = 'GO'; this.auxTicks = 0; this.playSfx('start_race');
        if (this.sfx) this.sfx.startMusic();
      }
    } else if (this.phase === 'GO') { this.phase = 'MUSIC'; this.auxTicks = 0; }
    else if (this.phase === 'MUSIC') {
      this.phase = 'RACE'; this.auxTicks = 0; this.time = 0; this.ticksSinceStart = 0;
    } else if (this.phase === 'DELAY_FINISH') {
      if (this.auxTicks >= this.time2ticks(this.config.DELAY_FINISH_TIME)) {   // F1.4
        this.phase = 'RESULT';
        this.onResult();
      }
    }
  }

  get isRacing() { return this.phase === 'RACE' || this.phase === 'DELAY_FINISH'; }

  step(dt) {
    this.ticks += 1;
    this.updatePhase();
    if (this.isRacing) { this.time += dt; this.ticksSinceStart += 1; }

    for (const k of this.karts) {
      if (k.eliminated) continue;
      if (k.controller) k.controller.update(dt, this.phase === 'RACE');
      else if (!this.isRacing) this.checkJumpStart(k);
      if (this.isRacing) this.maybeStartBoost(k);
      k.step(dt);
      if (k.plungerFaceTicks > 0) k.plungerFaceTicks -= 1;
    }
    this.handleKartCollisions();
    for (const it of this.items) it.update(dt);
    this.handleItemPickup();
    this.handlePowerupUse();
    for (let i = this.flyables.length - 1; i >= 0; i--) {
      this.flyables[i].update(dt);
      if (!this.flyables[i].alive) this.flyables.splice(i, 1);
    }
    this.updateSkidmarks();
    this.updateLaps();
    this.updateRanks();
  }

  checkJumpStart(kart) {                                     // D6.4 / S-18
    if (kart.controls.accel > 0 && !kart.jumpedStart) {
      kart.jumpedStart = true;
      kart.startPenaltyTicks = this.time2ticks(this.config.STARTUP_PENALTY);
      this.events.push([this.time, 'jump-start', kart.index]);
      this.playSfx('bzzt', kart);
    }
  }
  maybeStartBoost(kart) {                                    // F1.6
    if (kart.startBoostGiven || kart.jumpedStart || kart.controls.accel <= 0) return;
    const times = kart.ch('STARTUP_TIMES'), boosts = kart.ch('STARTUP_BOOSTS');
    let boost = null;
    for (let i = 0; i < times.length; i++) if (this.time <= times[i]) { boost = boosts[i]; break; }
    kart.startBoostGiven = true;
    if (boost === null) return;
    kart.maxSpeed.instantSpeedIncrease('zipper', boost, boost / 2, 250,
      this.time2ticks(0.6), this.time2ticks(1.0));
    this.events.push([this.time, 'start-boost', [kart.index, boost]]);
  }

  handleKartCollisions() {                                   // E3.3
    const n = this.karts.length;
    for (let i = 0; i < n; i++) {
      const a = this.karts[i];
      if (a.eliminated) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.karts[j];
        if (b.eliminated) continue;
        const rel = V.sub(b.position, a.position);
        const d = V.len(rel);
        if (d > 2 || d < 1e-6) continue;
        const nrm = V.scale(rel, 1 / d);
        const frontal = Math.abs(V.dot(nrm, a.forward)) > 0.85;
        const push = this.config.COLLISION_IMPULSE / this.config.COLLISION_IMPULSE_TIME;
        const ticks = this.time2ticks(this.config.COLLISION_IMPULSE_TIME);
        if (!frontal) {
          a.collisionImpulse = V.scale(nrm, -push); a.collisionTicks = ticks;
          b.collisionImpulse = V.scale(nrm, push); b.collisionTicks = ticks;
        } else {
          const rest = interpolate(this.config.RESTITUTION_CURVE, Math.abs(a.speed - b.speed));
          a.velocity = V.addScaled(a.velocity, nrm, -rest);
          b.velocity = V.addScaled(b.velocity, nrm, rest);
        }
        const overlap = (2 - d) * 0.5;
        a.position = V.addScaled(a.position, nrm, -overlap);
        b.position = V.addScaled(b.position, nrm, overlap);
        if (!a.attachment.handleCollision(b)) b.attachment.handleCollision(a);   // F3.8
      }
    }
  }

  handleItemPickup() {
    for (const k of this.karts) {
      if (k.eliminated || k.hasAnimation()) continue;
      for (const it of this.items) {
        if (!it.available) continue;
        if (V.len(V.sub(it.position, k.position)) > 1.2) continue;
        this.collectItem(k, it);
      }
    }
  }

  collectItem(kart, item) {
    const kind = item.kind;
    if (kind === 'bonus-box') {                              // F2.6
      const [name, count] = this.powerups.draw(kart.rank, this.karts.length, this.time);
      kart.powerup = [name, count];
      this.playSfx('grab_collectable', kart);                // C3.2
      item.collected(this);
      this.events.push([this.time, 'powerup', [kart.index, name, count]]);
    } else if (kind === 'nitro-big' || kind === 'nitro-small') {
      kart.addEnergy(kind === 'nitro-big' ? kart.ch('NITRO_BIG_CONTAINER') : kart.ch('NITRO_SMALL_CONTAINER'));
      this.playSfx('grab_collectable', kart);
      item.collected(this);
    } else if (kind === 'banana') {
      const result = kart.attachment.hitBanana(this.ticksSinceStart, false, kart.rank, this.karts.length);
      this.events.push([this.time, 'banana', [kart.index, result]]);
      item.collected(this, result === 'bomb-explode'
        ? Math.max(this.config.ITEM_RETURN_TIME.banana, kart.ch('EXPLOSION_DURATION') + 2)   // S-17
        : undefined);
    } else if (kind.startsWith('bubblegum')) {               // F2.9
      kart.maxSpeed.setSlowdown('bubble', 0.35, this.time2ticks(0.5), this.time2ticks(2));
      this.playSfx('goo', kart);
      item.collected(this);
    }
  }

  handlePowerupUse() {
    for (const k of this.karts) {
      if (!k.controls.fire || !k.powerup || k.hasAnimation()) continue;
      let [name, count] = k.powerup;
      this.usePowerup(k, name);
      count -= 1;
      k.powerup = count > 0 ? [name, count] : null;          // F2.4
      k.controls.fire = false;
    }
  }

  usePowerup(kart, name) {
    this.events.push([this.time, 'fire', [kart.index, name]]);
    if (name === 'zipper') { kart.applyZipper(); this.playSfx('wee', kart); }
    else if (name === 'cake') { this.flyables.push(new Cake(kart, this)); this.playSfx('shoot', kart); }
    else if (name === 'bowling') { this.flyables.push(new Bowling(kart, this, kart.controls.brake)); this.playSfx('bowling_shoot', kart); }
    else if (name === 'plunger') { this.flyables.push(new Plunger(kart, this, kart.controls.brake)); this.playSfx('plunger', kart); }
    else if (name === 'rubber-ball') { this.flyables.push(new RubberBall(kart, this)); }
    else if (name === 'bubblegum') { kart.shieldTime = kart.ch('BUBBLEGUM_SHIELD_TIME'); this.playSfx('goo', kart); }
    else if (name === 'anchor') {
      const target = this.kartAhead(kart);
      if (target) { target.attachment.set(ATTACH.ANVIL, target.ch('ANVIL_DURATION'), kart); this.playSfx('anvil', target); }
    } else if (name === 'parachute') {
      for (const other of this.karts) {
        if (other.rank < kart.rank && !other.eliminated) {
          const ratio = Math.abs(other.speed) / Math.max(1e-6, other.ch('BASE_MAX_SPEED'));
          other.attachment.set(ATTACH.PARACHUTE,
            other.attachment.parachuteDuration(false, other.rank, this.karts.length, ratio), kart);
        }
      }
      this.playSfx('parachute', kart);
    } else if (name === 'switch') {                          // F2.7
      const map = this.config.SWITCH_ITEMS, types = this.config.ITEM_TYPES;
      for (const it of this.items) {
        const idx = types.indexOf(it.kind);
        if (idx >= 0) it.kind = types[map[idx]];
      }
      this.playSfx('swap', kart);
    } else if (name === 'swatter') {                         // B2.9
      for (const other of this.karts) {
        if (other === kart) continue;
        if (V.len(V.sub(other.position, kart.position)) < kart.ch('SWATTER_DISTANCE')) {
          other.setSquashed();
          this.playSfx('boing', other);
        }
      }
    }
  }

  kartAhead(kart) {
    let best = null, bestRank = 0;
    for (const other of this.karts) {
      if (other === kart || other.eliminated) continue;
      if (other.rank < kart.rank && other.rank > bestRank) { best = other; bestRank = other.rank; }
    }
    return best;
  }

  explodeAt(position, owner) {                               // F3.9
    this.playSfx('explosion');
    for (const k of this.karts) {
      if (V.len(V.sub(k.position, position)) < k.ch('EXPLOSION_RADIUS')) {
        if (k.startExplosion() && k !== owner) owner.score += 1;
      }
    }
  }

  updateSkidmarks() {                                        // B1.7
    for (const k of this.karts) {
      if (k.skidding.isSkidding && k.onGround) {
        this.skidmarks.push([this.time, V.copy(k.position), k.skidding.level()]);
      }
    }
    while (this.skidmarks.length > this.config.SKIDMARK_MAX_NUMBER) this.skidmarks.shift();
    const cutoff = this.time - this.config.SKIDMARK_FADEOUT_TIME;
    while (this.skidmarks.length && this.skidmarks[0][0] < cutoff) this.skidmarks.shift();
  }

  updateLaps() {                                             // F1.1
    const lapLen = this.track.totalDistance;
    for (const k of this.karts) {
      if (k.finished || k.eliminated) continue;
      const d = k.distanceAlong, prev = k.prevDistance;
      if (prev > lapLen * 0.75 && d < lapLen * 0.25) {
        k.laps += 1;
        this.events.push([this.time, 'lap', [k.index, k.laps]]);
        if (k.laps === this.laps - 1 && k.isPlayer) {
          this.playSfx('last_lap_fanfare');                  // C3.9
          if (this.sfx) this.sfx.switchToFast();             // C4.3
        }
        if (k.laps >= this.laps) this.finishKart(k);
      } else if (prev < lapLen * 0.25 && d > lapLen * 0.75) k.laps -= 1;
      k.prevDistance = d;
      k.overallDistance = k.laps * lapLen + d;
    }
  }

  finishKart(kart) {
    kart.finished = true;
    kart.finishTime = this.time + (kart.jumpedStart ? this.config.STARTUP_PENALTY : 0);  // F1.5
    this.finishOrder.push(kart);
    kart.rank = this.finishOrder.length;
    this.events.push([this.time, 'finish', [kart.index, kart.finishTime]]);
    if (kart.isPlayer) this.playSfx(kart.rank === 1 ? 'race_finish_victory' : 'race_finish');
    const allDone = this.karts.every(k => k.finished || k.eliminated) ||
                    this.players.every(k => k.finished);
    if (allDone && this.phase === 'RACE') { this.phase = 'DELAY_FINISH'; this.auxTicks = 0; }
  }

  updateRanks() {                                            // F1.2
    const ordered = this.karts.filter(k => !k.eliminated).sort((a, b) => {
      const fa = a.finished ? 0 : 1, fb = b.finished ? 0 : 1;
      if (fa !== fb) return fa - fb;
      if (a.finished && b.finished) return this.finishOrder.indexOf(a) - this.finishOrder.indexOf(b);
      return b.overallDistance - a.overallDistance;
    });
    ordered.forEach((k, i) => { k.rank = i + 1; });
  }

  onResult() {
    const pts = grandPrixPoints(this.karts.length, this.config.GP_POINTS);
    this.gpPoints = {};
    for (const k of this.karts) this.gpPoints[k.index] = pts[k.rank - 1];
    this.events.push([this.time, 'result', this.gpPoints]);
    if (this.sfx) this.sfx.resultMusic(this.firstPlayer().rank, this.karts.length);
  }

  updateGraphics(dt) { for (const k of this.karts) k.updateGraphics(dt); }
}
