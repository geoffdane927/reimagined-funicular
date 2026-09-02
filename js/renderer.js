import * as SPLAT from 'https://cdn.jsdelivr.net/npm/gsplat@1.2.9/dist/index.es.js';

export class SplatRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new SPLAT.WebGLRenderer(canvas);
    this.scene = new SPLAT.Scene();
    this.camera = new SPLAT.Camera();
    this.controls = new SPLAT.OrbitControls(this.camera, canvas);
    this.count = 0;
    this.camera.position.z = 8;
    this.controls.target.z = 3;
    this.controls.update();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
  }

  async setPLY(plyText, count, onProgress) {
    this.clear();
    this.count = count || 0;
    const bytes = new TextEncoder().encode(plyText);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    try {
      SPLAT.PLYLoader.LoadFromArrayBuffer(buffer, this.scene, '');
      onProgress?.(1);
    } catch (error) {
      console.error('gsplat.js PLY conversion failed:', error);
      throw new Error(`gsplat.js could not load the generated splat data: ${error.message || error}`);
    }
    this.camera.position.z = 8;
    this.controls.target.set(0, 0, 3);
    this.controls.update();
    return this.count;
  }

  clear() {
    this.scene = new SPLAT.Scene();
    this.count = 0;
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
