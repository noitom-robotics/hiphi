# HiPHI Project Page V1

Static GitHub Pages site for the anonymous HiPHI project page. The page is designed for a reviewer-facing V1: polished, source-backed, and safe to publish without exposing identities, private paths, credentials, or full dataset copies.

## What is included

- `index.html` — single-page project website.
- `static/css/hiphi.css` — responsive visual system and layout.
- `static/js/main.js` — progressive enhancement for navigation, skeleton viewers, JSON-backed tables, and interactive modules.
- `static/data/*.json` — small sanitized manifests/examples used by the page.
- `static/interactive/*.html` — embedded t-SNE explorer plus placeholder shells for object/G1 viewers.
- `static/images/` and `static/videos/` — web-facing figures, poster, loops, and compressed demo video.
- `scripts/check_site_assets.py` — local validation for references, JSON, privacy leaks, and asset-size risk.
- `scripts/prepare_assets.py` — reproducible helper for copying/transcoding optional local assets into `static/`.

## Safety boundaries

This repository must not contain:

- Personal identities, private affiliation text, or non-anonymous acknowledgements.
- Local absolute paths, private dataset paths, NAS addresses, passwords, or SSH/OSS transfer commands.
- Full dataset dumps, raw motion corpora, or large private preprocessing artifacts.
- Unsupported claims that retargeted/reference motion is real robot execution.

The current V1 uses compact example manifests and web assets only. Public paper and dataset links remain placeholders until anonymized/public URLs are available.

## Local preview

```bash
python3 -m http.server 8000 --bind 127.0.0.1
# open http://127.0.0.1:8000/
```

## Validation

Run the full local checker before publishing:

```bash
python3 scripts/check_site_assets.py
```

Useful focused checks:

```bash
node --check static/js/main.js
python3 - <<'PY'
import json, pathlib
for path in pathlib.Path('static/data').glob('*.json'):
    json.load(open(path, encoding='utf-8'))
    print('json ok', path)
PY
```

## Asset preparation

`prepare_assets.py` intentionally defaults to environment variables instead of hard-coded private paths:

```bash
HIPHI_TSNE_HTML=/path/to/tSNE_explorer.html \
HIPHI_DEMO_VIDEO=/path/to/demo.mp4 \
python3 scripts/prepare_assets.py --transcode
```

The helper is optional; it does not download full datasets and it does not require access to private storage. Keep large source files outside this GitHub Pages repository and commit only compressed web deliverables.

## Publishing notes

- Keep individual committed assets below GitHub's 100 MiB hard limit; prefer much smaller web videos where possible.
- Do not commit raw datasets. Link to an approved release page when it exists.
- Re-run `scripts/check_site_assets.py` after any asset replacement.
- Default page: `index.html` is the simplified reviewer page (title, Overview, FrameNet, and t-SNE only).
- Full page: `full.html` keeps the complete project-page version.
