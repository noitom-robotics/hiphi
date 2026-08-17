const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => HTML_ESCAPES[char]);
}

function safeAssetPath(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!/^static\/[A-Za-z0-9_./-]+$/.test(raw)) return '';
  return raw;
}

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  return response.json();
}

function initNav() {
  const toggle = $('.nav-toggle');
  const links = $('[data-nav-links]');
  toggle?.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  const navLinks = $$('.nav-links a');
  const progress = $('.scroll-progress span');
  const sections = navLinks.map(a => $(a.getAttribute('href'))).filter(Boolean);
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const percent = max > 0 ? (scrollY / max) * 100 : 0;
    progress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    let active = sections[0]?.id;
    const activeOffset = getNavOffset() + 70;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= activeOffset) active = section.id;
    }
    navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${active}`));
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}


function getNavOffset() {
  const header = $('.site-header');
  const cssValue = getComputedStyle(document.documentElement).getPropertyValue('--nav-height');
  const cssHeight = Number.parseFloat(cssValue) || 0;
  const actualHeight = header?.getBoundingClientRect().height || 0;
  return Math.max(cssHeight, actualHeight);
}

function scrollToHash(hash, updateHistory = true, behavior = 'smooth') {
  if (!hash || hash === '#') return false;
  const id = decodeURIComponent(hash.slice(1));
  const target = document.getElementById(id);
  if (!target) return false;
  const top = target.getBoundingClientRect().top + window.scrollY - getNavOffset();
  window.scrollTo({ top: Math.max(0, top), behavior });
  if (updateHistory) history.pushState(null, '', hash);
  return true;
}

function initAnchorScroll() {
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href === '#') return;
    if (!scrollToHash(href)) return;
    event.preventDefault();
    const links = $('[data-nav-links]');
    const toggle = $('.nav-toggle');
    links?.classList.remove('open');
    toggle?.setAttribute('aria-expanded', 'false');
  });
  if (window.location.hash) {
    const alignInitialHash = () => scrollToHash(window.location.hash, false, 'auto');
    requestAnimationFrame(alignInitialHash);
    window.addEventListener('load', () => {
      setTimeout(alignInitialHash, 80);
      setTimeout(alignInitialHash, 650);
      setTimeout(alignInitialHash, 1600);
    }, { once: true });
  }
}

function initHeavyIframes() {
  const frames = $$('iframe[data-heavy-iframe][data-src]');
  if (!frames.length) return;

  frames.forEach(frame => {
    frame.dataset.placeholderSrcdoc = frame.getAttribute('srcdoc') || '';
    frame.dataset.loaded = frame.getAttribute('src') ? 'true' : 'false';
  });

  addEventListener('message', event => {
    if (event.data?.type !== 'hiphi-load-heavy-iframe' || !event.data?.src) return;
    const frame = frames.find(item => item.dataset.src === event.data.src);
    if (frame) loadFrame(frame);
  });

  const loadFrame = frame => {
    const src = frame.dataset.src;
    if (!src || frame.dataset.loaded === 'true') return;
    frame.removeAttribute('srcdoc');
    frame.src = src;
    frame.dataset.loaded = 'true';
  };

  const unloadFrame = frame => {
    if (frame.dataset.loaded !== 'true') return;
    frame.removeAttribute('src');
    if (frame.dataset.placeholderSrcdoc) frame.setAttribute('srcdoc', frame.dataset.placeholderSrcdoc);
    frame.dataset.loaded = 'false';
  };

  const update = () => {
    const vh = window.innerHeight || document.documentElement.clientHeight || 900;
    const targetId = window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : '';
    frames.forEach(frame => {
      const rect = frame.getBoundingClientRect();
      const targetSection = frame.closest('.site-section');
      const isTargetSection = targetId && targetSection?.id === targetId;
      const clickOnly = frame.dataset.loadMode === 'click';
      const shouldLoad = !clickOnly && (isTargetSection || (rect.bottom > -vh * 0.35 && rect.top < vh * 1.2));
      const shouldUnload = rect.bottom < -vh * 1.35 || rect.top > vh * 2.1;
      if (shouldLoad) loadFrame(frame);
      else if (shouldUnload) unloadFrame(frame);
    });
  };

  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update, { passive: true });
  addEventListener('hashchange', () => requestAnimationFrame(update), { passive: true });
  requestAnimationFrame(update);
  addEventListener('load', () => setTimeout(update, 120), { once: true });
}

function formatStat(value, format) {
  if (value === null || value === undefined) return '';
  const text = Number.isInteger(value) ? value.toLocaleString('en-US') : String(value);
  if (format === 'hours') return `${text} h`;
  if (format === 'hz') return `${text} Hz`;
  if (format === 'millions') return `${text}M`;
  if (format === 'percent') return `${text}%`;
  return text;
}

function renderStats(siteStats) {
  const stats = siteStats?.stats || {};
  $$('[data-stat-key]').forEach(node => {
    const key = node.dataset.statKey;
    if (!Object.prototype.hasOwnProperty.call(stats, key)) return;
    node.textContent = formatStat(stats[key], node.dataset.statFormat);
  });
}

let frameLuPlayer = null;

function frameLuKey(frame, lu) {
  return `${String(frame || '').trim()}-${String(lu || '').trim()}`.toLowerCase();
}

function renderFrameLu(data, motionData = null) {
  const list = $('[data-frame-family-list]');
  const title = $('[data-frame-family-title]');
  const desc = $('[data-frame-family-description]');
  const chips = $('[data-lu-chips]');
  const preview = $('[data-lu-preview]');
  if (!list || !data?.length) return;

  const clipsByKey = new Map();
  (motionData?.clips || []).forEach(clip => {
    clipsByKey.set(frameLuKey(clip.frame, clip.lu), clip);
    if (clip.requested_frame_lu) clipsByKey.set(String(clip.requested_frame_lu).toLowerCase(), clip);
  });
  const edges = motionData?.edges || CANONICAL23_EDGES;
  const bodyNames = motionData?.body_names || [];

  const renderPreview = (ex) => {
    frameLuPlayer?.stop?.();
    frameLuPlayer = null;
    const rawClip = clipsByKey.get(frameLuKey(ex.frame, ex.lu));
    const clip = rawClip && rawClip.object?.mesh_id && motionData?.meshes?.[rawClip.object.mesh_id]
      ? { ...rawClip, object: { ...rawClip.object, mesh: motionData.meshes[rawClip.object.mesh_id] } }
      : rawClip;
    if (!clip?.positions?.length) {
      preview.classList.remove('has-frame-lu-player');
      preview.innerHTML = `<div class="skeleton-lines" aria-hidden="true"></div><div><strong>${escapeHTML(ex.lu)}</strong><p><b>${escapeHTML(ex.frame)}</b> lexical unit preview. Select another Frame–LU to inspect an available motion sample.</p></div>`;
      return;
    }
    preview.classList.add('has-frame-lu-player');
    preview.innerHTML = `
      <div class="frame-lu-player">
        <div class="frame-lu-player-head">
          <div>
            <strong>${escapeHTML(ex.frame)} · ${escapeHTML(ex.lu)}</strong>
            <p>${escapeHTML(clip.prompt_summary || 'Representative motion sample for this Frame–LU.')}</p>
          </div>
        </div>
        <div class="frame-lu-stage">
          <canvas class="motion-canvas frame-lu-canvas" aria-label="${escapeHTML(ex.frame)} ${escapeHTML(ex.lu)} BVH skeleton preview"></canvas>
          <div class="viewer-tabs frame-lu-view-tabs" data-frame-lu-view-tabs></div>
        </div>
        <div class="playbar inline-playbar frame-lu-playbar">
          <button class="btn small" type="button" data-frame-lu-play>Pause</button>
          <input type="range" min="0" max="0" value="0" data-frame-lu-scrub aria-label="Frame–LU playback frame">
          <span data-frame-lu-frame>0 / 0</span>
          <select data-frame-lu-speed aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
        </div>
      </div>`;
    const canvas = $('.frame-lu-canvas', preview);
    const playButton = $('[data-frame-lu-play]', preview);
    const scrub = $('[data-frame-lu-scrub]', preview);
    const frameLabel = $('[data-frame-lu-frame]', preview);
    const viewTabs = $('[data-frame-lu-view-tabs]', preview);
    const speedControl = $('[data-frame-lu-speed]', preview);
    frameLuPlayer = createSkeletonPlayer({
      canvas,
      clips: [{ ...clip, body_names: clip.body_names || bodyNames, label: `${ex.frame} · ${ex.lu}` }],
      edges,
      playButton,
      scrub,
      frameLabel,
      viewTabs,
      speedControl,
      options: { background: '#fffafd', groundFill: 'rgba(240,107,168,0.07)', lineWidth: 2.9 },
    });
  };

  const selectFamily = (idx) => {
    const family = data[idx];
    $$('.family-list button').forEach((b, i) => b.classList.toggle('active', i === idx));
    title.textContent = family.family;
    desc.textContent = family.description;
    chips.innerHTML = '';
    family.examples.forEach((ex, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `${ex.frame} · ${ex.lu}`;
      btn.addEventListener('click', () => {
        $$('.lu-chip-wrap button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderPreview(ex);
      });
      chips.appendChild(btn);
      if (i === 0) setTimeout(() => btn.click(), 0);
    });
  };
  data.forEach((family, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = family.family;
    btn.addEventListener('click', () => selectFamily(idx));
    list.appendChild(btn);
  });
  selectFamily(0);
}

const CANONICAL23_EDGES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[8,9],[0,10],[10,11],[11,12],[12,13],[13,14],[2,15],[15,16],[16,17],[17,18],[2,19],[19,20],[20,21],[21,22]];

function resizeCanvas(canvas, ctx) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return rect;
}

function rotatePoint3D(p, yaw = -0.32, pitch = 0.18) {
  const [x, y, z] = p;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const ce = Math.cos(pitch), se = Math.sin(pitch);
  const u = cy * x - sy * y;
  const depth = sy * x + cy * y;
  const v = z * ce - depth * se;
  return [u, v, depth];
}

const SKELETON_VIEWS = {
  iso: { label: 'Iso', yaw: -0.32, pitch: 0.18, zoom: 0.88 },
  front: { label: 'Front', yaw: 0, pitch: 0, zoom: 0.86 },
  side: { label: 'Side', yaw: -Math.PI / 2, pitch: 0, zoom: 0.86 },
  top: { label: 'Top', yaw: -0.32, pitch: Math.PI / 2.85, zoom: 0.78 },
};

function edgeColorForClip(clip, a, b) {
  const names = clip.body_names || [];
  const label = `${names[a] || ''} ${names[b] || ''}`;
  if (label.includes('left_')) return 'rgba(176,68,244,0.84)';
  if (label.includes('right_')) return 'rgba(240,107,168,0.84)';
  if (label.includes('torso') || label.includes('waist') || label.includes('head') || label.includes('pelvis')) return 'rgba(44,37,50,0.82)';
  return 'rgba(36,31,26,0.74)';
}


function quatXyzwRotate(q, v) {
  if (!q || q.length < 4) return v;
  let [x, y, z, w] = q.map(Number);
  const n = Math.hypot(x, y, z, w);
  if (!Number.isFinite(n) || n < 1e-8) return v;
  x /= n; y /= n; z /= n; w /= n;
  const [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

function objectLocalToSite(vertex, pose) {
  // Mesh vertices use X/Z floor axes + Y up; rotate in source axes, then remap.
  const rotated = quatXyzwRotate(pose.quat_xyzw, vertex);
  const c = pose.center || [0, 0, 0];
  return [c[0] + rotated[0], c[1] + rotated[2], c[2] + rotated[1]];
}

function drawObjectMeshFrame(ctx, sx, sy, rotateScenePoint, object, frameIdx) {
  const mesh = object?.mesh;
  const trajectory = object?.trajectory || [];
  const pose = trajectory[Math.max(0, Math.min(trajectory.length - 1, frameIdx | 0))];
  if (!mesh?.vertices?.length || !mesh?.faces?.length || !pose) return false;
  const color = mesh.color || '#f06ba8';
  const [r, g, b] = hexToRgb(color);
  const projected = mesh.vertices.map(v => {
    const scene = rotateScenePoint(objectLocalToSite(v, pose));
    return { x: sx(scene), y: sy(scene), d: scene[2] };
  });
  const faces = mesh.faces.map(face => {
    const pts = face.map(i => projected[i]).filter(Boolean);
    return { pts, depth: pts.reduce((acc, p) => acc + p.d, 0) / Math.max(1, pts.length) };
  }).filter(face => face.pts.length >= 3).sort((a, b) => a.depth - b.depth);
  const minDepth = faces.length ? Math.min(...faces.map(face => face.depth)) : 0;
  const maxDepth = faces.length ? Math.max(...faces.map(face => face.depth)) : 1;
  const depthSpan = Math.max(0.001, maxDepth - minDepth);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const trail = trajectory
    .slice(Math.max(0, (frameIdx | 0) - 95), Math.max(1, (frameIdx | 0) + 1))
    .map(item => item.center ? rotateScenePoint(item.center) : null)
    .filter(Boolean);
  if (trail.length > 1) {
    ctx.beginPath();
    trail.forEach((p, i) => (i ? ctx.lineTo(sx(p), sy(p)) : ctx.moveTo(sx(p), sy(p))));
    ctx.strokeStyle = `rgba(${r},${g},${b},0.22)`;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }
  faces.forEach(face => {
    ctx.beginPath();
    face.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    const shade = (face.depth - minDepth) / depthSpan;
    ctx.fillStyle = `rgba(${r},${g},${b},${0.24 + shade * 0.16})`;
    ctx.fill();
    if (mesh.faces.length <= 24) {
      ctx.strokeStyle = `rgba(${r},${g},${b},0.22)`;
      ctx.lineWidth = .55;
      ctx.stroke();
    }
  });

  const center = rotateScenePoint(pose.center || [0,0,0]);
  ctx.fillStyle = `rgba(${r},${g},${b},0.92)`;
  ctx.globalAlpha = .9;
  ctx.beginPath();
  ctx.arc(sx(center), sy(center), 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return true;
}

function quatWxyzToBasis(q) {
  if (!q || q.length < 4) return null;
  let [w, x, y, z] = q.map(Number);
  const n = Math.hypot(w, x, y, z);
  if (!Number.isFinite(n) || n < 1e-8) return null;
  w /= n; x /= n; y /= n; z /= n;
  return [
    [1 - 2*y*y - 2*z*z, 2*x*y + 2*z*w, 2*x*z - 2*y*w],
    [2*x*y - 2*z*w, 1 - 2*x*x - 2*z*z, 2*y*z + 2*x*w],
    [2*x*z + 2*y*w, 2*y*z - 2*x*w, 1 - 2*x*x - 2*y*y],
  ];
}

const GROUND_ALIGNED_CLIPS = new WeakMap();

function clipVisibleMinZ(clip) {
  let minZ = Infinity;
  const includeZ = z => {
    const value = Number(z);
    if (Number.isFinite(value)) minZ = Math.min(minZ, value);
  };
  const includePoint = point => {
    if (Array.isArray(point) && point.length >= 3) includeZ(point[2]);
  };

  (clip.positions || []).forEach(frame => (frame || []).forEach(includePoint));

  (clip.objects || []).forEach(object => {
    if (!object?.center) return;
    includeZ(Number(object.center[2] || 0) - Number(object.radius || 0));
  });

  const object = clip.object;
  const mesh = object?.mesh;
  const trajectory = object?.trajectory || [];
  if (mesh?.vertices?.length && trajectory.length) {
    // Include the actual visible object geometry, not just the object center.
    // Sampling caps the worst case while still catching floor offsets in full meshes.
    const vertexStep = Math.max(1, Math.floor(mesh.vertices.length / 1800));
    const frameStep = Math.max(1, Math.floor(trajectory.length / 72));
    for (let frameIdx = 0; frameIdx < trajectory.length; frameIdx += frameStep) {
      const pose = trajectory[frameIdx];
      if (!pose?.center) continue;
      for (let vertexIdx = 0; vertexIdx < mesh.vertices.length; vertexIdx += vertexStep) {
        includePoint(objectLocalToSite(mesh.vertices[vertexIdx], pose));
      }
    }
    // Ensure the final pose is included when stride skipped it.
    const lastPose = trajectory[trajectory.length - 1];
    if (lastPose?.center) {
      for (let vertexIdx = 0; vertexIdx < mesh.vertices.length; vertexIdx += vertexStep) {
        includePoint(objectLocalToSite(mesh.vertices[vertexIdx], lastPose));
      }
    }
  } else if (trajectory.length) {
    const bounds = mesh?.bounds;
    const localMinY = bounds?.min?.[1];
    trajectory.forEach(pose => {
      if (!pose?.center) return;
      includeZ(Number(pose.center[2] || 0) + (Number.isFinite(Number(localMinY)) ? Number(localMinY) : 0));
    });
  }

  return minZ;
}

function groundAlignSkeletonClip(clip) {
  if (!clip?.positions?.length) return clip;
  if (GROUND_ALIGNED_CLIPS.has(clip)) return GROUND_ALIGNED_CLIPS.get(clip);
  const minZ = clipVisibleMinZ(clip);
  if (!Number.isFinite(minZ)) return clip;
  const offsetZ = -minZ;
  const adjustPoint = point => Array.isArray(point) ? [point[0], point[1], Number(point[2] || 0) + offsetZ] : point;
  const adjusted = {
    ...clip,
    positions: clip.positions.map(frame => frame.map(adjustPoint)),
    view: null,
    groundOffsetZ: offsetZ,
    groundZ: 0,
  };
  if (clip.objects?.length) {
    adjusted.objects = clip.objects.map(object => object?.center ? { ...object, center: adjustPoint(object.center) } : object);
  }
  if (clip.object) {
    adjusted.object = { ...clip.object };
    if (clip.object.trajectory?.length) {
      adjusted.object.trajectory = clip.object.trajectory.map(pose => pose?.center ? { ...pose, center: adjustPoint(pose.center) } : pose);
    }
  }
  GROUND_ALIGNED_CLIPS.set(clip, adjusted);
  return adjusted;
}

function computeSkeletonView(frames, clip = {}) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const includePoint = p => {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
  };
  frames.forEach(frame => frame.forEach(includePoint));
  if (clip.object?.trajectory?.length) {
    const mesh = clip.object?.mesh;
    if (mesh?.vertices?.length) {
      const vertexStep = Math.max(1, Math.floor(mesh.vertices.length / 1600));
      const frameStep = Math.max(1, Math.floor(clip.object.trajectory.length / 72));
      const includePoseMesh = pose => {
        if (!pose?.center) return;
        for (let vertexIdx = 0; vertexIdx < mesh.vertices.length; vertexIdx += vertexStep) {
          includePoint(objectLocalToSite(mesh.vertices[vertexIdx], pose));
        }
      };
      for (let frameIdx = 0; frameIdx < clip.object.trajectory.length; frameIdx += frameStep) includePoseMesh(clip.object.trajectory[frameIdx]);
      includePoseMesh(clip.object.trajectory[clip.object.trajectory.length - 1]);
    } else {
      clip.object.trajectory.forEach(pose => {
        const c = pose.center;
        if (!c) return;
        includePoint([c[0] - 0.22, c[1] - 0.22, c[2] - 0.22]);
        includePoint([c[0] + 0.22, c[1] + 0.22, c[2] + 0.22]);
      });
    }
  }
  const groundZ = Number.isFinite(Number(clip.groundZ)) ? Number(clip.groundZ) : Math.min(0, minZ);
  minZ = Math.min(minZ, groundZ);
  const xSpan = Math.max(maxX - minX, 0.45);
  const ySpan = Math.max(maxY - minY, 0.45);
  const zSpan = Math.max(maxZ - minZ, 0.45);
  return {
    rawMinX: minX, rawMaxX: maxX, rawMinY: minY, rawMaxY: maxY,
    centerU: (minX + maxX) / 2,
    centerV: (minZ + maxZ) / 2,
    spanU: xSpan,
    spanV: Math.max(zSpan, 0.95),
    groundZ,
    groundPad: Math.max(0.8, Math.max(xSpan, ySpan) * 0.72),
  };
}

function drawSkeletonFrame(canvas, ctx, clip, edges, frameIdx, options = {}) {
  const rect = resizeCanvas(canvas, ctx);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = options.background || '#fbfaf6';
  ctx.fillRect(0, 0, rect.width, rect.height);
  const frames = clip.positions || [];
  if (!frames.length) return;
  const frame = frames[Math.max(0, Math.min(frames.length - 1, frameIdx | 0))];
  const viewPreset = SKELETON_VIEWS[options.view || 'iso'] || SKELETON_VIEWS.iso;
  const yaw = options.yaw ?? viewPreset.yaw;
  const pitch = options.pitch ?? viewPreset.pitch;
  const pts = frame.map(p => rotatePoint3D(p, yaw, pitch));
  const view = clip.view || computeSkeletonView(frames, clip);
  clip.view = view;
  const scale = Math.min(rect.width * 0.74 / Math.max(view.spanU, 0.45), rect.height * 0.76 / Math.max(view.spanV, 0.45)) * (options.zoom || viewPreset.zoom || 0.86);
  const cx = rect.width / 2 - view.centerU * scale;
  const cy = rect.height / 2 + view.centerV * scale;
  const sx = p => cx + p[0] * scale;
  const sy = p => cy - p[1] * scale;

  const pad = view.groundPad || 0.8;
  const gx0 = view.rawMinX - pad, gx1 = view.rawMaxX + pad, gy0 = view.rawMinY - pad, gy1 = view.rawMaxY + pad;
  const gz = Number.isFinite(view.groundZ) ? view.groundZ : 0;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(120,102,86,0.22)';
  ctx.fillStyle = options.groundFill || 'rgba(185,138,217,0.075)';
  const corners = [[gx0, gy0, gz], [gx1, gy0, gz], [gx1, gy1, gz], [gx0, gy1, gz]].map(p => rotatePoint3D(p, yaw, pitch));
  ctx.beginPath();
  corners.forEach((p, i) => (i ? ctx.lineTo(sx(p), sy(p)) : ctx.moveTo(sx(p), sy(p))));
  ctx.closePath(); ctx.fill();
  const gridStep = 0.35;
  for (let x = Math.floor(gx0 / gridStep) * gridStep; x <= gx1 + 1e-6; x += gridStep) {
    const a = rotatePoint3D([x, gy0, gz], yaw, pitch), b = rotatePoint3D([x, gy1, gz], yaw, pitch);
    ctx.beginPath(); ctx.moveTo(sx(a), sy(a)); ctx.lineTo(sx(b), sy(b)); ctx.stroke();
  }
  for (let y = Math.floor(gy0 / gridStep) * gridStep; y <= gy1 + 1e-6; y += gridStep) {
    const a = rotatePoint3D([gx0, y, gz], yaw, pitch), b = rotatePoint3D([gx1, y, gz], yaw, pitch);
    ctx.beginPath(); ctx.moveTo(sx(a), sy(a)); ctx.lineTo(sx(b), sy(b)); ctx.stroke();
  }
  ctx.restore();

  const meshDrawn = clip.object?.mesh
    ? drawObjectMeshFrame(ctx, sx, sy, point => rotatePoint3D(point, yaw, pitch), clip.object, frameIdx)
    : false;
  const object = !meshDrawn ? clip.objects?.[Math.max(0, Math.min((clip.objects?.length || 1) - 1, frameIdx | 0))] : null;
  if (object?.center) {
    const c = rotatePoint3D(object.center, yaw, pitch);
    ctx.save();
    ctx.fillStyle = object.color || 'rgba(176,68,244,.28)';
    ctx.strokeStyle = object.stroke || 'rgba(176,68,244,.72)';
    ctx.lineWidth = 2;
    const r = Math.max(10, (object.radius || 0.18) * scale);
    ctx.beginPath();
    ctx.ellipse(sx(c), sy(c), r * 1.25, r * .72, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  edges.forEach(([a, b]) => {
    if (!pts[a] || !pts[b]) return;
    ctx.strokeStyle = options.boneColor || edgeColorForClip(clip, a, b);
    ctx.lineWidth = options.lineWidth || (options.robot ? 3.1 : 2.7);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx(pts[a]), sy(pts[a])); ctx.lineTo(sx(pts[b]), sy(pts[b])); ctx.stroke();
  });
  pts.forEach((p, j) => {
    const center = j === 0 || j === 1 || j === 16 || j === 2;
    ctx.fillStyle = options.jointColor || '#b044f4';
    ctx.globalAlpha = center ? .95 : .78;
    ctx.beginPath(); ctx.arc(sx(p), sy(p), center ? 4.2 : 2.8, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();

  const rootBasis = quatWxyzToBasis(clip.root_rot_wxyz?.[Math.max(0, Math.min((clip.root_rot_wxyz?.length || 1) - 1, frameIdx | 0))]);
  if (rootBasis && frame[0]) {
    const origin = frame[0];
    const axisLen = options.axisLength || 0.22;
    const axes = [
      { vec: rootBasis[0], color: 'rgba(240,107,168,.82)' },
      { vec: rootBasis[1], color: 'rgba(176,68,244,.82)' },
      { vec: rootBasis[2], color: 'rgba(92,55,166,.78)' },
    ];
    ctx.save();
    ctx.lineWidth = 2.1;
    axes.forEach(axis => {
      const tip = [origin[0] + axis.vec[0] * axisLen, origin[1] + axis.vec[1] * axisLen, origin[2] + axis.vec[2] * axisLen];
      const a = rotatePoint3D(origin, yaw, pitch);
      const b = rotatePoint3D(tip, yaw, pitch);
      ctx.strokeStyle = axis.color;
      ctx.beginPath(); ctx.moveTo(sx(a), sy(a)); ctx.lineTo(sx(b), sy(b)); ctx.stroke();
    });
    ctx.restore();
  }
}

function createSkeletonPlayer({ canvas, clips, edges, tabs, playButton, scrub, frameLabel, viewTabs, speedControl, onSelect, options = {} }) {
  if (!canvas || !clips?.length) return null;
  const ctx = canvas.getContext('2d');
  const playerClips = options.adaptiveGround === false || options.robot ? clips : clips.map(groundAlignSkeletonClip);
  const state = { clipIndex: 0, frame: 0, playing: true, lastTs: 0, raf: 0, view: options.view || 'iso', speed: 1, dirty: true };
  const draw = () => {
    const clip = playerClips[state.clipIndex];
    if (!clip) return;
    drawSkeletonFrame(canvas, ctx, clip, edges, state.frame, { ...options, view: state.view });
    if (frameLabel) frameLabel.textContent = `${state.frame + 1} / ${clip.positions.length}`;
    state.dirty = false;
  };
  const selectClip = idx => {
    state.clipIndex = idx;
    state.frame = 0;
    state.lastTs = 0;
    const clip = playerClips[idx];
    if (scrub) { scrub.max = String(Math.max(0, (clip.positions?.length || 1) - 1)); scrub.value = '0'; }
    if (tabs) $$('button', tabs).forEach((btn, i) => btn.classList.toggle('active', i === idx));
    onSelect?.(clip, idx);
    state.dirty = true;
    draw();
  };
  if (tabs) {
    tabs.innerHTML = '';
    playerClips.forEach((clip, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = clip.label || `Preview ${idx + 1}`;
      btn.addEventListener('click', () => selectClip(idx));
      tabs.appendChild(btn);
    });
  }
  playButton?.addEventListener('click', () => {
    state.playing = !state.playing;
    playButton.textContent = state.playing ? 'Pause' : 'Play';
    state.lastTs = 0;
    state.dirty = true;
  });
  scrub?.addEventListener('input', () => {
    state.frame = Number(scrub.value || 0);
    state.dirty = true;
    draw();
  });
  if (viewTabs) {
    viewTabs.innerHTML = '';
    Object.entries(SKELETON_VIEWS).forEach(([key, view]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = view.label;
      btn.classList.toggle('active', key === state.view);
      btn.addEventListener('click', () => {
        state.view = key;
        $$('button', viewTabs).forEach(item => item.classList.toggle('active', item === btn));
        state.dirty = true;
        draw();
      });
      viewTabs.appendChild(btn);
    });
  }
  speedControl?.addEventListener('change', () => {
    state.speed = Math.max(0.1, Number(speedControl.value || 1));
    state.lastTs = 0;
  });
  const resizeObserver = new ResizeObserver(() => { state.dirty = true; });
  resizeObserver.observe(canvas);
  function step(ts) {
    if (!canvas.isConnected) return;
    const clip = playerClips[state.clipIndex];
    if (clip && state.playing) {
      if (!state.lastTs) state.lastTs = ts;
      const frameMs = 1000 / (Math.max(1, Number(clip.fps || 30)) * state.speed);
      if (ts - state.lastTs >= frameMs) {
        const adv = Math.max(1, Math.floor((ts - state.lastTs) / frameMs));
        state.frame = (state.frame + adv) % Math.max(1, clip.positions.length);
        state.lastTs = ts;
        if (scrub) scrub.value = String(state.frame);
        state.dirty = true;
      }
    }
    if (clip && state.dirty) draw();
    state.raf = requestAnimationFrame(step);
  }
  selectClip(0);
  state.raf = requestAnimationFrame(step);
  return { stop: () => { cancelAnimationFrame(state.raf); resizeObserver.disconnect(); }, selectClip };
}

function baseHumanFrame(t, pattern) {
  const sway = Math.sin(t * Math.PI * 2);
  const step = Math.sin(t * Math.PI * 4);
  const reach = pattern === 'carry' || pattern === 'lift' ? .28 : pattern === 'push' ? .46 : pattern === 'pull' ? -.35 : 0;
  const lean = pattern === 'lean' ? .32 : pattern === 'sit' ? -.12 : 0;
  const kick = pattern === 'kick' ? Math.max(0, Math.sin(t * Math.PI * 2)) * .55 : 0;
  return [
    [0,0,.95],[0,0,1.18],[0,0,1.42],[0,0,1.62],[0,0,1.78],
    [-.16,0,.92],[-.20,.05,.52],[-.18,.08,.12],[-.18,.18,.06],[-.18,.28,.04],
    [.16,0,.92],[.20,-.05,.52 + kick*.12],[.18,-.08 + kick*.22,.12 + kick*.18],[.18,-.18 + kick*.42,.06 + kick*.18],[.18,-.28 + kick*.52,.04 + kick*.18],
    [-.26,0,1.48],[-.45,reach + .05*sway,1.20 + lean],[-.50,reach + .12,0.98 + lean*.5],[-.52,reach + .18,0.92],
    [.26,0,1.48],[.45,reach - .05*sway,1.20 + lean],[.50,reach + .12,0.98 + lean*.5],[.52,reach + .18,0.92],
  ].map(([x,y,z]) => [x + .04*sway, y + .1*step*t, z]);
}

function makeObjectClip(category) {
  const pattern = category.toLowerCase().split(/\s+/)[0];
  const frames = [];
  const objects = [];
  for (let i = 0; i < 120; i += 1) {
    const t = i / 119;
    frames.push(baseHumanFrame(t, pattern));
    const y = pattern === 'pull' ? .52 - t*.52 : pattern === 'push' ? -.10 + t*.62 : .34 + Math.sin(t * Math.PI * 2) * .05;
    const z = pattern === 'lift' ? .62 + Math.sin(t * Math.PI) * .46 : pattern === 'kick' ? .18 : pattern === 'sit' ? .52 : .86;
    objects.push({ center: [pattern === 'kick' ? .44 : .02, y, z], radius: pattern === 'sit' ? .30 : .18 });
  }
  return { label: `${category} skeleton preview`, fps: 30, positions: frames, objects };
}

let objectPlayer = null;
function displayObjectName(objectId) {
  const raw = String(objectId || '').toLowerCase();
  if (raw.includes('chair')) return 'chair';
  if (raw.includes('mop')) return 'mop';
  if (raw.includes('box')) return 'box';
  return String(objectId || '').replaceAll('_', ' ') || 'tracked object';
}

function renderObjects(data, motionData) {
  const tabs = $('[data-object-tabs]');
  const card = $('[data-object-card]');
  if (!tabs || !card || !data?.length) return;
  const clipsByCategory = new Map();
  (motionData?.clips || []).forEach(clip => {
    const mesh = clip.object?.mesh_id ? motionData?.meshes?.[clip.object.mesh_id] : null;
    clipsByCategory.set(String(clip.category || clip.label || '').toLowerCase(), mesh
      ? { ...clip, object: { ...clip.object, mesh } }
      : clip);
  });
  const edges = motionData?.edges || CANONICAL23_EDGES;
  const bodyNames = motionData?.body_names || [];
  const select = (idx) => {
    const item = data[idx];
    $$('button', tabs).forEach((b, i) => b.classList.toggle('active', i === idx));
    objectPlayer?.stop?.();
    card.classList.add('skeleton-object-card');
    const rawClip = clipsByCategory.get(String(item.category || '').toLowerCase());
    if (!rawClip?.positions?.length) {
      const clip = makeObjectClip(item.category);
      card.innerHTML = `<div class="object-player-layout"><div class="object-skeleton-stage"><canvas class="object-motion-canvas" aria-label="${escapeHTML(item.category)} motion preview"></canvas></div><div class="object-info-panel"><span class="badge">Object-interaction</span><h3>${escapeHTML(item.category)}</h3><p>${escapeHTML(item.description)}</p></div></div>`;
      const canvas = $('.object-motion-canvas', card);
      objectPlayer = createSkeletonPlayer({ canvas, clips: [clip], edges: CANONICAL23_EDGES });
      return;
    }
    const objectName = displayObjectName(rawClip.object_id || item.object_id);
    card.innerHTML = `
      <div class="object-player-layout object-player-live">
        <div class="object-skeleton-stage">
          <canvas class="object-motion-canvas" aria-label="${escapeHTML(item.category)} object-interaction playback"></canvas>
          <div class="viewer-tabs object-view-tabs" data-object-view-tabs></div>
        </div>
        <div class="object-info-panel">
          <span class="badge">Object-interaction</span>
          <h3>${escapeHTML(item.category)}</h3>
          <p class="object-object-name">Tracked object: ${escapeHTML(objectName)}</p>
          <p>${escapeHTML(item.description)}</p>
        </div>
      </div>
      <div class="playbar inline-playbar object-playbar">
        <button class="btn small" type="button" data-object-play>Pause</button>
        <input type="range" min="0" max="0" value="0" data-object-scrub aria-label="Object-interaction playback frame">
        <span data-object-frame>0 / 0</span>
        <select data-object-speed aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
      </div>`;
    const canvas = $('.object-motion-canvas', card);
    objectPlayer = createSkeletonPlayer({
      canvas,
      clips: [{ ...rawClip, body_names: rawClip.body_names || bodyNames }],
      edges,
      playButton: $('[data-object-play]', card),
      scrub: $('[data-object-scrub]', card),
      frameLabel: $('[data-object-frame]', card),
      viewTabs: $('[data-object-view-tabs]', card),
      speedControl: $('[data-object-speed]', card),
      options: { background: '#fffafd', groundFill: 'rgba(240,107,168,0.07)', lineWidth: 2.9 },
    });
  };
  tabs.innerHTML = '';
  data.forEach((item, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.category;
    btn.addEventListener('click', () => select(idx));
    tabs.appendChild(btn);
  });
  select(0);
}

function renderG1(data) {
  const host = $('[data-g1-player]');
  if (!host || !data?.clips?.length) return;
  const canvas = $('[data-g1-canvas]', host);
  const tabs = $('[data-g1-clip-tabs]', host);
  const playButton = $('[data-g1-play]', host);
  const scrub = $('[data-g1-scrub]', host);
  const frameLabel = $('[data-g1-frame]', host);
  const viewTabs = $('[data-g1-view-tabs]', host);
  const speedControl = $('[data-g1-speed]', host);
  createSkeletonPlayer({
    canvas,
    clips: data.clips.map(clip => ({ ...clip, body_names: clip.body_names || data.body_names || [] })),
    edges: data.edges || [],
    tabs,
    playButton,
    scrub,
    frameLabel,
    viewTabs,
    speedControl,
    options: { robot: true, background: '#fffafd' },
    onSelect: clip => {
      const head = $('.module-head strong', host);
      const meta = $('.module-head span', host);
      if (head) head.textContent = clip.label || 'Retargeted G1 reference preview';
      if (meta) meta.textContent = `${clip.source || 'G1 retargeted reference'} · ${clip.fps || data.target_fps || 30} Hz playback`;
    },
  });
}

function renderTables(metrics) {
  const fmt = v => v === null || v === undefined ? '—' : escapeHTML(v);
  const body = $('[data-body-table]');
  if (body) {
    body.innerHTML = `<table><thead><tr><th>Dataset</th><th>Duration</th><th>Jτ</th><th>A</th><th>δground</th><th>ϕfloat</th><th>νfoot</th></tr></thead><tbody>${metrics.bodyMotionPrecision.map(r => `<tr class="${r.dataset === 'HiPHI' ? 'highlight-row' : ''}"><td>${escapeHTML(r.dataset)}</td><td>${fmt(r.duration_h)}</td><td>${fmt(r.jerk_m_s3)}</td><td>${fmt(r.accel_m_s2)}</td><td>${fmt(r.ground_mm)}</td><td>${fmt(r.float_percent)}</td><td>${fmt(r.foot_mm_s)}</td></tr>`).join('')}</tbody></table>`;
  }
  const obj = $('[data-object-table]');
  if (obj) {
    obj.innerHTML = `<table><thead><tr><th>Dataset</th><th>Duration</th><th>ηnc</th><th>ρnear</th></tr></thead><tbody>${metrics.objectInteractionGeometry.map(r => `<tr class="${r.dataset === 'HiPHI' ? 'highlight-row' : ''}"><td>${escapeHTML(r.dataset)}</td><td>${fmt(r.duration_h)}</td><td>${fmt(r.eta_nc_percent)}</td><td>${fmt(r.rho_near_percent)}</td></tr>`).join('')}</tbody></table>`;
  }
}


function formatBenchmarkValue(value, unit = '') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const numeric = Number(value);
  const text = Math.abs(numeric) >= 100 ? numeric.toFixed(1).replace(/\.0$/, '') : numeric.toFixed(numeric < 1 ? 3 : 1).replace(/0+$/, '').replace(/\.$/, '');
  return `${text}${unit}`;
}

function renderBenchmarkVisuals(metrics) {
  const precisionHost = $('[data-precision-bar-list]');
  if (precisionHost && metrics?.bodyMotionPrecision?.length) {
    const rows = metrics.bodyMotionPrecision;
    const metricDefs = [
      { key: 'jerk_m_s3', label: 'Jτ', detail: 'jerk', unit: '' },
      { key: 'accel_m_s2', label: 'A', detail: 'acceleration', unit: '' },
      { key: 'ground_mm', label: 'δground', detail: 'floor offset', unit: ' mm' },
      { key: 'float_percent', label: 'ϕfloat', detail: 'floating', unit: '%' },
      { key: 'foot_mm_s', label: 'νfoot', detail: 'foot sliding', unit: ' mm/s' },
    ];
    precisionHost.innerHTML = metricDefs.map(metric => {
      const valid = rows.filter(row => row[metric.key] !== null && row[metric.key] !== undefined);
      const max = Math.max(...valid.map(row => Number(row[metric.key])), 1);
      const hiphi = valid.find(row => row.dataset === 'HiPHI');
      const bestBaseline = valid.filter(row => row.dataset !== 'HiPHI').sort((a, b) => Number(a[metric.key]) - Number(b[metric.key]))[0];
      const hiphiWidth = Math.max(6, Math.min(100, (Number(hiphi?.[metric.key] || 0) / max) * 100));
      const baselineWidth = Math.max(6, Math.min(100, (Number(bestBaseline?.[metric.key] || 0) / max) * 100));
      return `<div class="precision-row">
        <div class="precision-label"><strong>${escapeHTML(metric.label)}</strong><span>${escapeHTML(metric.detail)}</span></div>
        <div class="precision-track" aria-label="${escapeHTML(metric.label)} comparison">
          <div class="precision-line hiphi-line" style="width:${hiphiWidth}%"><span>HiPHI ${formatBenchmarkValue(hiphi?.[metric.key], metric.unit)}</span></div>
          <div class="precision-line baseline-line" style="width:${baselineWidth}%"><span>${escapeHTML(bestBaseline?.dataset || 'Baseline')} ${formatBenchmarkValue(bestBaseline?.[metric.key], metric.unit)}</span></div>
        </div>
      </div>`;
    }).join('');
  }

  const objectHost = $('[data-object-bar-list]');
  if (objectHost && metrics?.objectInteractionGeometry?.length) {
    const rows = metrics.objectInteractionGeometry;
    const maxDuration = Math.max(...rows.map(row => Number(row.duration_h) || 0), 1);
    objectHost.innerHTML = rows.map(row => {
      const isHiphi = row.dataset === 'HiPHI';
      const durationWidth = Math.max(3, Math.min(100, (Number(row.duration_h || 0) / maxDuration) * 100));
      const nc = Math.max(0, Math.min(100, Number(row.eta_nc_percent || 0)));
      const near = Math.max(0, Math.min(100, Number(row.rho_near_percent || 0)));
      return `<div class="object-compare-row ${isHiphi ? 'is-hiphi' : ''}">
        <div class="object-compare-name"><strong>${escapeHTML(row.dataset)}</strong><span>${formatBenchmarkValue(row.duration_h, ' h')}</span></div>
        <div class="object-duration-track"><span style="width:${durationWidth}%"></span></div>
        <div class="quality-pill"><span style="width:${nc}%"></span><b>ηnc ${formatBenchmarkValue(row.eta_nc_percent, '%')}</b></div>
        <div class="quality-pill near"><span style="width:${near}%"></span><b>ρnear ${formatBenchmarkValue(row.rho_near_percent, '%')}</b></div>
      </div>`;
    }).join('');
  }
}


function hexToRgb(hex) {
  const raw = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return [176, 68, 244];
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
}

function renderTsneEnvelope(data) {
  const host = $('[data-tsne-envelope]');
  const canvas = $('[data-tsne-envelope-canvas]', host || document);
  const controls = $('[data-tsne-envelope-controls]', host || document);
  if (!host || !canvas || !controls || !data?.datasets?.length) return;

  const desired = ['HiPHI', 'BONES-SEED-SOMA', 'AMASS', 'Motion-X++', 'LaFAN1'];
  const byName = new Map(data.datasets.map(ds => [ds.name, ds]));
  const datasets = desired.map(name => byName.get(name)).filter(Boolean)
    .concat(data.datasets.filter(ds => !desired.includes(ds.name)));
  const defaults = new Set(data.default_visible?.length ? data.default_visible : ['HiPHI', 'BONES-SEED-SOMA']);
  const visible = new Set(datasets.filter(ds => defaults.has(ds.name)).map(ds => ds.name));
  const grid = data.grid || 55;
  const ctx = canvas.getContext('2d');

  const buttons = datasets.map(ds => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${ds.display} · ${ds.occupied_cells}`;
    button.style.setProperty('--dataset-color', ds.color || '#b044f4');
    button.dataset.dataset = ds.name;
    button.setAttribute('aria-pressed', String(visible.has(ds.name)));
    button.addEventListener('click', () => {
      if (visible.has(ds.name)) visible.delete(ds.name);
      else visible.add(ds.name);
      if (!visible.size) visible.add(ds.name);
      sync();
    });
    controls.appendChild(button);
    return button;
  });

  const reset = $('[data-tsne-envelope-reset]', host);
  reset?.addEventListener('click', () => {
    visible.clear();
    defaults.forEach(name => visible.add(name));
    sync();
  });

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return { width: rect.width, height: rect.height };
  }

  function draw() {
    const rect = resize();
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff7fd';
    ctx.fillRect(0, 0, w, h);

    const pad = Math.max(28, Math.min(w, h) * 0.045);
    const size = Math.max(1, Math.min(w - pad * 2, h - pad * 2));
    const left = (w - size) / 2;
    const top = (h - size) / 2;
    const cell = size / grid;

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.62)';
    ctx.strokeStyle = 'rgba(176,68,244,.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(left, top, size, size, 18);
    ctx.fill();
    ctx.stroke();
    ctx.clip();

    ctx.strokeStyle = 'rgba(216,184,221,.52)';
    ctx.lineWidth = 0.6;
    for (let i = 0; i <= grid; i += 5) {
      const pos = left + i * cell;
      ctx.beginPath(); ctx.moveTo(pos, top); ctx.lineTo(pos, top + size); ctx.stroke();
      const y = top + i * cell;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + size, y); ctx.stroke();
    }

    ctx.globalCompositeOperation = 'multiply';
    datasets.forEach(ds => {
      if (!visible.has(ds.name)) return;
      const [r, g, b] = hexToRgb(ds.color);
      ctx.fillStyle = `rgba(${r},${g},${b},0.48)`;
      (ds.cells || []).forEach(([x, y]) => {
        ctx.fillRect(left + x * cell, top + (grid - 1 - y) * cell, Math.ceil(cell) + 0.25, Math.ceil(cell) + 0.25);
      });
    });
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(33,23,43,.82)';
    ctx.font = '800 13px Inter, system-ui, sans-serif';
    const active = datasets.filter(ds => visible.has(ds.name));
    const label = active.map(ds => ds.display).join(' + ');
    ctx.fillText(label || 'Select a dataset', left, Math.max(18, top - 10));
    ctx.fillStyle = 'rgba(108,88,112,.82)';
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.fillText(`${grid}×${grid} occupancy grid`, left + size - 126, Math.max(18, top - 10));
    ctx.restore();
  }

  function sync() {
    buttons.forEach(button => button.setAttribute('aria-pressed', String(visible.has(button.dataset.dataset))));
    draw();
  }

  const observer = new ResizeObserver(() => draw());
  observer.observe(canvas);
  addEventListener('resize', draw, { passive: true });
  sync();
  renderTsneTailViz(data);
}

