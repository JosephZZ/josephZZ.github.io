// Camera (A4), HUD (A5 / B4) and audio (C) for the browser build.
import { V, Q, clamp } from './core.js';

// ---------------------------------------------------------------- camera A4
export class Camera {
  constructor(kart, config, numPlayers = 1) {
    this.kart = kart; this.config = config; this.numPlayers = numPlayers;
    this.mode = 'CM_NORMAL';
    this.position = V.add(V.addScaled(kart.position, kart.forward, -3), [0, 1.5, 0]);
    this.rotation = Q.lookAt(kart.forward);
    this.distance = config.CAMERA_DISTANCE_A;
  }
  get fov() { return this.config.CAMERA_FOV[String(clamp(this.numPlayers, 1, 4))]; }  // A4.1

  settings() {
    const c = this.config, k = this.kart;
    if (this.mode === 'CM_REVERSE') {                       // A4.10
      return [this.distance, c.CAMERA_BACKWARD_UP_ANGLE_DEG * Math.PI / 180, 0, false];
    }
    let steer = k.steerValue * (1 + (k.skidding.factor - 1) / c.CAMERA_SKID_FACTOR_DIV);
    const sideway = -c.CAMERA_ROTATION_RANGE * (Math.abs(steer) * steer) * 0.5;   // A4.8
    return [this.distance, c.CAMERA_ANGLE, sideway, true];
  }

  update(dt) {
    const c = this.config, k = this.kart;
    if (this.mode === 'CM_NORMAL' || this.mode === 'CM_FALLING') {
      this.mode = k.onGround ? 'CM_NORMAL' : 'CM_FALLING';   // B5.1
    }
    if (k.controls.lookBack && (this.mode === 'CM_NORMAL' || this.mode === 'CM_FALLING')) {
      this.mode = 'CM_REVERSE';                             // D6.1
    } else if (this.mode === 'CM_REVERSE' && !k.controls.lookBack) this.mode = 'CM_NORMAL';

    let ratio = k.speed / Math.max(1e-6, k.ch('BASE_MAX_SPEED'));
    ratio = Math.max(ratio, c.CAMERA_RATIO_MIN);
    this.distance = c.CAMERA_DISTANCE_A + c.CAMERA_DISTANCE_B * ratio;   // A4.3

    const [distance, camAngle, sideway, smooth] = this.settings();
    const y = (0.85 + ratio / 2.5) - Math.tan(camAngle) * distance;       // A4.4
    const skidAngle = Math.asin(clamp(k.skidding.visualRotation, -1, 1)); // A4.5
    const x = distance * Math.sin(skidAngle / 2);
    const z = distance * Math.cos(skidAngle / 2);
    let local = [x, y, z];
    if (this.mode === 'CM_REVERSE') local = [-x, y, -z];

    const [pos, rot] = k.graphicalTransform();
    const fwd = Q.rotate(rot, [0, 0, 1]);
    const flat = V.norm([fwd[0], 0, fwd[2]]);
    const yawRot = Q.lookAt(flat, [0, 1, 0]);
    const worldPos = V.add(pos, Q.rotate(yawRot, local));
    const target = V.add(pos, Q.rotate(yawRot, c.CAMERA_TARGET_LOCAL));   // A4.6
    let wanted = Q.lookAt(V.norm(V.sub(target, worldPos)), [0, 1, 0]);
    if (Math.abs(sideway) > 1e-9) wanted = Q.mul(wanted, Q.fromAxisAngle([0, 0, 1], sideway));

    if (this.mode === 'CM_FALLING') {                       // B5.1 freeze position
      // keep position
    } else if (smooth) {                                    // A4.7
      const delta = dt / Math.max(dt, c.CAMERA_SMOOTH_POSITION);
      this.position = V.add(this.position, V.scale(V.sub(worldPos, this.position), delta));
    } else this.position = worldPos;

    if (smooth) {
      const dr = dt / Math.max(dt, c.CAMERA_SMOOTH_ROTATION);
      this.rotation = Q.slerp(this.rotation, wanted, dr);
    } else this.rotation = wanted;
  }
}

// ------------------------------------------------------------------ HUD A5
const REF_W = 800, REF_H = 600;

