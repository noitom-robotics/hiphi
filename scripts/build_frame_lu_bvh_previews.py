#!/usr/bin/env python3
"""Build anonymous Frame-LU motion preview data for the website.

The output keeps a compact 23-joint body representation, 30 Hz timing, and object
preview meshes/poses where available while omitting source paths and package metadata.
"""
from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass, field
import os
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

SOURCE_ROOT = Path(os.environ.get('HIPHI_FRAME_LU_SOURCE', '../hiphi_core_selection/outputs/requested_frame_lu_samples_20260616/local_download')).resolve()
PACKAGE_ROOT = SOURCE_ROOT / 'full_packages'
MANIFEST = SOURCE_ROOT / 'manifests' / 'requested_frame_lu_samples.csv'
OUT = Path('static/data/frame_lu_motion_samples.json')
TARGET_FPS = 30
EXCERPT_SECONDS = 10
EXCLUDE_FRAME_LUS = {'Self_motion-jog', 'Body_movement-toss', 'Body_movement-shake', 'Cause_motion-push'}
MAX_MESH_FACES = 0  # 0 means keep the original OBJ mesh faces, no simplification

# Matches the front-end CANONICAL23_EDGES topology.
CANONICAL_23 = [
    'Hips', 'Spine', 'Chest', 'Neck', 'Head',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'LeftToeBase_End',
    'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'RightToeBase_End',
    'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
    'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
]

JOINT_ALIASES = {
    'Hips': ['Hips'],
    'Spine': ['Spine'],
    'Chest': ['Spine4', 'Spine3', 'Spine2', 'Spine1', 'Spine'],
    'Neck': ['Neck1', 'Neck'],
    'Head': ['Head'],
    'LeftUpLeg': ['LeftUpLeg'],
    'LeftLeg': ['LeftLeg'],
    'LeftFoot': ['LeftFoot'],
    'LeftToeBase': ['LeftToeBase'],
    'LeftToeBase_End': ['LeftToeBase_End', 'LeftToeBase'],
    'RightUpLeg': ['RightUpLeg'],
    'RightLeg': ['RightLeg'],
    'RightFoot': ['RightFoot'],
    'RightToeBase': ['RightToeBase'],
    'RightToeBase_End': ['RightToeBase_End', 'RightToeBase'],
    'LeftShoulder': ['LeftShoulder'],
    'LeftArm': ['LeftArm'],
    'LeftForeArm': ['LeftForeArm'],
    'LeftHand': ['LeftHand'],
    'RightShoulder': ['RightShoulder'],
    'RightArm': ['RightArm'],
    'RightForeArm': ['RightForeArm'],
    'RightHand': ['RightHand'],
}
CANONICAL_23_EDGES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[8,9],[0,10],[10,11],[11,12],[12,13],[13,14],[2,15],[15,16],[16,17],[17,18],[2,19],[19,20],[20,21],[21,22]]

FAMILY_BY_PREFIX = {
    'L': 'Locomotion and direction',
    'P': 'Posture and support',
    'B': 'Body-part motion',
    'O': 'Object actuation and transfer',
    'D': 'Object-local dynamics',
}

@dataclass
class Node:
    name: str
    parent: Optional[int]
    offset: List[float] = field(default_factory=lambda: [0.0, 0.0, 0.0])
    channels: List[str] = field(default_factory=list)
    channel_index: Optional[int] = None


