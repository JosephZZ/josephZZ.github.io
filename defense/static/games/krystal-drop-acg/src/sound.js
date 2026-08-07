// Audio (checklist 3).
//  * sound effects are multi-channel: every PlaySound() starts an independent
//    voice, nothing is ever pre-empted (3.3.3)
//  * music is a single track, hard Stop/Close then Load/Play (3.3.4)
//  * volumes are on the SDL_mixer 0..128 scale; defaults are 127/127 (3.3.1)
import { loadBinary } from './resources.js';

export const Sound = {
  enabled: true,
  frequency: 44100,
  bits: 16,
  stereo: true,
  ctx: null,
  soundVolume: 127,
  musicVolume: 127,
  _buffers: new Map(),
  _music: null,
  _musicPath: null,

  init(cfg) {
    if (cfg) {
      this.enabled = cfg.enable !== false;
      this.frequency = cfg.frequency || 44100;
      this.bits = cfg.bits || 16;
      this.stereo = cfg.stereo !== false;
    }
    if (!this.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    try { this.ctx = new AC({ sampleRate: this.frequency }); }
    catch (e) { this.ctx = new AC(); }
  },

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  async loadSample(path) {
    if (!this.enabled || !this.ctx) return null;
    if (this._buffers.has(path)) return this._buffers.get(path);
    const p = loadBinary(path)
      .then(b => this.ctx.decodeAudioData(b))
      .catch(() => null);
    this._buffers.set(path, p);
    return p;
  },

  setSoundVolume(v) { this.soundVolume = v; },
  setMusicVolume(v) {
    this.musicVolume = v;
    if (this._music) this._music.volume = Math.max(0, Math.min(1, v / 128));
  },

  // volume defaults to the global sound volume; a per-sample override is used
  // by Duel for gemsDown/gemsUp (3.3.2).
  play(buffer, volume) {
    if (!this.enabled || !this.ctx || !buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = (volume === undefined ? this.soundVolume : volume) / 128;
    src.connect(g).connect(this.ctx.destination);
    src.start();
  },

  playMusic(path, volume) {
    if (!this.enabled) return;
    this.stopMusic();
    const a = new Audio('assets/' + path);
    a.loop = true;
    a.volume = Math.max(0, Math.min(1, (volume === undefined ? this.musicVolume : volume) / 128));
    a.play().catch(() => { /* autoplay gate; retried on first key */ });
    this._music = a;
    this._musicPath = path;
  },

  stopMusic() {
    if (this._music) { this._music.pause(); this._music.src = ''; this._music = null; }
    this._musicPath = null;
  },

  retryMusic() {
    if (this._music && this._music.paused) this._music.play().catch(() => {});
  },
};

// Named sound bank (resource names come from sound.txt / <char>.txt).
export const SFX = {};

export async function loadSoundBank() {
  const names = {
    gemsDownSound: 'swing.wav',
    gemsUpSound: 'swing2.wav',
    clapSound: 'waterdrop.wav',
    readyGoSound: 'readygo.wav',
  };
  for (let i = 1; i <= 13; i++) names['clash' + i] = 'clash' + i + '.wav';
  const jobs = [];
  for (const k in names) jobs.push(Sound.loadSample(names[k]).then(b => { SFX[k] = b; }));
  await Promise.all(jobs);
}

// 3.1.4 - music files.  puzzle3.ogg is never used (dead asset, section 9.5).
export const MUS = {
  TITLE: 'musics/puzzle2.ogg',      // title + menu
  CHARSEL: 'musics/puzzle4.ogg',    // 1P / 2P character select
  GAME: 'musics/survival.ogg',      // survival + duel
  LOSE: 'musics/puzzlelose.ogg',    // duel continue screen
  MENU: 'musics/puzzle1.ogg',       // high scores + options
};
