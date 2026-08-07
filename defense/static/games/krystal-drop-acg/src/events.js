// Screen "events" - the transient text / particle effects (checklist 2.3-2.5).
import { Display } from './display.js';
import { ALIGN_LEFT, ALIGN_CENTERED, ALIGN_RIGHT } from './font.js';
import { GetTimeSlice } from './time.js';

// 2.3 - quadratic interpolation through (P0, P1, P2) over duration T.
//   a = 2/T^2 * (P2 + P0 - 2 P1),  b = (4 P1 - 3 P0 - P2)/T,  c = P0
export class Curve {
  constructor(p0, p1, p2, T) {
    this.a = 2 / (T * T) * (p2 + p0 - 2 * p1);
    this.b = (4 * p1 - 3 * p0 - p2) / T;
    this.c = p0;
  }
  at(t) { return this.a * t * t + this.b * t + this.c; }
}

export class KDEvent {
  constructor(T) { this.t = 0; this.T = T; this.dead = false; }
  update(dt) {
    this.t += dt;
    if (this.t > this.T) this.dead = true;   // 2.3.1 - self destruction
  }
  display() {}
}

const D = (v, def) => (v === undefined ? def : v);

export class TextEvent extends KDEvent {
  // spec: {x:[p0,p1,p2], y:[...], alpha:[...], scaleX, scaleY, r,g,b, angle}
  constructor(font, str, T, spec, align = ALIGN_LEFT) {
    super(T);
    this.font = font; this.str = str; this.align = align;
    const mk = (v, def) => new Curve(...(v || [def, def, def]), T);
    this.cx = mk(spec.x, 0);
    this.cy = mk(spec.y, 0);
    this.ca = mk(spec.alpha, 255);
    this.csx = mk(spec.scaleX, 1);
    this.csy = mk(spec.scaleY, 1);
    this.cr = mk(spec.r, 255);
    this.cg = mk(spec.g, 255);
    this.cb = mk(spec.b, 255);
    this.cang = mk(spec.angle, 0);
    this.blinkVisible = D(spec.blinkVisible, 0);
    this.blinkInvisible = D(spec.blinkInvisible, 0);
  }
  display() {
    const t = this.t;
    if (this.blinkVisible > 0) {
      // 2.3.5 - blink in integer milliseconds.
      const period = this.blinkVisible + this.blinkInvisible;
      if (Math.floor(t * 1000) % period >= this.blinkVisible) return;
    }
    this.font.draw(this.str, this.cx.at(t), this.cy.at(t), this.align, {
      alpha: this.ca.at(t),
      scaleX: this.csx.at(t), scaleY: this.csy.at(t),
      r: this.cr.at(t), g: this.cg.at(t), b: this.cb.at(t),
      angle: this.cang.at(t),
    });
  }
}

// 2.4.1 - per-character wave/bounce used by the title-ish screens.
export class BouncingText extends KDEvent {
  constructor(font, str, cx, cy) {
    super(Infinity);
    this.font = font; this.str = str; this.cx = cx; this.cy = cy;
    this.space = font.advance(32) * 8 / 7;
  }
  display() {
    const t = this.t, len = this.str.length, sp = this.space;
    for (let i = 0; i < len; i++) {
      const ch = this.str[i];
      if (ch === ' ') continue;
      const time_r = 8 * t + 12 * i;
      const time_s = 4 * t + 8 * i;
      const time_v = time_s % 20;
      const famp = (a) => (a > 10 ? 15 - a : a - 5);
      const fp = (a) => Math.max(a, 0);
      const angle = fp(0.2 - famp(time_v)) * Math.cos(time_r) / 12;
      const x = this.cx + (i - len / 2) * sp;
      const y = this.cy - Math.abs(fp(famp(time_v)) * sp / 4 * Math.cos(time_r));
      this.font.draw(ch, x, y, ALIGN_LEFT, { angle });
    }
  }
}

