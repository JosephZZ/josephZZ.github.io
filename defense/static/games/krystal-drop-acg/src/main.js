import { Display } from './display.js';
import { Kernel, KD_FRONT_POS, KD_LAST_POS } from './kernel.js';
import { Sprite } from './sprite.js';
import { Font } from './font.js';
import { loadImage, loadText } from './resources.js';
import { Sound, loadSoundBank, MUS } from './sound.js';
import { Config } from './config.js';
import { HighScoreTable } from './highscore.js';
import { CHARACTERS, GEM_NAMES } from './game/consts.js';
import { getCharacter } from './game/character.js';

import { BackgroundController } from './ctrl/background.js';
import { TitleController } from './ctrl/title.js';
import { MenuController } from './ctrl/menu.js';
import { CharSel1PController } from './ctrl/charsel1p.js';
import { CharSel2PController } from './ctrl/charsel2p.js';
import { SurvivalController } from './ctrl/survival.js';
import { DuelController } from './ctrl/duel.js';
import { HighScoresController } from './ctrl/highscores.js';
import { ControlsController } from './ctrl/controls.js';

const boot = document.getElementById('boot');
const say = (s) => { boot.textContent = s; };

async function loadResources() {
  const res = { img: {}, gems: {} };
  say('loading sprites...');
  const sprJobs = [
    ...GEM_NAMES.map((n, i) => Sprite.load(n + '.spr').then(s => { res.gems[i] = s; })),
    Sprite.load('line.spr').then(s => { res.line = s; }),
    Sprite.load('star.spr').then(s => { res.star = s; }),
    Sprite.load('cup.spr').then(s => { res.cup = s; }),
    Sprite.load('doorl.spr').then(s => { res.doorl = s; }),
    Sprite.load('doorr.spr').then(s => { res.doorr = s; }),
    Sprite.load('bottombar.spr').then(s => { res.bottombar = s; }),
    Sprite.load('horizontalbar.spr').then(s => { res.horizontalbar = s; }),
    Sprite.load('verticalbar.spr').then(s => { res.verticalbar = s; }),
    Sprite.load('upleftcorner.spr').then(s => { res.upleftcorner = s; }),
    Sprite.load('uprightcorner.spr').then(s => { res.uprightcorner = s; }),
    Sprite.load('ar_l.spr').then(s => { res.arrowL = s; }),
    Sprite.load('ar_r.spr').then(s => { res.arrowR = s; }),
  ];
  const imgs = ['title1', 'title2', 'title3', 'terrain2', 'terrainMulti', 'vs', 'borders1p', 'borders2p'];
  const imgJobs = imgs.map(n => loadImage(n + '.png').then(i => { res.img[n] = i; }));
  await Promise.all([...sprJobs, ...imgJobs]);

  say('loading fonts...');
  res.fonts = await Font.loadFamily();

  say('loading tables...');
  [res.tableTxt, res.tableDuelTxt] = await Promise.all([
    loadText('table.txt'), loadText('tableDuel.txt'),
  ]);
  return res;
}

class App {
  constructor(res, highScores) {
    this.res = res;
    this.highScores = highScores;
    this.charCache = {};
    this.background = new BackgroundController(res);
    this.title = new TitleController(res, this);
    this.menu = new MenuController(res, this);
    this.charsel1p = new CharSel1PController(res, this);
    this.charsel2p = new CharSel2PController(res, this);
    this.survival = new SurvivalController(res, this);
    this.duel = new DuelController(res, this);
    this.highscores = new HighScoresController(res, this);
    this.controls = new ControlsController(res, this);
    this.front = null;
  }

  // 7.1.1 - Background stays at KD_LAST_POS; scenes are pushed in front.
  setFront(c) {
    if (this.front) Kernel.disableController(this.front);
    this.front = c;
    Kernel.enableController(c, KD_FRONT_POS);
    if (!Kernel.isEnabled(this.background)) Kernel.enableController(this.background, KD_LAST_POS);
  }
  setGame(c) {
    if (this.front) Kernel.disableController(this.front);
    this.front = c;
    Kernel.enableController(c, KD_FRONT_POS);
    Kernel.disableController(this.background);   // the game draws its own backdrop
  }

  gotoTitle() { this.setFront(this.title); }
  gotoMenu() { this.setFront(this.menu); }
  gotoCharSel1P() { this.setFront(this.charsel1p); }
  gotoCharSel2P() { this.setFront(this.charsel2p); }
  gotoControls() { this.setFront(this.controls); }
  gotoHighScores() { this.setFront(this.highscores); }

  startSurvival(name) {
    this.survival.start(this.charCache[name]);
    this.setGame(this.survival);
  }
  startDuel(n1, n2) {
    this.duel.start(this.charCache[n1], this.charCache[n2]);
    this.setGame(this.duel);
  }

  // called when the survival run is completely over
  finishSurvival(name, score, charName) {
    if (name !== null) {
      const id = CHARACTERS.indexOf(charName) + 1;
      this.highScores.insert(name, score, id);
      this.highScores.save();
    }
    this.gotoHighScores();
  }
}

async function main() {
  Display.init(document.getElementById('screen'));
  await Config.load();
  Sound.init(Config.sound);
  say('loading audio...');
  await loadSoundBank();
  const res = await loadResources();
  say('loading characters...');
  const hs = await HighScoreTable.load();
  const app = new App(res, hs);
  const chars = await Promise.all(CHARACTERS.map(n => getCharacter(n)));
  CHARACTERS.forEach((n, i) => { app.charCache[n] = chars[i]; });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;                 // 4.2.1 - no auto repeat, ever
    Kernel.pushKey(e);
    if (e.key === ' ' || e.key.startsWith('Arrow') || e.key === 'Enter') e.preventDefault();
  });

  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  boot.style.display = 'none';
  app.gotoTitle();
  Kernel.start();
  window.__kd = { app, res, Kernel };
}

function fitCanvas() {
  const cv = document.getElementById('screen');
  const k = Math.max(1, Math.min(window.innerWidth / 640, window.innerHeight / 480));
  cv.style.width = (640 * k) + 'px';
  cv.style.height = (480 * k) + 'px';
}

main().catch(e => { say('error: ' + e.message + '\n' + (e.stack || '')); console.error(e); });
