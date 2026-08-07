// Maths + track + kart physics, ported from the Python build one-to-one.
// No DOM/WebGL in this file so it can be unit tested under node.

export const V = {
  make: (x = 0, y = 0, z = 0) => [x, y, z],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
                    a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; },
  copy: (a) => [a[0], a[1], a[2]],
  addScaled: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
};

export const clamp = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));

// Piecewise linear interpolation over [[x,y], ...] (D2.1 / E3.5 / F5.3)
export function interpolate(points, x) {
  if (!points || !points.length) return 0;
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    if (x <= x1) {
      if (x1 === x0) return y1;
      return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
    }
  }
  return points[points.length - 1][1];
}

// ---------------------------------------------------------------- quaternions
export const Q = {
  identity: () => [0, 0, 0, 1],
  fromAxisAngle(axis, angle) {
    const a = V.norm(axis), s = Math.sin(angle * 0.5);
    return [a[0] * s, a[1] * s, a[2] * s, Math.cos(angle * 0.5)];
  },
  mul(a, b) {
    const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
    return [aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz];
  },
  normalize(q) {
    const l = Math.hypot(q[0], q[1], q[2], q[3]);
    return l > 1e-12 ? [q[0] / l, q[1] / l, q[2] / l, q[3] / l] : Q.identity();
  },
  rotate(q, v) {
    const [x, y, z, w] = q, [vx, vy, vz] = v;
    const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
    return [vx + w * tx + y * tz - z * ty,
            vy + w * ty + z * tx - x * tz,
            vz + w * tz + x * ty - y * tx];
  },
  integrate(q, omega, dt) {
    const a = V.len(omega);
    if (a < 1e-9) return q;
    return Q.normalize(Q.mul(Q.fromAxisAngle(V.scale(omega, 1 / a), a * dt), q));
  },
  slerp(a, b, t) {   // A4.7 shortest path
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bb = b.slice();
    if (d < 0) { bb = bb.map(v => -v); d = -d; }
    if (d > 0.9995) return Q.normalize(a.map((v, i) => v + (bb[i] - v) * t));
    const th0 = Math.acos(clamp(d, -1, 1)), th = th0 * t;
    const rel = Q.normalize(bb.map((v, i) => v - a[i] * d));
    return a.map((v, i) => v * Math.cos(th) + rel[i] * Math.sin(th));
  },
  axes(q) {          // returns [forward, up, right]
    const [x, y, z, w] = q;
    const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z;
    const wx = w * x, wy = w * y, wz = w * z;
    return [[2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy)],
            [2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx)],
            [1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy)]];
  },
  lookAt(forward, up = [0, 1, 0]) {
    const f = V.norm(forward);
    let r = V.cross(up, f);
    if (V.len(r) < 1e-6) r = [1, 0, 0];
    r = V.norm(r);
    const u = V.cross(f, r);
    const m = [[r[0], u[0], f[0]], [r[1], u[1], f[1]], [r[2], u[2], f[2]]];
    const tr = m[0][0] + m[1][1] + m[2][2];
    let q;
    if (tr > 0) {
      const s = Math.sqrt(tr + 1) * 2;
      q = [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, 0.25 * s];
    } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
      const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
      q = [0.25 * s, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s];
    } else if (m[1][1] > m[2][2]) {
      const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
      q = [(m[0][1] + m[1][0]) / s, 0.25 * s, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s];
    } else {
      const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
      q = [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, 0.25 * s, (m[1][0] - m[0][1]) / s];
    }
    return Q.normalize(q);
  },
};

// ------------------------------------------------------------------- track
export class Track {
  constructor(data) {
    this.data = data;
    this.name = data.name;
    this.quads = data.quads;
    this.totalDistance = data.totalDistance;
    this.laps = data.laps;
    this.offroadLimit = 6.0;
    this.centers = data.quads.map(q => q.center);
  }

