# TODO Assets

Adaptive V1 is intentionally publication-safe: polished enough for reviewers, but it avoids identity exposure, full dataset copies, unsupported robot claims, and manual rabbit holes around unavailable figures.

## Public links

- Dataset: replace the coming-soon placeholder when the approved public release URL is available.

## Media

- Object-interaction clips: add small browser-ready anonymized clips for Carry / Push / Pull / Lean / Sit / Kick / Toss / Swing.
- G1 retarget media: add web-safe MP4/WebM/GLB paths when available. Do not commit raw MotionLib, NPZ, preprocessing dumps, or full corpora.
- Real robot media: only add clips that clearly show hardware and are safe for anonymous review; do not relabel retargeted references as real robot evidence.
- Demo video: V1 uses the compressed web MP4 in `static/videos/`; keep committed video files well below 100 MiB.

## Interactive viewers

- Object viewer: replace `static/interactive/object_viewer.html` when object trajectories/meshes have a small browser-ready viewer.
- G1 browser: replace `static/interactive/g1_motion_browser.html` with a GLB/Three.js or video-based browser only when browser-ready assets exist.
- Motion Atlas: current t-SNE explorer is static HTML; re-export if final public embedding metadata changes.

## Data

- Frame-LU browser: current V1 uses representative examples. Replace with a sanitized release index when available.
- Sample release manifest: verify against the final release schema before launch.
- Benchmark metrics: keep values aligned with the paper/release artifacts and avoid adding unsupported claims.

## Figures

- Replace copied safe-looking paper figures with final anonymized versions if final captions/layouts change.
- Do not spend V1 time manually recreating paper figures unless a figure is missing from the approved assets.
