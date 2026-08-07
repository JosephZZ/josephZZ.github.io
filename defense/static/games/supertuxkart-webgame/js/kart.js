// The kart: rigid body, suspension, engine, steering, nitro, attachments.
// Straight port of the Python build (D2-D5, E2-E5, A1.8, C2).
import { V, Q, clamp, interpolate, MaxSpeed, Skidding, SKID } from './core.js';

export const GRAVITY = 9.81;

export class Controls {
  constructor() { this.reset(); }
  reset() {
    this.accel = 0; this.brake = false; this.steer = 0; this.nitro = false;
    this.skid = false; this.fire = false; this.lookBack = false;
  }
}

export const ATTACH = {
  NOTHING: 'nothing', PARACHUTE: 'parachute', ANVIL: 'anvil', BOMB: 'bomb',
  SWATTER: 'swatter', SHIELD: 'bubblegum-shield',
};

class Attachment {
  constructor(kart) {
    this.kart = kart; this.type = ATTACH.NOTHING; this.ticks = 0;
    this.previousOwner = null; this.everHad = false;
  }
  clear() {
    if (this.type === ATTACH.ANVIL) this.kart.maxSpeed.clearSlowdown('bubble');
    this.type = ATTACH.NOTHING; this.ticks = 0; this.previousOwner = null;
  }
  set(type, seconds, owner = null, add = false) {
    const t = this.kart.world.time2ticks(seconds);
    if (add && this.type === type) this.ticks += t;      // F3.4
    else { this.type = type; this.ticks = t; }
    this.previousOwner = owner;
    const first = !this.everHad;
    this.everHad = true;
    if (type === ATTACH.ANVIL) {                          // F3.5
      this.kart.maxSpeed.setSlowdown('bubble', this.kart.ch('ANVIL_SPEED_FACTOR'), 0, this.ticks);
    }
    if (first) this.kart.world.playSfx('ugh', this.kart); // C3.7
    return first;
  }
  update() {
    if (this.type === ATTACH.NOTHING) return;
    this.ticks -= 1;
    if (this.type === ATTACH.PARACHUTE) {                 // F3.7
      const k = this.kart, maxS = k.ch('BASE_MAX_SPEED');
      const f = clamp(Math.abs(k.speed) / k.ch('PARACHUTE_MAX_SPEED'), 0, 1);
      const lo = k.ch('PARACHUTE_LBOUND_FRACTION'), hi = k.ch('PARACHUTE_UBOUND_FRACTION');
      if (Math.abs(k.speed) < maxS * (lo + (hi - lo) * f)) { this.clear(); return; }
    } else if (this.type === ATTACH.BOMB && this.ticks <= 0) {
      if (this.kart.hasAnimation()) { this.ticks = 1; return; }   // S-13
      this.clear();
      this.kart.startExplosion();
      this.kart.world.playSfx('explosion', this.kart);
      return;
    }
    if (this.ticks <= 0) this.clear();
  }
  parachuteDuration(fromBanana, rank, numKarts, speedRatio) {     // F3.6
    const k = this.kart;
    const base = fromBanana ? k.ch('PARACHUTE_DURATION_BANANA') : k.ch('PARACHUTE_DURATION_OTHER');
    const t = numKarts > 1 ? (numKarts - rank) / (numKarts - 1) : 1;
    const rankMult = 1 + (k.ch('PARACHUTE_DURATION_RANK_MULT') - 1) * t;
    const speedMult = 1 + (k.ch('PARACHUTE_DURATION_SPEED_MULT') - 1) * clamp(speedRatio, 0, 1);
    return base * rankMult * speedMult;
  }
  hitBanana(ticksSinceStart, isTimeTrial, rank, numKarts) {       // F3.1-F3.4
    const k = this.kart;
    if (k.shieldTime > 0 || this.type === ATTACH.SHIELD) {        // F3.2
      k.shieldTime = 0;
      if (this.type === ATTACH.SHIELD) this.clear();
      return 'shield-lost';
    }
    if (this.type === ATTACH.BOMB) {                              // F3.3
      this.clear(); k.startExplosion();
      k.world.playSfx('explosion', k);
      return 'bomb-explode';
    }
    const r = Math.floor(ticksSinceStart / 16);
    const choice = r % (isTimeTrial ? 2 : 3);
    if (choice === 0) {
      const ratio = Math.abs(k.speed) / Math.max(1e-6, k.ch('BASE_MAX_SPEED'));
      this.set(ATTACH.PARACHUTE, this.parachuteDuration(true, rank, numKarts, ratio), null, true);
      return 'parachute';
    }
    if (choice === 1) { this.set(ATTACH.ANVIL, k.ch('ANVIL_DURATION'), null, true); return 'anvil'; }
    this.set(ATTACH.BOMB, k.world.config.BOMB_TIME);              // F3.8
    return 'bomb';
  }
  handleCollision(other) {                                        // F3.8
    if (this.type !== ATTACH.BOMB) return false;
    if (other.attachment.type !== ATTACH.NOTHING) return false;
    if (other === this.previousOwner) return false;
    const t = this.ticks;
    this.clear();
    other.attachment.type = ATTACH.BOMB;
    other.attachment.ticks = t;      // time-increase is 0
    other.attachment.previousOwner = this.kart;
    other.attachment.everHad = true;
    return true;
  }
}

