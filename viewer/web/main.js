/**
 * Browser shell: Frame/LU navigation and metadata on the left, player on the
 * right. The motion list is built from the folder the server was pointed at,
 * so it only ever lists motions actually present on disk.
 */

import { MotionViewer } from './viewer.js'
import { bvhUrl, datasetRelativeUrl, motionMetadataUrl, viewerObjectsFrom } from './paths.js'
import { groupMotions, matchesMotion, motionMetadataRows, normalizeMotionMetadata } from './motion-presenter.js'

const els = {
  search: document.querySelector('#search'),
  listBody: document.querySelector('#list-body'),
  listCount: document.querySelector('#list-count'),
  metaBody: document.querySelector('#meta-body'),
  metaTitle: document.querySelector('#meta-title'),
  viewer: document.querySelector('#viewer'),
  rootPath: document.querySelector('#root-path'),
  openForm: document.querySelector('#open-form'),
  openError: document.querySelector('#open-error'),
}

const viewer = new MotionViewer(els.viewer)

/** @type {Array<{frame: string, lu: string, motionId: string}>} */
let motions = []
let motionGroups = []
let selectedId = null
let selectionToken = 0
const expanded = new Set()

init()

async function init() {
  const config = await getJson('/api/config')
  els.rootPath.value = config.root ?? ''

  if (config.mode === 'single') {
    document.body.classList.add('single-mode')
    els.listCount.textContent = '1'
    selectMotion(null, { single: config.single })
    return
  }

  const tree = await getJson('/api/tree')
  motions = tree.motions ?? []
  motionGroups = groupMotions(motions)
  if (motions.length > 0) {
    const first = motions[0]
    selectedId = first.motionId
    expanded.add(first.frame)
    expanded.add(`${first.frame}/${first.lu}`)
    renderList()
    selectMotion(first)
  } else {
    els.listCount.textContent = '0'
    els.listBody.innerHTML = '<p class="empty">No motions found. Check that the folder contains a data/ directory.</p>'
  }
}

els.search.addEventListener('input', renderList)

els.openForm.addEventListener('submit', async e => {
  e.preventDefault()
  els.openError.hidden = true
  const res = await fetch('/api/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: els.rootPath.value }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    els.openError.textContent = body.error ?? 'Could not open that path.'
    els.openError.hidden = false
    return
  }
  location.reload()
})

function renderList() {
  const q = els.search.value.trim().toLowerCase()
  const visible = q ? motions.filter(m => matchesMotion(m, q)) : motions
  els.listCount.textContent = q ? `${visible.length} / ${motions.length}` : String(motions.length)

  // A search flattens the tree; browsing without one keeps Frame/LU grouping.
  if (q) {
    els.listBody.innerHTML = ''
    if (visible.length === 0) {
      els.listBody.innerHTML = '<p class="empty">No motions match.</p>'
      return
    }
    for (const m of visible.slice(0, 500)) els.listBody.appendChild(motionRow(m, true))
    if (visible.length > 500) {
      const more = document.createElement('p')
      more.className = 'empty'
      more.textContent = `Showing the first 500 of ${visible.length} matches. Refine the search to narrow it.`
      els.listBody.appendChild(more)
    }
    return
  }

  els.listBody.innerHTML = ''
  for (const frame of motionGroups) {
    els.listBody.appendChild(groupRow(frame.name, frame.name.replace(/_/g, ' '), frame.count, 0))
    if (!expanded.has(frame.name)) continue
    for (const lu of frame.lus) {
      const key = `${frame.name}/${lu.name}`
      els.listBody.appendChild(groupRow(key, lu.name, lu.motions.length, 1))
      if (!expanded.has(key)) continue
      for (const m of lu.motions) els.listBody.appendChild(motionRow(m, false))
    }
  }
}

function groupRow(key, label, count, depth) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `group-row depth-${depth}`
  el.innerHTML = `
    <span class="chevron${expanded.has(key) ? ' is-open' : ''}">&rsaquo;</span>
    <span class="group-label">${escapeHtml(label)}</span>
    <span class="group-count">${count}</span>
  `
  el.addEventListener('click', () => {
    if (expanded.has(key)) expanded.delete(key)
    else expanded.add(key)
    renderList()
  })
  return el
}