  nearestQuad(pos, hint) {
    const n = this.quads.length;
    if (hint !== undefined && hint !== null) {
      let best = -1, bestD = 1e30;
      for (let k = -8; k < 25; k++) {
        const i = ((hint + k) % n + n) % n;
        const c = this.centers[i];
        const dx = c[0] - pos[0], dy = (c[1] - pos[1]) * 0.5, dz = c[2] - pos[2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (bestD < 2500) return best;
    }
    let best = 0, bestD = 1e30;
    for (let i = 0; i < n; i++) {
      const c = this.centers[i];
      const dx = c[0] - pos[0], dy = (c[1] - pos[1]) * 0.5, dz = c[2] - pos[2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  containsXZ(q, p) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = q.p[i], b = q.p[(i + 1) % 4];
      const cross = (b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]);
      if (Math.abs(cross) < 1e-9) continue;
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s; else if (s !== sign) return false;
    }
    return true;
  }

  quadAt(pos, hint) {
    const i = this.nearestQuad(pos, hint);
    if (this.containsXZ(this.quads[i], pos)) return [i, true];
    const n = this.quads.length;
    for (let k = -3; k <= 3; k++) {
      const j = ((i + k) % n + n) % n;
      if (this.containsXZ(this.quads[j], pos)) return [j, true];
    }
    return [i, false];
  }

  heightIn(q, p) {
    const rel = V.sub(p, q.center);
    const along = V.dot(rel, q.forward), side = V.dot(rel, q.right);
    const u = clamp(0.5 + along / q.length, 0, 1);
    const v = clamp(0.5 + side / q.width, 0, 1);
    const top = q.p[0][1] * (1 - v) + q.p[1][1] * v;
    const bottom = q.p[3][1] * (1 - v) + q.p[2][1] * v;
    return top * (1 - u) + bottom * u;
  }

  surfaceHeight(pos, hint) {
    const [i, inside] = this.quadAt(pos, hint);
    const q = this.quads[i];
    if (inside) return [this.heightIn(q, pos), i];
    const excess = Math.max(0, Math.abs(V.dot(V.sub(pos, q.center), q.right)) - q.width * 0.5);
    return [this.heightIn(q, pos) - Math.min(excess * 0.15, 1.5), i];
  }

  materialAt(pos, hint) {
    const [i, inside] = this.quadAt(pos, hint);
    if (inside) return 'track';
    const q = this.quads[i];
    const excess = Math.abs(V.dot(V.sub(pos, q.center), q.right)) - q.width * 0.5;
    return excess > this.offroadLimit ? 'reset' : 'offroad';
  }

  distanceAlong(pos, hint) {
    const i = this.nearestQuad(pos, hint);
    const q = this.quads[i];
    const rel = V.sub(pos, q.center);
    const along = V.dot(rel, q.forward) + q.length * 0.5;
    return [q.distance + along, V.dot(rel, q.right), i];
  }

  startTransform(slot) {              // A2.8
    const n = this.quads.length;
    const row = Math.floor(slot / 2), col = slot % 2 === 0 ? -1 : 1;
    const target = 5 + row * 6;
    let idx = 0, dExit = 0;
    for (let k = 0; k < 4 * n; k++) {
      const prev = this.quads[idx].prev;
      if (!prev.length) break;
      idx = prev[0];
      const q = this.quads[idx];
      if (dExit + q.length >= target) break;
      dExit += q.length;
    }
    const q = this.quads[idx];
    const fwd = Math.max(0, (dExit + q.length) - target);
    const entry = V.scale(V.add(q.p[0], q.p[1]), 0.5);
    let pos = V.addScaled(entry, q.forward, fwd);
    pos = V.addScaled(pos, q.right, col * Math.min(2.5, q.width * 0.25));
    pos = V.add(pos, [0, 0.5, 0]);
    return [pos, V.copy(q.forward)];
  }
}

// --------------------------------------------------------------- max speed
export const INCREASE_CATS = ['zipper', 'slipstream', 'nitro', 'skidding', 'red-skidding'];
export const DECREASE_CATS = ['terrain', 'ai', 'bubble', 'squash', 'end-controller'];

class SpeedIncrease {
  constructor() { this.reset(); }
  reset() { this.maxAdd = 0; this.engineForce = 0; this.ticks = 0; this.fadeOut = 0; this.current = 0; }
  set(maxAdd, force, ticks, fade) {
    this.maxAdd = maxAdd; this.engineForce = force; this.ticks = ticks;
    this.fadeOut = fade; this.current = maxAdd;
  }
  update() {                                   // E5.3
    this.ticks -= 1;
    if (this.ticks >= 0) { this.current = this.maxAdd; return; }
    if (this.fadeOut <= 0 || -this.ticks > this.fadeOut) {
      this.current = 0; this.engineForce = 0; this.maxAdd = 0; return;
    }
    this.current = this.maxAdd * (1 - (-this.ticks) / this.fadeOut);
  }
  get active() { return this.current > 0 || this.ticks >= 0; }
  force() {
    if (this.ticks >= 0) return this.engineForce;
    if (this.fadeOut <= 0 || -this.ticks > this.fadeOut) return 0;
    return this.engineForce * (1 - (-this.ticks) / this.fadeOut);
  }
}

class SpeedDecrease {
  constructor() { this.reset(); }
  reset() { this.fraction = 1; this.current = 1; this.ticks = 0; this.fadeIn = 0; }
  set(fraction, fadeIn, duration = -1) {
    this.fraction = fraction; this.fadeIn = fadeIn; this.ticks = duration;
    if (fadeIn <= 0) this.current = fraction;
  }
  update() {                                   // E5.4
    if (this.ticks > 0) { this.ticks -= 1; if (this.ticks === 0) this.fraction = 1; }
    if (this.fadeIn > 0) {
      const step = 1 / this.fadeIn;
      this.current = this.current > this.fraction
        ? Math.max(this.fraction, this.current - step)
        : Math.min(this.fraction, this.current + step);
    } else this.current = this.fraction;
  }
}

export class MaxSpeed {
  constructor(kart) {
    this.kart = kart;
    this.inc = {}; this.dec = {};
    for (const c of INCREASE_CATS) this.inc[c] = new SpeedIncrease();
    for (const c of DECREASE_CATS) this.dec[c] = new SpeedDecrease();
    this.currentMax = kart.ch('BASE_MAX_SPEED');
    this.addEngineForce = 0;
    this.minSpeed = 0;
  }
  reset() {
    for (const c of INCREASE_CATS) this.inc[c].reset();
    for (const c of DECREASE_CATS) this.dec[c].reset();
    this.currentMax = this.kart.ch('BASE_MAX_SPEED');
    this.addEngineForce = 0; this.minSpeed = 0;
  }
  increaseSpeed(cat, maxAdd, force, ticks, fade) { this.inc[cat].set(maxAdd, force, ticks, fade); }
  instantSpeedIncrease(cat, maxAdd, boost, force, ticks, fade) {   // D4.6
    this.increaseSpeed(cat, maxAdd, force, ticks, fade);
    this.minSpeed = Math.max(this.minSpeed, this.kart.speed + boost);
  }
  setSlowdown(cat, fraction, fadeIn, duration) { this.dec[cat].set(fraction, fadeIn, duration); }
  clearSlowdown(cat) { this.dec[cat].set(1, 0); }
  update() {
    let current = this.kart.ch('BASE_MAX_SPEED');
    let force = 0;
    for (const c of INCREASE_CATS) this.inc[c].update();
    // D4.10 -- level 1 and level 2 skid bonus never stack
    let cancelSpeed = 0, cancelForce = 0;
    if (this.inc['skidding'].active && this.inc['red-skidding'].active) {
      cancelSpeed = this.inc['skidding'].current;
      cancelForce = this.inc['skidding'].force();
    }
    for (const c of INCREASE_CATS) { current += this.inc[c].current; force += this.inc[c].force(); }
    current -= cancelSpeed; force -= cancelForce;
    let slowdown = 1;
    for (const c of DECREASE_CATS) { this.dec[c].update(); slowdown = Math.min(slowdown, this.dec[c].current); }
    current *= slowdown;                       // E5.1 / E5.2
    if (!this.kart.onGround) current = 9999.9; // E5.5
    this.currentMax = current;
    this.addEngineForce = force;
  }
  popMinSpeed() { const v = this.minSpeed; this.minSpeed = 0; return v; }
}

// ---------------------------------------------------------------- skidding
export const SKID = { NONE: 0, ACC_L: 1, ACC_R: 2, GFX_L: 3, GFX_R: 4, BREAK: 5 };

export class Skidding {
  constructor(kart) { this.kart = kart; this.reset(); }
  reset() {
    this.state = SKID.NONE; this.factor = 1; this.time = 0; this.visualRotation = 0;
    this.jumpTime = 0; this.jumpOffset = 0; this.gfxTimeLeft = 0; this.bonusLevel = 0;
  }
  get isSkidding() { return this.state === SKID.ACC_L || this.state === SKID.ACC_R; }
  get direction() {
    if (this.state === SKID.ACC_L || this.state === SKID.GFX_L) return -1;
    if (this.state === SKID.ACC_R || this.state === SKID.GFX_R) return 1;
    return 0;
  }
  level() {                                     // B1.2 / D4.4
    const th = this.kart.ch('SKID_TIME_TILL_BONUS');
    let lvl = 0;
    th.forEach((t, i) => { if (this.time > t) lvl = i + 1; });
    return lvl;
  }
  reduceTurn(steer) {                           // D2.7
    const d = this.direction;
    if (d === 0) return steer;
    const lo = this.kart.ch('SKID_REDUCE_TURN_MIN'), hi = this.kart.ch('SKID_REDUCE_TURN_MAX');
    if (d > 0) return lo + (hi - lo) * (steer + 1) * 0.5;
    return -(lo + (hi - lo) * (-steer + 1) * 0.5);
  }
  update(dt, onGround, steer, key, speed) {
    if (this.jumpTime > 0) {                    // B1.8 graphical jump
      this.jumpTime -= dt;
      const total = this.kart.ch('SKID_GRAPHICAL_JUMP_TIME');
      const t = total - this.jumpTime, g = 9.81, v0 = 0.5 * g * total;
      this.jumpOffset = Math.max(0, v0 * t - 0.5 * g * t * t);
      if (this.jumpTime <= 0) { this.jumpTime = 0; this.jumpOffset = 0; }
    } else this.jumpOffset = 0;

    if (!onGround) this.factor = 1;             // D4.8

    if (this.isSkidding) {
      if (speed <= this.kart.ch('SKID_MIN_SPEED') || !onGround) {   // S-02 / S-03
        this.state = SKID.BREAK; this.time = 0;
      } else if (!key) {
        this.release();
      } else {                                  // D4.3
        this.factor += this.kart.ch('SKID_INCREASE') * dt / this.kart.ch('SKID_TIME_TILL_MAX');
        this.factor = clamp(this.factor, 1, this.kart.ch('SKID_MAX'));
        this.time += dt;
      }
    } else if (this.state === SKID.GFX_L || this.state === SKID.GFX_R) {
      this.gfxTimeLeft -= dt;
      if (this.gfxTimeLeft <= 0) { this.state = SKID.NONE; this.time = 0; }
      this.decay();
    } else if (this.state === SKID.BREAK) {
      this.decay();
      if (this.factor <= 1 && !key) { this.state = SKID.NONE; this.time = 0; }
    } else {
      this.decay();
      this.maybeStart(onGround, steer, key, speed);
    }
    this.bonusLevel = this.isSkidding ? this.level() : 0;
    this.updateVisual(dt);
  }
  maybeStart(onGround, steer, key, speed) {     // D4.2
    if (!key || !onGround) return;
    if (Math.abs(steer) <= 0.001) return;
    if (speed <= this.kart.ch('SKID_MIN_SPEED')) return;   // S-01 strict >
    if (this.jumpTime > 0) return;
    this.state = steer > 0 ? SKID.ACC_R : SKID.ACC_L;
    this.time = 0;
    this.jumpTime = this.kart.ch('SKID_GRAPHICAL_JUMP_TIME');
  }
  decay() {
    if (this.factor > 1) this.factor = Math.max(1, this.factor * this.kart.ch('SKID_DECREASE'));
  }
  release() {
    const level = this.level(), dir = this.direction;
    if (level > 0) {
      const i = level - 1;
      const speed = this.kart.ch('SKID_BONUS_SPEED')[i];
      const time = this.kart.ch('SKID_BONUS_TIME')[i];
      const force = this.kart.ch('SKID_BONUS_FORCE')[i];
      const cat = level === 1 ? 'skidding' : 'red-skidding';
      this.kart.maxSpeed.instantSpeedIncrease(cat, speed, speed / 2, force,
        this.kart.world.time2ticks(time), this.kart.world.time2ticks(1.0));  // D4.6
      this.kart.world.onSkidBonus(this.kart, level);
      this.state = dir > 0 ? SKID.GFX_R : SKID.GFX_L;
      this.gfxTimeLeft = Math.min(this.time, this.kart.ch('SKID_VISUAL_TIME'),
                                  this.kart.ch('SKID_REVERT_VISUAL_TIME'));   // D4.7
    } else { this.state = SKID.NONE; this.time = 0; }
  }
  updateVisual(dt) {                            // A1.9 clamp to [-1, 1]
    let target = 0;
    if (this.isSkidding) {
      const f = (this.factor - 1) / Math.max(1e-6, this.kart.ch('SKID_MAX') - 1);
      target = this.direction * f;
    } else if (this.state === SKID.GFX_L || this.state === SKID.GFX_R) {
      const span = Math.max(1e-6, Math.min(this.time, this.kart.ch('SKID_VISUAL_TIME'),
                                           this.kart.ch('SKID_REVERT_VISUAL_TIME')));
      target = this.visualRotation * Math.max(0, this.gfxTimeLeft / span);
    }
    const rate = dt / Math.max(1e-6, this.kart.ch('SKID_VISUAL_TIME'));
    this.visualRotation += (target - this.visualRotation) * Math.min(1, rate * 4);
    this.visualRotation = clamp(this.visualRotation, -1, 1);
  }
}