class Slipstream {
  constructor(kart) { this.kart = kart; this.time = 0; this.target = null; this.effect = 0; }
  quadSize() {                                                    // B3.1 / B3.2
    const k = this.kart;
    const scale = Math.abs(k.speed) / k.ch('SLIPSTREAM_BASE_SPEED');
    return [k.ch('SLIPSTREAM_LENGTH') * scale, k.ch('SLIPSTREAM_WIDTH') * scale];
  }
  isInside(other) {
    const [length, width] = other.slipstream.quadSize();
    if (length <= 0.01) return 0;
    const rel = V.sub(this.kart.position, other.position);
    const back = -V.dot(rel, other.forward);
    const side = Math.abs(V.dot(rel, other.right));
    if (back <= 0 || back > length) return 0;
    const half = 0.5 * width * (back / length);
    if (side > half) return 0;
    return side <= half * this.kart.ch('SLIPSTREAM_INNER_FACTOR') ? 1 : 0.5;
  }
  update(dt) {
    const k = this.kart, world = k.world;
    const speed = Math.abs(k.speed);
    let zone = 0, target = null;
    if (speed >= k.ch('SLIPSTREAM_MIN_SPEED')) {                  // F4.1
      for (const other of world.karts) {
        if (other === k || Math.abs(other.speed) < k.ch('SLIPSTREAM_MIN_SPEED')) continue;
        const z = this.isInside(other);
        if (z > zone) { zone = z; target = other; }
      }
    }
    this.target = target;
    if (zone > 0) {
      const rate = zone >= 1 ? 2 : 1;                             // inner zone counts double
      this.time = Math.min(k.ch('SLIPSTREAM_MAX_COLLECT_TIME'), this.time + rate * dt);
      this.effect = Math.min(1, this.time / k.ch('SLIPSTREAM_MIN_COLLECT_TIME'));
    } else {
      if (this.time >= k.ch('SLIPSTREAM_MIN_COLLECT_TIME')) {     // F4.2 / F4.3
        const duration = this.time * k.ch('SLIPSTREAM_DURATION_FACTOR');
        k.maxSpeed.increaseSpeed('slipstream', k.ch('SLIPSTREAM_MAX_SPEED_INCREASE'),
          k.ch('SLIPSTREAM_ENGINE_FORCE'), world.time2ticks(duration),
          world.time2ticks(k.ch('SLIPSTREAM_FADE_OUT_TIME')));
        this.time = 0;
      }
      this.time = Math.max(0, this.time - dt);
      this.effect = 0;
    }
  }
}

export class Kart {
  constructor(index, world, modelName, difficulty) {
    this.index = index;
    this.world = world;
    this.modelName = modelName;
    this.model = world.kartData[modelName];
    this.chars = this.model.characteristics[difficulty];
    this.controls = new Controls();
    this.maxSpeed = new MaxSpeed(this);
    this.skidding = new Skidding(this);
    this.slipstream = new Slipstream(this);
    this.attachment = new Attachment(this);
    this.controller = null;
    this.isPlayer = false;
    this.resetState();
  }

  ch(name) {
    const v = this.chars[name];
    return v === undefined || v === null ? this.world.config[name] : v;
  }