// 2.4.2 - spiralling entrance, fly-apart exit.
export class MessageText extends KDEvent {
  constructor(font, str, cx, cy) {
    super(Infinity);
    this.font = font; this.str = str; this.cx = cx; this.cy = cy;
    this.space = font.advance(32) * 8 / 7;
    this.leaving = false;
    this.leaveT = 0;
  }
  leave() { if (!this.leaving) { this.leaving = true; this.leaveT = 0; } }
  update(dt) {
    this.t += dt;
    if (this.leaving) {
      this.leaveT += dt;
      if (this.leaveT > 2) this.dead = true;
    }
  }
  display() {
    const len = this.str.length, sp = this.space;
    for (let i = 0; i < len; i++) {
      const ch = this.str[i];
      if (ch === ' ') continue;
      let x, y;
      const tau = 450 * this.t - 30 * i;
      if (tau <= 0) continue;
      if (tau < 800) {
        x = this.cx + Math.cos(tau / 400) * (800 - tau) + (i - len / 2) * sp;
        y = this.cy + Math.sin(tau / 400) * (800 - tau);
      } else {
        x = this.cx + (i - len / 2) * sp;
        y = this.cy;
      }
      if (this.leaving) {
        const dir = (i < len / 2) ? -1 : 1;
        x += dir * 900 * this.leaveT * this.leaveT;
      }
      this.font.draw(ch, x, y, ALIGN_LEFT, null);
    }
  }
}

// ---- particles (2.5.1) -------------------------------------------------
const PARTICLE_LIFE = 3;      // seconds
const ROT_MAX = 14;

class Particle {
  constructor(x, y, vx, vy, gravity, rotSpeed, c0, c1) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.gravity = gravity; this.rot = 0; this.rotSpeed = rotSpeed;
    this.c0 = c0; this.c1 = c1; this.t = 0; this.dead = false;
  }
  update(dt) {
    this.t += dt;
    if (this.t > PARTICLE_LIFE) { this.dead = true; return; }
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.rotSpeed * dt;
  }
  display(sprInst) {
    const k = this.t / PARTICLE_LIFE;
    const c0 = this.c0, c1 = this.c1;
    const r = c0[0] + (c1[0] - c0[0]) * k;
    const g = c0[1] + (c1[1] - c0[1]) * k;
    const b = c0[2] + (c1[2] - c0[2]) * k;
    const a = c0[3] + (c1[3] - c0[3]) * k;
    sprInst.display(this.x, this.y, { alpha: a, r, g, b, angle: this.rot });
  }
}

export class ParticleEmitter extends KDEvent {
  // opts: x,y,vx,vy,gravity,angle,powerVar,ttl,interval,color0,color1,sprite
  constructor(opts) {
    super(Infinity);
    Object.assign(this, {
      x: 0, y: 0, vx: 0, vy: -100, gravity: 90,
      angle: 0.4, powerVar: 0.4, ttl: 1, interval: 20,
      color0: [255, 255, 255, 255], color1: [255, 0, 0, 0],
    }, opts);
    this.sprInst = opts.sprite.instance();
    this.particles = [];
    this.life = 0;
  }
  update(dt) {
    this.life += dt;
    this.sprInst.update();
    if (this.life <= this.ttl) {
      // 2.5.1 - emit GetTimeSlice(interval) particles per frame.
      const n = GetTimeSlice(this.interval);
      for (let i = 0; i < n; i++) this.emit();
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update(dt);
      if (p.dead) this.particles.splice(i, 1);
    }
    if (this.life > this.ttl && this.particles.length === 0) this.dead = true;
  }
  emit() {
    const th = (Math.random() - 0.5) * this.angle;
    const p = 1 + Math.random() * this.powerVar - this.powerVar / 2;
    const c = Math.cos(th), s = Math.sin(th);
    const vx = this.vx * c * p - this.vy * s;
    const vy = this.vy * c * p + this.vx * s;
    const rs = (Math.random() * 2 - 1) * ROT_MAX;
    this.particles.push(new Particle(this.x, this.y, vx, vy, this.gravity, rs, this.color0, this.color1));
  }
  display() { for (const p of this.particles) p.display(this.sprInst); }
}

export { ALIGN_LEFT, ALIGN_CENTERED, ALIGN_RIGHT };
