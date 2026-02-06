/*
  Electromagnetic field-line background (canvas)
  - Animated warped mesh / field lines
  - Subtle mouse-reactive Lorentz-like drift (perpendicular to pointer velocity)
  - HiDPI-aware and responsive
  - Respects prefers-reduced-motion
  - Uniform baseline brightness + radial pointer boost (Gaussian falloff)
*/

(() => {
  const canvas = document.getElementById('field');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });

  const reduceMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    w: 0,
    h: 0,
    dpr: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
    t: 0,
    last: performance.now(),

    // Mesh density (keep modest for performance)
    hLines: 46,
    vLines: 22,

    // Wave parameters
    amp: 23,
    amp2: 19,
    speed: 0.00095,
    step: 1,

    // Gravitational-lensing-esque warp
    warpCenter: { x: 0.55, y: 0.42 },
    warpRadius: 0.56,
    warpStrength: 0.34,

    // Pointer interaction (Lorentz-like drift)
    pointer: { x: 0.5, y: 0.45, vx: 0, vy: 0, down: false },
    pointerRadius: 360,
    pointerStrength: 0.18,
    pointerDamping: 0.90,
    pointerFollow: 0.18,

    // Brightness control (baseline everywhere + pointer boost)
    // Baseline ≈ ~half of peak brightness; pointer region rises smoothly to peak.
    baseAlphaH: 0.12,     // baseline for horizontal lines (everywhere)
    baseAlphaV: 0.10,     // baseline for vertical lines (everywhere)
    boostAlpha: 0.12,     // additional alpha at pointer center (adds on top of baseline)
    boostRadius: 420,     // pixels: size of bright region around pointer
    boostVelGain: 0.06,   // small extra boost when moving (optional)

    // Stars (subtle but visible)
    stars: [],
    starCount: 220,
  };

  // Optional per-page presets. Set on <body data-field-preset="...">.
  // This gives you room to evolve each page’s background independently later.
  const presetName = (document.body && document.body.dataset && document.body.dataset.fieldPreset) || 'home';
  const presets = {
    home: {
      hLines: 46,
      vLines: 22,
      amp: 23,
      amp2: 19,
      warpCenter: { x: 0.55, y: 0.42 },
      warpStrength: 0.34,
      starCount: 220,
    },
    about: {
      hLines: 42,
      vLines: 20,
      amp: 18,
      amp2: 14,
      warpCenter: { x: 0.52, y: 0.40 },
      warpStrength: 0.26,
      starCount: 180,
      boostAlpha: 0.10,
    },
    research: {
      hLines: 52,
      vLines: 26,
      amp: 26,
      amp2: 20,
      warpCenter: { x: 0.58, y: 0.46 },
      warpStrength: 0.34,
      starCount: 210,
      boostAlpha: 0.13,
    },
    publications: {
      hLines: 44,
      vLines: 20,
      amp: 16,
      amp2: 12,
      warpCenter: { x: 0.54, y: 0.40 },
      warpStrength: 0.22,
      starCount: 160,
      baseAlphaH: 0.11,
      baseAlphaV: 0.09,
    },
    outreach: {
      hLines: 46,
      vLines: 22,
      amp: 20,
      amp2: 16,
      warpCenter: { x: 0.50, y: 0.44 },
      warpStrength: 0.28,
      starCount: 200,
    },
    music: {
      hLines: 46,
      vLines: 22,
      amp: 22,
      amp2: 18,
      warpCenter: { x: 0.60, y: 0.50 },
      warpStrength: 0.30,
      starCount: 220,
      boostAlpha: 0.14,
    },
    contact: {
      hLines: 42,
      vLines: 20,
      amp: 16,
      amp2: 12,
      warpCenter: { x: 0.52, y: 0.42 },
      warpStrength: 0.22,
      starCount: 160,
      baseAlphaH: 0.11,
      baseAlphaV: 0.09,
    },
  };

  (function applyPreset() {
    const preset = presets[presetName] || presets.home;
    if (!preset) return;
    // Handle nested objects explicitly.
    if (preset.warpCenter) state.warpCenter = { ...state.warpCenter, ...preset.warpCenter };
    // Apply remaining fields.
    const { warpCenter, ...rest } = preset;
    Object.assign(state, rest);
  })();

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

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

    // Re-seed stars on resize (deterministic-ish distribution)
    state.stars = new Array(state.starCount).fill(0).map((_, i) => {
      const r1 = (Math.sin(i * 999.1) * 0.5 + 0.5);
      const r2 = (Math.sin(i * 123.7 + 1.2) * 0.5 + 0.5);
      const r3 = (Math.sin(i * 77.7 + 2.1) * 0.5 + 0.5);
      return {
        x: r1 * state.w,
        y: r2 * state.h,
        a: 0.22 + r3 * 0.55,
        s: 1.0 + r2 * 2.4,
      };
    });
  }

  function onPointerMove(ev) {
    const x = ('touches' in ev) ? ev.touches[0].clientX : ev.clientX;
    const y = ('touches' in ev) ? ev.touches[0].clientY : ev.clientY;

    const nx = clamp(x / (state.w || 1), 0, 1);
    const ny = clamp(y / (state.h || 1), 0, 1);

    // velocity in normalized coordinates
    const pvx = (nx - state.pointer.x);
    const pvy = (ny - state.pointer.y);

    // blend into velocity so it feels fluid rather than twitchy
    state.pointer.vx = state.pointer.vx * 0.65 + pvx * 0.35;
    state.pointer.vy = state.pointer.vy * 0.65 + pvy * 0.35;

    // follow cursor with light smoothing
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

  function drawStars() {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(245,250,255,0.95)';

    for (const st of state.stars) {
      ctx.globalAlpha = st.a;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.s, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Field displacement model
  function displacedPoint(ix, iy, t) {
    const x0 = (ix / (state.hLines - 1)) * state.w;
    const y0 = (iy / (state.vLines - 1)) * state.h;

    const nx = x0 / state.w;
    const ny = y0 / state.h;

    // base waves
    const w1 = Math.sin((nx * 3.6 + t * 0.9) * Math.PI * 2) * state.amp * 0.2;
    const w2 = Math.sin((ny * 2.3 + t * 1.2) * Math.PI * 2 + nx * 1.1) * state.amp2 * 0.3;
    const w3 = Math.cos((nx * 1.4 + ny * 1.2 + t * 0.55) * Math.PI * 2) * (state.amp2 * 0.3);

    // warp around a center (spacetime-curvature-esque)
    const cx = state.warpCenter.x;
    const cy = state.warpCenter.y;
    const dx = nx - cx;
    const dy = ny - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    const falloff = Math.exp(-Math.pow(r / state.warpRadius, 2));
    const warp = state.warpStrength * falloff;

    const radialX = dx === 0 && dy === 0 ? 0 : (dx / (r + 1e-6));
    const radialY = dx === 0 && dy === 0 ? 0 : (dy / (r + 1e-6));
    const warpPx = radialX * warp * 42;
    const warpPy = radialY * warp * 22;

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

    const x = x0 + (w1 + w3) * 0.35 + warpPx + driftPx;
    const y = y0 + (w2 + w3) * 0.55 + warpPy + driftPy;

    return { x, y };
  }

  // Mesh draw: baseline alpha everywhere + pointer radial boost
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

    // Field ridges (subtle highlights, boosted near pointer)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineWidth = 1.25;

    for (let k = 0; k < 5; k++) {
      const iy = Math.floor((k + 1) * (state.vLines / 6));
      ctx.beginPath();

      let avgBoost = 0;
      let count = 0;

      for (let ix = 0; ix < state.hLines; ix += state.step) {
        const p = displacedPoint(ix, iy, t * 1.03 + k * 0.12);
        if (ix === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);

        avgBoost += boostAt(p.x, p.y);
        count++;
      }

      avgBoost = count ? (avgBoost / count) : 0;

      const ridgeAlpha = clamp(0.05 + 0.08 * avgBoost, 0, 0.18);
      ctx.strokeStyle = `rgba(140,240,210,${ridgeAlpha})`;
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

    clear();
    drawStars();
    drawMesh(state.t);

    if (!reduceMotion) requestAnimationFrame(tick);
  }

  // Init
  resize();
  installPointer();
  window.addEventListener('resize', resize, { passive: true });

  if (reduceMotion) {
    clear();
    drawStars();
    drawMesh(0.18);
  } else {
    requestAnimationFrame(tick);
  }
})();