  resetState() {
    this.position = [0, 0.5, 0];
    this.velocity = [0, 0, 0];
    this.rotation = Q.identity();
    this.angularVelocity = [0, 0, 0];
    this.onGround = true;
    this.suspension = [this.ch('SUSPENSION_REST_LENGTH'), this.ch('SUSPENSION_REST_LENGTH'),
                       this.ch('SUSPENSION_REST_LENGTH'), this.ch('SUSPENSION_REST_LENGTH')];
    this.steerValue = 0; this.steerAngle = 0; this.brakeTime = 0;
    this.energy = 0; this.minNitroTicks = 0; this.energyToMinRatio = 0; this.nitroActive = false;
    this.powerup = null; this.finished = false; this.finishTime = null;
    this.laps = 0; this.rank = 1; this.lean = 0; this.hint = 0;
    this.distanceAlong = 0; this.overallDistance = 0; this.prevDistance = 0;
    this.startPenaltyTicks = 0; this.startBoostGiven = false; this.jumpedStart = false;
    this.collisionImpulse = [0, 0, 0]; this.collisionTicks = 0;
    this.invulnerableTicks = 0; this.squashTicks = 0; this.shieldTime = 0;
    this.rescueTicks = 0; this.rescueTotal = 0; this.explosionTicks = 0;
    this.enginePitch = 0.6; this.enginePitchFactor = 0;
    this.eliminated = false; this.terrain = 'track';
    this.maxSpeed.reset();
  }

  get axes() { return Q.axes(this.rotation); }
  get forward() { return this.axes[0]; }
  get up() { return this.axes[1]; }
  get right() { return this.axes[2]; }
  get speed() { return V.dot(this.velocity, this.axes[0]); }
  get mass() {
    const extra = this.attachment.type === ATTACH.ANVIL ? this.ch('ANVIL_WEIGHT') : 0;
    return this.ch('BASE_MASS') + extra;
  }
  hasAnimation() { return this.rescueTicks > 0 || this.explosionTicks > 0; }

  place(position, forward) {
    this.position = V.copy(position);
    this.rotation = Q.lookAt(forward, [0, 1, 0]);
    this.velocity = [0, 0, 0];
    this.angularVelocity = [0, 0, 0];
    const [d, , i] = this.world.track.distanceAlong(this.position, null);
    this.hint = i; this.distanceAlong = d; this.prevDistance = d;
  }

  // ------------------------------------------------------------ D2 steering
  updateSteering(dt) {
    const target = clamp(this.controls.steer, -1, 1);
    let cur = this.steerValue;
    if (Math.abs(target) > 1e-6) {
      const time = interpolate(this.ch('TIME_FULL_STEER'), Math.abs(cur));  // D2.4
      const step = dt / Math.max(1e-6, time);
      cur = target > cur ? Math.min(target, cur + step) : Math.max(target, cur - step);
    } else {
      const step = dt / this.ch('TIME_RESET_STEER');                        // D2.5
      cur = cur > 0 ? Math.max(0, cur - step) : Math.min(0, cur + step);
    }
    this.steerValue = clamp(cur, -1, 1);
    let effective = this.steerValue;
    if (this.skidding.direction !== 0) effective = this.skidding.reduceTurn(this.steerValue);
    this.steerAngle = this.maxSteerAngle(Math.abs(this.speed)) * effective;
  }

  maxSteerAngle(speed) {                                                    // D2.1 / D2.2
    const radius = interpolate(this.ch('TURN_RADIUS'), speed);
    return Math.asin(clamp(this.model.wheelBase / Math.max(radius, 1e-6), -1, 1));
  }

  // ------------------------------------------------------------ D3 engine
  currentGear() {                                                           // D3.2
    const sw = this.ch('GEAR_SWITCH');
    const ratio = Math.abs(this.speed) / Math.max(1e-6, this.ch('BASE_MAX_SPEED'));
    for (let i = 0; i < sw.length; i++) if (ratio < sw[i]) return i;
    return sw.length - 1;
  }
  gearPower() {
    const p = this.ch('GEAR_POWER');
    return p[Math.min(this.currentGear(), p.length - 1)];
  }
  engineForce() {
    let power = this.ch('BASE_ENGINE_POWER') * this.gearPower();
    if (this.nitroActive) power *= this.ch('NITRO_ENGINE_MULT');            // D5.2
    power += this.maxSpeed.addEngineForce;                                  // E5.2
    return power;
  }
  applyAirFriction(power) {                                                 // D3.4
    const v = Math.abs(this.speed);
    const friction = v * Math.sqrt(v) * this.world.config.AIR_FRICTION;
    const compensation = this.world.config.AIR_FRICTION_LINEAR_COMPENSATION * v * (this.mass / 350);
    return [power + compensation - friction, friction];
  }