def parse_bvh(path: Path) -> Tuple[List[Node], int, float, int, Iterable[List[float]]]:
    lines = path.read_text(errors='ignore').splitlines()
    motion_idx = lines.index('MOTION')
    nodes: List[Node] = []
    stack: List[int] = []
    pending: Optional[int] = None
    channel_cursor = 0

    for line in lines[:motion_idx]:
        stripped = line.strip()
        if not stripped:
            continue
        parts = stripped.split()
        if parts[0] in {'ROOT', 'JOINT'}:
            nodes.append(Node(name=parts[1], parent=stack[-1] if stack else None))
            pending = len(nodes) - 1
        elif stripped == 'End Site':
            if not stack:
                continue
            parent = stack[-1]
            nodes.append(Node(name=f"{nodes[parent].name}_End", parent=parent))
            pending = len(nodes) - 1
        elif stripped == '{':
            if pending is not None:
                stack.append(pending)
                pending = None
        elif stripped == '}':
            if stack:
                stack.pop()
        elif parts[0] == 'OFFSET' and stack:
            nodes[stack[-1]].offset = [float(v) for v in parts[1:4]]
        elif parts[0] == 'CHANNELS' and stack:
            count = int(parts[1])
            nodes[stack[-1]].channels = parts[2:2 + count]
            nodes[stack[-1]].channel_index = channel_cursor
            channel_cursor += count

    frames = int(lines[motion_idx + 1].split(':', 1)[1])
    frame_time = float(lines[motion_idx + 2].split(':', 1)[1])
    motion_lines = lines[motion_idx + 3:]
    return nodes, frames, frame_time, channel_cursor, (list(map(float, ln.split())) for ln in motion_lines if ln.strip())


def rot_matrix(axis: str, degrees: float) -> List[List[float]]:
    a = math.radians(degrees)
    c = math.cos(a)
    s = math.sin(a)
    if axis == 'X':
        return [[1,0,0],[0,c,-s],[0,s,c]]
    if axis == 'Y':
        return [[c,0,s],[0,1,0],[-s,0,c]]
    return [[c,-s,0],[s,c,0],[0,0,1]]


def matmul(a: List[List[float]], b: List[List[float]]) -> List[List[float]]:
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def matvec(m: List[List[float]], v: List[float]) -> List[float]:
    return [sum(m[i][j] * v[j] for j in range(3)) for i in range(3)]


def vecadd(a: List[float], b: List[float]) -> List[float]:
    return [a[i] + b[i] for i in range(3)]


def fk(nodes: List[Node], values: List[float]) -> Dict[str, List[float]]:
    global_pos: List[List[float]] = []
    global_rot: List[List[List[float]]] = []
    ident = [[1,0,0],[0,1,0],[0,0,1]]

    for node in nodes:
        local_t = node.offset[:]
        local_r = ident
        if node.channels and node.channel_index is not None:
            vals = values[node.channel_index:node.channel_index + len(node.channels)]
            pos = [0.0, 0.0, 0.0]
            has_pos = False
            for channel, val in zip(node.channels, vals):
                if channel.endswith('position'):
                    pos['XYZ'.index(channel[0])] = val
                    has_pos = True
                elif channel.endswith('rotation'):
                    local_r = matmul(local_r, rot_matrix(channel[0], val))
            # These exported BVHs carry per-joint translation channels. Using those
            # channels directly gives the measured skeleton scale; adding OFFSET again
            # doubles limb lengths. End Sites still use their hierarchy OFFSET.
            if has_pos:
                local_t = pos
        if node.parent is None:
            global_pos.append(local_t)
            global_rot.append(local_r)
        else:
            parent_pos = global_pos[node.parent]
            parent_rot = global_rot[node.parent]
            global_pos.append(vecadd(parent_pos, matvec(parent_rot, local_t)))
            global_rot.append(matmul(parent_rot, local_r))
    return {node.name: pos for node, pos in zip(nodes, global_pos)}


def bvh_to_site_xyz(point_cm: List[float], root0_cm: List[float]) -> List[float]:
    # BVH uses X/Z as floor axes and Y as up, in centimeters. The site canvas expects
    # x/y floor axes and z up, in meters. Recenter each preview by first-frame root.
    x = (point_cm[0] - root0_cm[0]) / 100.0
    y = (point_cm[2] - root0_cm[2]) / 100.0
    z = point_cm[1] / 100.0
    return [round(x, 4), round(y, 4), round(z, 4)]


