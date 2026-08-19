# HiPHI

<video controls autoplay muted loop playsinline width="100%" src="https://huggingface.co/datasets/noitomrobotics/HiPHI/resolve/main/assets/HiPHI_demo_video.mp4"></video>

**A large-scale benchmark for high-precision human motion and object interaction.**

- **Hugging Face:** [noitomrobotics/HiPHI](https://huggingface.co/datasets/noitomrobotics/HiPHI)
- **Paper:** [arXiv:2608.16222](https://arxiv.org/abs/2608.16222)

HiPHI is an optical motion-capture dataset for humanoid learning and
whole-body motion modeling. It provides standardized BVH motion and, for
human-object interaction (HOI), synchronized object trajectories and
corresponding original high-resolution OBJ meshes.

## Overview

| Subset | Duration | Motion frames |
| --- | ---: | ---: |
| **HiPHI total** | **617.5 h** | **200.1M** |
| Body-only | **371.8 h** | **120.5M** |
| HOI | **245.7 h** | **79.6M** |

HOI accounts for **39.8%** of the total duration.

| Property | Value |
| --- | --- |
| Capture | Optical motion capture |
| Frame rate | 90 Hz |
| Human motion | Standardized 55-joint BVH |
| Performer IDs | 132 |
| Semantics | 22 Frames, 214 Frame-LU labels |
| Performer coverage | Median 24 performers per Frame-LU; 154 labels with at least 10 performers |
| HOI assets | Package-local object trajectories plus shared original high-resolution OBJ meshes |

The top 10, top 20, and top 50 Frame-LUs account for **20.4%**, **31.8%**,
and **53.7%** of the total duration.

## Intended Uses

- humanoid motion tracking, imitation learning, and retargeting;
- motion representation learning, generation, and completion;
- Frame-LU-based motion retrieval;
- object-aware whole-body motion and control;
- motion-space coverage analysis.

BVH motion must be retargeted and checked for the target robot embodiment.

## Dataset Structure

The Hugging Face repository stores the motion package tree in 32 independent
`.tar.zst` archives. Each original motion and its `__mirror` counterpart stay
in the same archive:

~~~text
HiPHI/
├── README.md
├── LICENSE.md
├── assets/
│   └── HiPHI_demo_video.mp4
├── docs/
│   ├── data_format.md
│   ├── mirroring.md
│   └── repository_layout.md
├── metadata/
│   ├── hiphi_metadata.csv
│   ├── hiphi_actor_metadata.csv
│   └── frame_lu_index.csv
├── object_meshes/
│   ├── {mesh_id}.obj
│   └── {mesh_id}__mirror.obj
└── data/
    ├── HiPHI_data_part_0001_of_0032.tar.zst
    ├── ...
    ├── HiPHI_data_part_0032_of_0032.tar.zst
    ├── archive_manifest.csv
    └── motion_to_part.csv
~~~

Archive members use the logical path
`HiPHI/data/{frame}/{lu}/{motion_id}`. Each motion directory contains its
motion-specific data; HOI metadata links to the shared repository-level object
mesh inventory. Mirrored packages use the suffix `__mirror` in the same
Frame/LU directory. `data/motion_to_part.csv` maps each original/mirror pair to
its archive.

Original motion IDs use `{frame_lu}_{xxxx}`. The four-digit counter starts at
`0001` independently within every Frame-LU, following the stable release
ordering. For example: `Body_movement-bob_0001` and
`Body_movement-bob_0001__mirror`.

See [docs/data_format.md](docs/data_format.md),
[docs/mirroring.md](docs/mirroring.md), and
[docs/repository_layout.md](docs/repository_layout.md) for details.

## Human Motion Format

All human motion uses the same 55-joint BVH hierarchy.

| Item | Format |
| --- | --- |
| Root joint | Hips |
| Articulated joints | 55 |
| End Sites | 13 |
| Coordinate system | Right-handed, Y-up |
| Linear unit | centimeters |
| Rotation unit | degrees |
| Joint channels | Xposition Yposition Zposition Zrotation Xrotation Yrotation |
| Euler order | Z-X-Y |
| Sampling rate | 90 Hz |
| Body proportions | Per-file joint offsets |

Frame count and frame time are stored in each BVH header. Duration is
`Frames × Frame Time`.

Release motions use the canonical approximately 90 Hz timing. Exact frame
count and frame time are stored in each BVH header. Human BVH and every object
track in a package share the same frame count and timestamps. Object-track
timestamps equal `frame × Frame Time`, rounded to six decimal places.

## HOI Format

HOI requires physical interaction with a tracked object. Ground contact,
locomotion, and untracked pantomime are not HOI.

Each HOI package contains:

1. `motion_actor.bvh`;
2. one trajectory CSV per tracked object;
3. `metadata.json` linking the motion and trajectories to the corresponding
   shared original high-resolution OBJ mesh.

### Object Trajectory CSV

~~~csv
frame,time_sec,px,py,pz,qx,qy,qz,qw
~~~

| Column | Type | Meaning |
| --- | --- | --- |
| frame | int | Zero-based BVH frame index. |
| time_sec | float | Time from the first frame, in seconds. |
| px, py, pz | float | Object position in meters in the shared right-handed Y-up frame. |
| qx, qy, qz, qw | float | Object-local-to-world quaternion in XYZW order. |

Each trajectory has one row per BVH frame. The `frame` column synchronizes the
object trajectory with the human motion.

### Object Mesh

Release meshes use the original high-resolution Wavefront OBJ geometry.
Vertices are stored in centimeters in the object's local frame, while
trajectory positions use meters:

~~~text
world_point_m = R(qx, qy, qz, qw) @ (0.01 * obj_vertex_cm)
                + [px, py, pz]
~~~

The repository-level `object_meshes/` directory contains 40 canonical
meshes and 40 local-X-reflected `__mirror` variants. `mesh_path` in
`metadata.json` is a repository-root-relative path to the matching OBJ, while
`mesh_id` is its stable object-asset identifier. OBJ files are not duplicated
inside motion packages.

The Hugging Face release includes the original high-resolution object meshes.

## Metadata

### metadata/hiphi_metadata.csv

One row represents one motion sequence.

| Field | Meaning |
| --- | --- |
| motion_id | `{frame_lu}_{xxxx}` identifier and directory name, with optional `__mirror` suffix. |
| frame | Frame label and first directory level. |
| lu | LU label and second directory level. |
| frame_lu | Frame-LU label. |
| duration_sec | Duration from the BVH header. |
| frame_count | Number of BVH frames. |
| actor_id | Short anonymized performer identifier in `A001` format. |
| text_annotation | English instruction describing the motion. |
| is_hoi | Whether the motion contains tracked-object interaction. |
| object_categories | Semicolon-separated tracked object categories; empty for body-only motion. |
| mirrored | `true` for a mirrored package and `false` for an original package. |

### metadata/hiphi_actor_metadata.csv

| Field | Meaning |
| --- | --- |
| actor_id | Short anonymized performer identifier in `A001` format. |
| height_cm | Height in centimeters. |
| weight_kg | Weight in kilograms. |
| gender | Gender. |

The release contains 132 anonymized performer IDs: 76 male and 56 female.
Original identity and capture-session identifiers are not included.

### Package metadata.json

Each package repeats its motion, Frame-LU, timing, performer, text annotation,
HOI, and mirroring fields. The annotation is stored under `text_annotation`.
Per-motion performer details are repeated under `actor_metadata`:

~~~json
{
  "actor_id": "A001",
  "actor_metadata": {
    "height_cm": 165,
    "weight_kg": 55,
    "gender": "female"
  }
}
~~~

HOI object entries contain `object_id`, `trajectory_path`, `mesh_id`, and
`mesh_path`.

There is no separate `interaction_type` field. Interaction semantics are
represented by `frame`, `lu`, `frame_lu`, and `text_annotation`.

### metadata/frame_lu_index.csv

One row per Frame-LU with sequence count, summed duration, summed frame count,
and unique performer count.

## Frame-LU Semantic Organization

A Frame-LU pairs one Frame with one LU. The directory order is Frame first,
then LU.

| Frame | Example LUs |
| --- | --- |
| Self_motion | walk, run, jog, stride |
| Change_posture | crawl |
| Posture | kneel, lean, squat |
| Body_movement | bend, toss, shake, clap |
| Cause_motion | push, pull, lift |
| Bringing | carry |
| Cause_to_move_in_place | rotate, shake, swing |

HiPHI contains 22 Frames and 214 Frame-LU labels.

## Mirrored Counterparts

Every original motion has one mirrored counterpart named by appending
`__mirror`, such as `Body_movement-bob_0001__mirror`. The package and global
metadata set `mirrored` to `true`; original motions set it to `false`.
For HOI, the human BVH, object trajectory, and object-local mesh are mirrored
together. Mirrored OBJ vertices negate local X, face winding is reversed, and
the mirrored mesh ID appends `__mirror`; both mesh variants live once under
`object_meshes/`. See
[docs/mirroring.md](docs/mirroring.md) for the transform and validation rules.

## HiPHI Motion Viewer

This repository includes the **HiPHI Motion Viewer**, a lightweight local
viewer for browsing the release by Frame and LU, playing 55-joint BVH motion
together with synchronized tracked objects, and inspecting motion metadata.
It runs entirely on your machine and works with partial dataset downloads.

See the [Motion Viewer guide](viewer/README.md) for setup, launch options,
controls, supported data layouts, and troubleshooting.

## Citation

If you use HiPHI in your research, please cite:

```bibtex
@article{ji2026hiphi,
  title={HiPHI: A Large-Scale Benchmark for High-Precision Human Motion and Object-Interaction},
  author={Ji, Jiahao and Ma, Ji and Zhang, Runhan and Yu, Runyi and Wang, Wenjia and Chi, Weiheng and Peng, Qianqian and Yan, Weichao and Gu, Yongfei and Tian, Ye and Wu, Ting and Li, Longwei and Yuan, Chun and Dai, Ruoli and Han, Lei},
  journal={arXiv preprint arXiv:2608.16222},
  year={2026}
}
```