  // ------------------------------------------------------------ D5 nitro
  updateNitro(dt) {
    const want = this.controls.nitro && this.energy > 0 && !this.hasAnimation();
    if (want && this.minNitroTicks <= 0) {                                  // D5.3
      this.minNitroTicks = this.world.config.NITRO_MIN_CONSUMPTION_TICKS;
      const needed = this.ch('NITRO_CONSUMPTION') * this.world.ticks2time(this.minNitroTicks);
      this.energyToMinRatio = Math.min(1, this.energy / Math.max(1e-6, needed)); // D5.4
    } else if (this.controls.nitro && this.minNitroTicks > 0) {
      this.minNitroTicks = Math.max(1, this.minNitroTicks);
    }
    if (this.minNitroTicks > 0) {
      this.minNitroTicks -= 1;
      this.energy = Math.max(0, this.energy - this.ch('NITRO_CONSUMPTION') * dt);
      this.nitroActive = this.onGround;                                     // D5.5
      if (this.nitroActive) {
        const duration = this.ch('NITRO_DURATION') * Math.max(this.energyToMinRatio, 1e-3);
        this.maxSpeed.increaseSpeed('nitro', this.ch('NITRO_MAX_SPEED_INCREASE'),
          this.ch('NITRO_ENGINE_FORCE'), this.world.time2ticks(duration),
          this.world.time2ticks(this.ch('NITRO_FADE_OUT_TIME')));
      }
    } else this.nitroActive = false;
    if (this.energy <= 0) { this.nitroActive = false; this.minNitroTicks = 0; }
  }
  addEnergy(amount) { this.energy = Math.min(this.ch('NITRO_MAX'), this.energy + amount); }

  // ------------------------------------------------------------ C2 engine sfx
  updateEngineSfx(dt) {
    if (this.onGround) {
      const maxS = Math.max(1e-6, this.ch('BASE_MAX_SPEED'));
      let f = Math.abs(this.speed) / maxS;
      if (f > 1) f = 1 + (1 - 1 / f);
      const gears = 3 * ((Math.min(f, 1)) % (1 / 3));
      this.enginePitchFactor = f;
      this.enginePitch = 0.6 + (0.9 * f + gears) * 0.35;                    // C2.2
    } else {
      this.enginePitchFactor *= (1 - 0.1 * dt);                             // C2.3
      if (Math.abs(this.speed) < 0.1) this.enginePitchFactor = 0;
      const f = this.enginePitchFactor;
      const gears = 3 * ((Math.min(f, 1)) % (1 / 3));
      this.enginePitch = 0.6 + (0.9 * f + gears) * 0.35;
    }
    return this.enginePitch;
  }

