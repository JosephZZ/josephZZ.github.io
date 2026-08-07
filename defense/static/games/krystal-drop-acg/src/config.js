// kdrop.xml (checklist 7.3.4).  Key changes made in the Options screen are
// written back immediately (here: to localStorage, the browser's $HOME).
import { loadText } from './resources.js';

const LS_KEY = 'krystaldrop.kdrop.xml';

export const Config = {
  artDirectory: 'art',
  opengl: true,
  fullscreen: true,
  sound: { enable: true, frequency: 44100, bits: 16, stereo: true },
  // 4.1.1 - SDL key codes
  controls: {
    p1up: 303, p1down: 305, p1left: 276, p1right: 275, p1extra: 13,
    p2up: 113, p2down: 97, p2left: 120, p2right: 99, p2extra: 306,
  },

  async load() {
    let txt = localStorage.getItem(LS_KEY);
    if (!txt) { try { txt = await loadText('kdrop.xml'); } catch (e) { return; } }
    this.parse(txt);
  },

  parse(txt) {
    const doc = new DOMParser().parseFromString(txt, 'text/xml');
    const t = (tag) => { const n = doc.getElementsByTagName(tag)[0]; return n ? n.textContent.trim() : null; };
    const base = t('base_directory'); if (base) this.artDirectory = base;
    const og = t('opengl'); if (og) this.opengl = og === 'yes';
    const fs = t('fullscreen'); if (fs) this.fullscreen = fs === 'yes';
    const en = t('enable'); if (en) this.sound.enable = en === 'yes';
    const fr = t('frequency'); if (fr) this.sound.frequency = parseInt(fr, 10);
    const bi = t('bits'); if (bi) this.sound.bits = parseInt(bi, 10);
    const st = t('stereo'); if (st) this.sound.stereo = st === 'yes';
    for (const k in this.controls) {
      const n = doc.getElementsByTagName(k)[0];
      if (n) this.controls[k] = parseInt(n.getAttribute('code'), 10);
    }
  },

  serialize() {
    const c = this.controls;
    let s = '<?xml version="1.0"?>\n<config>\n\t<art>\n\t\t<base_directory>' + this.artDirectory +
      '</base_directory>\n\t</art>\n\t<global>\n\t\t<video>\n\t\t\t<opengl>' + (this.opengl ? 'yes' : 'no') +
      '</opengl>\n\t\t\t<fullscreen>' + (this.fullscreen ? 'yes' : 'no') +
      '</fullscreen>\n\t\t</video>\n\t\t<sound>\n\t\t\t<enable>' + (this.sound.enable ? 'yes' : 'no') +
      '</enable>\n\t\t\t<frequency>' + this.sound.frequency +
      '</frequency>\n\t\t\t<bits>' + this.sound.bits +
      '</bits>\n\t\t\t<stereo>' + (this.sound.stereo ? 'yes' : 'no') +
      '</stereo>\n\t\t</sound>\n\t</global>\n\t<game>\n\t\t<controls>\n';
    for (const k in c) s += `\t\t\t<${k} type="keyboard" code="${c[k]}"/>\n`;
    s += '\t\t</controls>\n\t</game>\n</config>\n';
    return s;
  },

  save() { localStorage.setItem(LS_KEY, this.serialize()); },
};
