#!/usr/bin/env python3
"""Build compact, anonymous G1 previews for static browser playback.

Supported sources:
  * MotionLib `.pt` files with `gts`, `length_starts`, and `motion_num_frames`.
  * G1 retargeted `.npz` files in either of these forms:
      - `body_pos_w`, optional `body_quat_w`, optional `joint_pos`
      - `base_frame_pos`, `base_frame_wxyz`, `joint_angles` plus `--urdf` for FK

The output stores only downsampled skeleton positions and sanitized labels. It never
copies raw NPZ/MotionLib files or source paths into the website.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable
from xml.etree import ElementTree as ET

import numpy as np

BODY_NAMES = [
    "pelvis", "head",
    "left_hip_pitch", "left_hip_roll", "left_hip_yaw", "left_knee", "left_ankle_pitch", "left_ankle_roll",
    "right_hip_pitch", "right_hip_roll", "right_hip_yaw", "right_knee", "right_ankle_pitch", "right_ankle_roll",
    "waist_yaw", "waist_roll", "torso",
    "left_shoulder_pitch", "left_shoulder_roll", "left_shoulder_yaw", "left_elbow", "left_wrist_roll", "left_wrist_pitch", "left_wrist_yaw", "left_hand",
    "right_shoulder_pitch", "right_shoulder_roll", "right_shoulder_yaw", "right_elbow", "right_wrist_roll", "right_wrist_pitch", "right_wrist_yaw", "right_hand",
]

PARENTS = [-1, 0, 0, 2, 3, 4, 5, 6, 0, 8, 9, 10, 11, 12, 0, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 16, 25, 26, 27, 28, 29, 30, 31]
EDGES = [[p, i] for i, p in enumerate(PARENTS) if p >= 0]

# moviz reorders Isaac-Sim joint order to G1/URDF order.
ISAAC_SIM_TO_G1_JOINT_MAPPING = np.array([
    0, 3, 6, 9, 13, 17,
    1, 4, 7, 10, 14, 18,
    2, 5, 8,
    11, 15, 19, 21, 23, 25, 27,
    12, 16, 20, 22, 24, 26, 28,
], dtype=np.int64)

G1_JOINT_NAMES = [
    "left_hip_pitch_joint", "left_hip_roll_joint", "left_hip_yaw_joint", "left_knee_joint", "left_ankle_pitch_joint", "left_ankle_roll_joint",
    "right_hip_pitch_joint", "right_hip_roll_joint", "right_hip_yaw_joint", "right_knee_joint", "right_ankle_pitch_joint", "right_ankle_roll_joint",
    "waist_yaw_joint", "waist_roll_joint", "waist_pitch_joint",
    "left_shoulder_pitch_joint", "left_shoulder_roll_joint", "left_shoulder_yaw_joint", "left_elbow_joint", "left_wrist_roll_joint", "left_wrist_pitch_joint", "left_wrist_yaw_joint",
    "right_shoulder_pitch_joint", "right_shoulder_roll_joint", "right_shoulder_yaw_joint", "right_elbow_joint", "right_wrist_roll_joint", "right_wrist_pitch_joint", "right_wrist_yaw_joint",
]

BODY_TO_LINK = {
    "pelvis": "pelvis",
    "head": "head_link",
    "torso": "torso_link",
    "left_hand": "left_wrist_yaw_link",
    "right_hand": "right_wrist_yaw_link",
    **{name: f"{name}_link" for name in BODY_NAMES if name not in {"pelvis", "head", "torso", "left_hand", "right_hand"}},
}


@dataclass
class UrdfJoint:
    name: str
    parent: str
    child: str
    joint_type: str
    xyz: np.ndarray
    rpy: np.ndarray
    axis: np.ndarray


def sanitize_label(raw: str) -> str:
    label = Path(raw).stem if "/" in raw or "\\" in raw else raw
    label = re.sub(r"[_-]+", " ", label)
    label = re.sub(r"\b[0-9a-f]{8,}\b", "", label, flags=re.I)
    label = re.sub(r"\s+", " ", label).strip()
    return label[:64] or "G1 reference"


def split_frame_lu(value: str) -> tuple[str | None, str | None]:
    if not value or "-" not in value:
        return None, None
    frame, lu = value.split("-", 1)
    return frame or None, lu or None


def load_frame_lu_index(paths: list[str]) -> dict[str, str]:
    index: dict[str, str] = {}
    for raw in paths:
        path = Path(raw)
        if not path.exists():
            continue
        with path.open(newline="", encoding="utf-8", errors="ignore") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                clip_id = (row.get("clip_id") or "").strip()
                frame_lu = (
                    row.get("true_frame_lu")
                    or row.get("selected_true_frame_lu")
                    or row.get("name")
                    or ""
                ).strip()
                if clip_id and frame_lu and frame_lu not in {"[UNKNOWN]", "UNKNOWN"}:
                    index.setdefault(clip_id, frame_lu)
    return index


def metadata_for_npz(path: Path, frame_lu_index: dict[str, str]) -> dict[str, str]:
    subset = path.parent.name if path.parent.name in {"3h", "20h"} else ""
    match = re.search(r"hiphi_core300_[^_]+_[^_]+_([0-9a-f]{8}-[0-9a-f-]{27,})_", path.name, flags=re.I)
    if not match:
        fallback = f"HiPHI clip {path.stem[:8]}"
        return {"label": fallback, **({"subset": subset} if subset else {})}
    clip_id = match.group(1)
    frame_lu = frame_lu_index.get(clip_id)
    if not frame_lu:
        fallback = f"HiPHI clip {clip_id[:8]}"
        return {"clip_id": clip_id, "label": fallback, **({"subset": subset} if subset else {})}
    frame, lu = split_frame_lu(frame_lu)
    return {
        "clip_id": clip_id,
        "frame_lu": frame_lu,
        "frame": frame or "",
        "lu": lu or "",
        "label": frame_lu,
        **({"subset": subset} if subset else {}),
    }


def add_display_labels(clips: list[dict[str, Any]]) -> None:
    counts: dict[str, int] = {}
    for clip in clips:
        key = clip.get("frame_lu") or clip.get("label") or ""
        if key:
            counts[key] = counts.get(key, 0) + 1
    for clip in clips:
        key = clip.get("frame_lu") or clip.get("label") or ""
        subset = clip.get("subset")
        if key and counts.get(key, 0) > 1 and subset:
            clip["display_label"] = f"{key} · {subset}"
        elif key:
            clip["display_label"] = key


def parse_labeled_path(spec: str) -> tuple[str, Path]:
    if "=" in spec:
        label, raw_path = spec.split("=", 1)
        return sanitize_label(label), Path(raw_path)
    path = Path(spec)
    return sanitize_label(path.stem), path


def round_nested(array: np.ndarray, ndigits: int = 4) -> list:
    return np.round(array.astype(np.float32), ndigits).tolist()


def downsample_indices(length: int, source_fps: float, target_fps: float, max_frames: int) -> np.ndarray:
    if length <= 0:
        return np.zeros((0,), dtype=np.int64)
    fps_step = max(1, int(round(source_fps / max(target_fps, 1)))) if source_fps > target_fps else 1
    max_step = max(1, math.ceil(length / max_frames))
    step = max(fps_step, max_step)
    return np.arange(0, length, step, dtype=np.int64)[:max_frames]


def root_center_xy(pts: np.ndarray) -> np.ndarray:
    pts = pts.astype(np.float32).copy()
    if pts.ndim == 3 and pts.shape[1] > 0:
        pts[:, :, 0:2] -= pts[:, :1, 0:2]
    return pts


def quat_wxyz_to_matrix(q: Iterable[float]) -> np.ndarray:
    w, x, y, z = [float(v) for v in q]
    n = math.sqrt(w*w + x*x + y*y + z*z)
    if n < 1e-8:
        return np.eye(3, dtype=np.float32)
    w, x, y, z = w/n, x/n, y/n, z/n
    return np.array([
        [1 - 2*y*y - 2*z*z, 2*x*y - 2*z*w, 2*x*z + 2*y*w],
        [2*x*y + 2*z*w, 1 - 2*x*x - 2*z*z, 2*y*z - 2*x*w],
        [2*x*z - 2*y*w, 2*y*z + 2*x*w, 1 - 2*x*x - 2*y*y],
    ], dtype=np.float32)


def rpy_to_matrix(rpy: np.ndarray) -> np.ndarray:
    r, p, y = [float(v) for v in rpy]
    cr, sr = math.cos(r), math.sin(r)
    cp, sp = math.cos(p), math.sin(p)
    cy, sy = math.cos(y), math.sin(y)
    rx = np.array([[1, 0, 0], [0, cr, -sr], [0, sr, cr]], dtype=np.float32)
    ry = np.array([[cp, 0, sp], [0, 1, 0], [-sp, 0, cp]], dtype=np.float32)
    rz = np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]], dtype=np.float32)
    return rz @ ry @ rx


def axis_angle_to_matrix(axis: np.ndarray, angle: float) -> np.ndarray:
    axis = axis.astype(np.float32)
    n = float(np.linalg.norm(axis))
    if n < 1e-8:
        return np.eye(3, dtype=np.float32)
    x, y, z = axis / n
    c, s = math.cos(float(angle)), math.sin(float(angle))
    C = 1 - c
    return np.array([
        [x*x*C + c, x*y*C - z*s, x*z*C + y*s],
        [y*x*C + z*s, y*y*C + c, y*z*C - x*s],
        [z*x*C - y*s, z*y*C + x*s, z*z*C + c],
    ], dtype=np.float32)


def make_transform(rot: np.ndarray | None = None, trans: np.ndarray | None = None) -> np.ndarray:
    t = np.eye(4, dtype=np.float32)
    if rot is not None:
        t[:3, :3] = rot
    if trans is not None:
        t[:3, 3] = trans.astype(np.float32)
    return t


def parse_urdf(path: Path) -> list[UrdfJoint]:
    root = ET.parse(path).getroot()
    joints: list[UrdfJoint] = []
    for elem in root.findall("joint"):
        parent = elem.find("parent")
        child = elem.find("child")
        if parent is None or child is None:
            continue
        origin = elem.find("origin")
        axis = elem.find("axis")
        xyz = np.fromstring(origin.get("xyz", "0 0 0") if origin is not None else "0 0 0", sep=" ", dtype=np.float32)
        rpy = np.fromstring(origin.get("rpy", "0 0 0") if origin is not None else "0 0 0", sep=" ", dtype=np.float32)
        ax = np.fromstring(axis.get("xyz", "0 0 0") if axis is not None else "0 0 0", sep=" ", dtype=np.float32)
        joints.append(UrdfJoint(elem.get("name", ""), parent.get("link", ""), child.get("link", ""), elem.get("type", "fixed"), xyz, rpy, ax))
    return joints


def fk_positions_from_npz(npz: Any, urdf_path: Path, target_fps: float, max_frames: int, joint_order: str) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, int, int]:
    joints = parse_urdf(urdf_path)
    child_joints: dict[str, list[UrdfJoint]] = {}
    for joint in joints:
        child_joints.setdefault(joint.parent, []).append(joint)

    root_pos = np.asarray(npz["base_frame_pos"], dtype=np.float32)
    root_quat = np.asarray(npz["base_frame_wxyz"], dtype=np.float32)
    joint_angles = np.asarray(npz["joint_angles"], dtype=np.float32)
    source_fps = float(np.asarray(npz["fps"]).reshape(-1)[0]) if "fps" in npz.files else 30.0
    idx = downsample_indices(len(root_pos), source_fps, target_fps, max_frames)
    joint_index = {name: i for i, name in enumerate(G1_JOINT_NAMES)}
    if joint_order == "isaac" and joint_angles.shape[1] >= len(ISAAC_SIM_TO_G1_JOINT_MAPPING):
        joint_angles = joint_angles[:, ISAAC_SIM_TO_G1_JOINT_MAPPING]

    frames = []
    for fi in idx:
        transforms = {"pelvis": make_transform(quat_wxyz_to_matrix(root_quat[fi]), root_pos[fi])}
        stack = ["pelvis"]
        while stack:
            parent = stack.pop()
            parent_tf = transforms[parent]
            for joint in child_joints.get(parent, []):
                origin_tf = make_transform(rpy_to_matrix(joint.rpy), joint.xyz)
                motion_tf = np.eye(4, dtype=np.float32)
                if joint.joint_type != "fixed":
                    qi = joint_index.get(joint.name)
                    angle = float(joint_angles[fi, qi]) if qi is not None and qi < joint_angles.shape[1] else 0.0
                    motion_tf = make_transform(axis_angle_to_matrix(joint.axis, angle), None)
                transforms[joint.child] = parent_tf @ origin_tf @ motion_tf
                stack.append(joint.child)
        pts = []
        for body in BODY_NAMES:
            link = BODY_TO_LINK.get(body, body)
            tf = transforms.get(link)
            if tf is None:
                # Head link names differ across G1 variants; use torso plus a small visual offset as a last resort.
                base = transforms.get("torso_link", transforms["pelvis"])
                offset = np.array([0.0, 0.0, 0.32], dtype=np.float32) if body == "head" else np.zeros(3, dtype=np.float32)
                pts.append((base @ make_transform(None, offset))[:3, 3])
            else:
                pts.append(tf[:3, 3])
        frames.append(np.stack(pts, axis=0))
    sampled_root = root_pos[idx].astype(np.float32).copy()
    if len(sampled_root):
        sampled_root[:, 0:2] -= sampled_root[:1, 0:2]
    return root_center_xy(np.stack(frames, axis=0)), sampled_root, root_quat[idx], joint_angles[idx], len(root_pos), len(idx)


def positions_from_body_pos(npz: Any, target_fps: float, max_frames: int) -> tuple[np.ndarray, np.ndarray | None, np.ndarray | None, np.ndarray | None, int, int]:
    body_pos = np.asarray(npz["body_pos_w"], dtype=np.float32)
    source_fps = float(np.asarray(npz["fps"]).reshape(-1)[0]) if "fps" in npz.files else 50.0
    idx = downsample_indices(len(body_pos), source_fps, target_fps, max_frames)
    root_rot = None
    root_pos = None
    joint_angles = None
    if "body_quat_w" in npz.files:
        root_rot = np.asarray(npz["body_quat_w"], dtype=np.float32)[idx, 0]
    if len(body_pos):
        root_pos = body_pos[idx, 0, :].astype(np.float32).copy()
        root_pos[:, 0:2] -= root_pos[:1, 0:2]
    if "joint_pos" in npz.files:
        joint_angles = np.asarray(npz["joint_pos"], dtype=np.float32)[idx]
    return root_center_xy(body_pos[idx, :len(BODY_NAMES), :]), root_pos, root_rot, joint_angles, len(body_pos), len(idx)


def clip_from_npz(path: Path, label: str, index: int, args: argparse.Namespace, frame_lu_index: dict[str, str]) -> dict[str, Any]:
    with np.load(path, allow_pickle=True) as data:
        if "body_pos_w" in data.files:
            positions, root_pos, root_rot, joint_angles, total, shown = positions_from_body_pos(data, args.target_fps, args.max_frames)
        elif {"base_frame_pos", "base_frame_wxyz", "joint_angles"}.issubset(set(data.files)):
            if not args.urdf:
                raise ValueError(f"{path.name} requires --urdf because it stores base_frame_pos/base_frame_wxyz/joint_angles but no body_pos_w")
            positions, root_pos, root_rot, joint_angles, total, shown = fk_positions_from_npz(data, Path(args.urdf), args.target_fps, args.max_frames, args.joint_order)
        else:
            raise ValueError(f"{path.name} has unsupported keys: {data.files}")
    meta = metadata_for_npz(path, frame_lu_index)
    display_label = meta.get("label") or label
    return {
        "id": f"g1-npz-{index + 1}",
        "label": display_label,
        **({k: v for k, v in meta.items() if k in {"clip_id", "frame_lu", "frame", "lu", "subset"} and v}),
        "fps": int(round(args.target_fps)),
        "frames_total": int(total),
        "frames_shown": int(shown),
        "joints": len(BODY_NAMES),
        "body_names": BODY_NAMES,
        "positions": round_nested(positions),
        **({"root_pos": round_nested(root_pos)} if root_pos is not None else {}),
        **({"root_rot_wxyz": round_nested(root_rot)} if root_rot is not None else {}),
        **({"joint_angles": round_nested(joint_angles)} if joint_angles is not None else {}),
    }


def rounded_motionlib_frames(tensor: Any, start: int, length: int, max_frames: int) -> list[list[list[float]]]:
    import torch
    step = max(1, math.ceil(length / max_frames))
    idx = torch.arange(start, start + length, step)[:max_frames]
    pts = tensor[idx].detach().cpu().float()
    root = pts[:, :1, :].clone()
    pts[:, :, 0:2] -= root[:, :, 0:2]
    return round_nested(pts.numpy())


def motionlib_entries(path: Path, label: str, clip_indices: list[int], max_frames: int) -> list[dict[str, Any]]:
    import torch
    data = torch.load(path, map_location="cpu")
    gts = data["gts"]
    starts = data["length_starts"].to(torch.long).tolist()
    nums = data["motion_num_frames"].to(torch.long).tolist()
    dt = float(data.get("motion_dt", torch.tensor([1 / 30]))[0])
    clips = []
    for local_idx, motion_idx in enumerate(clip_indices):
        if motion_idx >= len(starts):
            continue
        start = int(starts[motion_idx])
        length = int(nums[motion_idx])
        clips.append({
            "id": f"motionlib-{len(clips) + 1}",
            "label": f"{label} reference {local_idx + 1}",
            "setting": label,
            "source": "G1 MotionLib retargeted reference",
            "fps": round(1 / dt) if dt > 0 else 30,
            "frames_total": length,
            "frames_shown": min(max_frames, math.ceil(length / max(1, math.ceil(length / max_frames)))),
            "joints": len(BODY_NAMES),
            "body_names": BODY_NAMES,
            "positions": rounded_motionlib_frames(gts, start, length, max_frames),
        })
    return clips


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--motionlib", action="append", default=[], help="Label=path.pt or path.pt")
    parser.add_argument("--npz", action="append", default=[], help="Label=path.npz or path.npz")
    parser.add_argument("--urdf", help="G1 URDF used for NPZ files that contain base_frame_* and joint_angles")
    parser.add_argument("--joint-order", choices=["g1", "urdf", "isaac"], default="g1", help="Order of 29 joint_angles in NPZ; g1 and urdf are equivalent here")
    parser.add_argument("--metadata-csv", action="append", default=[], help="Optional HiPHI manifest CSV with clip_id and true_frame_lu columns")
    parser.add_argument("--out", required=True)
    parser.add_argument("--clips", default="0,12", help="Comma-separated motion indices per MotionLib")
    parser.add_argument("--max-frames", type=int, default=150)
    parser.add_argument("--target-fps", type=float, default=30.0)
    args = parser.parse_args()

    if not args.motionlib and not args.npz:
        parser.error("provide at least one --motionlib or --npz source")

    clip_indices = [int(x) for x in args.clips.split(",") if x.strip()]
    frame_lu_index = load_frame_lu_index(args.metadata_csv)
    all_clips: list[dict[str, Any]] = []
    for spec in args.motionlib:
        label, path = parse_labeled_path(spec)
        all_clips.extend(motionlib_entries(path, label, clip_indices, args.max_frames))
    for spec in args.npz:
        label, path = parse_labeled_path(spec)
        all_clips.append(clip_from_npz(path, label, len(all_clips), args, frame_lu_index))
    add_display_labels(all_clips)

    payload = {
        "schema": "hiphi_g1_static_preview_v2",
        "coordinate_frame": "z_up_root_centered_xy",
        "target_fps": int(round(args.target_fps)),
        "body_names": BODY_NAMES,
        "edges": EDGES,
        "clips": all_clips,
        "note": "G1 retargeted-reference playback data.",
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {out} clips={len(all_clips)} size={out.stat().st_size}")


if __name__ == "__main__":
    main()