  // ------------------------------------------------------------ physics step
  step(dt) {
    if (this.rescueTicks > 0) { this.updateRescue(dt); return; }
    if (this.explosionTicks > 0) { this.updateExplosion(dt); return; }

    const track = this.world.track;
    this.attachment.update();
    this.updateSteering(dt);
    this.skidding.update(dt, this.onGround, this.steerValue,
                         this.controls.skid && !this.hasAnimation(), Math.abs(this.speed));
    this.slipstream.update(dt);
    this.updateNitro(dt);
    this.maxSpeed.update();

    const [forward, up, right] = this.axes;
    const mass = this.mass;

    // ---- suspension (E2.1 / E2.2) ----------------------------------------
    let suspForce = [0, 0, 0];
    let contacts = 0;
    const wheels = this.world.config.PHYSICAL_WHEELS;
    const names = Object.keys(wheels).sort();
    const rest = this.ch('SUSPENSION_REST_LENGTH'), travel = this.ch('SUSPENSION_TRAVEL');
    for (let wi = 0; wi < names.length; wi++) {
      const local = wheels[names[wi]];
      const worldP = V.add(this.position, Q.rotate(this.rotation, local));
      const [groundY] = track.surfaceHeight(worldP, this.hint);
      const length = worldP[1] - groundY;
      if (length < rest + travel) {
        contacts++;
        const compression = clamp(rest - length, -travel, travel);
        let force = this.ch('SUSPENSION_STIFFNESS') * compression * mass / 4;
        const lever = V.sub(worldP, this.position);
        const wheelVel = V.add(this.velocity, V.cross(this.angularVelocity, lever));
        const rel = wheelVel[1];
        const damping = rel < 0 ? this.ch('DAMPING_COMPRESSION') : this.ch('DAMPING_RELAXATION');
        force -= damping * rel * mass / 4;
        force = clamp(force, 0, this.ch('SUSPENSION_MAX_FORCE'));
        suspForce[1] += force;
        this.suspension[wi] = clamp(length, rest - travel, rest + travel);
      } else {
        this.suspension[wi] = rest + travel;
        suspForce[1] -= this.ch('TRACK_CONNECTION_ACCEL') * mass / 4;       // E2.6
      }
    }
    this.onGround = contacts > 0;

    let accel = [0, -GRAVITY, 0];
    accel = V.addScaled(accel, suspForce, 1 / mass);

    // ---- longitudinal force (D3) -----------------------------------------
    let longForce = 0;
    if (this.onGround && !this.hasAnimation()) {
      if (this.startPenaltyTicks > 0) this.startPenaltyTicks -= 1;
      else if (this.controls.brake) {
        this.brakeTime += dt;
        if (this.speed > 0.01) {                                            // D3.5
          longForce = -this.ch('BRAKE_FACTOR') * (1 + this.brakeTime * this.ch('BRAKE_TIME_INCREASE')) * mass;
        } else longForce = -this.ch('BASE_ENGINE_POWER') * this.gearPower() * 0.5;
      } else {
        this.brakeTime = 0;
        longForce = this.engineForce() * this.controls.accel;
      }
    }
    const [corrected, friction] = this.applyAirFriction(longForce);
    let engineAccel = corrected;
    if (this.attachment.type === ATTACH.PARACHUTE) {                        // F3.6
      engineAccel -= friction * (this.ch('PARACHUTE_FRICTION') - 1);
    }
    accel = V.addScaled(accel, forward, engineAccel / mass);

    if (this.onGround) {                                                    // E2.6
      accel[1] -= this.ch('DOWNWARD_IMPULSE_FACTOR') * Math.abs(this.speed) / mass;
    } else {                                                                // E2.7
      const lev = V.cross(up, [0, 1, 0]);
      this.angularVelocity = V.addScaled(this.angularVelocity, lev,
        this.ch('SMOOTH_FLYING_IMPULSE') / mass * dt);
    }

    if (this.collisionTicks > 0) {                                          // E3.3
      this.collisionTicks -= 1;
      accel = V.addScaled(accel, this.collisionImpulse, 1 / mass);
      if (this.collisionTicks === 0) this.collisionImpulse = [0, 0, 0];
    }

    this.velocity = V.addScaled(this.velocity, accel, dt);
    this.velocity = V.scale(this.velocity, 1 - this.ch('CHASSIS_LINEAR_DAMPING') * dt);  // E2.4

    // ---- steering / grip (D2.2) -------------------------------------------
    if (this.onGround) {
      const speedAlong = V.dot(this.velocity, forward);
      if (Math.abs(this.steerAngle) > 1e-7 && Math.abs(speedAlong) > 1e-4) {
        const yawRate = speedAlong * Math.sin(this.steerAngle) / this.model.wheelBase;
        const spin = V.dot(this.angularVelocity, up);
        this.angularVelocity = V.add(V.scale(up, yawRate),
                                     V.sub(this.angularVelocity, V.scale(up, spin)));
      } else {
        const spin = V.dot(this.angularVelocity, up);
        this.angularVelocity = V.sub(this.angularVelocity, V.scale(up, spin * Math.min(1, dt * 8)));
      }
      const lateral = V.dot(this.velocity, right);
      const grip = 1 / this.skidding.factor;
      this.velocity = V.addScaled(this.velocity, right, -lateral * Math.min(1, grip * 12 * dt));
    }

    // E2.5 -- angular factor suppresses roll and pitch
    const inv = [-this.rotation[0], -this.rotation[1], -this.rotation[2], this.rotation[3]];
    let omegaLocal = Q.rotate(inv, this.angularVelocity);
    const af = this.ch('ANGULAR_FACTOR');
    omegaLocal = [omegaLocal[0] * af[0], omegaLocal[1] * af[1], omegaLocal[2] * af[2]];
    this.angularVelocity = Q.rotate(this.rotation, omegaLocal);

    // ---- speed limits (E5) -------------------------------------------------
    const minSpeed = this.maxSpeed.popMinSpeed();
    let speedAlong = V.dot(this.velocity, forward);
    if (minSpeed > 0 && speedAlong < minSpeed) {
      this.velocity = V.addScaled(this.velocity, forward, minSpeed - speedAlong);
      speedAlong = minSpeed;
    }
    let limit = this.maxSpeed.currentMax;
    if (this.controls.brake && speedAlong < 0) {                             // D3.6
      limit = this.ch('BASE_MAX_SPEED') * this.ch('MAX_SPEED_REVERSE_RATIO');
      if (-speedAlong > limit) this.velocity = V.addScaled(this.velocity, forward, -speedAlong - limit);
    } else if (speedAlong > limit) {
      this.velocity = V.addScaled(this.velocity, forward, -(speedAlong - limit));
    }

    this.position = V.addScaled(this.position, this.velocity, dt);
    this.rotation = Q.integrate(this.rotation, this.angularVelocity, dt);

    this.resolveTrack(dt, track);
    this.updateTrackState(track);
    this.updateLean(dt);
  }