def parse_obj_mesh(path: Path, max_faces: int = MAX_MESH_FACES) -> dict:
    vertices: List[List[float]] = []
    faces_raw: List[List[int]] = []
    for line in path.read_text(errors='ignore').splitlines():
        if line.startswith('v '):
            parts = line.split()
            if len(parts) >= 4:
                # Keep OBJ's original axis convention in meters: X/Z floor, Y up.
                vertices.append([round(float(parts[1]) / 100.0, 5), round(float(parts[2]) / 100.0, 5), round(float(parts[3]) / 100.0, 5)])
        elif line.startswith('f '):
            idxs = []
            for token in line.split()[1:]:
                raw = token.split('/')[0]
                if not raw:
                    continue
                idx = int(raw)
                idxs.append(idx - 1 if idx > 0 else len(vertices) + idx)
            if len(idxs) >= 3:
                # Triangulate fan-style if needed.
                for j in range(1, len(idxs) - 1):
                    faces_raw.append([idxs[0], idxs[j], idxs[j + 1]])
    if not vertices or not faces_raw:
        return {'vertices': [], 'faces': []}
    if max_faces and max_faces > 0 and len(faces_raw) > max_faces:
        step = max(1, len(faces_raw) // max_faces)
        sampled = faces_raw[::step][:max_faces]
    else:
        sampled = faces_raw
    used = sorted({i for face in sampled for i in face if 0 <= i < len(vertices)})
    remap = {old: new for new, old in enumerate(used)}
    faces = [[remap[i] for i in face] for face in sampled if all(i in remap for i in face)]
    verts = [vertices[i] for i in used]
    mins = [min(v[i] for v in verts) for i in range(3)]
    maxs = [max(v[i] for v in verts) for i in range(3)]
    return {
        'vertices': verts,
        'faces': faces,
        'bounds': {'min': [round(v, 5) for v in mins], 'max': [round(v, 5) for v in maxs]},
        'source_faces': len(faces_raw),
        'full_mesh': len(sampled) == len(faces_raw),
    }


def build_mesh_library() -> dict:
    mesh_root = SOURCE_ROOT / 'meshes'
    library = {}
    for object_id in ['Table_C_1', 'Chair_Q_1']:
        obj_path = next(mesh_root.glob(f'*__{object_id}/{object_id}.obj'), None)
        if obj_path:
            mesh_id = object_id.lower()
            label = 'Table mesh' if 'Table' in object_id else 'Chair mesh'
            color = '#f06ba8' if 'Table' in object_id else '#b044f4'
            mesh = parse_obj_mesh(obj_path)
            mesh.update({'id': mesh_id, 'label': label, 'color': color})
            library[mesh_id] = mesh
    return library


def read_prop_trajectory(package: Path, object_id: str, root0_cm: List[float], start: int, end: int, stride: int) -> List[dict]:
    prop_path = package / f'prop_{object_id}.csv'
    if not prop_path.exists():
        matches = sorted(package.glob('prop_*.csv'))
        if not matches:
            return []
        prop_path = matches[0]
    rows = []
    with prop_path.open(newline='') as f:
        for row in csv.DictReader(f):
            rows.append(row)
    out = []
    for idx in range(start, min(end, len(rows))):
        if (idx - start) % stride:
            continue
        row = rows[idx]
        px = float(row['px'])
        py = float(row['py'])
        pz = float(row['pz'])
        # Source object pose uses X/Z floor axes and Y up, in meters.
        center = [round(px - root0_cm[0] / 100.0, 4), round(pz - root0_cm[2] / 100.0, 4), round(py, 4)]
        out.append({
            'center': center,
            'quat_xyzw': [round(float(row['qx']), 6), round(float(row['qy']), 6), round(float(row['qz']), 6), round(float(row['qw']), 6)],
        })
    return out


    with MANIFEST.open(newline='') as f:
        rows = list(csv.DictReader(f))
    return {row['sample_id']: row for row in rows}


def read_manifest() -> Dict[str, dict]:
    with MANIFEST.open(newline='') as f:
        rows = list(csv.DictReader(f))
    return {row['sample_id']: row for row in rows}


def package_for_sample(sample_id: str) -> Path:
    matches = sorted(PACKAGE_ROOT.glob(f'{sample_id}__*'))
    if not matches:
        raise FileNotFoundError(f'No package for {sample_id}')
    return matches[0]


def build_clip(sample_id: str, meta: dict) -> dict:
    package = package_for_sample(sample_id)
    bvh = package / 'motion_actor.bvh'
    nodes, source_frames, frame_time, channels, frame_iter = parse_bvh(bvh)
    node_names = {node.name for node in nodes}
    joint_map = {}
    missing = []
    for canonical in CANONICAL_23:
        match = next((name for name in JOINT_ALIASES[canonical] if name in node_names), None)
        if match is None:
            missing.append(canonical)
        else:
            joint_map[canonical] = match
    if missing:
        raise ValueError(f'{sample_id}: missing joints {missing}')

    source_fps = 1.0 / frame_time if frame_time > 0 else 90.0
    stride = max(1, round(source_fps / TARGET_FPS))
    excerpt_source_frames = int(EXCERPT_SECONDS * source_fps)
    start = max(0, (source_frames - excerpt_source_frames) // 2)
    end = min(source_frames, start + excerpt_source_frames)

    positions: List[List[List[float]]] = []
    root0: Optional[List[float]] = None
    for idx, values in enumerate(frame_iter):
        if idx < start or idx >= end or ((idx - start) % stride):
            continue
        world = fk(nodes, values)
        if root0 is None:
            root0 = world['Hips'][:]
        positions.append([bvh_to_site_xyz(world[joint_map[name]], root0) for name in CANONICAL_23])

    requested = meta.get('requested_frame_lu') or meta.get('selected_frame_lu') or ''
    selected = meta.get('selected_frame_lu') or requested
    frame, _, lu = requested.partition('-')
    label_lu = lu or requested
    prefix = ''.join(ch for ch in sample_id if ch.isalpha())[:1]
    is_object = str(meta.get('object_available', '')).lower() == 'true' or bool(meta.get('object_id'))
    object_id = meta.get('object_id') if is_object else ''
    object_payload = None
    if is_object and object_id and root0 is not None:
        traj = read_prop_trajectory(package, object_id, root0, start, end, stride)
        mesh_id = object_id.lower()
        if traj:
            object_payload = {
                'object_id': object_id,
                'mesh_id': mesh_id,
                'trajectory': traj[:len(positions)],
            }
    return {
        'id': sample_id,
        'key': requested.lower(),
        'frame': frame,
        'lu': label_lu,
        'label': label_lu,
        'family': FAMILY_BY_PREFIX.get(prefix, ''),
        'requested_frame_lu': requested,
        'selected_frame_lu': selected,
        'match_status': meta.get('match_status') or 'exact',
        'prompt_summary': meta.get('prompt_short') or '',
        'has_object': is_object,
        'object_id': object_id,
        'object': object_payload,
        'fps': TARGET_FPS,
        'source_fps': round(source_fps, 3),
        'source_frames_total': source_frames,
        'excerpt_seconds': round(len(positions) / TARGET_FPS, 2),
        'positions': positions,
    }


def main() -> None:
    manifest = read_manifest()
    clips = []
    for sample_id in sorted(manifest.keys()):
        row = manifest[sample_id]
        if (row.get('requested_frame_lu') or '').strip() in EXCLUDE_FRAME_LUS:
            continue
        clips.append(build_clip(sample_id, row))
    payload = {
        'version': 2,
        'target_fps': TARGET_FPS,
        'body_names': CANONICAL_23,
        'edges': CANONICAL_23_EDGES,
        'source_note': 'Frame-LU motion and object preview data.',
        'meshes': build_mesh_library(),
        'clips': clips,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(',', ':')), encoding='utf-8')
    print(f'wrote {OUT} with {len(clips)} clips, {sum(len(c["positions"]) for c in clips)} frames')


if __name__ == '__main__':
    main()