export class HUD {
  constructor(canvas, assets, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.assets = assets;
    this.world = world;
    this.images = new Map();
    this.minimapState = 0;
    this.rankAnim = new Map();
    this.load();
  }
  load() {
    const names = ['speedback.png', 'speedfore.png', 'gauge_empty.png', 'gauge_full.png',
                   'gauge_full_bright.png', 'icons-frame.png',
                   ...Object.values(this.assets.config.POWERUP_ICON)];
    for (const n of names) {
      const img = new Image();
      img.src = this.assets.base + 'icons/' + n;
      this.images.set(n, img);
    }
    for (const [name, data] of Object.entries(this.assets.karts)) {
      if (!data.icon) continue;
      const img = new Image();
      img.src = this.assets.base + 'icons/' + data.icon;
      this.images.set('kart:' + name, img);
    }
  }
  scales(w, h) { return [w / REF_W, h / REF_H, Math.min(w / REF_W, h / REF_H)]; }

  speedMeterRect(w, h) {                                   // A5.1
    const c = this.assets.config;
    const [sx, sy, mr] = this.scales(w, h);
    const size = c.SPEEDWIDTH * mr;
    return [w - size + c.SPEED_ANCHOR_OFFSET[0] * sx, h - size + c.SPEED_ANCHOR_OFFSET[1] * sy, size];
  }
  speedRatio(speed) { return clamp(Math.abs(speed) / this.assets.config.HUD_MAX_SPEED, 0, 1); }  // A5.2

  rankAnimation(id, rank, dt) {                            // B4.1 / B4.2
    const c = this.assets.config;
    let st = this.rankAnim.get(id);
    if (!st) { st = { last: rank, timer: 0 }; this.rankAnim.set(id, st); return [rank, 1]; }
    if (rank !== st.last && st.timer <= 0) st.timer = 2 * c.RANK_ANIM_DURATION;
    if (st.timer > 0) {
      st.timer = Math.max(0, st.timer - dt);
      if (st.timer > c.RANK_ANIM_DURATION) {
        const f = (st.timer - c.RANK_ANIM_DURATION) / c.RANK_ANIM_DURATION;
        return [st.last, c.RANK_ANIM_MIN_SHRINK + (1 - c.RANK_ANIM_MIN_SHRINK) * f];
      }
      const f = 1 - st.timer / c.RANK_ANIM_DURATION;
      if (st.timer <= 0) st.last = rank;
      return [rank, c.RANK_ANIM_MIN_SHRINK + (1 - c.RANK_ANIM_MIN_SHRINK) * f];
    }
    st.last = rank;
    return [rank, 1];
  }

