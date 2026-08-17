# HiPHI Motion Viewer

An offline viewer for the [HiPHI](https://huggingface.co/datasets/noitomrobotics/HiPHI)
motion capture dataset. It plays the 55-joint BVH skeleton together with the
tracked objects of human-object interaction (HOI) motions, and lets you browse
the release by Frame and lexical unit (LU).

Everything runs on your own machine. The viewer never uploads your data and
needs no internet connection after you have downloaded the dataset.

## Requirements

- Python 3.9 or newer — no packages to install, the standard library is enough
- A modern browser (Chrome, Edge, Firefox, or Safari)

There is no build step. The web assets are plain ES modules and three.js is
included in `web/vendor/`, so Node.js and npm are not needed to run the viewer.

## What is in this folder

```
start-viewer.bat        double-click this on Windows
start-viewer.command    double-click this on macOS
stop-viewer.bat         stops a running viewer (Windows)
stop-viewer.command     stops a running viewer (macOS/Linux)
run_viewer.py           same thing, as a plain Python script
hiphi_motion_viewer/    the local server
web/                    the viewer itself (HTML, CSS, ES modules, three.js)
```

## Quick start

**1. Download the dataset** from Hugging Face. Install the client, sign in, then
download. The full release is large, so check the size on the dataset page
first and make sure you have room for it plus the extracted files:

```bash
pip install -U huggingface_hub
```

```bash
hf auth login
```

```bash
hf download noitomrobotics/HiPHI --repo-type dataset --local-dir ./HiPHI
```

If an older install does not recognize `hf`, the command was named
`huggingface-cli` instead (and sign-in was `huggingface-cli login`). The
arguments are the same.

**2. Extract the archives.** The motion data ships as 32 `.tar.zst` files.
Extract them in place, so the motion folders land under `HiPHI/data/`:

```bash
cd HiPHI && for f in data/*.tar.zst; do tar --use-compress-program=unzstd -xf "$f"; done
```

You do not need all 32. The viewer lists whatever you have extracted.

**3. Start the viewer.** No terminal needed — just double-click:

| Your system | Double-click this file |
| --- | --- |
| Windows | `start-viewer.bat` |
| macOS | `start-viewer.command` |
| Linux, or any system where `.py` files open with Python | `run_viewer.py` |

**Tip:** you can also **drag your extracted HiPHI folder onto the launcher** and
it opens that folder straight away. This is the easiest way to start the first
time.

Your browser opens at `http://127.0.0.1:8666`. If it does not open by itself,
type that address into your browser.

That is all. The rest of this file is optional detail.

### Telling it where your data is

Three ways, any of which works:

1. **Drag** your extracted HiPHI folder onto the launcher file.
2. **Type the path** into the box at the top of the viewer page and press Open.
3. **Pass it on the command line** (see below).

The viewer **remembers the last folder you opened**, so from the second time
onward a plain double-click takes you straight back to your data. The folder is
stored in `~/.hiphi_motion_viewer.json`; delete that file to forget it.

### Notes for each system

- **Windows** — if Windows says Python was not found, install it from
  <https://www.python.org/downloads/> and tick **Add Python to PATH** during
  installation.
- **macOS** — the first launch may be blocked because the file came from a zip.
  Right-click `start-viewer.command` and choose **Open**, then confirm. If it
  still will not run, open Terminal once and run
  `chmod +x start-viewer.command`.

## Stopping the viewer

A small terminal window stays open while the viewer runs. Closing that window
normally stops the viewer, but it is not guaranteed on Windows — the server can
be left running in the background with the port still in use.

Note that the page stays on screen in your browser after the server stops. That
is just the already-loaded page; selecting a motion will fail once the server is
gone.

To stop it:

- **Press `Ctrl+C`** in the viewer's terminal window, if you still have it, or
- **Double-click `stop-viewer.bat`** (Windows) or **`stop-viewer.command`**
  (macOS/Linux).

If you started it on a different port, pass that port:

```bash
stop-viewer.bat 9000
./stop-viewer.command 9000
```

The launcher sends an authenticated request to the viewer instance registered
on that port; it does not kill arbitrary processes that happen to use the same
port. It also says so plainly when no viewer is registered, so it is safe to run
at any time.

## Using it from a terminal

If you prefer the command line, point it at a dataset folder or at one `.bvh`
file:

```bash
python -m hiphi_motion_viewer /path/to/HiPHI
python -m hiphi_motion_viewer /path/to/motion_actor.bvh
```

With no arguments it reopens the last folder you used.
`python run_viewer.py <path>` does the same, if you prefer running a script
over a module. The launchers accept these options too, so
`start-viewer.bat --port 9000` works.

Options:

| Option | Meaning |
| --- | --- |
| `--port N` | Listen on port N (default 8666) |
| `--no-browser` | Do not open a browser window |

## In the viewer

The left rail lists motions grouped by **Frame**, then by **LU**. Click to
expand. The search box matches motion IDs, Frame and LU names, actor IDs,
descriptions, object IDs, and object categories; searching flattens the tree to
matching motions. This search also works for partial downloads that do not have
the release-wide metadata CSV.

Below the list, the metadata panel shows the selected motion's description,
duration, frame count, performer details, and its objects for HOI motions.

The player has orbit controls (drag to rotate, scroll to zoom) and a transport
bar with play/pause, a timeline scrubber, and toggles for showing the skeleton
and following the character. The frame counter is one-based, matching the frame
count shown in metadata.

Keyboard shortcuts work whenever you are not typing in a field:

| Key | Action |
| --- | --- |
| `Space` | Play or pause |
| `Left` / `Right` | Step backward or forward one frame |
| `Shift+Left` / `Shift+Right` | Step backward or forward ten frames |

The three dividers between panels can be dragged to resize.

## Partial downloads

The motion list is built by scanning `data/` on disk, not by reading the
release index. If you extracted only a few archives, only those motions are
listed. Nothing appears that you cannot actually play.

When `metadata/hiphi_metadata.csv` is present, it supplies the release-wide
search metadata. Otherwise the viewer reads each motion's `metadata.json`.
For HOI motions it also reads the local file to include object instance IDs.
The release-wide CSV is entirely optional.

## Expected data layout

```
HiPHI/
├── metadata/
│   └── hiphi_metadata.csv                     (optional)
├── object_meshes_preview/
│   └── {mesh_id}.obj
└── data/
    └── {frame}/{lu}/{motion_id}/
        ├── motion_actor.bvh
        ├── metadata.json
        └── object_tracks/{object_id}.csv
```

If you point the viewer at a folder that contains a single `HiPHI/` directory,
it steps into it automatically.

Note that a motion's `metadata.json` uses two different path bases:
`trajectory_path` is relative to the motion folder, while `mesh_path` is
relative to the dataset root, because object meshes are shared between motions
and stored only once. This is why the viewer needs the dataset root and not
just one motion folder — a single motion folder has no meshes in it, so HOI
objects could not be drawn.

## Data format notes

- Human motion is a 55-joint BVH hierarchy, right-handed and Y-up, with joint
  offsets in **centimeters** and rotations in degrees (Z-X-Y Euler order).
- Object trajectory positions are in **meters**; object mesh vertices are in
  **centimeters**. The viewer scales both the skeleton and the meshes by 0.01
  so everything shares one metric world.
- Object rotations are quaternions in XYZW order.
- Each object track has exactly one row per BVH frame, so the skeleton and its
  objects are driven by one shared integer frame index and cannot drift apart.
- On load, the whole capture is shifted so the performer's feet rest on the
  grid and the hips start over the origin. The skeleton and its objects move
  together, which preserves their relative geometry.

## Privacy and network access

The server binds to `127.0.0.1` only, so it is not reachable from other
machines on your network. It serves just two things: the viewer's own files,
and files inside the folder you pointed it at. No telemetry, no external
requests.

## License

Apache License 2.0. See [LICENSE](LICENSE).
