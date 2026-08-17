# HiPHI Repository Layout

HiPHI is organized by the semantic hierarchy:

~~~text
frame / lu / motion_id
~~~

A motion directory is the smallest logical data package. Its BVH, JSON
metadata, and HOI trajectories remain together inside one archive; original
meshes are shared at repository root to avoid duplicating identical assets
across thousands of packages.

## 1. Hugging Face Repository

~~~text
HiPHI/
├── README.md
├── LICENSE.md
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
├── data/
│   ├── HiPHI_data_part_0001_of_0032.tar.zst
│   ├── ...
│   ├── HiPHI_data_part_0032_of_0032.tar.zst
│   ├── archive_manifest.csv
│   └── motion_to_part.csv
~~~

`object_meshes/` contains exactly 40 canonical original meshes and
40 reflected `__mirror` variants.

The 32 `.tar.zst` files are independent archives. Every original/mirror pair
is kept in one archive. `archive_manifest.csv` records archive sizes;
`motion_to_part.csv` maps every pair to its archive.

Frame and LU directory names are the canonical labels. The released
22 Frame names and 214 Frame-LU labels use portable ASCII path characters.
Original motion IDs use `{frame_lu}_{xxxx}`, with an independent four-digit
counter per Frame-LU starting at `0001` in stable release order.

## 2. Logical Package Tree

Archive members use the following `HiPHI/data/...` hierarchy:

~~~text
data/
└── {frame}/
    └── {lu}/
        ├── {motion_id}/
        │   ├── motion_actor.bvh
        │   ├── metadata.json
        │   └── object_tracks/
        │       └── {object_id}.csv
        └── {motion_id}__mirror/
            ├── motion_actor.bvh
            ├── metadata.json
            └── object_tracks/
                └── {object_id}.csv
~~~

Body-only packages omit `object_tracks`. Original and
mirrored packages occupy the same Frame/LU namespace; mirroring is expressed
through the `{frame_lu}_{xxxx}__mirror` suffix and the boolean `mirrored`
metadata field.

## 3. Package Contents

Required for every motion package:

- motion_actor.bvh;
- metadata.json.

Additional files for HOI:

- object_tracks/{object_id}.csv, one per tracked object.

Every HOI metadata object references
`object_meshes/{mesh_id}.obj` relative to repository root. For mirrored
HOI packages, `mesh_id` is `{source_mesh_id}__mirror`; that shared OBJ contains
reflected local-X vertices and reversed face winding.

## 4. Global Index

hiphi_metadata.csv contains one row per motion package:

~~~text
motion_id,frame,lu,frame_lu,duration_sec,frame_count,actor_id,text_annotation,is_hoi,object_categories,mirrored
~~~

Users can select one Frame, one LU, individual motion IDs, actors, durations,
object categories, or interaction subsets. The corresponding logical package
location is always data/{frame}/{lu}/{motion_id}.
`motion_to_part.csv` identifies the archive containing it.
