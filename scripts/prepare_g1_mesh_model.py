#!/usr/bin/env python3
"""Prepare static G1 mesh assets and browser manifests from a URDF.

Outputs:
  * g1_model.json: URDF-style link/joint/visual manifest for WebGL STL playback.
  * g1_mesh_lite.json: sampled triangle mesh fallback for non-WebGL Canvas playback.

No source filesystem paths are embedded in generated website assets.
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
from pathlib import Path
from xml.etree import ElementTree as ET

import numpy as np


def vec(text: str | None, default: str = "0 0 0") -> list[float]:
    return [float(x) for x in (text or default).split()]


def origin(elem: ET.Element | None) -> dict[str, list[float]]:
    return {
        "xyz": vec(elem.get("xyz") if elem is not None else None),
        "rpy": vec(elem.get("rpy") if elem is not None else None),
    }


def material(visual: ET.Element) -> dict | None:
    mat = visual.find("material")
    if mat is None:
        return None
    payload: dict[str, object] = {"name": mat.get("name", "")}
    color = mat.find("color")
    if color is not None and color.get("rgba"):
        payload["rgba"] = vec(color.get("rgba"), "0.7 0.7 0.7 1")
    return payload


def clean_mesh_path(filename: str) -> str:
    for prefix in ("package://unitree_g1/", "package://g1_description/", "./"):
        if filename.startswith(prefix):
            filename = filename[len(prefix):]
    return filename.lstrip("/")


def rpy_matrix(rpy: list[float]) -> np.ndarray:
    r, p, y = rpy
    cr, sr = math.cos(r), math.sin(r)
    cp, sp = math.cos(p), math.sin(p)
    cy, sy = math.cos(y), math.sin(y)
    rx = np.array([[1, 0, 0], [0, cr, -sr], [0, sr, cr]], dtype=np.float32)
    ry = np.array([[cp, 0, sp], [0, 1, 0], [-sp, 0, cp]], dtype=np.float32)
    rz = np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]], dtype=np.float32)
    return rz @ ry @ rx


def transform_points(points: np.ndarray, visual: dict) -> np.ndarray:
    scale = np.asarray(visual.get("scale", [1, 1, 1]), dtype=np.float32)
    org = visual.get("origin", {"xyz": [0, 0, 0], "rpy": [0, 0, 0]})
    rot = rpy_matrix(org["rpy"])
    trans = np.asarray(org["xyz"], dtype=np.float32)
    return (points * scale) @ rot.T + trans


def read_stl_triangles(path: Path) -> np.ndarray:
    data = path.read_bytes()
    if len(data) >= 84:
        count = int.from_bytes(data[80:84], "little", signed=False)
        expected = 84 + count * 50
        if count > 0 and expected <= len(data):
            arr = np.frombuffer(data, dtype=np.uint8, offset=84, count=count * 50).reshape(count, 50)
            verts = np.empty((count, 3, 3), dtype=np.float32)
            for i in range(count):
                verts[i] = np.frombuffer(arr[i, 12:48].tobytes(), dtype="<f4").reshape(3, 3)
            return verts
    # Minimal ASCII STL fallback.
    verts: list[list[float]] = []
    for line in data.decode("utf-8", errors="ignore").splitlines():
        line = line.strip()
        if line.startswith("vertex "):
            verts.append([float(x) for x in line.split()[1:4]])
    usable = len(verts) // 3 * 3
    return np.asarray(verts[:usable], dtype=np.float32).reshape(-1, 3, 3)


def sample_triangles(tris: np.ndarray, max_tris: int) -> np.ndarray:
    if len(tris) <= max_tris:
        return tris
    idx = np.linspace(0, len(tris) - 1, max_tris).round().astype(np.int64)
    return tris[idx]


def link_color(name: str) -> str:
    if "left_" in name:
        return "#b044f4"
    if "right_" in name:
        return "#f06ba8"
    if any(key in name for key in ("pelvis", "torso", "waist", "head")):
        return "#282232"
    return "#d8b1e8"


def material_hex(mat: object) -> str:
    if not isinstance(mat, dict):
        return "#d8b1e8"
    rgba = mat.get("rgba")
    if not isinstance(rgba, list) or len(rgba) < 3:
        return "#d8b1e8"
    vals = [max(0, min(255, round(float(v) * 255))) for v in rgba[:3]]
    return f"#{vals[0]:02x}{vals[1]:02x}{vals[2]:02x}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--urdf", required=True, help="Source G1 URDF")
    parser.add_argument("--source-root", required=True, help="Directory that contains the URDF mesh files")
    parser.add_argument("--out-dir", required=True, help="Destination static model directory")
    parser.add_argument("--lite-triangles-per-link", type=int, default=220)
    parser.add_argument("--lite-total-triangles", type=int, default=45000, help="Approximate total triangles kept for Canvas fallback")
    args = parser.parse_args()

    urdf = Path(args.urdf)
    source_root = Path(args.source_root)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    root = ET.parse(urdf).getroot()
    links = []
    mesh_refs: set[str] = set()
    lite_links: dict[str, dict] = {}

    link_triangle_counts: dict[str, int] = {}
    for link in root.findall("link"):
        visuals = []
        link_triangles: list[np.ndarray] = []
        for visual in link.findall("visual"):
            mesh = visual.find("geometry/mesh")
            if mesh is None or not mesh.get("filename"):
                continue
            mesh_path = clean_mesh_path(mesh.get("filename", ""))
            mesh_refs.add(mesh_path)
            scale_text = mesh.get("scale")
            visual_payload = {
                "mesh": mesh_path,
                "origin": origin(visual.find("origin")),
                "scale": vec(scale_text, "1 1 1") if scale_text else [1, 1, 1],
            }
            mat = material(visual)
            if mat:
                visual_payload["material"] = mat
            visuals.append(visual_payload)
            tris = read_stl_triangles(source_root / mesh_path)
            if len(tris):
                # Apply visual origin once; runtime applies link transform only.
                link_triangles.append(transform_points(tris, visual_payload))
        name = link.get("name", "")
        links.append({"name": name, "visuals": visuals})
        if link_triangles:
            merged = np.concatenate(link_triangles, axis=0)
            link_triangle_counts[name] = int(len(merged))
            lite_links[name] = {
                "color": material_hex(visuals[0].get("material")) if visuals and visuals[0].get("material") else link_color(name),
                "triangles_raw": merged,
            }

    joints = []
    for joint in root.findall("joint"):
        parent = joint.find("parent")
        child = joint.find("child")
        if parent is None or child is None:
            continue
        joints.append({
            "name": joint.get("name", ""),
            "type": joint.get("type", "fixed"),
            "parent": parent.get("link", ""),
            "child": child.get("link", ""),
            "origin": origin(joint.find("origin")),
            "axis": vec(joint.find("axis").get("xyz") if joint.find("axis") is not None else None),
        })

    total_source_tris = sum(link_triangle_counts.values()) or 1
    total_written_tris = 0
    for name, payload in list(lite_links.items()):
        raw = payload.pop("triangles_raw")
        share = len(raw) / total_source_tris
        keep = max(args.lite_triangles_per_link, int(round(args.lite_total_triangles * share)))
        kept = sample_triangles(raw, keep)
        total_written_tris += len(kept)
        payload["triangles"] = np.round(kept, 4).tolist()

    for rel in sorted(mesh_refs):
        src = source_root / rel
        dst = out_dir / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    manifest = {
        "schema": "hiphi_g1_urdf_mesh_manifest_v1",
        "root_link": "pelvis",
        "coordinate_frame": "z_up",
        "links": links,
        "joints": joints,
        "note": "Browser-ready G1 link mesh manifest derived from a local URDF. Mesh files are referenced relatively.",
    }
    lite = {
        "schema": "hiphi_g1_mesh_lite_v1",
        "root_link": "pelvis",
        "coordinate_frame": "z_up",
        "triangles_per_link_min": args.lite_triangles_per_link,
        "triangles_total_target": args.lite_total_triangles,
        "triangles_total_written": total_written_tris,
        "links": lite_links,
        "note": "Sampled link triangles for non-WebGL Canvas fallback rendering.",
    }
    (out_dir / "g1_model.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (out_dir / "g1_mesh_lite.json").write_text(json.dumps(lite, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {out_dir / 'g1_model.json'} links={len(links)} joints={len(joints)} meshes={len(mesh_refs)}")
    print(f"wrote {out_dir / 'g1_mesh_lite.json'} fallback_links={len(lite_links)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
