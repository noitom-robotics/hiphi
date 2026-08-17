/**
 * Shared 3D scene chrome - background, reference grid, and axis colors defined
 * once so every scene in the viewer sits on the same floor.
 */

import * as THREE from 'three'

/** Scene clear color. */
export const SCENE_BACKGROUND = 0x050609

export const VIEWPORT_AXIS_COLORS = { x: 0xef3f45, y: 0x2fd95f, z: 0x3478e5 }

const GRID_COLORS = { center: 0x6a6f76, line: 0x343940 }

/** The grid spans 4x the subject's largest dimension, floored at 2. */
export function actorGridSize(largestSize) {
  return Math.max(2, Math.max(largestSize, 1) * 4)
}

/**
 * The reference floor: a soft grid plus X (red) and Z (blue) axis lines
 * slightly above it. Add the returned group at world origin.
 *
 * @param {{size?: number, divisions?: number, y?: number}} [options]
 * @returns {THREE.Group}
 */
export function createReferenceGrid(options = {}) {
  const size = options.size ?? 1.6
  const divisions = options.divisions ?? 16
  const group = new THREE.Group()
  group.position.y = options.y ?? 0

  const grid = new THREE.GridHelper(size, divisions, GRID_COLORS.center, GRID_COLORS.line)
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
  gridMaterials.forEach(material => {
    material.transparent = true
    material.opacity = 0.72
    material.depthWrite = false
  })
  group.add(grid)
  group.add(makeAxisLine(new THREE.Vector3(-size / 2, 0.001, 0), new THREE.Vector3(size / 2, 0.001, 0), VIEWPORT_AXIS_COLORS.x))
  group.add(makeAxisLine(new THREE.Vector3(0, 0.001, -size / 2), new THREE.Vector3(0, 0.001, size / 2), VIEWPORT_AXIS_COLORS.z))
  return group
}

function makeAxisLine(from, to, color) {
  const geometry = new THREE.BufferGeometry().setFromPoints([from, to])
  const material = new THREE.LineBasicMaterial({ color, opacity: 0.92, transparent: true })
  return new THREE.Line(geometry, material)
}
