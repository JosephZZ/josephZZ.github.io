// WebGL2 renderer: the original meshes with their real textures, the track's
// own sun / fog / sky box (A2.5, A2.6), kart nodes per A1.2-A1.7 and A1.10 LOD.
import { V, Q } from './core.js';

const VS = `#version 300 es
precision highp float;
uniform mat4 u_viewproj;
uniform mat4 u_model;
in vec3 in_pos;
in vec3 in_normal;
in vec2 in_uv;
out vec2 v_uv;
out vec3 v_normal;
out float v_depth;
void main() {
  vec4 world = u_model * vec4(in_pos, 1.0);
  gl_Position = u_viewproj * world;
  v_uv = in_uv;
  v_normal = mat3(u_model) * in_normal;
  v_depth = gl_Position.w;
}`;

const FS = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec3 u_sun;
uniform vec3 u_ambient;
uniform vec3 u_diffuse;
uniform vec3 u_fogColor;
uniform vec2 u_fogRange;
uniform float u_fogMax;
uniform vec3 u_tint;
uniform float u_alphaTest;
in vec2 v_uv;
in vec3 v_normal;
in float v_depth;
out vec4 color;
void main() {
  vec4 tex = texture(u_texture, v_uv);
  if (tex.a < u_alphaTest) discard;
  float lambert = max(dot(normalize(v_normal), u_sun), 0.0);
  vec3 lit = tex.rgb * u_tint * (u_ambient + u_diffuse * lambert);
  float f = clamp((v_depth - u_fogRange.x) / max(u_fogRange.y - u_fogRange.x, 1.0), 0.0, 1.0) * u_fogMax;
  color = vec4(mix(lit, u_fogColor, f), 1.0);
}`;

const SKY_VS = `#version 300 es
precision highp float;
uniform mat4 u_viewproj;
uniform vec3 u_eye;
in vec3 in_pos;
in vec2 in_uv;
out vec2 v_uv;
void main() {
  v_uv = in_uv;
  vec4 p = u_viewproj * vec4(in_pos * 900.0 + u_eye, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FS = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
in vec2 v_uv;
out vec4 color;
void main() { color = vec4(texture(u_texture, v_uv).rgb, 1.0); }`;

// Irrlicht sky box order: top, bottom, left, right, front, back
const SKY_FACES = [
  [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]],
  [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]],
  [[-1, 1, 1], [-1, 1, -1], [-1, -1, -1], [-1, -1, 1]],
  [[1, 1, -1], [1, 1, 1], [1, -1, 1], [1, -1, -1]],
  [[-1, 1, 1], [1, 1, 1], [1, -1, 1], [-1, -1, 1]],
  [[1, 1, -1], [-1, 1, -1], [-1, -1, -1], [1, -1, -1]],
];
const SKY_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
function mat4Multiply(a, b) {                       // column major, out = a*b
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
                   a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function perspective(fovYdeg, aspect, near, far) {
  const f = 1 / Math.tan(fovYdeg * Math.PI / 360);
  const o = new Float32Array(16);
  o[0] = f / aspect; o[5] = f; o[11] = -1;
  o[10] = (far + near) / (near - far);
  o[14] = (2 * far * near) / (near - far);
  return o;
}
function lookAt(eye, target, up) {
  const f = V.norm(V.sub(target, eye));
  const s = V.norm(V.cross(f, up));
  const u = V.cross(s, f);
  const o = new Float32Array(16);
  o[0] = s[0]; o[4] = s[1]; o[8] = s[2];
  o[1] = u[0]; o[5] = u[1]; o[9] = u[2];
  o[2] = -f[0]; o[6] = -f[1]; o[10] = -f[2];
  o[12] = -V.dot(s, eye); o[13] = -V.dot(u, eye); o[14] = V.dot(f, eye);
  o[15] = 1;
  return o;
}
function modelMatrix(rot3, pos, scale) {
  const o = mat4Identity();
  const s = scale || [1, 1, 1];
  o[0] = rot3[0][0] * s[0]; o[1] = rot3[1][0] * s[0]; o[2] = rot3[2][0] * s[0];
  o[4] = rot3[0][1] * s[1]; o[5] = rot3[1][1] * s[1]; o[6] = rot3[2][1] * s[1];
  o[8] = rot3[0][2] * s[2]; o[9] = rot3[1][2] * s[2]; o[10] = rot3[2][2] * s[2];
  o[12] = pos[0]; o[13] = pos[1]; o[14] = pos[2];
  return o;
}
function quatMat3(q) {
  const [x, y, z, w] = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}
function hprMat3(hpr) {
  const [h, p, r] = hpr.map(a => a * Math.PI / 180);
  const ch = Math.cos(h), sh = Math.sin(h), cp = Math.cos(p), sp = Math.sin(p);
  const cr = Math.cos(r), sr = Math.sin(r);
  const rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]];
  const ry = [[ch, 0, sh], [0, 1, 0], [-sh, 0, ch]];
  const rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]];
  const mul = (a, b) => a.map((row, i) => [0, 1, 2].map(j =>
    row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
  return mul(mul(ry, rx), rz);
}

export class Renderer {
  constructor(canvas, assets, world) {
    this.canvas = canvas;
    this.assets = assets;
    this.world = world;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 is required');
    this.gl = gl;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    this.program = this.buildProgram(VS, FS);
    this.skyProgram = this.buildProgram(SKY_VS, SKY_FS);
    this.meshCache = new Map();
    this.textureCache = new Map();
    this.white = this.solidTexture([210, 210, 215, 255]);
    this.buildSky();
    this.buildStatic();
  }

  buildProgram(vsSrc, fsSrc) {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      uniforms[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { program: p, uniforms };
  }

  solidTexture(rgba) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                  new Uint8Array(rgba));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    return t;
  }

  texture(name) {
    if (!name) return this.white;
    if (this.textureCache.has(name)) return this.textureCache.get(name);
    const gl = this.gl;
    const img = this.assets.textures.get(name);
    let tex = this.white;
    if (img) {
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
    this.textureCache.set(name, tex);
    return tex;
  }

  mesh(name) {
    if (this.meshCache.has(name)) return this.meshCache.get(name);
    const parts = this.assets.meshParts(name);
    if (!parts) { this.meshCache.set(name, null); return null; }
    const gl = this.gl;
    const built = parts.map(p => {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const bind = (data, loc, size) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      };
      bind(p.position, 0, 3);
      bind(p.normal, 1, 3);
      bind(p.uv, 2, 2);
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.index, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao, count: p.index.length, texture: this.texture(p.texture) };
    });
    this.meshCache.set(name, built);
    return built;
  }

  buildSky() {
    const gl = this.gl;
    const names = this.assets.track.sky || [];
    this.sky = [];
    if (names.length < 6) return;
    for (let i = 0; i < 6; i++) {
      const verts = [];
      SKY_FACES[i].forEach((corner, k) => {
        verts.push(corner[0], corner[1], corner[2], SKY_UV[k][0], 1 - SKY_UV[k][1]);
      });
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      this.sky.push({ vao, texture: this.texture(names[i]) });
    }
  }

  buildStatic() {
    this.static = [];
    const track = this.mesh('track');
    if (track) this.static.push({ parts: track, matrix: mat4Identity() });
    for (const obj of this.assets.track.objects) {
      const m = this.mesh(obj.mesh);
      if (!m) continue;
      this.static.push({ parts: m, matrix: modelMatrix(hprMat3(obj.hpr), obj.xyz, obj.scale) });
    }
  }

  drawParts(parts, matrix, tint = [1, 1, 1], alphaTest = 0.5) {
    const gl = this.gl, u = this.program.uniforms;
    gl.uniformMatrix4fv(u['u_model'], false, matrix);
    gl.uniform3fv(u['u_tint'], tint);
    gl.uniform1f(u['u_alphaTest'], alphaTest);
    for (const part of parts) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, part.texture);
      gl.bindVertexArray(part.vao);
      gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, 0);
    }
  }

  render(camera) {
    const gl = this.gl, world = this.world, track = this.assets.track;
    const w = this.canvas.width, h = this.canvas.height;
    gl.viewport(0, 0, w, h);
    const sky = track.skyColor.map(c => c);
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const axes = Q.axes(camera.rotation);
    const eye = camera.position;
    const view = lookAt(eye, V.add(eye, axes[0]), axes[1]);
    const proj = perspective(camera.fov, w / h, 0.15, Math.min(track.cameraFar, 1500));
    const viewproj = mat4Multiply(proj, view);

    if (this.sky.length) {                                   // A2.5
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(this.skyProgram.program);
      gl.uniformMatrix4fv(this.skyProgram.uniforms['u_viewproj'], false, viewproj);
      gl.uniform3fv(this.skyProgram.uniforms['u_eye'], new Float32Array(eye));
      for (const face of this.sky) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, face.texture);
        gl.bindVertexArray(face.vao);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      }
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
    }

    gl.useProgram(this.program.program);
    const u = this.program.uniforms;
    gl.uniformMatrix4fv(u['u_viewproj'], false, viewproj);
    gl.uniform3fv(u['u_sun'], new Float32Array(V.norm(track.sun.position)));
    gl.uniform3fv(u['u_ambient'], new Float32Array(track.sun.ambient));
    gl.uniform3fv(u['u_diffuse'], new Float32Array(track.sun.diffuse));
    const fog = track.fog;
    gl.uniform3fv(u['u_fogColor'], new Float32Array(fog.color));
    gl.uniform2fv(u['u_fogRange'], new Float32Array(fog.enabled ? [fog.start, fog.end] : [1e9, 1e9 + 1]));
    gl.uniform1f(u['u_fogMax'], fog.enabled ? (fog.max ?? 1) : 0);
    gl.uniform1i(u['u_texture'], 0);

    for (const s of this.static) this.drawParts(s.parts, s.matrix);

    for (const kart of world.karts) {
      if (kart.eliminated) continue;
      this.drawKart(kart);
    }
    this.drawItems();
  }

  drawKart(kart) {
    const data = this.assets.karts[kart.modelName];
    const body = this.mesh(data.mesh);
    if (!body) return;
    const [pos, rot] = kart.graphicalTransform();
    const R = quatMat3(rot);
    let tint = data.rgb.map(c => 0.55 + 0.45 * c);              // A1.5
    if (kart.invulnerableTicks > 0 && Math.floor(kart.invulnerableTicks / 8) % 2) tint = [1.6, 1.6, 1.6];
    const scale = kart.squashTicks > 0 ? [1.25, 0.5, 1.25] : null;   // B2.9
    this.drawParts(body, modelMatrix(R, pos, scale), tint);

    const names = ['front-left', 'front-right', 'rear-left', 'rear-right'];
    names.forEach((name, idx) => {
      const meshName = data.wheelMeshes[name];
      if (!meshName) return;
      const wheel = this.mesh(meshName);
      if (!wheel) return;
      const local = data.wheels[name] || [0, 0, 0];
      const travel = kart.suspension[idx] - kart.ch('SUSPENSION_REST_LENGTH');   // A1.3
      const lp = [local[0], local[1] - travel, local[2]];
      let wr = R;
      if (name.startsWith('front')) {
        const a = kart.steerAngle, ca = Math.cos(a), sa = Math.sin(a);
        const spin = [[ca, 0, sa], [0, 1, 0], [-sa, 0, ca]];
        wr = R.map((row, i) => [0, 1, 2].map(j =>
          row[0] * spin[0][j] + row[1] * spin[1][j] + row[2] * spin[2][j]));
      }
      const world = V.add(pos, [
        R[0][0] * lp[0] + R[0][1] * lp[1] + R[0][2] * lp[2],
        R[1][0] * lp[0] + R[1][1] * lp[1] + R[1][2] * lp[2],
        R[2][0] * lp[0] + R[2][1] * lp[1] + R[2][2] * lp[2]]);
      this.drawParts(wheel, modelMatrix(wr, world));
    });
  }

  drawItems() {
    for (const it of this.world.items) {
      if (!it.available) continue;
      const info = this.assets.items[it.kind];
      if (!info || !info.mesh) continue;
      if (V.len(V.sub(it.position, this.world.cameraPosition || [0, 0, 0])) > 160) continue;
      const mesh = this.mesh(info.mesh);
      if (!mesh) continue;
      const a = it.rotates ? it.rotation : 0;                  // A3.3
      const ca = Math.cos(a), sa = Math.sin(a);
      const R = [[ca, 0, sa], [0, 1, 0], [-sa, 0, ca]];
      const glow = info.glow.map(c => 0.55 + 0.75 * (c / 255));  // A3.2
      this.drawParts(mesh, modelMatrix(R, it.position), glow);
    }
  }
}
