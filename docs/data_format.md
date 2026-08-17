# HiPHI Data Format Specification

HiPHI uses the logical hierarchy frame/lu/motion_id. Each motion directory is
one complete data package. The Hugging Face repository distributes that
package tree in 32 independent `.tar.zst` files under `data/`; archive members
use the paths below.

## 1. Package Contract

~~~text
data/{frame}/{lu}/{motion_id}/
├── motion_actor.bvh
├── metadata.json
└── object_tracks/              # HOI only
    └── {object_id}.csv
~~~

An original motion ID is `{frame_lu}_{xxxx}`, where `xxxx` is a four-digit
sequence number assigned independently within each Frame-LU in ascending
stable release order. Numbering starts at `0001`; for example,
`Body_movement-bob_0001`. A mirrored motion appends `__mirror` to its original
ID. Motion-specific JSON metadata and HOI trajectories stay inside the package;
simplified meshes are shared at repository root.

## 2. Path Rules

- frame is the canonical FrameNet frame label.
- lu is the canonical lexical-unit label.
- motion_id is a stable Frame-LU-scoped identifier in `{frame_lu}_{xxxx}` format.
- frame and lu use their released case and spelling without an additional slug
  mapping.
- the checked 22 Frames and 214 Frame-LUs contain no slash, backslash,
  whitespace, or non-portable path characters.
- frame_lu equals frame joined with lu by a hyphen.

## 3. Coordinate and Unit Summary

| Asset | Coordinate frame | Position unit | Orientation |
| --- | --- | --- | --- |
| Human BVH | right-handed, Y-up | centimeters | Euler degrees, Z-X-Y |
| Public object trajectory CSV | same right-handed Y-up world frame | meters | normalized quaternion, XYZW |
| Repository-level simplified OBJ mesh | object-local frame | centimeters | posed by trajectory quaternion; mirrored variants contain reflected local geometry |

For an approved mesh vertex v_cm, trajectory translation p_m, and quaternion q:

~~~text
v_world_m = R(q) @ (0.01 * v_cm) + p_m
~~~

## 4. Standardized 55-joint BVH

Each motion_actor.bvh contains 55 articulated joints, 13 End Sites, and a Hips
root.

~~~text
Hips
Spine Spine1 Spine2 Spine3 Spine4
Neck Neck1 Head
LeftShoulder LeftArm LeftForeArm LeftHand
LeftHandThumb1 LeftHandThumb2 LeftHandThumb3
LeftHandIndex1 LeftHandIndex2 LeftHandIndex3
LeftHandMiddle1 LeftHandMiddle2 LeftHandMiddle3
LeftHandRing1 LeftHandRing2 LeftHandRing3
LeftHandPinky1 LeftHandPinky2 LeftHandPinky3
RightShoulder RightArm RightForeArm RightHand
RightHandThumb1 RightHandThumb2 RightHandThumb3
RightHandIndex1 RightHandIndex2 RightHandIndex3
RightHandMiddle1 RightHandMiddle2 RightHandMiddle3
RightHandRing1 RightHandRing2 RightHandRing3
RightHandPinky1 RightHandPinky2 RightHandPinky3
LeftUpLeg LeftLeg LeftFoot LeftToeBase
RightUpLeg RightLeg RightFoot RightToeBase
~~~

Every articulated joint uses:

~~~text
CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
~~~

Translations and offsets are centimeters. Rotations are Euler degrees in the
declared Z-X-Y channel order. Per-file offsets preserve performer proportions.

Timing is read from Frames and Frame Time in the BVH MOTION header. Release
motions use the canonical approximately 90 Hz timing, and duration equals
frame count times frame time. Every object track has exactly the BVH frame
count and uses the same zero-based timestamps:
`time_sec = frame × Frame Time`, rounded to six decimal places in the
trajectory CSV.

## 5. Object Trajectory

HOI packages contain one CSV per tracked object:

~~~text
object_tracks/{object_id}.csv
~~~

| Column | Type | Unit | Meaning |
| --- | --- | --- | --- |
| frame | int64 | frame | Zero-based BVH frame index. |
| time_sec | float64 | seconds | Relative time from package start. |
| px, py, pz | float64 | meters | Object origin in the shared world frame. |
| qx, qy, qz, qw | float64 | unitless | Object-local-to-world quaternion, XYZW. |

Trajectory requirements:

- exactly one row per BVH frame;
- contiguous indices from 0 to frame_count minus 1;
- normalized quaternions;
- no absolute timestamps or internal frame IDs.

Object trajectories are included in the Hugging Face package archives.

The archive index `data/motion_to_part.csv` maps every original motion and its
mirror to one `HiPHI_data_part_*.tar.zst` file. A pair is never split across
archives.

## 6. Object Mesh

The repository contains each canonical simplified mesh and its reflected
counterpart once at:

~~~text
object_meshes_preview/{mesh_id}.obj
object_meshes_preview/{mesh_id}__mirror.obj
~~~

