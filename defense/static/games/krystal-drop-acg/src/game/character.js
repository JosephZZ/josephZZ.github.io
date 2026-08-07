// Character assets: background picture, chibi sprite and the voice table
// (checklist 3.1.5, 3.2.5, 3.2.6).
import { loadText, loadImage } from '../resources.js';
import { Sprite } from '../sprite.js';
import { Sound } from '../sound.js';

export class Character {
  constructor(name) {
    this.name = name;
    this.bg = null;          // <name>a.png, drawn inside the field
    this.big = null;         // <name>b.png
    this.small = null;       // <name>c.png
    this.chibi = null;       // Sprite
    this.voices = new Map(); // resource name -> AudioBuffer
    this.events = new Map(); // event name -> [{proba, voice, anim}]
    this.probaSum = new Map();
  }

  static async load(name) {
    const c = new Character(name);
    const dir = name + '/';
    const [txt, actions] = await Promise.all([
      loadText(dir + name + '.txt'),
      loadText(dir + 'actions.xml').catch(() => '<actions/>'),
    ]);
    const doc = new DOMParser().parseFromString(txt, 'text/xml');
    const jobs = [];
    let chibiFile = null, bgFile = null;
    const voiceFiles = [];
    for (const r of doc.getElementsByTagName('resource')) {
      const rn = r.getAttribute('name'), f = r.getAttribute('file');
      if (rn === 'chibi') chibiFile = f;
      else if (rn === 'backgroundCharacter') bgFile = f;
      else voiceFiles.push([rn, f]);
    }
    if (chibiFile) jobs.push(Sprite.load(dir + chibiFile).then(s => { c.chibi = s; }));
    if (bgFile) {
      // backgroundCharacter is a .spr wrapping <name>a.png
      jobs.push(Sprite.load(dir + bgFile)
        .then(s => { const f = s.anims[0].frames[0]; c.bg = f ? f.img : null; })
        .catch(() => loadImage(dir + name + 'a.png').then(i => { c.bg = i; })));
    }
    jobs.push(loadImage(name + 'b.png').then(i => { c.big = i; }));
    jobs.push(loadImage(name + 'c.png').then(i => { c.small = i; }));
    for (const [rn, f] of voiceFiles) {
      jobs.push(Sound.loadSample(dir + f).then(b => { if (b) c.voices.set(rn, b); }).catch(() => {}));
    }

    const ad = new DOMParser().parseFromString(actions, 'text/xml');
    for (const ev of ad.getElementsByTagName('event')) {
      const list = [];
      let sum = 0;
      for (const a of ev.getElementsByTagName('action')) {
        const p = parseInt(a.getAttribute('probability') || '1', 10);
        const v = a.getElementsByTagName('voice')[0];
        const an = a.getElementsByTagName('anim')[0];
        list.push({ proba: p, voice: v ? v.getAttribute('name') : null, anim: an ? parseInt(an.getAttribute('number'), 10) : null });
        sum += p;
      }
      c.events.set(ev.getAttribute('name'), list);
      c.probaSum.set(ev.getAttribute('name'), sum);
    }
    await Promise.all(jobs);
    return c;
  }

  // 3.2.6 - weighted random pick: rand01 * probaSum, walk the accumulator.
  playEvent(name) {
    const list = this.events.get(name);
    if (!list || !list.length) return null;
    let r = Math.random() * this.probaSum.get(name);
    for (const a of list) {
      r -= a.proba;
      if (r < 0) {
        if (a.voice && this.voices.has(a.voice)) Sound.play(this.voices.get(a.voice));
        return a;
      }
    }
    return null;
  }
}

const cache = new Map();
export function getCharacter(name) {
  let p = cache.get(name);
  if (!p) { p = Character.load(name); cache.set(name, p); }
  return p;
}