  resolveTrack(dt, track) {
    const [groundY, i] = track.surfaceHeight(this.position, this.hint);
    this.hint = i;
    const minY = groundY + this.ch('SUSPENSION_REST_LENGTH') - this.ch('SUSPENSION_TRAVEL');
    if (this.position[1] < minY) {
      this.position[1] = minY;
      if (this.velocity[1] < 0) {
        this.velocity[1] *= -interpolate(this.world.config.RESTITUTION_CURVE, Math.abs(this.velocity[1]));
      }
    }
    const q = track.quads[i];
    const lateral = V.dot(V.sub(this.position, q.center), q.right);
    const half = q.width * 0.5 + 3;
    if (Math.abs(lateral) > half) {                                         // E3.4
      const nrm = V.scale(q.right, lateral > 0 ? -1 : 1);
      this.position = V.addScaled(this.position, nrm, Math.abs(lateral) - half);
      const vn = V.dot(this.velocity, nrm);
      if (vn < 0) {
        const rest = interpolate(this.world.config.RESTITUTION_CURVE, V.len(this.velocity));
        this.velocity = V.addScaled(this.velocity, nrm, -vn * (1 + rest));
        this.velocity = V.addScaled(this.velocity, nrm, this.world.config.TERRAIN_IMPULSE / this.mass);
        this.world.playSfx('crash', this);
      }
    }
  }

  updateTrackState(track) {
    const mat = track.materialAt(this.position, this.hint);
    this.terrain = mat;
    if (mat === 'offroad') this.maxSpeed.setSlowdown('terrain', 0.5, this.world.time2ticks(1.0));
    else this.maxSpeed.clearSlowdown('terrain');
    const [ground] = track.surfaceHeight(this.position, this.hint);
    if (mat === 'reset' || this.position[1] < ground - 5) this.startRescue();  // E4.3
    const [d, , i] = track.distanceAlong(this.position, this.hint);
    this.distanceAlong = d;
    this.hint = i;
  }

  updateLean(dt) {                                                           // A1.8
    const target = this.ch('LEAN_MAX_DEG') * Math.PI / 180 * -this.steerValue *
      Math.min(1, Math.abs(this.speed) / Math.max(1e-6, this.ch('BASE_MAX_SPEED')));
    const rate = this.ch('LEAN_SPEED_DEG') * Math.PI / 180 * dt;
    this.lean = this.lean < target ? Math.min(target, this.lean + rate)
                                   : Math.max(target, this.lean - rate);
  }