Meshes use simplified Wavefront OBJ geometry. Vertices are centimeters in
object-local coordinates. The directory contains 40 canonical files and 40
mirrored files. `mesh_path` gives the repository-root-relative file path and
`mesh_id` gives the stable object-asset identifier. Motion packages do not
contain duplicated OBJ files.

## 7. Package metadata.json

Required top-level fields:

| Field | Type | Meaning |
| --- | --- | --- |
| motion_id | string | Stable `{frame_lu}_{xxxx}` ID and package directory name, with optional `__mirror` suffix. |
| dataset | string | HiPHI. |
| frame | string | FrameNet frame and first path component. |
| lu | string | Lexical unit and second path component. |
| frame_lu | string | Public Frame-LU label. |
| fps | float | Nominal frame rate. |
| frame_count | int | BVH frame count. |
| duration_sec | float | BVH duration. |
| actor_id | string | Short anonymized performer ID in `A001` format. |
| actor_metadata | object | Performer height, weight, and gender for this motion. |
| text_annotation | string | English motion instruction copied from the selected row's `steps` field. |
| is_hoi | bool | HOI flag under the tracked-object definition. |
| mirrored | bool | `true` for mirrored packages and `false` for originals. |
| objects | array | Tracked objects; empty for body-only packages. |

Each objects entry contains object_id, object_category, trajectory_path,
mesh_id, and mesh_path. `mesh_path` must equal
`object_meshes_preview/{mesh_id}.obj`.

| Field | Type | Meaning |
| --- | --- | --- |
| object_id | string | Tracked object identifier and trajectory filename stem. |
| object_category | string | One of the 12 broad categories: `ball`, `bench`, `bottle`, `box`, `bucket`, `chair`, `clothrack`, `mop`, `soccerball`, `stepstool`, `table`, or `trashbin`. |
| trajectory_path | string | Package-local `object_tracks/{object_id}.csv` path. |
| mesh_id | string | Stable simplified-mesh identifier; mirrored variants append `__mirror`. |
| mesh_path | string | Repository-root-relative `object_meshes_preview/{mesh_id}.obj` path. |

No `interaction_type` field is released. Interaction semantics are represented
by `frame`, `lu`, `frame_lu`, and `text_annotation`.

`actor_metadata` contains:

| Field | Type | Meaning |
| --- | --- | --- |
| height_cm | number | Performer height in centimeters. |
| weight_kg | number | Performer weight in kilograms. |
| gender | string | Performer gender from the anonymized actor roster. |

## 8. Global hiphi_metadata

metadata/hiphi_metadata.csv contains one row per motion package with the
following columns:

| Field | Meaning |
| --- | --- |
| motion_id | Stable `{frame_lu}_{xxxx}` motion identifier, with optional `__mirror` suffix. |
| frame | FrameNet frame and first directory level. |
| lu | Lexical unit and second directory level. |
| frame_lu | Frame-LU label. |
| duration_sec | Duration from the BVH header. |
| frame_count | BVH motion-frame count. |
| actor_id | Anonymized performer identifier. |
| text_annotation | English instruction describing the motion. |
| is_hoi | Whether the package contains tracked-object interaction. |
| object_categories | Tracked categories separated by semicolons; empty for body-only motion. |
| mirrored | `true` for mirrored packages and `false` for originals. |

The CSV does not expose collection-session IDs, capture dates, transport paths,
or analysis-only groupings. Files are located by the fixed
data/{frame}/{lu}/{motion_id} hierarchy.

## 9. Actor and Frame-LU Tables

metadata/hiphi_actor_metadata.csv contains anonymized actor_id, height_cm,
weight_kg, and gender. Actor IDs use the fixed four-character format `A001`,
`A002`, and so on; original identity fields are not included in the release.

metadata/frame_lu_index.csv contains:

~~~text
frame,lu,frame_lu,sequence_count,duration_sec,frame_count,unique_actor_count
~~~

Every sequence count is accompanied by summed duration and summed frame count.

## 10. Mirroring

Original and mirrored motions share the same frame/lu directory. If the
original identifier is `Body_movement-bob_0001`, the mirrored identifier is
`Body_movement-bob_0001__mirror`. The `mirrored` metadata value is `false` for
the original and `true` for the mirrored package.

The release mirror is the world YZ plane, using `S = diag(-1, 1, 1)` in the
documented right-handed Y-up frame. BVH left/right joints are swapped while
local translations and rotations use `t' = S t` and `R' = S R S`. Object
tracks use `p' = S p`; for XYZW quaternions this is
`(qx, -qy, -qz, qw)`.

HOI meshes must also be mirrored in object-local X and have their face winding
reversed. With `v' = S v`, the resulting world geometry satisfies
`R' v' + p' = S (R v + p)`. Reusing the unchanged local mesh generally breaks
this equality for asymmetric objects. The mirrored `mesh_id` and OBJ filename
append `__mirror`; metadata points to the shared mirrored asset under
`object_meshes_preview/`. See [mirroring.md](mirroring.md) for the complete
procedure and validation gates.
