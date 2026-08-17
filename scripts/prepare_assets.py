#!/usr/bin/env python3
"""Copy and optionally transcode approved local web assets into the project page.

This helper intentionally uses environment variables instead of hard-coded private
paths. It is for small web-facing derivatives only; do not use it to import full
datasets or raw preprocessing artifacts.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"


def copy_if_env(env_name: str, destination: Path) -> bool:
    source = os.environ.get(env_name)
    if not source:
        return False
    src = Path(source).expanduser()
    if not src.exists():
        raise FileNotFoundError(f"{env_name} points to a missing file: {src}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, destination)
    print(f"copied {env_name} -> {destination.relative_to(ROOT)}")
    return True


def transcode_demo(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(source),
        "-vf",
        "scale='min(1280,iw)':-2",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "28",
        "-movflags",
        "+faststart",
        "-an",
        str(destination),
    ]
    subprocess.run(cmd, check=True)
    print(f"transcoded demo -> {destination.relative_to(ROOT)}")


def extract_poster(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-y", "-ss", "00:00:01", "-i", str(source), "-frames:v", "1", "-q:v", "3", str(destination)]
    subprocess.run(cmd, check=True)
    print(f"poster -> {destination.relative_to(ROOT)}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--transcode", action="store_true", help="transcode HIPHI_DEMO_VIDEO into the compressed web MP4")
    parser.add_argument("--poster", action="store_true", help="extract hero poster from the demo video")
    args = parser.parse_args()

    copied = False
    copied |= copy_if_env("HIPHI_TSNE_HTML", STATIC / "interactive" / "tSNE_explorer.html")
    demo_env = os.environ.get("HIPHI_DEMO_VIDEO")
    if demo_env:
        demo_src = Path(demo_env).expanduser()
        if not demo_src.exists():
            raise FileNotFoundError(f"HIPHI_DEMO_VIDEO points to a missing file: {demo_src}")
        if args.transcode:
            transcode_demo(demo_src, STATIC / "videos" / "HiPHI_demo_video_web.mp4")
            copied = True
        else:
            print("HIPHI_DEMO_VIDEO set; use --transcode to create the web MP4")
        if args.poster:
            extract_poster(demo_src, STATIC / "images" / "hero_poster.jpg")
            copied = True
    if not copied:
        print("No assets copied. Set HIPHI_TSNE_HTML and/or HIPHI_DEMO_VIDEO to import approved web assets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