function motionRow(m, showFrame) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `motion-row${m.motionId === selectedId ? ' is-active' : ''}`
  const context = showFrame ? `<span class="motion-context">${escapeHtml(m.frame.replace(/_/g, ' '))} / ${escapeHtml(m.lu)}</span>` : ''
  el.innerHTML = `<span class="motion-id">${escapeHtml(m.motionId)}</span>${context}`
  el.addEventListener('click', () => {
    els.listBody.querySelector('.motion-row.is-active')?.classList.remove('is-active')
    el.classList.add('is-active')
    selectMotion(m)
  })
  return el
}

async function selectMotion(m, opts = {}) {
  const token = ++selectionToken
  if (opts.single) {
    els.metaTitle.textContent = opts.single.name
    renderMetadata([['file', opts.single.name], ['source', 'single file']])
    viewer.load({ bvhUrl: datasetRelativeUrl(opts.single.name) })
    return
  }

  selectedId = m.motionId
  els.metaTitle.textContent = m.motionId

  let meta = null
  try {
    const res = await fetch(motionMetadataUrl(m.frame, m.lu, m.motionId))
    if (res.ok) meta = normalizeMotionMetadata(await res.json())
  } catch {
    // metadata.json is how HOI objects are discovered; without it the skeleton
    // still plays, so a failure here is not fatal.
  }
  if (token !== selectionToken) return

  renderMetadata(motionMetadataRows(m, meta))

  viewer.load({
    bvhUrl: bvhUrl(m.frame, m.lu, m.motionId),
    objects: viewerObjectsFrom(m.frame, m.lu, m.motionId, meta),
  })
}

function renderMetadata(rows) {
  els.metaBody.innerHTML = rows
    .map(([k, v, variant]) => `<div class="meta-row${variant === 'long' ? ' meta-row-long' : ''}"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`)
    .join('')
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.json()
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

setupSplitters()

/**
 * Thin draggable dividers between panels. Positions are stored as fractions of
 * their container so a window resize keeps every panel proportional instead of
 * frozen at the pixel size it was dragged to.
 */
function setupSplitters() {
  const root = document.querySelector('#layout')
  const rail = document.querySelector('#rail')
  const listCard = document.querySelector('#list-card')
  const metaCard = document.querySelector('#meta-card')
  const viewerPanel = document.querySelector('#viewer-panel')
  let drag = null

  const bind = (el, axis, measure, apply) => {
    el.addEventListener('pointerdown', e => {
      try { el.setPointerCapture(e.pointerId) } catch { /* drag still works over the divider */ }
      drag = { start: axis === 'x' ? e.clientX : e.clientY, base: measure(), axis, apply }
    })
    el.addEventListener('pointermove', e => {
      if (!drag) return
      const cur = drag.axis === 'x' ? e.clientX : e.clientY
      drag.apply(drag.base + (cur - drag.start))
    })
    el.addEventListener('pointerup', () => { drag = null })
  }

  bind(document.querySelector('#split-rail'), 'x',
    () => rail.getBoundingClientRect().width,
    w => { rail.style.width = `${Math.min(45, Math.max(12, (w / root.clientWidth) * 100))}%` })

  bind(document.querySelector('#split-list'), 'y',
    () => listCard.getBoundingClientRect().height,
    h => {
      const frac = Math.min(0.85, Math.max(0.15, h / rail.clientHeight))
      listCard.style.flex = `${frac} 1 0%`
      metaCard.style.flex = `${1 - frac} 1 0%`
    })

  bind(document.querySelector('#split-viewer'), 'y',
    () => viewerPanel.getBoundingClientRect().height,
    h => {
      const column = viewerPanel.parentElement
      const frac = Math.min(1, Math.max(0.35, h / (column.clientHeight - 8)))
      viewerPanel.style.flex = '0 0 auto'
      viewerPanel.style.height = `${frac * 100}%`
    })
}
