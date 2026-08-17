/**
 * HiPHI motion player: BVH skeleton plus rigid objects animated from
 * trajectory CSVs, on a shared scrubbable clock.
 *
 * The renderer, camera, lights, and floor are built once and reused across
 * motions; only the posed skeleton and its objects are rebuilt per load, so
 * clicking through a long list never churns WebGL contexts.
 */

import * as THREE from 'three'
import { BVHLoader } from './vendor/three/examples/jsm/loaders/BVHLoader.js'
import { OBJLoader } from './vendor/three/examples/jsm/loaders/OBJLoader.js'
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js'
import { SkeletonMeshSet, addActorSkeletonLights } from './skeleton-style.js'
import { createReferenceGrid } from './scene-chrome.js'
import { parseObjectTrack, sampleTrackIndex } from './object-track.js'
import { buildOrientationGizmo, renderOrientationGizmo } from './gizmo.js'
import { frameCounterText } from './motion-presenter.js'

/** Elapsed-portion fill for the scrubber. */
const SCRUB_GRADIENT =
  'linear-gradient(90deg, rgba(61,215,255,0.58), rgba(126,91,202,0.55), rgba(242,65,169,0.48), rgba(82,230,157,0.44))'

// BVH offsets and OBJ vertices are centimeters; object tracks are meters.
const CM_TO_M = 0.01

const ICON_SKELETON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 2 6-2"/><path d="M12 10v4"/></svg>'
const ICON_FOCUS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/></svg>'
const ICON_PAUSE = '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="1" width="3.5" height="10" rx="1"/><rect x="7.5" y="1" width="3.5" height="10" rx="1"/></svg>'
const ICON_PLAY = '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2.5 1.2v9.6c0 .9 1 1.5 1.8 1L11 7c.8-.5.8-1.6 0-2.1L4.3.2c-.8-.5-1.8.1-1.8 1z"/></svg>'

export class MotionViewer {
  /** @param {HTMLElement} container */
  constructor(container) {
    this.container = container
    this.playing = true
    this.time = 0
    this.follow = false
    this.showSkeleton = true
    this.duration = 0
    this.frameTime = 1 / 90
    this.frameCount = 0
    this.frameIndex = 0
    this.loadedObjects = []
    this.loadToken = 0
    this.disposed = false

    this.#buildDom()
    this.#bindKeyboard()
    this.#buildScene()
    this.#startLoop()
  }

  #buildDom() {
    this.container.classList.add('viewer-root')
    this.container.innerHTML = `
      <div class="viewer-canvas"></div>
      <div class="viewer-status" hidden></div>
      <div class="transport">
        <div class="transport-row">
          <div class="transport-buttons">
            <button class="icon-btn is-on" data-act="skeleton" title="Show skeleton" aria-label="Show skeleton">${ICON_SKELETON}</button>
            <button class="icon-btn" data-act="follow" title="Follow character" aria-label="Follow character">${ICON_FOCUS}</button>
            <button class="play-btn" data-act="play" aria-label="Pause" aria-keyshortcuts="Space">${ICON_PAUSE}</button>
          </div>
          <div class="scrub">
            <div class="scrub-rail"></div>
            <div class="scrub-fill"></div>
            <div class="scrub-thumb"></div>
            <input class="scrub-input" type="range" min="0" max="0.001" step="any" value="0"
                   title="Left/Right: one frame; Shift+Left/Right: ten frames"
                   aria-label="Timeline" aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight">
          </div>
          <span class="frame-counter">0 / 0</span>
        </div>
      </div>
    `
    this.mount = this.container.querySelector('.viewer-canvas')
    this.statusEl = this.container.querySelector('.viewer-status')
    this.fillEl = this.container.querySelector('.scrub-fill')
    this.thumbEl = this.container.querySelector('.scrub-thumb')
    this.inputEl = this.container.querySelector('.scrub-input')
    this.counterEl = this.container.querySelector('.frame-counter')
    this.playBtn = this.container.querySelector('[data-act="play"]')

    this.container.querySelector('[data-act="skeleton"]').addEventListener('click', e => {
      this.showSkeleton = !this.showSkeleton
      e.currentTarget.classList.toggle('is-on', this.showSkeleton)
      if (this.skeletonMeshes) this.skeletonMeshes.group.visible = this.showSkeleton
    })
    this.container.querySelector('[data-act="follow"]').addEventListener('click', e => {
      this.follow = !this.follow
      e.currentTarget.classList.toggle('is-on', this.follow)
    })
    this.playBtn.addEventListener('click', () => this.#togglePlay())
    this.inputEl.addEventListener('input', e => {
      this.playing = false
      this.#syncPlayButton()
      this.#applyTime(Number(e.target.value))
      this.#syncScrub()
    })
  }