function renderTsneTailViz(data) {
  const host = $('[data-tsne-tail-viz]');
  const canvas = $('[data-tsne-tail-canvas]', host || document);
  const kpis = $('[data-tsne-tail-kpis]', host || document);
  if (!host || !canvas) return;

  const fallback = [
    { name: 'HiPHI', display: 'HiPHI (ours)', color: '#B98AD9', long_tail_percent: 14.1, effective_occupied_cells: 1443, occupied_cells: 1620 },
    { name: 'BONES-SEED-SOMA', display: 'BONES-SEED', color: '#5E88BF', long_tail_percent: 10.7, effective_occupied_cells: 1114, occupied_cells: 1438 },
  ];
  const stats = (data.long_tail_stats?.length ? data.long_tail_stats : fallback)
    .map(item => ({ ...item, long_tail_percent: Number(item.long_tail_percent ?? 0) }))
    .filter(item => Number.isFinite(item.long_tail_percent));
  if (!stats.length) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return { width: rect.width, height: rect.height };
  }

  function roundRectPath(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
  }

  function draw() {
    const { width: w, height: h } = resize();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff7fd';
    ctx.fillRect(0, 0, w, h);

    const padX = Math.max(24, w * 0.075);
    const top = Math.max(24, h * 0.12);
    const bottom = Math.max(46, h * 0.18);
    const chartH = Math.max(120, h - top - bottom);
    const maxVal = Math.max(16, ...stats.map(s => s.long_tail_percent)) * 1.08;

    ctx.strokeStyle = 'rgba(154,75,139,.14)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(102,103,124,.68)';
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of [0, 5, 10, 15]) {
      if (tick > maxVal) continue;
      const y = top + chartH - (tick / maxVal) * chartH;
      ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(w - padX, y); ctx.stroke();
      ctx.fillText(`${tick}%`, padX - 8, y);
    }

    const gap = Math.max(18, w * 0.06);
    const barW = Math.min(96, (w - padX * 2 - gap * (stats.length - 1)) / stats.length * 0.56);
    const groupW = stats.length * barW + (stats.length - 1) * gap;
    let x = (w - groupW) / 2;
    stats.forEach(s => {
      const [r, g, b] = hexToRgb(s.color);
      const bh = Math.max(4, (s.long_tail_percent / maxVal) * chartH);
      const y = top + chartH - bh;
      const grad = ctx.createLinearGradient(0, y, 0, top + chartH);
      grad.addColorStop(0, `rgba(${r},${g},${b},0.92)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0.42)`);
      roundRectPath(x, y, barW, bh, 13);
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = `rgba(${r},${g},${b},0.88)`; ctx.stroke();

      ctx.fillStyle = '#21172b';
      ctx.textAlign = 'center';
      ctx.font = '900 21px Inter, system-ui, sans-serif';
      ctx.fillText(`${s.long_tail_percent.toFixed(1)}%`, x + barW / 2, y - 18);
      ctx.fillStyle = 'rgba(33,23,43,.82)';
      ctx.font = '800 12px Inter, system-ui, sans-serif';
      ctx.fillText(s.display, x + barW / 2, top + chartH + 25);
      x += barW + gap;
    });

    ctx.fillStyle = 'rgba(102,78,112,.78)';
    ctx.textAlign = 'center';
    ctx.font = '800 12px Inter, system-ui, sans-serif';
    ctx.fillText('long-tail cell share', w / 2, h - 12);
  }

  if (kpis) {
    kpis.innerHTML = stats.map(s => `<span style="--dataset-color:${escapeHTML(s.color)}"><b>${escapeHTML(String(Math.round(s.effective_occupied_cells || 0)))}</b><em>${escapeHTML(s.display)} effective cells</em></span>`).join('');
  }

  const observer = new ResizeObserver(draw);
  observer.observe(canvas);
  addEventListener('resize', draw, { passive: true });
  draw();
}

