/**
 * The actor-skeleton look - colors, materials, sizing rules, and light rig
 * defined once so every skeleton renders identically.
 *
 * `SkeletonMeshSet` is the shared runtime: cylinder bones + sphere joints
 * built once from a joint list and parent pairs, then repositioned
 * imperatively per tick from world-space joint positions.
 */

import * as THREE from 'three'

export const ACTOR_SKELETON_COLORS = {
  bone: 0xa94cff,
  joint: 0xd897ff,
  emissive: 0x4e147d,
}

/** Finger bones/joints render at a fraction of the base radius. */
export const FINGER_RADIUS_SCALE = 0.42

const FINGER_NAME_PATTERN = /(thumb|index|middle|ring|pinky|finger)/i

/** True when a joint/bone name belongs to a finger chain. */
export function isFingerJointName(name) {
  return !!name && FINGER_NAME_PATTERN.test(name)
}

const END_SITE_NAME_PATTERN = /(_end$|^endsite$)/i

/**
 * True for terminal end-site joints (BVH ENDSITE nodes, `*_End` names).
 * These carry no articulation - their joint spheres are suppressed so rigs
 * with recorded end sites don't read as having extra joints.
 */
export function isEndSiteJointName(name) {
  return !!name && END_SITE_NAME_PATTERN.test(name)
}

/** Taper thickness of the reference (default) chain; divide for a factor. */
export const TAPER_REFERENCE_THICKNESS = 2.0

/**
 * Per-joint taper thickness: three chains taper independently from root to tip
 * as base * 0.8^depth with a per-chain floor, so thighs render thicker than
 * shins and fingertips thinnest. Divide by TAPER_REFERENCE_THICKNESS for a
 * unitless factor.
 *
 * `matched` is false when the name hit no chain rule (generic end sites, rigs
 * with other naming conventions) - callers should inherit the parent joint's
 * factor so unnamed tips taper with their chain instead of snapping to full
 * size.
 *
 * @param {string} name
 * @returns {{thickness: number, matched: boolean}}
 */
export function actorTaperThickness(name) {
  const rule = taperChainRule(name)
  if (!rule) return { thickness: TAPER_REFERENCE_THICKNESS, matched: false }
  const decay = 0.8
  return { thickness: Math.max(rule.min, rule.base * Math.pow(decay, rule.depth)), matched: true }
}

function taperChainRule(n) {
  // Legs: UpLeg(0) -> Leg(1) -> Foot(2) -> ToeBase(3)
  if (n.includes('UpLeg')) return { base: 2.8, depth: 0, min: 0.8 }
  if (n.includes('Leg') && !n.includes('Up')) return { base: 2.8, depth: 1, min: 0.8 }
  if (n.includes('Foot') && !n.includes('Toe')) return { base: 2.8, depth: 2, min: 0.8 }
  if (n.includes('ToeBase')) return { base: 2.8, depth: 3, min: 0.8 }
  // Arms: Shoulder(0) -> Arm(1) -> ForeArm(2) -> Hand(3) -> Fingers(4-6)
  if (n.includes('Shoulder')) return { base: 2.0, depth: 0, min: 0.6 }
  if (n.includes('ForeArm')) return { base: 2.0, depth: 2, min: 0.6 }
  if (n.includes('Arm') && !n.includes('Fore')) return { base: 2.0, depth: 1, min: 0.6 }
  if (n.match(/^(Left|Right)Hand$/) || n.match(/Hand_End/)) return { base: 2.0, depth: 3, min: 0.6 }
  if (n.includes('InHand')) return { base: 2.0, depth: 4, min: 0.6 }
  if (n.includes('Hand') && n.match(/1$/)) return { base: 2.0, depth: 4, min: 0.6 }
  if (n.includes('Hand') && n.match(/2$/)) return { base: 2.0, depth: 5, min: 0.6 }
  if (n.includes('Hand') && (n.match(/3$/) || n.includes('_End'))) return { base: 2.0, depth: 6, min: 0.6 }
  // Spine: Hips(0) -> Spine(1) -> Neck(3) -> Head(4)
  if (n === 'Hips') return { base: 2.8, depth: 0, min: 1.0 }
  if (n.startsWith('Spine')) return { base: 2.8, depth: 1, min: 1.0 }
  if (n.startsWith('Neck')) return { base: 2.8, depth: 3, min: 1.0 }
  if (n.startsWith('Head')) return { base: 2.8, depth: 4, min: 1.0 }
  if (n.includes('_End')) return { base: 1.2, depth: 0, min: 0.6 }
  return null
}

/**
 * Base bone radius for a skeleton whose bounding box's largest dimension is
 * `largestSize` (proportional with a unit floor so tiny or degenerate bounds
 * still draw visibly).
 */
export function actorBoneRadius(largestSize, units = 'meters') {
  const unitFloor = units === 'meters' ? 0.006 : 0.6
  return Math.max(unitFloor, Math.max(largestSize, 1) * 0.006)
}

/** Base joint-sphere radius; see {@link actorBoneRadius}. */
export function actorJointRadius(largestSize, units = 'meters') {
  const unitFloor = units === 'meters' ? 0.006 : 0.6
  return Math.max(unitFloor * 1.58, Math.max(largestSize, 1) * 0.011)
}

export function makeActorBoneMaterial() {
  return new THREE.MeshStandardMaterial({
    color: ACTOR_SKELETON_COLORS.bone,
    emissive: ACTOR_SKELETON_COLORS.emissive,
    emissiveIntensity: 0.34,
    roughness: 0.46,
    metalness: 0.08,
  })
}

