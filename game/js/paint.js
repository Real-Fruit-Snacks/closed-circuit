// CLOSED CIRCUIT — paint.js
// Shared canvas helpers: noise, scanlines, vignette, glitch, lights, figures.
window.MQ = window.MQ || {};

MQ.paint = (function () {
  const U = MQ.util;

  // ---------- pre-rendered noise frames (faint per-channel chroma) ----------
  const NOISE_W = 640, NOISE_H = 360, NOISE_FRAMES = 6;
  const noiseFrames = [];

  function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  function initNoise() {
    if (noiseFrames.length) return;
    for (let f = 0; f < NOISE_FRAMES; f++) {
      const cv = document.createElement("canvas");
      cv.width = NOISE_W; cv.height = NOISE_H;
      const ctx = cv.getContext("2d");
      const img = ctx.createImageData(NOISE_W, NOISE_H);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        // jitter channels so grain carries a faint chroma speckle like a real sensor
        d[i] = clamp8(v + (Math.random() * 26 - 13));
        d[i + 1] = v;
        d[i + 2] = clamp8(v + (Math.random() * 26 - 13));
        d[i + 3] = Math.random() < 0.42 ? 255 : 0;
      }
      ctx.putImageData(img, 0, 0);
      noiseFrames.push(cv);
    }
  }

  let noiseIdx = 0, noiseTick = 0;
  // mode: "overlay" (default for feeds — modulates luminance, keeps blacks black)
  //       or "source-over" for the flat title veil.
  function drawNoise(ctx, w, h, alpha, mode) {
    if (!noiseFrames.length) initNoise();
    noiseTick++;
    if (noiseTick % 2 === 0) noiseIdx = (noiseIdx + 1 + ((Math.random() * 2) | 0)) % NOISE_FRAMES;
    ctx.save();
    if (mode) ctx.globalCompositeOperation = mode;
    ctx.globalAlpha = alpha;
    const ox = -((Math.random() * 40) | 0), oy = -((Math.random() * 40) | 0);
    ctx.drawImage(noiseFrames[noiseIdx], ox, oy, w + 40, h + 40);
    ctx.restore();
  }

  // ---------- scanlines (fine 2px raster, soft dark row) ----------
  let scanPat = null;
  function scanlines(ctx, w, h, alpha) {
    if (!scanPat) {
      const cv = document.createElement("canvas");
      cv.width = 2; cv.height = 2;
      const c = cv.getContext("2d");
      c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(0, 1, 2, 1);   // 1-on/1-off
      c.fillStyle = "rgba(255,255,255,0.02)"; c.fillRect(0, 0, 2, 1); // faint beam gain
      scanPat = ctx.createPattern(cv, "repeat");
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = scanPat;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // ---------- vignette (never crushes corners fully black) ----------
  const vignCache = {};
  function vignette(ctx, w, h, strength) {
    const key = w + "x" + h;
    if (!vignCache[key]) {
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const c = cv.getContext("2d");
      const g = c.createRadialGradient(w / 2, h / 2, h * 0.52, w / 2, h / 2, h * 1.02);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.7, "rgba(0,0,0,0.34)");
      g.addColorStop(1, "rgba(0,0,0,0.86)");    // leaves a corner readable
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      vignCache[key] = cv;
    }
    ctx.save();
    ctx.globalAlpha = strength;
    ctx.drawImage(vignCache[key], 0, 0);
    ctx.restore();
  }

  // ---------- radial light pool (with a falloff knee) ----------
  function light(ctx, x, y, r, rgb, alpha) {
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, "rgba(" + rgb + "," + alpha + ")");
    g.addColorStop(0.45, "rgba(" + rgb + "," + (alpha * 0.42) + ")");
    g.addColorStop(1, "rgba(" + rgb + ",0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  // ---------- dust motes drifting inside a beam ----------
  function motes(ctx, x, yTop, yBase, spread, t, rgb, n) {
    ctx.save();
    ctx.fillStyle = "rgba(" + (rgb || "210,220,180") + ",0.10)";
    for (let i = 0; i < (n || 5); i++) {
      const ph = i * 2.4;
      const fy = (yTop + ((t * 6 + i * 37) % (yBase - yTop)));
      const fx = x + Math.sin(t * 0.6 + ph) * spread * ((fy - yTop) / (yBase - yTop));
      ctx.fillRect(fx, fy, 1, 1);
    }
    ctx.restore();
  }

  // ---------- rounded rect ----------
  function rr(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- soft ground shadow (radial, with optional contact core) ----------
  function shadow(ctx, x, y, rx, ry, a, contact) {
    ctx.save();
    const g = ctx.createRadialGradient(x, y, 1, x, y, rx);
    g.addColorStop(0, "rgba(0,0,0," + (a || 0.3) + ")");
    g.addColorStop(0.6, "rgba(0,0,0," + (a || 0.3) * 0.55 + ")");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (contact) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath(); ctx.ellipse(x, y, rx * 0.34, Math.max(1.5, ry * 0.5), 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // ---------- figure sub-parts ----------
  function headEgg(ctx, cx, cy, r) {
    // wider cranium, narrower jaw
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 1.06);
    ctx.bezierCurveTo(cx + r * 0.96, cy - r * 1.02, cx + r * 0.82, cy + r * 0.96, cx, cy + r * 0.96);
    ctx.bezierCurveTo(cx - r * 0.82, cy + r * 0.96, cx - r * 0.96, cy - r * 1.02, cx, cy - r * 1.06);
    ctx.closePath(); ctx.fill();
  }

  function armPath(ctx, s, w, h, face, drop) {
    // s = -1 left / +1 right; drop nudges the hang for asymmetry. A THIN limb: the bicep tucks
    // behind the torso, the forearm hangs as a narrow sliver beside the thigh down to ~the knee
    // (an uncanny too-long reach). Face pose swings the hand a touch outward.
    const out = face ? 0.05 : 0;
    ctx.beginPath();
    ctx.moveTo(s * w * 0.24, -h * 0.82);                                                         // shoulder root, WELL inside the torso (no gap)
    ctx.quadraticCurveTo(s * w * (0.50 + out), -h * 0.70, s * w * (0.47 + out), -h * (0.44 - drop)); // outer upper-arm
    ctx.lineTo(s * w * (0.44 + out), -h * (0.20 - drop));                                        // thin forearm, hangs long
    ctx.lineTo(s * w * (0.37 + out), -h * (0.20 - drop));                                        // hand (narrow)
    ctx.lineTo(s * w * (0.40 + out), -h * (0.44 - drop));                                        // inner forearm up to the elbow
    ctx.quadraticCurveTo(s * w * 0.40, -h * 0.62, s * w * 0.22, -h * 0.82);                      // inner-upper EDGE hugs the torso (gap only below elbow)
    ctx.closePath(); ctx.fill();
  }

  // Two cold specular eye-glints — drawn in HEAD-LOCAL coords (origin = head centre).
  // The single thing that makes a facing head "look at you": bright point sources are the
  // one value-break that punches through the heavy CCTV grain when every soft fill dies.
  // Deliberately asymmetric (right eye weaker + lower) so it reads uncanny, never cartoon.
  function eyeGlints(ctx, r, t, a) {
    if (r < 6) return;
    ctx.save();
    const ey = -r * 0.05, rad = Math.max(1.3, r * 0.12), cr = Math.max(0.8, rad * 0.5);   // size floor: stays catchable at patrol distance
    // recessed socket mass + a brow shelf above it (normal compositing, just darker)
    ctx.fillStyle = "rgba(2,4,7,0.5)";
    ctx.beginPath(); ctx.ellipse(0, ey, r * 0.62, r * 0.30, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    rr(ctx, -r * 0.62, ey - r * 0.26, r * 1.24, r * 0.16, r * 0.05); ctx.fill();
    // the catchlights — additive, OWN literal cold-white so they can never silently vanish
    const bl = t * 0.045 + a * 0.13, lid = (bl - Math.floor(bl)) < 0.018 ? 0 : 1;   // a slow ~0.4s blink every ~22s
    const gl = (0.5 + 0.12 * Math.sin(t * 0.6)) * lid;
    const j = Math.sin(t * 0.31) * r * 0.04;                    // ultra-slow drift (not per-frame)
    ctx.globalCompositeOperation = "lighter";
    for (const s of [-1, 1]) {
      const cx = s * r * 0.34 + a * r * 0.03, w = s > 0 ? 1 : 0.62, dy = s > 0 ? 0 : r * 0.14;  // one eye lower => head cocked, never a level "cute" pair
      const sc = s > 0 ? 1 : 0.82;
      ctx.fillStyle = "rgba(200,214,225," + (gl * w) + ")";
      ctx.beginPath(); ctx.arc(cx + j, ey + dy, rad * sc, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(235,245,255," + (0.9 * w * lid) + ")";
      ctx.beginPath(); ctx.arc(cx + j, ey + dy, cr * sc, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  // Motion driver — pure f(t,x). Replaces the old equal-everywhere sines with stillness
  // punctuated by a rare lateral twitch, and a breath that rises, HOLDS at the top, then
  // falls. Per-spawn phase (ph) desyncs feeds; safe at the engine's ~13fps.
  function figMotion(t, x, h, face) {
    const ph = x * 0.41 + Math.sin(x * 7.3);
    const idle = Math.sin(t * 0.45 + ph) * h * 0.0026;
    const PER = 5.5, cyc = t / PER + ph * 0.16, f = cyc - Math.floor(cyc);
    const sp = f < 0.09 ? Math.sin(f / 0.09 * Math.PI) * Math.exp(-f * 7) : 0;
    const twitch = sp * (Math.sin(x * 91.7) < 0 ? -1 : 1) * h * 0.018 * (face ? 0.45 : 1);
    const BR = face ? 9.0 : 6.0, bc = t / BR + ph * 0.07, bf = bc - Math.floor(bc);
    let amp = bf < 0.30 ? bf / 0.30 : bf < 0.78 ? 1 : 1 - (bf - 0.78) / 0.22;
    amp = amp * amp * (3 - 2 * amp);
    return { lateral: idle + twitch, breathe: 1 + amp * (face ? 0.006 : 0.009), bf: bf };
  }

  // ---------- THE figure ----------
  // The same silhouette appears in every PERSON anomaly, in every stream.
  // x = center, gy = ground y, h = height.
  // opts: {sway, seated, rim, color, rimColor, face}
  function fig(ctx, x, gy, h, t, opts) {
    opts = opts || {};
    const face = !!opts.face;
    const swayBase = (opts.sway === undefined ? 1 : opts.sway);
    // stable per-spawn asymmetry from x
    const a = Math.sin(x * 12.9898) * 0.5 + Math.sin(x * 4.1) * 0.5; // ~[-1,1]
    // motion: mostly still, breath that HOLDS at the top, a rare twitch (facing => stiller)
    const m = figMotion(t, x, h, face);
    const sway = swayBase * (face ? 0.16 : 1) * m.lateral;
    const breathe = m.breathe;
    // proportions: small head, long neck, high/narrow/asymmetric shoulders => human-but-WRONG
    const w = h * (face ? 0.34 : 0.30);
    const headR = h * 0.092;                              // smaller cranium
    const dropR = a * 0.03;                               // stable shoulder asymmetry (one rides higher)
    const shY = face ? 0.82 : 0.815;                      // shoulders ride high
    const tilt = (face ? 0.12 : 0) + a * 0.015;
    const col = opts.color || "#040506";

    ctx.save();
    ctx.translate(x + sway, gy);
    ctx.scale(1, breathe);
    // value-hole body: the torso punches BLACKER than any room black (a hole in the wall);
    // the crown keeps the caller value so the head still catches the rim / back light.
    const bg = ctx.createLinearGradient(0, -h, 0, 0);
    bg.addColorStop(0, col);
    bg.addColorStop(0.34, "#000002");
    bg.addColorStop(1, "#070809");
    ctx.fillStyle = bg;

    if (opts.seated) {
      const lean = a * 0.04;
      ctx.save(); ctx.rotate(lean);
      rr(ctx, -w * 0.55, -h * 0.6, w * 1.1, h * 0.6, w * 0.3); ctx.fill();
      // shoulder line
      ctx.beginPath();
      ctx.moveTo(-w * 0.52, -h * 0.5);
      ctx.quadraticCurveTo(-w * 0.30, -h * 0.66, 0, -h * 0.64);
      ctx.quadraticCurveTo(w * 0.30, -h * 0.66, w * 0.52, -h * 0.5);
      ctx.closePath(); ctx.fill();
      // neck (long throat)
      rr(ctx, -headR * 0.34, -h * 0.62 - headR * 0.7, headR * 0.68, headR * 1.15, headR * 0.2); ctx.fill();
      headEgg(ctx, 0, -h * 0.62 - headR * 1.30, headR);
      if (face && h >= 70) { ctx.save(); ctx.translate(0, -h * 0.62 - headR * 1.30); eyeGlints(ctx, headR, t, a); ctx.restore(); }
      ctx.restore();
    } else {
      const wallShows = h >= 45;
      // arms first (behind torso) when hanging; drawn after for face pose
      if (!face && wallShows) {
        armPath(ctx, -1, w, h, false, 0.0);
        armPath(ctx, 1, w, h, false, a * 0.05);
      }
      // legs forking from the pelvis with real negative space
      if (h >= 50) {
        const gap = w * 0.16, legTop = -h * 0.46;
        // left
        ctx.beginPath();
        ctx.moveTo(-w * 0.40, legTop);
        ctx.lineTo(-gap * 0.5, legTop);
        ctx.lineTo(-gap * 0.5 - w * 0.03, 0);
        ctx.lineTo(-w * 0.30, 0);
        ctx.closePath(); ctx.fill();
        // right
        ctx.beginPath();
        ctx.moveTo(w * 0.40, legTop);
        ctx.lineTo(gap * 0.5, legTop);
        ctx.lineTo(gap * 0.5 + w * 0.03, 0);
        ctx.lineTo(w * 0.30, 0);
        ctx.closePath(); ctx.fill();
      } else {
        rr(ctx, -w * 0.34, -h * 0.5, w * 0.68, h * 0.5, w * 0.18); ctx.fill();
      }
      // torso: hips in, ribs out, HIGH NARROW ASYMMETRIC shoulders, inverted-V crotch notch
      const gap = w * 0.16;
      ctx.beginPath();
      ctx.moveTo(-w * 0.40, -h * 0.50);
      ctx.lineTo(-w * 0.44, -h * 0.64);
      ctx.quadraticCurveTo(-w * 0.42, -h * 0.77, -w * 0.26, -h * (shY - 0.5 * Math.abs(dropR)));
      ctx.lineTo(w * 0.26, -h * (shY + dropR));
      ctx.quadraticCurveTo(w * 0.42, -h * (0.77 + dropR), w * 0.44, -h * 0.64);
      ctx.lineTo(w * 0.40, -h * 0.50);
      ctx.lineTo(gap * 0.5, -h * 0.455);
      ctx.lineTo(0, -h * 0.50);                          // crotch notch (points up)
      ctx.lineTo(-gap * 0.5, -h * 0.455);
      ctx.closePath(); ctx.fill();
      // arms in front when facing you (held a touch away from the body)
      if (face && h >= 45) {
        armPath(ctx, -1, w, h, true, 0.0);
        armPath(ctx, 1, w, h, true, a * 0.06);
      }
      // long flared neck into the high shoulders; small egg head perched low on top
      ctx.save();
      ctx.translate(a * w * 0.02, -h * shY);
      ctx.rotate(tilt);
      ctx.beginPath();                                   // trapezoid neck (long, flared throat)
      ctx.moveTo(-headR * 0.34, 0);
      ctx.lineTo(headR * 0.34, 0);
      ctx.lineTo(headR * 1.05, headR * 0.95);
      ctx.lineTo(-headR * 1.05, headR * 0.95);
      ctx.closePath(); ctx.fill();
      headEgg(ctx, 0, -headR * 0.78, headR);
      if (face && h >= 70) { ctx.save(); ctx.translate(0, -headR * 0.78); eyeGlints(ctx, headR, t, a); ctx.restore(); }
      ctx.restore();
    }

    // rim: head crown + a broken edge down one lit side
    if (opts.rim !== false) {
      const rc = opts.rimColor || "#9fb4bb";
      const hy = opts.seated ? -h * 0.62 - headR * 1.30 - headR * 0.5
                             : -h * shY - headR * 0.78 - headR;
      ctx.globalAlpha = face ? 0.18 : 0.11;
      ctx.strokeStyle = rc; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(Math.sin(tilt) * headR, hy + headR, headR * 0.94, -Math.PI * 0.58, -Math.PI * 0.08);  // flush to the skull edge (no floating halo)
      ctx.stroke();
      if (!opts.seated) {
        // broken bounce down the lit (right) side
        ctx.globalAlpha = face ? 0.10 : 0.07;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(w * 0.40, -h * 0.74);
        ctx.quadraticCurveTo(w * 0.52, -h * 0.55, w * 0.40, -h * 0.30);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  // ---------- glitch: shift random horizontal bands of the canvas ----------
  function bandGlitch(ctx, cv, intensity) {
    const n = 1 + Math.floor(intensity * 6);
    for (let i = 0; i < n; i++) {
      const y = (Math.random() * cv.height) | 0;
      const bh = 2 + ((Math.random() * 14 * intensity) | 0);
      const dx = ((Math.random() - 0.5) * 30 * intensity) | 0;
      if (!dx) continue;
      ctx.drawImage(cv, 0, y, cv.width, bh, dx, y, cv.width, bh);
    }
    if (intensity > 0.5 && Math.random() < 0.5) {
      ctx.save();
      ctx.globalAlpha = 0.12 * intensity;
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(cv, 2.5 * intensity, 0);
      ctx.restore();
    }
  }

  // ---------- in-feed camera OSD (encoder overlay, under the noise) ----------
  function camText(ctx, txt, x, y, opts) {
    opts = opts || {};
    const size = opts.size || 10;
    ctx.save();
    if (opts.jitter) x += (Math.random() - 0.5) * opts.jitter;
    ctx.font = size + "px Consolas, monospace";
    const tw = ctx.measureText(txt).width;
    const dotPad = opts.rec ? 14 : 0;
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(x - 4, y - size - 2, tw + 8 + dotPad, size + 7);
    ctx.fillStyle = opts.tint || "rgba(208,224,216,0.78)";
    ctx.fillText(txt, x, y);
    if (opts.rec) {
      const T = opts.t || 0;
      const on = opts.irregular
        ? (Math.sin(T * 3.1) + Math.sin(T * 1.7) > -0.2)
        : (Math.floor(T) % 2 === 0);
      if (on) {
        ctx.fillStyle = opts.recColor || "rgba(225,60,50,0.95)";
        ctx.beginPath(); ctx.arc(x + tw + 7, y - size * 0.32, 2.6, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------- per-camera hot pixels (every cheap sensor has them) ----------
  const hotCache = {};
  function hotPixels(ctx, w, h, seed, t) {
    if (!seed) return;
    if (!hotCache[seed]) {
      const rng = MQ.util.mulberry(seed * 7 + 13);
      hotCache[seed] = [
        { x: (rng() * w) | 0, y: (rng() * h * 0.85) | 0, hot: true },
        { x: (rng() * w) | 0, y: (rng() * h * 0.85) | 0, hot: true },
        { x: (rng() * w) | 0, y: (rng() * h * 0.85) | 0, hot: false }
      ];
    }
    const s = w / 640;
    hotCache[seed].forEach((p, i) => {
      if (p.hot) ctx.fillStyle = "rgba(235,245,255," + (0.18 + 0.22 * Math.abs(Math.sin(t * 11 + i * 2.4))) + ")";
      else ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(p.x, p.y, 1.4 * s, 1.4 * s);
    });
  }

  // ---------- per-camera color cast (each feed is a different cheap sensor) ----------
  const CAST = {
    11: "44,34,14",    // gasmart  — warm fluorescent green-amber
    22: "16,26,42",    // laundromat — cold
    33: "44,28,14",    // daycare — warm tungsten
    44: "22,30,46",    // office — cold blue (tightened toward the fleet mean)
    55: "38,30,16",    // warehouse — sodium (tightened toward the fleet mean)
    66: "34,28,18",    // lobby — tired incandescent
    77: "18,16,34",    // apartment — cold & faintly wrong
    999: "16,22,36"    // modcam
  };
  function colorCast(ctx, w, h, seed) {
    const c = CAST[seed]; if (!c) return;
    ctx.save();
    ctx.globalAlpha = seed === 77 ? 0.08 : 0.06;
    ctx.fillStyle = "rgb(" + c + ")";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // ---------- full post pass ----------
  // q: per-stream quality 0..1 (lower = noisier). glitch: 0..1 momentary.
  function fxPass(ctx, cv, q, glitch, t, seed) {
    const w = cv.width, h = cv.height, s = w / 640;
    if (glitch > 0.02) bandGlitch(ctx, cv, glitch);
    else if (Math.random() < 0.012) bandGlitch(ctx, cv, 0.18);

    // radial chromatic aberration: red pushes out one way, cyan the other, edges only
    if (!fxPass._mask || fxPass._mask.width !== w) {
      const m = document.createElement("canvas"); m.width = w; m.height = h;
      const mc = m.getContext("2d");
      const g = mc.createRadialGradient(w / 2, h / 2, h * 0.42, w / 2, h / 2, h * 0.95);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,1)");
      mc.fillStyle = g; mc.fillRect(0, 0, w, h);
      fxPass._mask = m;
      const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h; fxPass._split = tmp;
    }
    {
      // edge-only chromatic aberration: split on a temp, keep only the edge ring, then add
      const dx = 1.6 * s, tmp = fxPass._split, tc = tmp.getContext("2d");
      tc.globalCompositeOperation = "source-over"; tc.globalAlpha = 1; tc.clearRect(0, 0, w, h);
      tc.drawImage(cv, dx, 0); tc.globalAlpha = 0.8; tc.drawImage(cv, -dx, 0); tc.globalAlpha = 1;
      tc.globalCompositeOperation = "destination-in"; tc.drawImage(fxPass._mask, 0, 0);
      tc.globalCompositeOperation = "source-over";
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.06; ctx.drawImage(tmp, 0, 0); ctx.restore();
    }

    colorCast(ctx, w, h, seed);
    hotPixels(ctx, w, h, seed, t);
    drawNoise(ctx, w, h, (0.34 + (1 - q) * 0.22 + glitch * 0.4), "overlay");
    drawNoise(ctx, w, h, 0.04 + glitch * 0.08);          // faint source-over sparkle
    ctx.save();
    ctx.translate(0, Math.floor(t * 24) % 2);
    scanlines(ctx, w, h, 0.18);
    ctx.restore();
    vignette(ctx, w, h, 0.46);

    // rolling sync bar: dark leading edge, bright trailing edge, gentle drift
    const barH = 70 * s;
    const barY = ((t * 20) % (h + barH * 2)) - barH;
    const g = ctx.createLinearGradient(0, barY, 0, barY + barH);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.35, "rgba(0,0,0,0.05)");
    g.addColorStop(0.6, "rgba(255,255,255,0.055)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, barY, w, barH);
  }

  // chroma split helper — tints a copy and offsets it
  function drawSplit(ctx, cv, dx, op, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = alpha;
    ctx.drawImage(cv, dx, 0);
    ctx.globalAlpha = alpha * 0.8;
    ctx.drawImage(cv, -dx, 0);
    ctx.restore();
  }

  return {
    initNoise, drawNoise, scanlines, vignette, light, motes, rr, fig, eyeGlints, shadow,
    bandGlitch, camText, fxPass
  };
})();