  #bindKeyboard() {
    this.keydownHandler = event => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return
      const target = event.target
      const tag = target?.tagName
      const editsText = target !== this.inputEl && (
        target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)
      )
      if (editsText) return

      if (event.code === 'Space') {
        if (event.repeat) return
        event.preventDefault()
        this.#togglePlay()
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault()
        this.#stepFrames(event.shiftKey ? -10 : -1)
      } else if (event.code === 'ArrowRight') {
        event.preventDefault()
        this.#stepFrames(event.shiftKey ? 10 : 1)
      }
    }
    window.addEventListener('keydown', this.keydownHandler)
  }

  #buildScene() {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b0b10)
    scene.fog = new THREE.Fog(0x0b0b10, 12, 40)

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200)
    camera.position.set(2.6, 1.7, 3.4)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.9, 0)
    controls.enableDamping = true

    addActorSkeletonLights(scene)
    scene.add(createReferenceGrid({ size: 7.2, divisions: 32 }))

    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.controls = controls
    this.gizmo = buildOrientationGizmo()
    this.gizmoSize = new THREE.Vector2()
    this.followTarget = new THREE.Vector3()

    const resize = () => {
      const w = this.mount.clientWidth
      const h = this.mount.clientHeight
      if (w === 0 || h === 0) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    this.resizeObserver = new ResizeObserver(resize)
    this.resizeObserver.observe(this.mount)
  }

  #startLoop() {
    const clock = new THREE.Clock()
    let uiAccum = 0
    const animate = () => {
      if (this.disposed) return
      this.raf = requestAnimationFrame(animate)
      const dt = clock.getDelta()
      if (this.playing && this.duration > 0) {
        this.#applyTime((this.time + dt) % this.duration)
      }
      // Throttle DOM updates to ~8Hz; the canvas animates at full rate.
      uiAccum += dt
      if (uiAccum > 0.12) {
        uiAccum = 0
        this.#syncScrub()
      }
      // Follow mode: ease the orbit target toward the actor's hips so the
      // camera tracks locomotion without hard cuts.
      if (this.follow && this.bones?.[0]) {
        this.bones[0].getWorldPosition(this.followTarget)
        this.controls.target.lerp(this.followTarget, 0.08)
      }
      this.controls.update()
      this.renderer.getSize(this.gizmoSize)
      this.renderer.setViewport(0, 0, this.gizmoSize.x, this.gizmoSize.y)
      this.renderer.render(this.scene, this.camera)
      renderOrientationGizmo(this.renderer, this.camera, this.gizmo, this.gizmoSize.x, this.gizmoSize.y)
    }
    animate()
  }

  /**
   * Loads and plays one motion. Safe to call repeatedly; a later call
   * supersedes an in-flight earlier one.
   *
   * @param {{bvhUrl: string,
   *          objects?: Array<{objectId: string, meshUrl: string, trackUrl: string}>}} motion
   */
  async load(motion) {
    const token = ++this.loadToken
    this.#clearMotion()
    this.#setStatus('Loading motion...')

    try {
      const bvhText = await fetchText(motion.bvhUrl)
      if (token !== this.loadToken || this.disposed) return

      const bvh = new BVHLoader().parse(bvhText)
      const world = new THREE.Group()
      this.scene.add(world)
      this.world = world

      const root = new THREE.Group()
      root.scale.setScalar(CM_TO_M)
      const rootBone = bvh.skeleton.bones[0]
      root.add(rootBone)
      world.add(root)

      const bones = bvh.skeleton.bones

      const boneIndices = new Map(bones.map((bone, index) => [bone, index]))
      const bonePairs = []
      bones.forEach((bone, i) => {
        const parent = bone.parent
        if (parent instanceof THREE.Bone) {
          const pi = boneIndices.get(parent)
          if (pi !== undefined) bonePairs.push([i, pi])
        }
      })

      // Lift raw keyframe arrays out of the clip so playback can pose bones
      // directly at an integer frame - the same frame index that drives the
      // object tracks (see #applyTime). BVHLoader names tracks
      // ".bones[<name>].position" / ".quaternion".
      const boneTracks = new Map()
      let frames = 0
      for (const track of bvh.clip.tracks) {
        // Track names vary by three.js version: ".bones[Hips].position" or
        // plain "Hips.position" - accept both.
        const bracket = /\.bones\[(.+?)\]\.(position|quaternion)$/.exec(track.name)
        const dot = bracket ? null : /^(.*)\.(position|quaternion)$/.exec(track.name)
        const m = bracket ?? dot
        if (!m) continue
        const entry = boneTracks.get(m[1]) ?? {}
        if (m[2] === 'position') entry.positions = track.values
        else entry.quaternions = track.values
        boneTracks.set(m[1], entry)
        frames = Math.max(frames, track.times.length)
      }

      this.poseTracks = bones.map(bone => {
        const track = boneTracks.get(bone.name)
        if (!track) return null
        return {
          positions: bone === rootBone ? track.positions : undefined,
          quaternions: track.quaternions,
        }
      })
      this.frameCount = frames
      this.skeletonRoot = root
      this.bones = bones
      this.frameTime = frames > 1 ? bvh.clip.duration / (frames - 1) : 1 / 90
      this.duration = frames > 0 ? frames * this.frameTime : 0

      // Ground + recenter: pose frame 0, then shift the WHOLE capture world
      // (skeleton and objects share it) so the actor's feet stand on the grid
      // and the hips start over the origin. Capture coordinates put the actor
      // meters from the origin and the floor slightly off y=0; shifting the
      // shared parent preserves actor-to-object alignment.
      this.#applyTime(0)
      world.updateMatrixWorld(true)
      const wp = new THREE.Vector3()
      let minY = Number.POSITIVE_INFINITY
      for (const bone of bones) {
        bone.getWorldPosition(wp)
        if (wp.y < minY) minY = wp.y
      }
      rootBone.getWorldPosition(wp)
      world.position.set(-wp.x, Number.isFinite(minY) ? -minY : 0, -wp.z)

      world.updateMatrixWorld(true)
      const poseBox = new THREE.Box3()
      for (const bone of bones) poseBox.expandByPoint(bone.getWorldPosition(wp))
      const poseSize = poseBox.getSize(new THREE.Vector3())
      const skeletonMeshes = new SkeletonMeshSet({
        jointNames: bones.map(b => b.name),
        bonePairs: bonePairs.map(([ci, pi]) => [pi, ci]),
        largestSize: Math.max(poseSize.x, poseSize.y, poseSize.z, 1),
        units: 'meters',
      })
      skeletonMeshes.group.visible = this.showSkeleton
      this.scene.add(skeletonMeshes.group)
      this.skeletonMeshes = skeletonMeshes

      // Objects (HOI motions only). One failing object must not blank the
      // whole motion, so each is loaded independently and reported inline.
      const objects = motion.objects ?? []
      const objMaterial = objects.length > 0
        ? new THREE.MeshStandardMaterial({
          color: 0x9aa0b0, roughness: 0.6, metalness: 0.1,
          transparent: true, opacity: 0.92,
        })
        : null
      this.objectMaterial = objMaterial
      const failures = []
      await Promise.all(objects.map(async o => {
        try {
          const [objText, csvText] = await Promise.all([fetchText(o.meshUrl), fetchText(o.trackUrl)])
          if (token !== this.loadToken || this.disposed) return
          const mesh = new OBJLoader().parse(objText)
          mesh.traverse(child => {
            if (child.isMesh) child.material = objMaterial
          })
          mesh.scale.setScalar(CM_TO_M)
          // Objects join the shared world group so grounding/recentering moves
          // them with the skeleton.
          world.add(mesh)
          this.loadedObjects.push({ mesh, track: parseObjectTrack(csvText) })
        } catch (err) {
          console.error(`[viewer] object "${o.objectId}" failed:`, err)
          failures.push(o.objectId)
        }
      }))
      if (token !== this.loadToken || this.disposed) return

      this.#applyTime(0)
      this.playing = true
      this.#syncPlayButton()
      this.#syncScrub()
      this.#setStatus(failures.length ? `Could not load object(s): ${failures.join(', ')}` : null)
    } catch (err) {
      if (token !== this.loadToken || this.disposed) return
      console.error('[viewer] load failed:', err)
      this.#setStatus('Failed to load motion data.')
    }
  }

  #clearMotion() {
    if (this.skeletonMeshes) {
      this.scene.remove(this.skeletonMeshes.group)
      this.skeletonMeshes.dispose()
      this.skeletonMeshes = undefined
    }
    if (this.world) {
      this.scene.remove(this.world)
      disposeTree(this.world)
      this.world = undefined
    }
    this.objectMaterial?.dispose()
    this.objectMaterial = undefined
    this.loadedObjects = []
    this.poseTracks = undefined
    this.bones = undefined
    this.skeletonRoot = undefined
    this.duration = 0
    this.frameCount = 0
    this.frameIndex = 0
    this.time = 0
  }

  #applyTime(t) {
    this.time = t

    // One shared integer frame drives skeleton AND objects. The release
    // guarantees exactly one track row per BVH frame, so index-locking the two
    // eliminates any possibility of relative drift.
    const frameIdx = Math.min(
      Math.max(0, Math.floor(t / this.frameTime)),
      Math.max(0, this.frameCount - 1)
    )
    this.frameIndex = frameIdx

    if (this.poseTracks && this.bones) {
      for (let i = 0; i < this.bones.length; i++) {
        const bone = this.bones[i]
        const track = this.poseTracks[i]
        if (!track) continue
        if (track.positions) {
          bone.position.set(
            track.positions[frameIdx * 3],
            track.positions[frameIdx * 3 + 1],
            track.positions[frameIdx * 3 + 2]
          )
        }
        if (track.quaternions) {
          bone.quaternion.set(
            track.quaternions[frameIdx * 4],
            track.quaternions[frameIdx * 4 + 1],
            track.quaternions[frameIdx * 4 + 2],
            track.quaternions[frameIdx * 4 + 3]
          )
        }
      }
    }

    for (const obj of this.loadedObjects) {
      // Index-aligned row per spec; fall back to a time search if a track ever
      // ships with a different row count.
      const idx = obj.track.frameCount === this.frameCount
        ? Math.min(frameIdx, obj.track.frameCount - 1)
        : sampleTrackIndex(obj.track, t)
      obj.mesh.position.set(
        obj.track.positions[idx * 3],
        obj.track.positions[idx * 3 + 1],
        obj.track.positions[idx * 3 + 2]
      )
      obj.mesh.quaternion.set(
        obj.track.quaternions[idx * 4],
        obj.track.quaternions[idx * 4 + 1],
        obj.track.quaternions[idx * 4 + 2],
        obj.track.quaternions[idx * 4 + 3]
      )
    }

    if (this.skeletonMeshes && this.bones && this.skeletonRoot) {
      this.skeletonRoot.updateMatrixWorld(true)
      const bones = this.bones
      this.skeletonMeshes.update((index, out) =>
        bones[index] ? bones[index].getWorldPosition(out) : null
      )
    }
  }

  #togglePlay() {
    if (this.frameCount <= 0) return
    this.playing = !this.playing
    this.#syncPlayButton()
  }

  #stepFrames(delta) {
    if (this.frameCount <= 0) return
    this.playing = false
    const next = Math.min(Math.max(0, this.frameIndex + delta), this.frameCount - 1)
    this.#applyTime(next * this.frameTime)
    this.#syncPlayButton()
    this.#syncScrub()
  }

  #syncPlayButton() {
    this.playBtn.innerHTML = this.playing ? ICON_PAUSE : ICON_PLAY
    this.playBtn.setAttribute('aria-label', this.playing ? 'Pause' : 'Play')
  }

  #syncScrub() {
    const pct = this.duration > 0 ? Math.min(100, (this.time / this.duration) * 100) : 0
    this.fillEl.style.width = `${pct}%`
    this.fillEl.style.background = SCRUB_GRADIENT
    // Reveal a left-anchored slice of the full-bar gradient rather than
    // compressing it into the elapsed width.
    this.fillEl.style.backgroundSize = `${10000 / Math.max(0.5, pct || 0.5)}% 100%`
    this.thumbEl.style.left = `${pct}%`
    this.inputEl.max = String(this.duration || 0.001)
    this.inputEl.value = String(this.time)
    this.counterEl.textContent = frameCounterText(this.frameIndex, this.frameCount)
  }

  #setStatus(text) {
    this.statusEl.hidden = !text
    this.statusEl.textContent = text ?? ''
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener('keydown', this.keydownHandler)
    this.resizeObserver?.disconnect()
    this.#clearMotion()
    this.controls?.dispose()
    this.renderer?.dispose()
  }
}

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.text()
}

function disposeTree(root) {
  root.traverse(child => {
    if (child.isMesh || child.isLine) {
      child.geometry?.dispose()
      const material = child.material
      if (Array.isArray(material)) material.forEach(m => m.dispose())
      else material?.dispose()
    }
  })
}