export function makeActorJointMaterial() {
  return new THREE.MeshStandardMaterial({
    color: ACTOR_SKELETON_COLORS.joint,
    emissive: ACTOR_SKELETON_COLORS.emissive,
    emissiveIntensity: 0.46,
    roughness: 0.38,
    metalness: 0.08,
  })
}

/** Adds the actor light rig (ambient + lavender key + violet rim). */
export function addActorSkeletonLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 1.65))
  const keyLight = new THREE.DirectionalLight(0xf0dcff, 1.45)
  keyLight.position.set(1.2, 2.4, 2.2)
  scene.add(keyLight)
  const rimLight = new THREE.DirectionalLight(0x8e49ff, 0.85)
  rimLight.position.set(-1.2, 0.8, -1.8)
  scene.add(rimLight)
}

const UP = new THREE.Vector3(0, 1, 0)
const tmpFrom = new THREE.Vector3()
const tmpTo = new THREE.Vector3()
const tmpDir = new THREE.Vector3()

/**
 * Cylinder-and-sphere skeleton in the unified style. Build once, add
 * `.group` to a scene, then call `update` each tick with a world-position
 * getter - no allocations in the hot path.
 */
export class SkeletonMeshSet {
  /**
   * @param {{jointNames: readonly string[],
   *          bonePairs: ReadonlyArray<readonly [number, number]>,
   *          largestSize: number,
   *          units?: 'meters'|'centimeters'}} options
   */
  constructor(options) {
    this.group = new THREE.Group()
    this.boneMeshes = []
    this.jointMeshes = []
    this.boneRadii = []
    this.jointRadii = []

    const { jointNames, bonePairs, largestSize, units = 'meters' } = options
    this.pairs = bonePairs
    const boneRadius = actorBoneRadius(largestSize, units)
    const jointRadius = actorJointRadius(largestSize, units)
    const boneGeometry = new THREE.CylinderGeometry(1, 1, 1, 12, 1)
    const jointGeometry = new THREE.SphereGeometry(1, 14, 10)
    const boneMaterial = makeActorBoneMaterial()
    const jointMaterial = makeActorJointMaterial()

    // Per-joint size factor: the taper rule when the name matches a chain,
    // the finger scale for finger-named joints the taper table doesn't know,
    // and otherwise the parent's factor - BVH end sites arrive with generic
    // names ("ENDSITE"), so a tip only sizes correctly through its ancestry.
    const parentOf = new Map()
    for (const [parent, child] of bonePairs) parentOf.set(child, parent)
    const factor = jointNames.map(name => {
      const taper = actorTaperThickness(name ?? '')
      if (taper.matched) return taper.thickness / TAPER_REFERENCE_THICKNESS
      if (isFingerJointName(name)) return FINGER_RADIUS_SCALE
      return null
    })
    const resolveFactor = (index, hops = 0) => {
      const own = factor[index]
      if (own !== null || hops > jointNames.length) return own ?? 1
      const parent = parentOf.get(index)
      const resolved = parent === undefined ? 1 : resolveFactor(parent, hops + 1)
      factor[index] = resolved
      return resolved
    }
    jointNames.forEach((_, index) => resolveFactor(index))

    for (const [, child] of bonePairs) {
      const mesh = new THREE.Mesh(boneGeometry, boneMaterial)
      mesh.frustumCulled = false
      this.boneMeshes.push(mesh)
      // Segment thickness follows the child joint, so a bone reads as the
      // taper of the limb it leads into.
      this.boneRadii.push(boneRadius * (factor[child] ?? 1))
      this.group.add(mesh)
    }
    jointNames.forEach((name, index) => {
      const mesh = new THREE.Mesh(jointGeometry, jointMaterial)
      mesh.frustumCulled = false
      // End sites carry no articulation; suppress their spheres so rigs that
      // record them don't read as having extra joints.
      if (isEndSiteJointName(name)) mesh.visible = false
      this.jointMeshes.push(mesh)
      this.jointRadii.push(jointRadius * (factor[index] ?? 1))
      this.group.add(mesh)
    })
  }

  /**
   * Repositions every bone and joint from world-space joint positions.
   * `getPosition` writes joint `index`'s position into `out` and returns it
   * (or returns null to leave that joint where it was this tick).
   *
   * @param {(index: number, out: THREE.Vector3) => THREE.Vector3 | null} getPosition
   */
  update(getPosition) {
    for (let i = 0; i < this.pairs.length; i++) {
      const [parent, child] = this.pairs[i]
      const from = getPosition(parent, tmpFrom)
      const to = getPosition(child, tmpTo)
      if (!from || !to) continue
      const mesh = this.boneMeshes[i]
      const length = tmpDir.subVectors(to, from).length()
      if (length < 1e-9) {
        mesh.visible = false
        continue
      }
      mesh.visible = true
      mesh.position.addVectors(from, to).multiplyScalar(0.5)
      mesh.quaternion.setFromUnitVectors(UP, tmpDir.multiplyScalar(1 / length))
      mesh.scale.set(this.boneRadii[i], length, this.boneRadii[i])
    }
    for (let j = 0; j < this.jointMeshes.length; j++) {
      const position = getPosition(j, tmpFrom)
      if (!position) continue
      this.jointMeshes[j].position.copy(position)
      this.jointMeshes[j].scale.setScalar(this.jointRadii[j])
    }
  }

  dispose() {
    // Geometries/materials are shared across meshes; dispose once each.
    this.boneMeshes[0]?.geometry.dispose()
    this.boneMeshes[0]?.material?.dispose()
    this.jointMeshes[0]?.geometry.dispose()
    this.jointMeshes[0]?.material?.dispose()
  }
}
