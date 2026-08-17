#!/usr/bin/env python3
"""Build compact object-interaction BVH + object mesh previews for the website.

The output keeps only a 23-joint body excerpt, object pose trajectory, and OBJ
geometry needed by the static canvas viewer. It omits source paths and private
package metadata.
"""
from __future__ import annotations

import csv
import json
import os
from pathlib import Path
from typing import Any

from build_frame_lu_bvh_previews import (
    CANONICAL_23,
    CANONICAL_23_EDGES,
    JOINT_ALIASES,
    bvh_to_site_xyz,
    fk,
    parse_bvh,
    parse_obj_mesh,
    read_prop_trajectory,
)

SOURCE_ROOT = Path(os.environ.get(
    'HIPHI_OBJECT_SOURCE',
    '../hiphi_core_selection/outputs/action_object_samples_20260616/local_download',
)).resolve()
MANIFEST = SOURCE_ROOT / 'manifests' / 'local_package_verification.csv'
OUT = Path('static/data/object_motion_samples.json')
TARGET_FPS = 30
EXCERPT_SECONDS = 10

DESCRIPTIONS = {
    'Carry': 'Whole-body load-bearing motion with tracked object state.',
    'Lift': 'Object lifting with coordinated arm, torso, and load-bearing motion.',
    'Push': 'Object actuation shaped by contact, resistance, and trajectory.',
    'Pull': 'Object-constrained locomotion and whole-body coordination.',
    'Lean': 'Support interaction where object geometry shapes body posture.',
    'Sit': 'Posture transition grounded by real support geometry.',
    'Kick': 'Dynamic object-interaction with foot-object contact.',
    'Swing': 'Object-local dynamics with repeated rotational motion.',
}

OBJECT_COLORS = {
    'Box_A_1': '#f06ba8',
    'Box_H_1': '#e45aa0',
    'Chair_A_1': '#b044f4',
    'Chair_Q_1': '#8f5bd6',
    'Chair_S_1': '#c45ad8',
    'Mop_A_1': '#7b4fc6',
}


def read_manifest() -> list[dict[str, str]]:
    with MANIFEST.open(newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def package_for_row(row: dict[str, str]) -> Path:
    rel = row.get('local_package_dir', '')
    name = Path(rel).name if rel else f"{row['sample_id']}__{row['category']}__*"
    direct = SOURCE_ROOT / 'full_packages' / name
    if direct.exists():
        return direct
    matches = sorted((SOURCE_ROOT / 'full_packages').glob(f"{row['sample_id']}__{row['category']}__*"))
    if not matches:
        raise FileNotFoundError(f"package not found for {row.get('sample_id')} {row.get('category')}")
    return matches[0]


def build_mesh_library(rows: list[dict[str, str]]) -> dict[str, Any]:
    object_ids = sorted({row.get('task_info_items', '').strip() for row in rows if row.get('task_info_items')})
    mesh_root = SOURCE_ROOT / 'meshes'
    meshes: dict[str, Any] = {}
    for object_id in object_ids:
        obj_path = mesh_root / object_id / f'{object_id}.obj'
        if not obj_path.exists():
            continue
        mesh_id = object_id.lower()
        mesh = parse_obj_mesh(obj_path, max_faces=0)
        mesh.update({
            'id': mesh_id,
            'label': object_id.replace('_', ' '),
            'object_id': object_id,
            'color': OBJECT_COLORS.get(object_id, '#b044f4'),
        })
        meshes[mesh_id] = mesh
    return meshes


def build_clip(row: dict[str, str]) -> dict[str, Any]:
    package = package_for_row(row)
    bvh = package / 'motion_actor.bvh'
    nodes, source_frames, frame_time, _channels, frame_iter = parse_bvh(bvh)
    node_names = {node.name for node in nodes}
    joint_map: dict[str, str] = {}
    missing: list[str] = []
    for canonical in CANONICAL_23:
        match = next((name for name in JOINT_ALIASES[canonical] if name in node_names), None)
        if match is None:
            missing.append(canonical)
        else:
            joint_map[canonical] = match
    if missing:
        raise ValueError(f"{row.get('sample_id')}: missing joints {missing}")

    source_fps = 1.0 / frame_time if frame_time > 0 else 90.0
    stride = max(1, round(source_fps / TARGET_FPS))
    excerpt_source_frames = int(EXCERPT_SECONDS * source_fps)
    start = max(0, (source_frames - excerpt_source_frames) // 2)
    end = min(source_frames, start + excerpt_source_frames)

    positions: list[list[list[float]]] = []
    root0: list[float] | None = None
    for idx, values in enumerate(frame_iter):
        if idx < start or idx >= end or ((idx - start) % stride):
            continue
        world = fk(nodes, values)
        if root0 is None:
            root0 = world['Hips'][:]
        positions.append([bvh_to_site_xyz(world[joint_map[name]], root0) for name in CANONICAL_23])

    object_id = row.get('task_info_items', '').strip()
    object_payload = None
    if object_id and root0 is not None:
        trajectory = read_prop_trajectory(package, object_id, root0, start, end, stride)
        if trajectory:
            object_payload = {
                'object_id': object_id,
                'mesh_id': object_id.lower(),
                'trajectory': trajectory[:len(positions)],
            }

    category = row.get('category', '').strip()
    return {
        'id': row.get('sample_id') or category.lower(),
        'label': category,
        'category': category,
        'description': DESCRIPTIONS.get(category, 'Object-interaction sample with synchronized human and object state.'),
        'object_id': object_id,
        'object': object_payload,
        'fps': TARGET_FPS,
        'source_fps': round(source_fps, 3),
        'source_frames_total': int(source_frames),
        'excerpt_seconds': round(len(positions) / TARGET_FPS, 2),
        'positions': positions,
    }


def main() -> None:
    rows = read_manifest()
    clips = [build_clip(row) for row in rows]
    payload = {
        'version': 1,
        'target_fps': TARGET_FPS,
        'body_names': CANONICAL_23,
        'edges': CANONICAL_23_EDGES,
        'meshes': build_mesh_library(rows),
        'clips': clips,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(',', ':')), encoding='utf-8')
    frames = sum(len(c['positions']) for c in clips)
    print(f'wrote {OUT} with {len(clips)} clips, {len(payload["meshes"])} meshes, {frames} frames, size={OUT.stat().st_size}')


if __name__ == '__main__':
    main()