function renderManifestPreview(data) {
  const pre = $('[data-manifest-preview]');
  if (!pre) return;
  const row = data.rows?.[0] || data[0] || {};
  pre.textContent = JSON.stringify(row, null, 2);
}

async function main() {
  initNav();
  initAnchorScroll();
  initHeavyIframes();
  try { renderStats(await loadJSON('static/data/site_stats.json')); } catch (err) { console.warn(err); }
  try {
    const [frameLuExamples, frameLuMotion] = await Promise.all([
      loadJSON('static/data/frame_lu_examples.json'),
      loadJSON('static/data/frame_lu_motion_samples.json').catch(err => { console.warn(err); return null; }),
    ]);
    renderFrameLu(frameLuExamples, frameLuMotion);
  } catch (err) { console.warn(err); }
  try {
    const [objectManifest, objectMotion] = await Promise.all([
      loadJSON('static/data/object_gallery_manifest.json'),
      loadJSON('static/data/object_motion_samples.json').catch(err => { console.warn(err); return null; }),
    ]);
    renderObjects(objectManifest, objectMotion);
  } catch (err) { console.warn(err); }
  if ($('[data-tsne-envelope]')) {
    try { renderTsneEnvelope(await loadJSON('static/data/tsne_envelopes_55grid.json')); } catch (err) { console.warn(err); }
  }
  if ($('[data-g1-player]')) {
    try { renderG1(await loadJSON('static/data/g1_npz_preview.json')); } catch (err) { console.warn(err); }
  }
  try {
    const metrics = await loadJSON('static/data/benchmark_metrics.json');
    renderTables(metrics);
    renderBenchmarkVisuals(metrics);
  } catch (err) { console.warn(err); }
}

document.addEventListener('DOMContentLoaded', main);
