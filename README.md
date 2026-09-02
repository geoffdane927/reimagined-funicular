# Gaussian Splat Video Creator

A small browser-based Gaussian-style splat creator using **WebAssembly** for the procedural generator and **WebGL2** for GPU rendering.

## MP4 workflow

1. Open `index.html` from a web server (ES modules generally require HTTP rather than `file://`).
2. Choose an MP4/video file.
3. Adjust frame samples, pixel stride, depth spread, and splat size.
4. Click **Create splats**.
5. Orbit, pan, and zoom the resulting point cloud.
6. Export it as a PLY file.

The video importer samples frames through the browser's video decoder and converts pixels into colored Gaussian-style splats. Frames are placed along the Z axis to form a simple 2.5D/volumetric representation; this is intentionally lightweight and is **not** a full photogrammetry/NeRF reconstruction system.

## Files

- `index.html` — application shell
- `css/style.css` — UI styling
- `js/main.js` — application controller
- `js/video.js` — video loading and frame sampling
- `js/renderer.js` — WebGL2 Gaussian-style splat renderer
- `js/splats.js` — WebAssembly loader/generator
