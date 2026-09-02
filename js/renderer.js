import * as SPLAT from 'https://cdn.jsdelivr.net/npm/gsplat@1.2.9/dist/index.es.js';

export class SplatRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new SPLAT.WebGLRenderer(canvas);
    this.scene = new SPLAT.Scene();
    this.camera = new SPLAT.Camera();
    this.controls = new SPLAT.OrbitControls(this.camera, canvas);
    this.count = 0;
    this.lastUrl = null;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() { this.renderer.setSize(innerWidth, innerHeight); }

  async setPLY(plyText, count) {
    this.clear();
    const blob = new Blob([plyText], {type:'application/octet-stream'});
    this.lastUrl = URL.createObjectURL(blob);
    this.count = count || 0;
    await SPLAT.Loader.LoadAsync(this.lastUrl, this.scene, () => {});
  }

  clear() {
    if (this.lastUrl) { URL.revokeObjectURL(this.lastUrl); this.lastUrl = null; }
    this.scene = new SPLAT.Scene();
    this.count = 0;
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
