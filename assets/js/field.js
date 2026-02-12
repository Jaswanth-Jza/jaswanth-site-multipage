/*
  Electromagnetic field-line background (canvas)
  - Animated mesh / field lines (uniform, no central warp)
  - Cursor brightening (radial boost)
  - Subtle mouse-reactive Lorentz-like drift (can be toned down)
  - HiDPI-aware and responsive
  - Respects prefers-reduced-motion
*/

(() => {
  const canvas = document.getElementById('field');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });

  const reduceMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function applyUI(state){
  const ui = window.__FIELD_UI__;
  if(!ui) return;

  // B⊥ strength -> baseline alpha everywhere
  if (ui.bperp != null){
    const a = clamp(ui.bperp, 0.04, 0.30);
    state.baseAlphaH = a;
    state.baseAlphaV = a;
  }

  // Turbulence -> wave amplitudes
  if (ui.turb != null){
    const t = clamp(ui.turb, 6, 40);
    state.amp  = t;
    state.amp2 = t * 0.8;
  }

  // Coherence scale -> spatial frequency multiplier
  if (ui.coh != null){
    state.kScale = clamp(ui.coh, 0.4, 3.0);
  }

  // Wave activity -> time speed
  if (ui.speed != null){
    state.speed = clamp(ui.speed, 0.0002, 0.003);
  }
boostRadius: 420,  

// Distortion radius -> how far cursor bends the grid
if (ui.src != null){
  state.pointerRadius = clamp(ui.src, 120, 900);
}

  // Shear / drift -> mouse deformation
  if (ui.shear != null){
    state.pointerStrength = clamp(ui.shear, 0.0, 0.6);
  }
}


  const state = {
    w: 0,
    h: 0,
    dpr: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
    t: 0,
    last: performance.now(),

    // Mesh density
    hLines: 46,
    vLines: 22,
    step: 1,

    // Wave parameters (keep modest for uniform feel)
    kScale: 1.0, // coherence scale multiplier for wave spatial frequency
    amp: 20,
    amp2: 16,
    speed: 0.00095,

    // Pointer interaction (deformation + brightening)
    pointer: { x: 0.5, y: 0.45, vx: 0, vy: 0 },
    pointerRadius: 360,
    pointerStrength: 0.18,   // deformation strength
    pointerDamping: 0.90,
    pointerFollow: 0.18,

    // Brightness (uniform baseline + cursor boost)
    baseAlphaH: 0.12,
    baseAlphaV: 0.12,
    boostAlpha: 0.12,
    boostRadius: 420,
    boostVelGain: 0.06,

    // Turn OFF any “lens” warp completely
    warpStrength: 0.0,
  };

  // Optional per-page presets. Set on <body data-field-preset="...">.
  const presetName = (document.body?.dataset?.fieldPreset) || 'home';
  const presets = {
    home: { hLines: 46, vLines: 22, amp: 20, amp2: 16 },
    about: { hLines: 42, vLines: 20, amp: 16, amp2: 12, boostAlpha: 0.10 },
    research: { hLines: 52, vLines: 26, amp: 22, amp2: 18, boostAlpha: 0.13 },
    publications: { hLines: 44, vLines: 20, amp: 14, amp2: 10, baseAlphaH: 0.11, baseAlphaV: 0.11, boostAlpha: 0.10 },
    outreach: { hLines: 46, vLines: 22, amp: 18, amp2: 14 },
    music: { hLines: 46, vLines: 22, amp: 19, amp2: 15, boostAlpha: 0.14 },
    contact: { hLines: 42, vLines: 20, amp: 14, amp2: 10, baseAlphaH: 0.11, baseAlphaV: 0.11, boostAlpha: 0.10 },
  };

  (function applyPreset() {
    const p = presets[presetName] || presets.home;
    Object.assign(state, p);
  })();

  function resize() {
    state.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    state.w = Math.floor(window.innerWidth);
    state.h = Math.floor(window.innerHeight);

    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    canvas.style.width = state.w + 'px';
    canvas.style.height = state.h + 'px';

    // Draw in CSS pixels
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
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

  // Field displacement model (NO central warp)
  function displacedPoint(ix, iy, t) {
    const x0 = (ix / (state.hLines - 1)) * state.w;
    const y0 = (iy / (state.vLines - 1)) * state.h;

    const nx = x0 / state.w;
    const ny = y0 / state.h;

    // smooth base waves (kept subtle)
    const ks = state.kScale || 1.0;
    const w1 = Math.sin(((nx * 3.6 * ks) + t * 0.9) * Math.PI * 2) * state.amp * 0.2;
    const w2 = Math.sin(((ny * 2.3 * ks) + t * 1.2) * Math.PI * 2 + nx * 1.1 * ks) * state.amp2 * 0.3;
    const w3 = Math.cos(((nx * 1.4 * ks) + (ny * 1.2 * ks) + t * 0.55) * Math.PI * 2) * (state.amp2 * 0.3);

    // Lorentz-like pointer drift (deformation)
    const px = state.pointer.x;
    const py = state.pointer.y;
    const pdx = (nx - px) * state.w;
    const pdy = (ny - py) * state.h;
    const pr = Math.sqrt(pdx * pdx + pdy * pdy);
    const pInfluence = Math.exp(-(pr * pr) / (2 * state.pointerRadius * state.pointerRadius));

    const pvx = state.pointer.vx;
    const pvy = state.pointer.vy;
    const pvMag = Math.sqrt(pvx * pvx + pvy * pvy);

    const perpX = -pvy;
    const perpY = pvx;

    const trX = pr < 1e-3 ? 0 : (-pdy / pr);
    const trY = pr < 1e-3 ? 0 : (pdx / pr);

    const driftGain = state.pointerStrength * pInfluence * clamp(pvMag * 18, 0, 1.8);

    const driftPx = (perpX * 85 + trX * 55) * driftGain;
    const driftPy = (perpY * 55 + trY * 85) * driftGain;

    const x = x0 + (w1 + w3) * 0.35 + driftPx;
    const y = y0 + (w2 + w3) * 0.55 + driftPy;

    return { x, y };
  }

  // Mesh draw: uniform baseline + cursor radial brightening
  function drawMesh(t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    const px = state.pointer.x * state.w;
    const py = state.pointer.y * state.h;
    const r0 = state.boostRadius;

    const v = Math.sqrt(state.pointer.vx * state.pointer.vx + state.pointer.vy * state.pointer.vy);
    const velBoost = clamp(v * 10, 0, 1) * state.boostVelGain;

    function boostAt(x, y) {
      const dx = x - px;
      const dy = y - py;
      const rr = dx * dx + dy * dy;
      return Math.exp(-rr / (2 * r0 * r0));
    }

    // Horizontal lines
    for (let iy = 0; iy < state.vLines; iy += state.step) {
      ctx.beginPath();
      let avgBoost = 0;
      let count = 0;

      for (let ix = 0; ix < state.hLines; ix += state.step) {
        const p = displacedPoint(ix, iy, t);
        if (ix === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);

        avgBoost += boostAt(p.x, p.y);
        count++;
      }

      avgBoost = count ? (avgBoost / count) : 0;

      const alpha = clamp(
        state.baseAlphaH + (state.boostAlpha + velBoost) * avgBoost,
        0,
        0.42
      );

      ctx.strokeStyle = `rgba(235,240,255,${alpha})`;
      ctx.lineWidth = 1.35;
      ctx.stroke();
    }

    // Vertical lines
    for (let ix = 0; ix < state.hLines; ix += state.step) {
      ctx.beginPath();
      let avgBoost = 0;
      let count = 0;

      for (let iy = 0; iy < state.vLines; iy += state.step) {
        const p = displacedPoint(ix, iy, t);
        if (iy === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);

        avgBoost += boostAt(p.x, p.y);
        count++;
      }

      avgBoost = count ? (avgBoost / count) : 0;

      const alpha = clamp(
        state.baseAlphaV + (state.boostAlpha + velBoost) * avgBoost,
        0,
        0.42
      );

      ctx.strokeStyle = `rgba(235,240,255,${alpha})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    ctx.restore();
  }

  function tick(now) {
    const dt = Math.min(50, now - state.last);
    state.last = now;

    const speed = reduceMotion ? state.speed * 0.18 : state.speed;
    state.t += dt * speed;

    // pointer velocity damping
    state.pointer.vx *= state.pointerDamping;
    state.pointer.vy *= state.pointerDamping;

    applyUI(state);
    clear();
    drawMesh(state.t);

    if (!reduceMotion) requestAnimationFrame(tick);
  }

  // Init
  resize();
  installPointer();
  window.addEventListener('resize', resize, { passive: true });

  if (reduceMotion) {
    applyUI(state);
    clear();
    drawMesh(0.18);
  } else {
    requestAnimationFrame(tick);
  }
})();
