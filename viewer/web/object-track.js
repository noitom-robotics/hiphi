import { parseCsv } from './csv.js'

/**
 * @typedef {object} ObjectTrack
 * @property {Float32Array} times Seconds from track start, ascending.
 * @property {Float32Array} positions xyz per frame, meters.
 * @property {Float32Array} quaternions xyzw per frame (three.js order).
 * @property {number} frameCount
 */

/**
 * Parses an object-track CSV into typed arrays.
 *
 * The release header is `frame,time_sec,px,py,pz,qx,qy,qz,qw`; `timestamp` is
 * also accepted as the time column. Timestamps are re-based to the first row
 * so absolute epochs and zero-based clocks behave identically. Throws if a
 * required column is missing.
 *
 * @param {string} csvText
 * @returns {ObjectTrack}
 */
export function parseObjectTrack(csvText) {
  const rows = parseCsv(csvText)
  if (rows.length < 2) {
    return { times: new Float32Array(0), positions: new Float32Array(0), quaternions: new Float32Array(0), frameCount: 0 }
  }
  const header = rows[0]
  const iTime = ['time_sec', 'timestamp'].map(n => header.indexOf(n)).find(i => i >= 0)
  const need = name => {
    const idx = header.indexOf(name)
    if (idx < 0) throw new Error(`object track: missing column "${name}"`)
    return idx
  }
  if (iTime === undefined) throw new Error('object track: missing time column (time_sec/timestamp)')
  const iPx = need('px'), iPy = need('py'), iPz = need('pz')
  const iQx = need('qx'), iQy = need('qy'), iQz = need('qz'), iQw = need('qw')

  const n = rows.length - 1
  const times = new Float32Array(n)
  const positions = new Float32Array(n * 3)
  const quaternions = new Float32Array(n * 4)
  const t0 = Number(rows[1][iTime])
  for (let f = 0; f < n; f++) {
    const r = rows[f + 1]
    times[f] = Number(r[iTime]) - t0
    positions[f * 3] = Number(r[iPx])
    positions[f * 3 + 1] = Number(r[iPy])
    positions[f * 3 + 2] = Number(r[iPz])
    quaternions[f * 4] = Number(r[iQx])
    quaternions[f * 4 + 1] = Number(r[iQy])
    quaternions[f * 4 + 2] = Number(r[iQz])
    quaternions[f * 4 + 3] = Number(r[iQw])
  }
  return { times, positions, quaternions, frameCount: n }
}

/**
 * Returns the frame index whose time is nearest to `t` without going past it
 * (binary search; clamps to the track's ends). O(log n) per sample so the
 * render loop can call it every animation frame.
 *
 * @param {ObjectTrack} track
 * @param {number} t
 * @returns {number}
 */
export function sampleTrackIndex(track, t) {
  const { times, frameCount } = track
  if (frameCount === 0) return 0
  if (t <= times[0]) return 0
  if (t >= times[frameCount - 1]) return frameCount - 1
  let lo = 0
  let hi = frameCount - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= t) lo = mid
    else hi = mid
  }
  return lo
}
