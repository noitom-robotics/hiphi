/** Orientation gizmo: XYZ axis lines with labeled dots, drawn in a corner viewport. */

import * as THREE from 'three'

/** Builds a labeled axis dot (canvas-drawn circle + letter). */
export function makeGizmoSprite(label, fill) {
  const canvas = document.createElement('canvas')
  canvas.width = 128; canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.beginPath()
  ctx.arc(64, 64, 60, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.font = '700 60px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 3
  ctx.strokeText(label, 64, 66)
  ctx.fillStyle = '#000000'
  ctx.fillText(label, 64, 66)
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(0.58, 0.58, 1)
  return sprite
}

/** Builds the hollow negative-axis dot. */
export function makeGizmoNeg(fill) {
  const canvas = document.createElement('canvas')
  canvas.width = 128; canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.beginPath()
  ctx.arc(64, 64, 60, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.globalAlpha = 0.25
  ctx.fill()
  ctx.globalAlpha = 1.0
  ctx.beginPath()
  ctx.arc(64, 64, 57, 0, Math.PI * 2)
  ctx.strokeStyle = fill
  ctx.lineWidth = 6
  ctx.stroke()
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(0.58, 0.58, 1)
  return sprite
}

/** Builds one axis line from the origin. */
export function makeGizmoLine(x, y, z, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, y, z)])
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }))
}

/** Corner placement for the gizmo viewport. */
export const GIZMO_VIEWPORT = { size: 84, marginX: 12, topOffset: 44 }

/** Bottom-left viewport origin for the gizmo in a pane of the given size. */
export function gizmoViewportRect(width, height) {
  const { size, marginX, topOffset } = GIZMO_VIEWPORT
  return { x: width - size - marginX, y: height - size - topOffset, size }
}

/** Builds the axis gizmo: XYZ lines, labeled dots, hollow negative-axis dots. */
export function buildOrientationGizmo() {
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1.4, 1.4, 1.4, -1.4, 0.1, 10)
  camera.position.set(0, 0, 5)
  scene.add(
    makeGizmoLine(0.55, 0, 0, 0xb81010),
    makeGizmoLine(0, 0.55, 0, 0x10961a),
    makeGizmoLine(0, 0, 0.55, 0x1038b8),
  )
  const dotX = makeGizmoSprite('X', '#b81010'); dotX.position.set(0.88, 0, 0)
  const dotY = makeGizmoSprite('Y', '#10961a'); dotY.position.set(0, 0.88, 0)
  const dotZ = makeGizmoSprite('Z', '#1038b8'); dotZ.position.set(0, 0, 0.88)
  const negX = makeGizmoNeg('#b81010'); negX.position.set(-0.88, 0, 0)
  const negY = makeGizmoNeg('#10961a'); negY.position.set(0, -0.88, 0)
  const negZ = makeGizmoNeg('#1038b8'); negZ.position.set(0, 0, -0.88)
  scene.add(dotX, dotY, dotZ, negX, negY, negZ)
  return { scene, camera }
}

const gizmoDirection = new THREE.Vector3()

/** Renders the gizmo into its corner viewport, aligned to the main camera. */
export function renderOrientationGizmo(renderer, camera, gizmo, width, height) {
  const rect = gizmoViewportRect(width, height)
  renderer.autoClear = false
  renderer.setViewport(rect.x, rect.y, rect.size, rect.size)
  renderer.setScissor(rect.x, rect.y, rect.size, rect.size)
  renderer.setScissorTest(true)
  renderer.clearDepth()
  camera.getWorldDirection(gizmoDirection)
  gizmo.camera.position.copy(gizmoDirection).negate().multiplyScalar(5)
  gizmo.camera.up.copy(camera.up)
  gizmo.camera.lookAt(0, 0, 0)
  renderer.render(gizmo.scene, gizmo.camera)
  renderer.autoClear = true
  renderer.setScissorTest(false)
}
