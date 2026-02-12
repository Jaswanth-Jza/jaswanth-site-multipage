/*
  Electromagnetic field-line background (canvas)
  - Animated mesh / field lines (uniform, no central warp)
  - Cursor brightening (radial boost)
  - Subtle mouse-reactive Lorentz-like drift
  - HiDPI-aware and responsive
  - Respects prefers-reduced-motion
*/

(() => {
  const canvas = document.getElementById('field');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const reduceMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const BASE_FIELD_ALPHA = 0.05;   // quarter of prior slider max (0.20)
  const CURSOR_FIELD_ALPHA = 0.20; // prior slider max brightness

  const state = {
    w: 0,
    h: 0,
    dpr: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
    t: 0,
    last: performance.now(),
    rafId: 0,
    running: false,

    // Mesh density
    hLines: 46,
    vLines: 22,
    baseHLines: 46,
    baseVLines: 22,
    densityScale: 1.0,
    viewportDensityScale: 1.0,
    densityStrokeScale: 1.0,
    step: 1,

    // Wave parameters
    kScale: 1.0, // coherence scale multiplier
    amp: 20,
    amp2: 16,
    speed: 0.00095,

    // Pointer interaction (geometry distortion)
    pointer: { x: 0.5, y: 0.45, vx: 0, vy: 0 },
    pointerRadius: 360,    // <-- distortion radius (now controlled by slider)
    pointerStrength: 0.18, // <-- distortion strength (shear slider)
    pointerDamping: 0.90,
    pointerFollow: 0.18,

    // Brightness (uniform baseline + cursor boost)
    baseAlphaH: BASE_FIELD_ALPHA,
    baseAlphaV: BASE_FIELD_ALPHA,

    // Reused buffers for per-frame geometry and brightness calculations.
    gridX: null,
    gridY: null,
  };

  // Optional per-page presets
  const presetName = (document.body?.dataset?.fieldPreset) || 'home';
  const presets = {
    home: { hLines: 46, vLines: 22, amp: 20, amp2: 16 },
    about: { hLines: 42, vLines: 20, amp: 16, amp2: 12 },
    research: { hLines: 52, vLines: 26, amp: 22, amp2: 18 },
    publications: { hLines: 44, vLines: 20, amp: 14, amp2: 10 },
    outreach: { hLines: 46, vLines: 22, amp: 18, amp2: 14 },
    music: { hLines: 46, vLines: 22, amp: 19, amp2: 15 },
    contact: { hLines: 42, vLines: 20, amp: 14, amp2: 10 },
  };

  (function applyPreset() {
    const p = presets[presetName] || presets.home;
    Object.assign(state, p);
    state.baseHLines = state.hLines;
    state.baseVLines = state.vLines;
  })();

  function updateDensityVisualScales() {
    // Keep dense meshes readable by thinning strokes slightly.
    state.densityStrokeScale = clamp(1 / Math.pow(state.densityScale, 0.35), 0.78, 1.14);
  }

  function applyMeshDensity() {
    const densityFactor = state.viewportDensityScale * state.densityScale;
    const nextHLines = Math.min(96, Math.max(24, Math.round(state.baseHLines * densityFactor)));
    const nextVLines = Math.min(56, Math.max(12, Math.round(state.baseVLines * densityFactor)));

    const changed = nextHLines !== state.hLines || nextVLines !== state.vLines;
    state.hLines = nextHLines;
    state.vLines = nextVLines;

    updateDensityVisualScales();
    if (changed) ensureGridBuffers();
  }

  function updateDensityForViewport() {
    const area = Math.max(1, state.w * state.h);
    const areaFactor = clamp(Math.sqrt(area / (1366 * 768)), 0.82, 1.08);
    const mobileFactor = state.w < 560 ? 0.74 : state.w < 860 ? 0.86 : 1;
    state.viewportDensityScale = areaFactor * mobileFactor;
    applyMeshDensity();
  }

  function ensureGridBuffers() {
    const total = state.hLines * state.vLines;
    if (state.gridX && state.gridX.length === total) return;

    state.gridX = new Float32Array(total);
    state.gridY = new Float32Array(total);
  }

  function applyUI() {
    const ui = window.__FIELD_UI__;
    if (!ui) return;

    // Turbulence -> wave amplitudes
    if (ui.turb != null) {
      const t = clamp(ui.turb, 6, 40);
      state.amp = t;
      state.amp2 = t * 0.8;
    }

    // Coherence scale -> spatial frequency multiplier
    if (ui.coh != null) {
      state.kScale = clamp(ui.coh, 0.4, 3.0);
    }

    // Wave activity -> time speed
    if (ui.speed != null) {
      state.speed = clamp(ui.speed, 0.0002, 0.003);
    }

    // Field density -> number of lines per unit area (with caps for performance)
    if (ui.density != null) {
      const d = clamp(ui.density, 0.65, 1.75);
      if (d !== state.densityScale) {
        state.densityScale = d;
        applyMeshDensity();
      }
    }

    // Distortion radius -> how far cursor bends the grid
    if (ui.src != null) {
      state.pointerRadius = clamp(ui.src, 120, 900);
    }

    // Shear / drift -> distortion strength
    if (ui.shear != null) {
      state.pointerStrength = clamp(ui.shear, 0.0, 0.6);
    }
  }

  function resize() {
    state.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    state.w = Math.floor(window.innerWidth);
    state.h = Math.floor(window.innerHeight);
    updateDensityForViewport();

    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    canvas.style.width = state.w + 'px';
    canvas.style.height = state.h + 'px';

    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    if (reduceMotion) {
      applyUI();
      clear();
      drawMesh(0.18);
    }
  }

  function onPointerMove(ev) {
    const x = ('touches' in ev) ? ev.touches[0].clientX : ev.clientX;
    const y = ('touches' in ev) ? ev.touches[0].clientY : ev.clientY;

    const nx = clamp(x / (state.w || 1), 0, 1);
    const ny = clamp(y / (state.h || 1), 0, 1);

    const pvx = (nx - state.pointer.x);
    const pvy = (ny - state.pointer.y);

    state.pointer.vx = state.pointer.vx * 0.65 + pvx * 0.35;
    state.pointer.vy = state.pointer.vy * 0.65 + pvy * 0.35;

    state.pointer.x += (nx - state.pointer.x) * state.pointerFollow;
    state.pointer.y += (ny - state.pointer.y) * state.pointerFollow;
  }

  function installPointer() {
    const opts = { passive: true };
    window.addEventListener('mousemove', onPointerMove, opts);
    window.addEventListener('touchmove', onPointerMove, opts);
  }

  function clear() {
    ctx.clearRect(0, 0, state.w, state.h);
  }

  function populateGrid(t) {
    ensureGridBuffers();

    const invH = state.hLines > 1 ? 1 / (state.hLines - 1) : 1;
    const invV = state.vLines > 1 ? 1 / (state.vLines - 1) : 1;
    const ks = state.kScale || 1.0;

    const px = state.pointer.x;
    const py = state.pointer.y;
    const pvx = state.pointer.vx;
    const pvy = state.pointer.vy;
    const pvMag = Math.sqrt(pvx * pvx + pvy * pvy);
    const velGain = clamp(pvMag * 18, 0, 1.8);

    const perpX = -pvy;
    const perpY = pvx;

    const pointerDen = 2 * state.pointerRadius * state.pointerRadius;

    let idx = 0;
    for (let iy = 0; iy < state.vLines; iy++) {
      const ny = iy * invV;
      const y0 = ny * state.h;

      for (let ix = 0; ix < state.hLines; ix++) {
        const nx = ix * invH;
        const x0 = nx * state.w;

        const w1 = Math.sin(((nx * 3.6 * ks) + t * 0.9) * Math.PI * 2) * state.amp * 0.2;
        const w2 = Math.sin(((ny * 2.3 * ks) + t * 1.2) * Math.PI * 2 + nx * 1.1 * ks) * state.amp2 * 0.3;
        const w3 = Math.cos(((nx * 1.4 * ks) + (ny * 1.2 * ks) + t * 0.55) * Math.PI * 2) * (state.amp2 * 0.3);

        const pdx = (nx - px) * state.w;
        const pdy = (ny - py) * state.h;
        const pr2 = pdx * pdx + pdy * pdy;
        const pInfluence = Math.exp(-pr2 / pointerDen);

        const invPr = pr2 > 1e-6 ? 1 / Math.sqrt(pr2) : 0;
        const trX = -pdy * invPr;
        const trY = pdx * invPr;

        const driftGain = state.pointerStrength * pInfluence * velGain;
        const driftPx = (perpX * 85 + trX * 55) * driftGain;
        const driftPy = (perpY * 55 + trY * 85) * driftGain;

        const x = x0 + (w1 + w3) * 0.35 + driftPx;
        const y = y0 + (w2 + w3) * 0.55 + driftPy;

        state.gridX[idx] = x;
        state.gridY[idx] = y;
        idx++;
      }
    }
  }

  function drawMesh(t) {
    populateGrid(t);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    const hLines = state.hLines;
    const vLines = state.vLines;
    const step = state.step;
    const gridX = state.gridX;
    const gridY = state.gridY;
    const hBaseWidth = 1.35 * state.densityStrokeScale;
    const vBaseWidth = 1.2 * state.densityStrokeScale;

    function drawLines(horizontalStyle, verticalStyle, horizontalWidth, verticalWidth) {
      // Horizontal
      ctx.strokeStyle = horizontalStyle;
      ctx.lineWidth = horizontalWidth;
      for (let iy = 0; iy < vLines; iy += step) {
        ctx.beginPath();
        const rowOffset = iy * hLines;
        for (let ix = 0; ix < hLines; ix += step) {
          const idx = rowOffset + ix;
          const x = gridX[idx];
          const y = gridY[idx];
          if (ix === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Vertical
      ctx.strokeStyle = verticalStyle;
      ctx.lineWidth = verticalWidth;
      for (let ix = 0; ix < hLines; ix += step) {
        ctx.beginPath();
        for (let iy = 0; iy < vLines; iy += step) {
          const idx = iy * hLines + ix;
          const x = gridX[idx];
          const y = gridY[idx];
          if (iy === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // Pass 1: fixed base brightness field.
    drawLines(
      `rgba(235,240,255,${state.baseAlphaH})`,
      `rgba(235,240,255,${state.baseAlphaV})`,
      hBaseWidth,
      vBaseWidth
    );

    // Pass 2: cursor-local brightening with radial falloff tied to distortion radius.
    const cursorX = state.pointer.x * state.w;
    const cursorY = state.pointer.y * state.h;
    const radius = Math.max(100, state.pointerRadius);
    const extraH = clamp(CURSOR_FIELD_ALPHA - state.baseAlphaH, 0, 0.35);
    const extraV = clamp(CURSOR_FIELD_ALPHA - state.baseAlphaV, 0, 0.35);

    if (extraH > 0.001 || extraV > 0.001) {
      const horizontalGlow = ctx.createRadialGradient(cursorX, cursorY, 0, cursorX, cursorY, radius);
      const verticalGlow = ctx.createRadialGradient(cursorX, cursorY, 0, cursorX, cursorY, radius);
      const stops = [0, 0.25, 0.5, 0.75, 1];

      stops.forEach((s) => {
        const falloff = Math.exp(-2 * s * s);
        const alphaH = s === 1 ? 0 : (extraH * falloff);
        const alphaV = s === 1 ? 0 : (extraV * falloff);
        horizontalGlow.addColorStop(s, `rgba(235,240,255,${alphaH})`);
        verticalGlow.addColorStop(s, `rgba(235,240,255,${alphaV})`);
      });

      drawLines(
        horizontalGlow,
        verticalGlow,
        hBaseWidth * 1.05,
        vBaseWidth * 1.05
      );
    }

    ctx.restore();
  }

  function tick(now) {
    if (!state.running) return;

    const dt = Math.min(50, now - state.last);
    state.last = now;

    const speed = reduceMotion ? state.speed * 0.18 : state.speed;
    state.t += dt * speed;

    state.pointer.vx *= state.pointerDamping;
    state.pointer.vy *= state.pointerDamping;

    applyUI();
    clear();
    drawMesh(state.t);
    state.rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (reduceMotion || state.running || document.hidden) return;
    state.running = true;
    state.last = performance.now();
    state.rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (!state.running) return;
    state.running = false;
    if (!state.rafId) return;
    cancelAnimationFrame(state.rafId);
    state.rafId = 0;
  }

  // Init
  resize();
  installPointer();
  let resizeRafId = 0;
  window.addEventListener('resize', () => {
    if (resizeRafId) return;
    resizeRafId = requestAnimationFrame(() => {
      resizeRafId = 0;
      resize();
    });
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (reduceMotion) return;
    if (document.hidden) stop();
    else start();
  });

  if (reduceMotion) {
    applyUI();
    clear();
    drawMesh(0.18);
  } else {
    start();
  }
})();
