/** Pure presentation helpers shared by the catalog, metadata sidebar, and player. */

const text = value => value === undefined || value === null ? '' : String(value)

const firstText = (...values) => values.map(text).find(value => value.trim()) ?? ''

/** Normalizes untrusted motion JSON without making a playable BVH depend on it. */
export function normalizeMotionMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const objects = Array.isArray(value.objects)
    ? value.objects.filter(object => object && typeof object === 'object' && !Array.isArray(object))
    : []
  return { ...value, objects }
}

/**
 * Matches one catalog motion against identifiers and semantic metadata.
 * The server enriches catalog motions from the release index or motion-local
 * metadata, keeping search useful with complete and partial datasets.
 */
export function matchesMotion(motion, query) {
  const q = text(query).trim().toLowerCase()
  if (!q) return true

  return [
    motion.motionId,
    motion.frame,
    motion.lu,
    motion.actorId,
    motion.textAnnotation,
    ...(motion.objectIds ?? []),
    ...(motion.objectCategories ?? []),
  ].some(value => text(value).toLowerCase().includes(q))
}

/** Builds the stable Frame/LU hierarchy once instead of on every UI update. */
export function groupMotions(motions) {
  const frames = new Map()
  for (const motion of motions) {
    let frame = frames.get(motion.frame)
    if (!frame) {
      frame = { name: motion.frame, count: 0, lus: new Map() }
      frames.set(motion.frame, frame)
    }
    frame.count++
    if (!frame.lus.has(motion.lu)) frame.lus.set(motion.lu, [])
    frame.lus.get(motion.lu).push(motion)
  }

  return [...frames.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(frame => ({
      name: frame.name,
      count: frame.count,
      lus: [...frame.lus]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, grouped]) => ({ name, motions: grouped })),
    }))
}

/**
 * Builds display rows for the selected motion's metadata sidebar.
 * The third tuple item marks long copy that should use the stacked row layout.
 */
export function motionMetadataRows(motion, metadata) {
  const rows = [
    ['motion_id', motion.motionId],
    ['frame', motion.frame],
    ['lexical unit', motion.lu],
  ]

  const description = firstText(
    metadata?.text_annotation,
    motion.textAnnotation,
  )
  if (description) rows.push(['description', description, 'long'])

  const duration = metadata?.duration_sec ?? motion.durationSec
  const frameCount = metadata?.frame_count ?? motion.frameCount
  const actorId = firstText(metadata?.actor_id, motion.actorId)
  if (duration) rows.push(['duration', `${Number(duration).toFixed(2)} s`])
  if (frameCount) rows.push(['frames', String(frameCount)])
  if (actorId) rows.push(['actor', actorId])
  if (metadata?.fps) rows.push(['fps', String(metadata.fps)])

  const actor = metadata?.actor_metadata
  if (actor?.height_cm) rows.push(['actor height', `${actor.height_cm} cm`])
  if (actor?.weight_kg) rows.push(['actor weight', `${actor.weight_kg} kg`])
  if (actor?.gender) rows.push(['actor gender', actor.gender])

  const objects = Array.isArray(metadata?.objects)
    ? metadata.objects.filter(object => object && typeof object === 'object' && !Array.isArray(object))
    : []
  if (objects.length > 0) {
    rows.push(['objects', objects.map(object => object.object_id).filter(Boolean).join(', ')])
    const categories = [...new Set(objects.map(object => object.object_category).filter(Boolean))]
    if (categories.length > 0) rows.push(['object categories', categories.join(', ')])
  }

  const mirrored = metadata?.mirrored ?? motion.mirrored
  if (mirrored !== undefined) rows.push(['mirrored', mirrored ? 'yes' : 'no'])
  return rows
}

/** Human-facing frame positions are one-based; playback indices stay zero-based. */
export function frameCounterText(frameIndex, frameCount) {
  if (!Number.isFinite(frameCount) || frameCount <= 0) return '0 / 0'
  const index = Math.min(Math.max(0, Math.round(frameIndex)), frameCount - 1)
  return `${index + 1} / ${frameCount}`
}
