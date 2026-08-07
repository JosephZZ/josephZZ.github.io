// Asset loading.  Everything under assets/ is an unmodified original file
// (extracted verbatim out of the .acc archives) - checklist 1.8.1.

export const BASE = 'assets/';

const imgCache = new Map();
const txtCache = new Map();

export function loadImage(path) {
  let p = imgCache.get(path);
  if (p) return p;
  p = new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image ' + path));
    im.src = BASE + path;
  });
  imgCache.set(path, p);
  return p;
}

export function loadText(path) {
  let p = txtCache.get(path);
  if (p) return p;
  p = fetch(BASE + path).then(r => {
    if (!r.ok) throw new Error('text ' + path);
    return r.arrayBuffer();
  }).then(b => new TextDecoder('iso-8859-1').decode(b));
  txtCache.set(path, p);
  return p;
}

export function loadBinary(path) {
  return fetch(BASE + path).then(r => {
    if (!r.ok) throw new Error('bin ' + path);
    return r.arrayBuffer();
  });
}

export function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i + 1);
}
