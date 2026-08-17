/**
 * URL layout of an extracted HiPHI release, served under `/dataset/`.
 *
 * The release tree is:
 *
 *     object_meshes_preview/{mesh_id}.obj
 *     data/{frame}/{lu}/{motion_id}/motion_actor.bvh
 *     data/{frame}/{lu}/{motion_id}/metadata.json
 *     data/{frame}/{lu}/{motion_id}/object_tracks/{object_id}.csv
 */

const DATASET_BASE = '/dataset'

const encodePath = relPath => relPath.split('/').filter(Boolean).map(encodeURIComponent).join('/')

/** Directory of one motion package. */
export function motionDir(frame, lu, motionId) {
  return `${DATASET_BASE}/data/${encodeURIComponent(frame)}/${encodeURIComponent(lu)}/${encodeURIComponent(motionId)}`
}

export function bvhUrl(frame, lu, motionId) {
  return `${motionDir(frame, lu, motionId)}/motion_actor.bvh`
}

export function motionMetadataUrl(frame, lu, motionId) {
  return `${motionDir(frame, lu, motionId)}/metadata.json`
}

/** Resolves a path that metadata.json states relative to the motion package. */
export function motionRelativeUrl(frame, lu, motionId, relPath) {
  return `${motionDir(frame, lu, motionId)}/${encodePath(relPath)}`
}

/**
 * Resolves a path that metadata.json states relative to the dataset root.
 *
 * Object entries mix both conventions: `trajectory_path` is relative to the
 * motion package ("object_tracks/Box_A_1.csv") while `mesh_path` is relative
 * to the dataset root ("object_meshes_preview/Box_A_1.obj"), because meshes
 * are shared between motions and stored once.
 */
export function datasetRelativeUrl(relPath) {
  return `${DATASET_BASE}/${encodePath(relPath)}`
}

/**
 * Builds the viewer's object list from a motion's metadata.json, applying the
 * correct base to each path.
 *
 * @param {string} frame
 * @param {string} lu
 * @param {string} motionId
 * @param {{objects?: Array<object>}} meta
 */
export function viewerObjectsFrom(frame, lu, motionId, meta) {
  const objects = Array.isArray(meta?.objects)
    ? meta.objects.filter(object => object && typeof object === 'object' && !Array.isArray(object))
    : []
  return objects.map(o => ({
    objectId: o.object_id ?? o.mesh_id ?? 'object',
    meshUrl: o.mesh_path
      ? datasetRelativeUrl(o.mesh_path)
      : datasetRelativeUrl(`object_meshes_preview/${o.mesh_id ?? o.object_id}.obj`),
    trackUrl: o.trajectory_path
      ? motionRelativeUrl(frame, lu, motionId, o.trajectory_path)
      : motionRelativeUrl(frame, lu, motionId, `object_tracks/${o.object_id}.csv`),
  }))
}
