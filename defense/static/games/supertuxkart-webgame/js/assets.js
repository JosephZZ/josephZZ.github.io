// Loads the exported assets (meshes.bin + json, textures, audio, fonts).
export class Assets {
  constructor(base = 'assets/') { this.base = base; this.textures = new Map(); }

  async loadAll(onProgress = () => {}) {
    const j = async (name) => (await fetch(this.base + name)).json();
    onProgress('data');
    [this.config, this.track, this.karts, this.items, this.meshes] = await Promise.all([
      j('config.json'), j('track.json'), j('karts.json'), j('items.json'), j('meshes.json'),
    ]);
    this.config.DIFFICULTY_NAMES = ['easy', 'medium', 'hard', 'best'];
    onProgress('meshes');
    const buf = await (await fetch(this.base + 'meshes.bin')).arrayBuffer();
    this.meshBuffer = buf;
    onProgress('textures');
    const names = new Set();
    for (const parts of Object.values(this.meshes)) for (const p of parts) if (p.texture) names.add(p.texture);
    for (const n of this.track.sky) names.add(n);
    await Promise.all([...names].map(n => this.loadImage(n)));
    return this;
  }

  async loadImage(name) {
    if (this.textures.has(name)) return this.textures.get(name);
    try {
      const img = new Image();
      img.src = this.base + 'textures/' + name;
      await img.decode();
      this.textures.set(name, img);
      return img;
    } catch (e) {
      this.textures.set(name, null);
      return null;
    }
  }

  view(part, kind, Type, components) {
    const v = part[kind];
    return new Type(this.meshBuffer, v.offset, v.length / Type.BYTES_PER_ELEMENT);
  }

  meshParts(name) {
    const parts = this.meshes[name];
    if (!parts) return null;
    return parts.map(p => ({
      position: this.view(p, 'position', Float32Array),
      normal: this.view(p, 'normal', Float32Array),
      uv: this.view(p, 'uv', Float32Array),
      index: this.view(p, 'index', Uint32Array),
      texture: p.texture,
      vertexCount: p.vertexCount,
    }));
  }
}
