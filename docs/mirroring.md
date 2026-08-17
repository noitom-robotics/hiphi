# HiPHI Mirroring Procedure

This document defines how original HiPHI packages are materialized as
mirrored release packages. Mirroring is a deterministic derivative step over
an already validated original package; it is not a second download source.

## 1. Source and output

Use the released original package as the only input:

```text
data/{frame}/{lu}/{frame_lu}_{xxxx}/
```

Write the derivative beside it:

```text
data/{frame}/{lu}/{frame_lu}_{xxxx}__mirror/
```

Copy the original metadata, append `__mirror` to `motion_id`, and set the
boolean `mirrored` field to `true`. Actor identity, annotation, timing, Frame-LU,
and HOI classification remain unchanged. For each HOI object, append
`__mirror` to `mesh_id` and set `mesh_path` to the corresponding
repository-root-relative `object_meshes/{mesh_id}.obj` path.

## 2. Canonical reflection

HiPHI BVH and object trajectories use a shared right-handed, Y-up world
frame. The standardized skeleton offsets confirm that X is the left/right
axis. The canonical release mirror is therefore the world YZ plane:

```text
S = diag(-1, 1, 1)
```

The plane is fixed at world `X = 0`; no per-motion pivot is introduced.

## 3. Human BVH

For every BVH node:

1. swap `Left...` and `Right...` source joints;
2. reflect local translations and hierarchy offsets with `t' = S t`;
3. conjugate local rotations with `R' = S R S`;
4. convert the proper rotation back to the declared BVH Euler order;
5. preserve frame count and frame time.

Mirroring preserves the standardized human and object timeline exactly.

For the standardized six-channel HiPHI hierarchy, this applies to all 55
articulated joints. End Site offsets are swapped and reflected as well.

## 4. Object trajectory

For every synchronized object frame:

```text
p' = S p
R' = S R S
```

With the released XYZW quaternion order and an X reflection, the equivalent
quaternion is:

```text
(qx, qy, qz, qw) -> (qx, -qy, -qz, qw)
```

Frame indices and relative timestamps remain unchanged.

## 5. Object mesh

Meshes are repository-level release assets rather than package-local copies.
The release root contains each canonical and mirrored variant once:

```text
object_meshes/{mesh_id}.obj
object_meshes/{mesh_id}__mirror.obj
```

The local mesh must be reflected as well. For each OBJ vertex and normal:

```text
v' = S v
n' = S n
```

Reverse every face's vertex order to preserve outward winding. The mirrored
mesh ID and filename append `__mirror`. Motion metadata references the shared
asset; the OBJ is not copied into each HOI package.

This is necessary because the exact world-space mirror is:

```text
R' v' + p' = (S R S)(S v) + S p = S(R v + p)
```

If the local mesh is reused unchanged, the middle `S v` term is missing. That
can be harmless only for an exactly reflection-symmetric asset; it is not a
safe general release rule.

## 6. Required validation gates

Before a mirrored package is indexed for release, verify:

- motion ID suffix and `mirrored=true` agree;
- frame count and timing are unchanged;
- mirrored BVH world joints equal reflected, left/right-swapped source joints;
- applying the BVH mirror twice restores source positions and rotations;
- trajectory positions and rotations satisfy the matrix equations above;
- trajectory quaternion norms remain one;
- shared mirrored OBJ vertices equal reflected source vertices;
- OBJ face winding is reversed;
- posed mirrored mesh vertices equal the world-space reflection of the posed
  original mesh;
- BVH and every object track retain exact frame-count synchronization.

After package validation, duplicate the original global metadata row, append
`__mirror` to `motion_id`, set `mirrored=true`, and keep all other semantic,
actor, and timing fields unchanged.