  // ------------------------------------------------------------ animations
  startRescue() {                                                            // D6.2
    if (this.hasAnimation()) return;                                         // S-24
    this.rescueTicks = this.world.time2ticks(this.ch('RESCUE_DURATION'));
    this.rescueTotal = this.rescueTicks;
    this.rescueStart = V.copy(this.position);
    this.velocity = [0, 0, 0];
    this.angularVelocity = [0, 0, 0];
    this.skidding.reset();
  }
  updateRescue(dt) {
    this.rescueTicks -= 1;
    const t = 1 - this.rescueTicks / Math.max(1, this.rescueTotal);
    const track = this.world.track;
    const i = track.nearestQuad(this.rescueStart, this.hint);
    const q = track.quads[i];
    const target = V.add(q.center, [0, 0.5, 0]);
    const lift = Math.sin(Math.PI * Math.min(1, t)) * this.ch('RESCUE_HEIGHT');
    this.position = V.add(V.addScaled(this.rescueStart, V.sub(target, this.rescueStart), t), [0, lift, 0]);
    this.rotation = Q.lookAt(q.forward, [0, 1, 0]);
    this.hint = i;
    if (this.rescueTicks <= 0) {
      this.position = target;
      this.velocity = [0, 0, 0];
      this.maxSpeed.reset();
    }
  }
  startExplosion() {                                                         // B2.2
    if (this.invulnerableTicks > 0 || this.hasAnimation()) return false;
    if (this.shieldTime > 0) { this.shieldTime = 0; return false; }
    this.explosionTicks = this.world.time2ticks(this.ch('EXPLOSION_DURATION'));
    this.explosionTotal = this.explosionTicks;
    this.explosionStart = V.copy(this.position);
    this.invulnerableTicks = this.world.time2ticks(this.ch('EXPLOSION_INVULNERABILITY_TIME'));
    this.velocity = [0, 0, 0];
    this.attachment.clear();
    this.world.onExplosion(this);
    return true;
  }
  updateExplosion() {
    this.explosionTicks -= 1;
    const t = 1 - this.explosionTicks / Math.max(1, this.explosionTotal);
    const duration = this.ch('EXPLOSION_DURATION');
    const v0 = 0.5 * GRAVITY * duration, tt = t * duration;
    const h = Math.max(0, v0 * tt - 0.5 * GRAVITY * tt * tt);
    this.position = V.add(this.explosionStart, [0, h, 0]);
    if (this.explosionTicks <= 0) {
      this.position = V.copy(this.explosionStart);
      this.maxSpeed.reset();
    }
  }

  applyZipper() {                                                            // E4.2
    this.maxSpeed.instantSpeedIncrease('zipper',
      this.ch('POWERUP_ZIPPER_MAX_SPEED_INCREASE'), this.ch('POWERUP_ZIPPER_SPEED_GAIN'),
      this.ch('POWERUP_ZIPPER_FORCE'), this.world.time2ticks(this.ch('POWERUP_ZIPPER_DURATION')),
      this.world.time2ticks(this.ch('POWERUP_ZIPPER_FADE_OUT_TIME')));
  }
  setSquashed() {                                                            // B2.9
    if (this.attachment.type === ATTACH.ANVIL) return false;
    this.squashTicks = this.world.time2ticks(this.ch('SWATTER_SQUASH_DURATION'));
    this.maxSpeed.setSlowdown('squash', this.ch('SWATTER_SQUASH_SLOWDOWN') || 0.5, 0, this.squashTicks);
    return true;
  }

  updateGraphics(dt) {
    this.updateEngineSfx(dt);
    if (this.squashTicks > 0) this.squashTicks -= 1;
    if (this.invulnerableTicks > 0) this.invulnerableTicks -= 1;
    if (this.shieldTime > 0) this.shieldTime = Math.max(0, this.shieldTime - dt);
  }

  graphicalTransform() {                                                     // A1.8 / A1.9 / B1.8
    let q = this.rotation;
    const vis = this.skidding.visualRotation;
    if (Math.abs(vis) > 1e-6) q = Q.mul(q, Q.fromAxisAngle([0, 1, 0], vis * Math.PI / 4));
    if (Math.abs(this.lean) > 1e-6) q = Q.mul(q, Q.fromAxisAngle([0, 0, 1], this.lean));
    return [V.add(this.position, [0, this.skidding.jumpOffset, 0]), q];
  }
}
