// Runs the browser-only modules (Renderer, HUD, Camera, Audio) against fake
// WebGL2 / canvas / Image / fetch implementations, to catch runtime errors
// without a real browser.
import fs from 'fs';
import path from 'path';

const A = new URL('../assets/', import.meta.url).pathname;

// ---- fake DOM ---------------------------------------------------------------
class FakeImage {
  constructor() { this.complete = true; this.width = 4; this.height = 4; }
  set src(v) { this._src = v; }
  get src() { return this._src; }
  async decode() { if (!fs.existsSync(path.join(A, '..', this._src))) throw new Error('missing ' + this._src); }
}
const calls = { drawElements: 0, texImage2D: 0, useProgram: 0, uniformMatrix4fv: 0 };
function fakeGL() {
  const obj = () => ({});
  const gl = new Proxy({
    TRIANGLES: 4, UNSIGNED_INT: 5125, UNSIGNED_SHORT: 5123, FLOAT: 5126,
    ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963, STATIC_DRAW: 35044,
    TEXTURE_2D: 3553, RGBA: 6408, UNSIGNED_BYTE: 5121, TEXTURE0: 33984,
    DEPTH_TEST: 2929, CULL_FACE: 2884, BACK: 1029, COLOR_BUFFER_BIT: 16384,
    DEPTH_BUFFER_BIT: 256, VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713, LINK_STATUS: 35714, ACTIVE_UNIFORMS: 35718,
    TEXTURE_MIN_FILTER: 10241, LINEAR: 9729, LINEAR_MIPMAP_LINEAR: 9987,
    TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243, REPEAT: 10497,
    UNPACK_FLIP_Y_WEBGL: 37440,
    getShaderParameter: () => true, getProgramParameter: (p, k) => (k === 35718 ? 9 : true),
    getActiveUniform: (p, i) => ({ name: ['u_viewproj', 'u_model', 'u_texture', 'u_sun',
      'u_ambient', 'u_diffuse', 'u_fogColor', 'u_fogRange', 'u_fogMax'][i] || ('u' + i) }),
    getUniformLocation: () => obj(), createShader: obj, createProgram: obj,
    createBuffer: obj, createTexture: obj, createVertexArray: obj,
    getShaderInfoLog: () => '', getProgramInfoLog: () => '',
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args) => { calls[prop] = (calls[prop] || 0) + 1; };
    },
  });
  return gl;
}
function fakeCanvas(kind) {
  return {
    width: 1280, height: 720,
    getBoundingClientRect: () => ({ width: 1280, height: 720 }),
    getContext: (type) => type === 'webgl2' ? fakeGL() : fake2D(),
  };
}
function fake2D() {
  return new Proxy({ canvas: { width: 1280, height: 720 }, font: '', fillStyle: '',
                     strokeStyle: '', lineWidth: 1, textAlign: '', textBaseline: '',
                     globalAlpha: 1 },
    { get(t, p) { if (p in t) return t[p]; return () => {}; },
      set(t, p, v) { t[p] = v; return true; } });
}
global.Image = FakeImage;
global.performance = { now: () => Date.now() };
global.document = { getElementById: (id) => fakeCanvas(id) };
global.window = { devicePixelRatio: 1, AudioContext: undefined };
global.fetch = async (url) => {
  const p = path.join(A, '..', url);
  if (!fs.existsSync(p)) return { ok: false, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  const buf = fs.readFileSync(p);
  return { ok: true, json: async () => JSON.parse(buf.toString()),
           arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};

const { Assets } = await import('../js/assets.js');
const { World } = await import('../js/world.js');
const { Renderer } = await import('../js/render.js');
const { Camera, HUD, SoundManager } = await import('../js/view.js');

let fail = 0;
const check = (name, ok, detail = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(20)} ${detail}`); };

const assets = new Assets('assets/');
await assets.loadAll();
check('assets load', !!assets.config && !!assets.meshBuffer,
      `${Object.keys(assets.meshes).length} meshes, ${assets.textures.size} textures`);

const world = new World({ config: assets.config, trackData: assets.track,
                          kartData: assets.karts, numKarts: 6, laps: 3,
                          difficulty: 2, seed: 5, sfx: new SoundManager(assets) });
const renderer = new Renderer(fakeCanvas('scene'), assets, world);
check('renderer build', renderer.static.length > 0,
      `${renderer.static.length} static nodes, sky faces ${renderer.sky.length}`);

const camera = new Camera(world.players[0], assets.config, 1);
const hud = new HUD(fakeCanvas('hud'), assets, world);

for (let i = 0; i < 600; i++) {
  world.players[0].controls.accel = 1;
  world.players[0].controls.steer = 0.2;
  world.step(1 / assets.config.PHYSICS_FPS);
}
world.updateGraphics(1 / 60);
camera.update(1 / 60);
world.cameraPosition = camera.position;
renderer.render(camera);
hud.draw(world.players[0], 1 / 60);
check('render pass', calls.drawElements > 100, `${calls.drawElements} draw calls`);
check('hud pass', true, 'no exception');
check('camera', camera.distance < 0 && Math.abs(camera.distance) >= 2.8,
      `distance ${camera.distance.toFixed(2)} m at ${world.players[0].speed.toFixed(1)} m/s`);

for (let i = 0; i < 60; i++) { camera.update(1 / 60); renderer.render(camera); hud.draw(world.players[0], 1 / 60); }
check('60 frames', true, `${calls.drawElements} cumulative draw calls`);

console.log(`\n${fail === 0 ? 'browser modules OK' : fail + ' FAILED'}`);
process.exit(fail ? 1 : 0);