  draw(kart, dt) {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    const c = this.assets.config;
    const [sx, sy, mr] = this.scales(w, h);
    ctx.clearRect(0, 0, w, h);

    // speedometer + needle (A5.1 - A5.3)
    const [mx, my, msize] = this.speedMeterRect(w, h);
    const back = this.images.get('speedback.png');
    if (back && back.complete) ctx.drawImage(back, mx, my, msize, msize);
    const ax = mx + c.SPEED_NEEDLE_A[0] * msize, ay = my + c.SPEED_NEEDLE_A[1] * msize;
    const start = c.SPEED_NEEDLE_B2_DEG * Math.PI / 180;
    const end = (360 - c.SPEED_NEEDLE_J1_DEG) * Math.PI / 180;
    const angle = start + (end - start) * this.speedRatio(kart.speed);
    ctx.fillStyle = '#e63c28';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    const radius = msize * 0.45;
    for (let i = 0; i < 11; i++) {
      const a = start + (angle - start) * (i / 10);
      ctx.lineTo(ax + Math.sin(a) * radius, ay - Math.cos(a) * radius);
    }
    ctx.closePath();
    ctx.fill();
    const fore = this.images.get('speedfore.png');
    if (fore && fore.complete) ctx.drawImage(fore, mx, my, msize, msize);

    // nitro gauge (A5.4 - A5.7)
    const gsize = c.GAUGEWIDTH * mr;
    const gx = mx + c.GAUGE_ANCHOR_OFFSET[0] * sx;
    const gy = my + msize - gsize + c.GAUGE_ANCHOR_OFFSET[1] * sy;
    const empty = this.images.get('gauge_empty.png');
    if (empty && empty.complete) ctx.drawImage(empty, gx, gy, gsize, gsize);
    let state = clamp(kart.energy / kart.ch('NITRO_MAX'), 0, 1);
    for (let i = 1; i <= 5; i++) {                          // A5.6 / S-08
      const step = 0.2 * i;
      if (Math.abs(state - step) < 0.005 && state <= step) { state = step - c.GAUGE_3D_EPS; break; }
    }
    const full = this.images.get(kart.nitroActive ? 'gauge_full_bright.png' : 'gauge_full.png');
    if (full && full.complete && state > 0) {
      const hh = Math.max(1, gsize * state);
      ctx.drawImage(full, 0, full.height - full.height * state, full.width, full.height * state,
                    gx, gy + gsize - hh, gsize, hh);
    }

    // rank inside the dial (A5.8 / B4.1)
    const [rank, scale] = this.rankAnimation(kart.index, kart.rank, dt);
    const size = Math.max(8, msize / 64 * c.RANK_FONT_SCALE * mr * 64 * scale);
    ctx.font = `${size}px SigmarOne, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, size * 0.08);
    ctx.strokeStyle = '#000';
    ctx.strokeText(String(rank), mx + msize / 2, my + msize / 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(rank), mx + msize / 2, my + msize / 2);

    // powerup icon (A5.13)
    ctx.textAlign = 'left';
    if (kart.powerup) {
      const [name, count] = kart.powerup;
      const box = 56 * mr;
      const bx = w / 2 - box / 2, by = 34 * sy;
      const icon = this.images.get(c.POWERUP_ICON[name]);
      if (icon && icon.complete) ctx.drawImage(icon, bx, by, box, box);
      if (count > 1) {
        ctx.font = `${18 * mr}px Cantarell, sans-serif`;
        ctx.fillStyle = '#ffdc50';
        ctx.fillText('x' + count, bx + box - 20 * mr, by + box - 6 * mr);
      }
    }

    // timer and laps (A5.14 / A5.15)
    ctx.font = `${30 * mr}px Cantarell, sans-serif`;
    ctx.fillStyle = '#fff';
    const t = this.world.time;
    const timer = `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
    ctx.textAlign = 'center';
    ctx.fillText(timer, w / 2, 30 * sy);
    ctx.textAlign = 'left';
    const shown = clamp(kart.laps + 1, 1, this.world.laps);
    ctx.fillStyle = shown >= this.world.laps ? '#ff5a3c' : '#fff';
    ctx.fillText(`${shown}/${this.world.laps}`, 12 * sx, 30 * sy);

    this.drawMinimap(kart, w, h, mr);

    // rank column (A5.16)
    const ordered = [...this.world.karts].sort((a, b) => a.rank - b.rank);
    const iconPx = 26 * mr;
    ctx.font = `${16 * mr}px Cantarell, sans-serif`;
    ordered.forEach((k, i) => {
      const iy = 46 * sy + i * (iconPx + 4);
      const frame = this.images.get('icons-frame.png');
      const icon = this.images.get('kart:' + k.modelName);
      if (frame && frame.complete) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.drawImage(frame, 6 * sx, iy - 3, iconPx + 6, iconPx + 6);
        ctx.restore();
      }
      if (icon && icon.complete) ctx.drawImage(icon, 9 * sx, iy, iconPx, iconPx);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(k.rank), 14 * sx + iconPx, iy + iconPx * 0.7);
    });

    // Ready / Set / Go and the final-lap banner (B4.3 / B4.4)
    let banner = { READY: 'Ready', SET: 'Set', GO: 'Go!', MUSIC: 'Go!' }[this.world.phase];
    if (!banner && kart.laps + 1 === this.world.laps && this.world.time % 6 < 3) banner = 'Final Lap';
    if (this.world.phase === 'RESULT') banner = `Finished — P${kart.rank}`;
    if (banner) {
      ctx.font = `${90 * mr}px SigmarOne, Cantarell, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 6 * mr;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(banner, w / 2, h / 3);
      ctx.fillStyle = '#ffe6a0';
      ctx.fillText(banner, w / 2, h / 3);
    }
  }

  drawMinimap(kart, w, h, mr) {                             // A5.9 - A5.12
    if (this.minimapState === 2) return;
    const ctx = this.ctx;
    const size = 180 * mr;
    let rx = 10 * mr, ry = h - size - 10 * mr;
    if (this.minimapState === 1) { rx = w - size - 10 * mr; ry = h * 0.5 - size * 0.5; }
    if (this.minimapState === 3) { rx = w * 0.5 - size * 0.5; ry = h - size - 10 * mr; }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(rx, ry, size, size);
    const quads = this.assets.track.quads;
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (const q of quads) {
      minx = Math.min(minx, q.center[0]); maxx = Math.max(maxx, q.center[0]);
      minz = Math.min(minz, q.center[2]); maxz = Math.max(maxz, q.center[2]);
    }
    const span = Math.max(maxx - minx, maxz - minz) || 1;
    const toMap = (p) => [rx + (p[0] - minx) / span * size, ry + size - (p[2] - minz) / span * size];
    ctx.strokeStyle = 'rgba(200,205,225,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    quads.forEach((q, i) => {
      const [x, y] = toMap(q.center);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
    for (const k of this.world.karts) {
      const [x, y] = toMap(k.position);
      const s = (k.isPlayer ? 14 : 10) * mr;                // A5.9 player icon larger
      const icon = this.images.get('kart:' + k.modelName);
      if (icon && icon.complete) ctx.drawImage(icon, x - s / 2, y - s / 2, s, s);
      else {
        const rgb = this.assets.karts[k.modelName].rgb.map(v => Math.round(v * 255));
        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
  }
}

// ------------------------------------------------------------------ audio C
export class SoundManager {
  constructor(assets) {
    this.assets = assets;
    this.base = assets.base + 'sfx/';
    this.config = assets.config;
    this.enabled = true;
    this.buffers = new Map();
    this.engineNodes = new Map();
    this.ctx = null;
    this.music = null;
  }
  async init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const names = Object.keys(this.config.SFX || {});
      await Promise.all(names.map(async (n) => {
        try {
          const res = await fetch(this.base + n + '.ogg');
          if (!res.ok) return;
          const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(n, buf);
        } catch (e) { /* missing file: silent */ }
      }));
    } catch (e) { this.enabled = false; }
  }
  play(name, kart = null, listener = null) {                // C1.2 - C1.4
    if (!this.enabled || !this.ctx) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const info = this.config.SFX[name] || { volume: 1, positional: false, rolloff: 0.1 };
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    let volume = info.volume * 0.8;
    let pan = 0;
    if (info.positional && kart && listener) {
      const rel = V.sub(kart.position, listener.position);
      const d = V.len(rel);
      volume *= 1 / (1 + info.rolloff * d);
      if (d > 1e-3) pan = clamp(V.dot(V.scale(rel, 1 / d), listener.right), -1, 1);
    }
    gain.gain.value = volume;
    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (panner) { panner.pan.value = pan; src.connect(gain).connect(panner).connect(this.ctx.destination); }
    else src.connect(gain).connect(this.ctx.destination);
    src.start();
  }
  engine(kart, listener, name, pitch, volume = 1) {          // C2.1 / C2.4
    if (!this.enabled || !this.ctx) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    let node = this.engineNodes.get(kart.index);
    if (!node) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const gain = this.ctx.createGain();
      src.connect(gain).connect(this.ctx.destination);
      src.start();
      node = { src, gain };
      this.engineNodes.set(kart.index, node);
    }
    node.src.playbackRate.value = clamp(pitch, 0.4, 3);
    const info = this.config.SFX[name] || { volume: 0.4, rolloff: 0.2 };
    const d = listener ? V.len(V.sub(kart.position, listener.position)) : 0;
    node.gain.gain.value = info.volume * volume / (1 + info.rolloff * d) * 0.8;
  }
  loop(name, kart, on) {                                     // C3.3 / C3.4
    if (!this.enabled || !this.ctx) return;
    const key = name + ':' + kart.index;
    const existing = this.engineNodes.get(key);
    if (on && !existing) {
      const buf = this.buffers.get(name);
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = (this.config.SFX[name]?.volume ?? 1) * 0.6;
      src.connect(gain).connect(this.ctx.destination);
      src.start();
      this.engineNodes.set(key, { src, gain });
    } else if (!on && existing) {
      try { existing.src.stop(); } catch (e) {}
      this.engineNodes.delete(key);
    }
  }
  startMusic() {                                             // C4
    if (!this.config.MUSIC_FILE) return;
    if (!this.music) {
      try {
        this.music = new window.Audio(this.base + this.config.MUSIC_FILE);
        this.music.loop = true;
        this.music.volume = 0.35;
      } catch (e) { this.music = null; return; }
    }
    if (this.music.play) this.music.play().catch(() => {});
  }
  switchToFast() {}                                          // no fast section for this track
  resultMusic() { if (this.music) this.music.pause(); }
}
