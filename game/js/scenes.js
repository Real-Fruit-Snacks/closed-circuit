// CLOSED CIRCUIT — scenes.js
// Every stream is drawn procedurally at 640x360. Anomalies are flags on a
// per-stream state object S (PERSON anomalies hold a stage number 1..3).
// Categories: PERSON, REMOVED, ADDED, MOVED, LIGHT, FEED
window.MQ = window.MQ || {};

MQ.scenes = (function () {
  const P = MQ.paint, U = MQ.util;
  const W = 640, H = 360;

  // ====================== art kit ======================
  function R(ctx, c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function L(ctx, c, x1, y1, x2, y2, lw) {
    ctx.strokeStyle = c; ctx.lineWidth = lw || 1;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  // lighten (f>0) / darken (f<0) a #rrggbb color
  function shade(c, f) {
    const n = parseInt(c.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")";
  }
  // pseudo-3D box: front face, lit top edge, dark right side
  function box(ctx, c, x, y, w, h) {
    R(ctx, c, x, y, w, h);
    R(ctx, shade(c, 0.13), x, y, w, Math.max(1.5, h * 0.05));
    R(ctx, shade(c, -0.3), x + w - Math.max(2, w * 0.07), y, Math.max(2, w * 0.07), h);
  }
  function hl(ctx, x, y, w, a) { R(ctx, "rgba(255,255,255," + a + ")", x, y, w, 1); }
  // window glass: vertical gradient + two faint diagonal reflections
  function glass(ctx, x, y, w, h, c1, c2) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.globalAlpha = 0.05; ctx.strokeStyle = "#cfe2f0"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + h); ctx.lineTo(x + w * 0.55, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w * 0.42, y + h); ctx.lineTo(x + w * 0.77, y); ctx.stroke();
    ctx.restore();
  }
  // light cone from a fixture — feathered (dim wide penumbra + bright tight core)
  function cone(ctx, x, yTop, yBase, topW, baseW, rgb, a) {
    for (let pass = 0; pass < 2; pass++) {
      const wide = pass === 0;
      const aa = wide ? a * 0.5 : a;
      const tw = topW * (wide ? 1.35 : 0.78), bw = baseW * (wide ? 1.3 : 0.66);
      const g = ctx.createLinearGradient(0, yTop, 0, yBase);
      g.addColorStop(0, "rgba(" + rgb + "," + aa + ")");
      g.addColorStop(1, "rgba(" + rgb + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - tw / 2, yTop); ctx.lineTo(x + tw / 2, yTop);
      ctx.lineTo(x + bw / 2, yBase); ctx.lineTo(x - bw / 2, yBase);
      ctx.closePath(); ctx.fill();
    }
  }
  // glow reflected on a glossy floor
  function refl(ctx, x, y, w, h, rgb, a) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "rgba(" + rgb + "," + a + ")");
    g.addColorStop(1, "rgba(" + rgb + ",0)");
    ctx.fillStyle = g; ctx.fillRect(x - w / 2, y, w, h);
  }
  // flat elliptical pool lying on the floor plane
  function pool(ctx, x, y, rx, ry, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 1, x, y, rx);
    g.addColorStop(0, "rgba(" + rgb + "," + a + ")");
    g.addColorStop(0.5, "rgba(" + rgb + "," + a * 0.4 + ")");
    g.addColorStop(1, "rgba(" + rgb + ",0)");
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rx, 0, 7); ctx.fill();
    ctx.restore();
  }
  // vertical surface grade: paint a lit-from-above gradient into a wall/floor rect
  function grade(ctx, x, y, w, h, top, bot) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }
  // recede the side walls so corners fall off
  function cornerVig(ctx, a) {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, "rgba(0,0,0," + a + ")");
    g.addColorStop(0.5, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0," + a + ")");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // squashed 5-point star (sits on a perspective floor)
  function star(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 5, a2 = a + Math.PI / 5;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.55);
      ctx.lineTo(cx + Math.cos(a2) * r * 0.45, cy + Math.sin(a2) * r * 0.45 * 0.55);
    }
    ctx.closePath(); ctx.fill();
  }
  // ambient occlusion straddling the wall/floor seam
  function ao(ctx, y, up, down, a) {
    let g = ctx.createLinearGradient(0, y - up, 0, y);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0," + a + ")");
    ctx.fillStyle = g; ctx.fillRect(0, y - up, W, up);
    g = ctx.createLinearGradient(0, y, 0, y + down);
    g.addColorStop(0, "rgba(0,0,0," + a + ")"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, y, W, down);
  }
  // brushed-metal / fabric vertical streaks
  function streaks(ctx, x, y, w, h, n, a, seed) {
    const rng = U.mulberry(seed || 1);
    ctx.save(); ctx.globalAlpha = a;
    for (let i = 0; i < n; i++) {
      const sx = x + rng() * w;
      L(ctx, rng() < 0.5 ? "#ffffff" : "#000000", sx, y, sx, y + h, 1);
    }
    ctx.restore();
  }
  // swivel chair, the office kind
  function officeChair(ctx, c, x, y, rot) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.fillStyle = c; P.rr(ctx, -15, -56, 30, 31, 5); ctx.fill();     // tall contoured backrest
    hl(ctx, -13, -55, 26, 0.10);
    L(ctx, shade(c, -0.28), 0, -54, 0, -30, 1.2);                       // centre seam
    L(ctx, shade(c, 0.1), -15, -42, 15, -42, 1.2);                      // lumbar line
    ctx.fillStyle = shade(c, 0.12); P.rr(ctx, -17, -28, 34, 9, 3); ctx.fill();   // seat cushion
    hl(ctx, -15, -28, 30, 0.10);
    L(ctx, shade(c, -0.28), 0, -19, 0, -5, 4);                          // gas lift
    [[-16, 1], [-8, 3], [0, 4], [8, 3], [16, 1]].forEach(p => L(ctx, shade(c, -0.28), 0, -5, p[0], p[1], 2.4)); // 5-star base
    ctx.fillStyle = shade(c, 0.1);
    [[-16, 1], [-8, 3], [0, 4], [8, 3], [16, 1]].forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1] + 1, 1.9, 0, 7); ctx.fill(); }); // casters
    ctx.restore();
  }
  // over-ear headphones seen from behind — the strongest "person at a desk" cue.
  // Two-pass: a band that sits ON the skull (darker base + lit-side highlight) and
  // cups that ride PROUD of the cranium. r = head radius; opts.rimColor = monitor tint.
  // (legacy 5th arg may be a colour string.)
  function headphones(ctx, x, cy, r, opts) {
    opts = typeof opts === "string" ? { base: opts } : (opts || {});
    const base = opts.base || "#10151f";
    const rim = opts.rimColor || "rgba(74,100,136,0.55)";
    const lw = Math.max(3, r * 0.26);
    ctx.save(); ctx.lineCap = "round";
    ctx.strokeStyle = base; ctx.lineWidth = lw;                                   // band base, darker than the head
    ctx.beginPath(); ctx.arc(x, cy, r * 1.15, -Math.PI * 0.84, -Math.PI * 0.16); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = Math.max(1, r * 0.06);   // underside shade -> round bar
    ctx.beginPath(); ctx.arc(x, cy + 1, r * 1.15, -Math.PI * 0.78, -Math.PI * 0.22); ctx.stroke();
    ctx.strokeStyle = rim; ctx.lineWidth = Math.max(1.4, lw - 2);                 // highlight on the lit (+x) quarter only
    ctx.beginPath(); ctx.arc(x, cy, r * 1.15, -Math.PI * 0.42, -Math.PI * 0.16); ctx.stroke();
    ctx.restore();
    const cupW = r * 0.5, cupH = r * 0.95, cupY = cy - r * 0.1;
    ctx.fillStyle = "#12171f"; P.rr(ctx, x - r * 1.4, cupY, cupW, cupH, r * 0.18); ctx.fill();   // shadow cup (off pure black so it reads)
    R(ctx, "rgba(40,55,80,0.4)", x - r * 1.4, cupY + 2, 1.4, cupH - 4);                           // shadow-cup outer edge -> both cups bracket the head
    ctx.fillStyle = "#16222f"; P.rr(ctx, x + r * 0.9, cupY, cupW, cupH, r * 0.18); ctx.fill();   // lit cup
    R(ctx, "rgba(90,119,152,0.55)", x + r * 0.9 + cupW - 1.4, cupY + 2, 1.4, cupH - 4);           // lit-cup outer edge
  }

  // analog wall-clock hands set to the SHIFT TIME (tMin = game minutes since midnight),
  // so a room's clock reads the same time the camera's timestamp shows.
  function clockHands(ctx, cx, cy, tMin, r, color) {
    tMin = tMin || 0;
    const ha = (((tMin / 60) % 12) / 12) * Math.PI * 2;   // hour hand (includes minute creep)
    const ma = ((tMin % 60) / 60) * Math.PI * 2;          // minute hand
    ctx.strokeStyle = color; ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1.3, r * 0.16);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(ha) * r * 0.5, cy - Math.cos(ha) * r * 0.5); ctx.stroke();
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(ma) * r * 0.82, cy - Math.cos(ma) * r * 0.82); ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.9, r * 0.1), 0, 7); ctx.fill();   // hub
  }

  // a whole wall clock: bezel, face, 12 hour ticks, time-set hands, glass catch-light.
  function wallClock(ctx, cx, cy, r, tMin, faceCol, handCol) {
    ctx.fillStyle = "#0a0e12"; ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, 7); ctx.fill();       // bezel
    ctx.fillStyle = faceCol; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();              // face
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
    for (let i = 0; i < 12; i++) {                                                               // hour ticks
      const a = i * Math.PI / 6, major = i % 3 === 0;
      const r1 = r * (major ? 0.72 : 0.82), r2 = r * 0.93;
      ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = major ? 1.7 : 0.8;
      ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1); ctx.lineTo(cx + Math.sin(a) * r2, cy - Math.cos(a) * r2); ctx.stroke();
    }
    clockHands(ctx, cx, cy, tMin, r, handCol);
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1.4;                             // glass catch-light
    ctx.beginPath(); ctx.arc(cx, cy, r - 1.5, Math.PI * 1.04, Math.PI * 1.5); ctx.stroke();
  }

  // ======================================================================
  // S1 — GasMart #2241 (gas station interior)
  // ======================================================================
  const gasmart = {
    id: "strm_2241", title: "GasMart #2241", src: "merchant cam",
    reason: "AUTO-ALERT: motion after hours", q: 0.78, seed: 11, tiltDir: -1,
    decor(rng) {
      const PRODUCT = ["#36443a", "#46382c", "#2e3e4c", "#6a2a26", "#7a6230", "#384a44"];
      const items = [];
      for (let s = 0; s < 2; s++)
        for (let row = 0; row < 4; row++)
          for (let i = 0; i < 7; i++)
            items.push({
              g: s, x: 244 + s * 86 + i * 11, row,
              w: 10, h: 13 + rng() * 7,
              c: PRODUCT[(rng() * PRODUCT.length) | 0],
              type: rng() < 0.3 ? "bottle" : rng() < 0.55 ? "can" : "box"
            });
      const BAND = ["#7a3a32", "#3a5a7a", "#7a6a32", "#4a7a4a", "#6a4a7a"];
      const cigs = [];
      for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++)
        cigs.push({ x: 52 + i * 20, y: 112 + r * 24, band: BAND[(rng() * BAND.length) | 0] });
      const scuffs = [];
      for (let i = 0; i < 8; i++) scuffs.push({ x: 60 + rng() * 520, y: 308 + rng() * 44, r: 6 + rng() * 14 });
      return { items, cigs, scuffs };
    },
    draw(ctx, S, t, world, d) {
      R(ctx, "#05070a", 0, 0, W, H);
      grade(ctx, 0, 40, W, 262, "#1a2419", "#0c120d");  // back wall, lit from above
      grade(ctx, 0, 302, W, 58, "#161c16", "#0c100d");  // floor
      // ceiling: panel grid + fixture
      R(ctx, "#0a0e0a", 0, 24, W, 16);
      for (let i = 0; i < 8; i++) L(ctx, "#080c08", 20 + i * 84, 24, 20 + i * 84, 40, 1);
      const la = S.lightsDim ? 0.09 : 0.26;
      R(ctx, S.lightsDim ? "#1a201a" : "#36443a", 250, 32, 140, 7);
      hl(ctx, 250, 32, 140, S.lightsDim ? 0.04 : 0.14);
      // soft fixture wash baked into the wall, then a hotter core
      if (!S.lightsDim) P.light(ctx, 320, 58, 230, "54,68,52", 0.45);
      P.light(ctx, 320, 56, 240, "170,190,150", la * 0.78);
      P.light(ctx, 150, 64, 168, "170,190,150", la * 0.6);
      // wall paneling seams + receding corners
      for (let i = 0; i < 5; i++) L(ctx, "rgba(0,0,0,0.12)", 40 + i * 140, 44, 40 + i * 140, 298, 1);
      cornerVig(ctx, 0.16);
      ao(ctx, 302, 26, 14, 0.26);
      // floor: tile seams converging + warm light spill + wax sheen
      for (let i = 0; i < 8; i++) L(ctx, "rgba(255,255,255,0.05)", 30 + i * 84, 302, 10 + i * 92, 360, 1);
      pool(ctx, 320, 322, 230, 30, "150,170,115", 0.05);
      pool(ctx, 150, 324, 150, 24, "150,170,115", 0.03);
      L(ctx, "rgba(170,190,160,0.05)", 0, 322, W, 322, 2);
      ctx.save(); ctx.globalAlpha = 0.07; ctx.fillStyle = "#000";
      d.scuffs.forEach(s => { ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * 0.3, 0, 0, 7); ctx.fill(); });
      ctx.restore();
      // wall clock — bigger, centred on the back wall under the light; reads the shift time
      wallClock(ctx, 320, 80, 17, world.tMin, "#2c382f", "#a8baac");
      // cigarette rack: shelf lips + branded packs (each carton shaded as a 3D box)
      box(ctx, "#080d0a", 44, 104, 132, 84);
      d.cigs.forEach((c, i) => {
        const body = i % 3 === 0 ? "#30372f" : i % 3 === 1 ? "#262c27" : "#2c322d";
        R(ctx, body, c.x, c.y, 14, 16);
        R(ctx, c.band, c.x, c.y, 14, 4);
        L(ctx, "rgba(0,0,0,0.4)", c.x, c.y + 4, c.x + 14, c.y + 4, 1);   // cellophane seam
        L(ctx, "rgba(255,255,255,0.06)", c.x, c.y, c.x, c.y + 16, 1);
        L(ctx, "rgba(0,0,0,0.32)", c.x + 13, c.y, c.x + 13, c.y + 16, 1);
      });
      for (let r = 0; r < 3; r++) { R(ctx, "#161c17", 44, 128 + r * 24, 132, 3); hl(ctx, 44, 128 + r * 24, 132, 0.05); }
      // counter: wood-grain front, worn top
      P.shadow(ctx, 118, 307, 95, 6, 0.3);
      box(ctx, "#11181b", 30, 229, 175, 75);
      for (let i = 0; i < 5; i++) L(ctx, "rgba(0,0,0,0.18)", 38, 242 + i * 12, 198, 244 + i * 12, 1);
      R(ctx, "#202b2c", 30, 215, 175, 14);
      hl(ctx, 30, 215, 175, 0.10);
      if (!S.registerGone) {
        box(ctx, "#27333a", 120, 183, 36, 32);
        R(ctx, "#3f5a58", 124, 187, 19, 13);            // screen
        hl(ctx, 124, 187, 19, 0.18);
        for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++)
          R(ctx, "#1b2429", 124 + c * 5, 203 + r * 5, 3.6, 3.6);  // keypad
        P.light(ctx, 133, 193, 26, "120,200,190", 0.12);
      }
      // gondola shelves: end caps, shelf strips, typed products
      for (let s = 0; s < 2; s++) {
        const x0 = 240 + s * 86;
        P.shadow(ctx, x0 + 40, 297, 46, 5, 0.28);
        box(ctx, "#222a1e", x0 - 3, 166, 6, 134);        // end cap — head-height gondola
        box(ctx, "#222a1e", x0 + 77, 166, 6, 134);
        R(ctx, "#27301f", x0 - 3, 166, 86, 6);            // top cap
        hl(ctx, x0 - 3, 166, 86, 0.08);
        for (let row = 0; row < 4; row++) {
          R(ctx, "#2a3322", x0 + 2, 198 + row * 33, 76, 4);
          hl(ctx, x0 + 2, 198 + row * 33, 76, 0.08);
          R(ctx, "#cfd8c0", x0 + 2, 202 + row * 33, 76, 1.2); // price strip
          ctx.save(); ctx.globalAlpha = 0.12; R(ctx, "#000", x0 + 2, 202 + row * 33, 76, 1.2); ctx.restore();
        }
      }
      d.items.forEach(it => {
        if (S.shelfEmpty && it.g === 0) return;
        const shelfY = 198 + it.row * 33, y = shelfY - it.h;
        R(ctx, "rgba(0,0,0,0.4)", it.x - 0.5, shelfY - 2, it.w + 1, 2);   // contact shadow
        if (it.type === "bottle") {
          const g = ctx.createLinearGradient(it.x + 1, 0, it.x + 6.5, 0);
          g.addColorStop(0, shade(it.c, -0.35)); g.addColorStop(0.4, shade(it.c, 0.2)); g.addColorStop(1, shade(it.c, -0.28));
          ctx.fillStyle = g; ctx.fillRect(it.x + 1.5, y + 3, 5, it.h - 3);
          R(ctx, it.c, it.x + 2.5, y, 3, 4);
          R(ctx, shade(it.c, 0.35), it.x + 2.5, y - 1.5, 3, 2);            // cap
          R(ctx, "rgba(255,255,255,0.25)", it.x + 2, y + 4, 1, 2);        // shoulder spec
        } else if (it.type === "can") {
          const g = ctx.createLinearGradient(it.x, 0, it.x + it.w, 0);
          g.addColorStop(0, shade(it.c, -0.35)); g.addColorStop(0.38, shade(it.c, 0.24)); g.addColorStop(1, shade(it.c, -0.32));
          ctx.fillStyle = g; ctx.fillRect(it.x, y + 2, it.w, it.h - 2);
          R(ctx, shade(it.c, 0.24), it.x, y + 2, it.w, 1.5);
        } else {
          R(ctx, it.c, it.x, y, it.w, it.h);
          R(ctx, shade(it.c, 0.14), it.x, y, it.w, 2);
          L(ctx, "rgba(0,0,0,0.35)", it.x + it.w, y, it.x + it.w, y + it.h, 1);
        }
      });
      if (S.shelfEmpty) { // dust ghosts where product was
        ctx.save(); ctx.globalAlpha = 0.05; ctx.fillStyle = "#fff";
        for (let row = 0; row < 4; row++) R(ctx, "#fff", 246, 194 + row * 33, 70, 4);
        ctx.restore();
      }
      // mop bucket: a yellow janitor's bucket — wringer, casters, a mop leaning out of it
      const bx = S.bucketMoved ? 120 : 430;
      P.shadow(ctx, bx + 17, 334, 24, 4, 0.34);
      L(ctx, "#7a6a38", bx + 12, 302, bx - 18, 244, 3);                    // mop handle (head soaking down in the bucket)
      const mbg = ctx.createLinearGradient(bx, 0, bx + 34, 0);             // bright yellow tub
      mbg.addColorStop(0, "#9c8420"); mbg.addColorStop(0.5, "#caa82c"); mbg.addColorStop(1, "#8a741c");
      ctx.fillStyle = mbg; ctx.beginPath();
      ctx.moveTo(bx, 302); ctx.lineTo(bx + 34, 302); ctx.lineTo(bx + 30, 332); ctx.lineTo(bx + 4, 332); ctx.closePath(); ctx.fill();
      R(ctx, "#d8b836", bx, 301, 34, 3);                                   // rim
      ctx.fillStyle = "#2c3327"; ctx.beginPath(); ctx.ellipse(bx + 17, 302, 15, 3.4, 0, 0, 7); ctx.fill(); // dirty water
      ctx.fillStyle = "rgba(150,170,130,0.16)"; ctx.beginPath(); ctx.ellipse(bx + 13, 301.5, 6, 1.4, 0, 0, 7); ctx.fill();
      box(ctx, "#7c6a22", bx + 26, 286, 13, 18); R(ctx, "#9c8a32", bx + 26, 286, 13, 3);   // side wringer press
      L(ctx, "#5a4e18", bx + 32, 280, bx + 39, 290, 2);                    // wringer handle
      ctx.fillStyle = "#14140f"; ctx.beginPath(); ctx.arc(bx + 7, 333, 3.2, 0, 7); ctx.arc(bx + 27, 333, 3.2, 0, 7); ctx.fill(); // casters
      // window + door, right — full-height storefront glass reaching the floor
      glass(ctx, 470, 70, 150, 233, "#101e2c", "#0a141e");
      // outside: canopy with lit underside, two pumps with hoses
      R(ctx, "#243646", 482, 96, 126, 24);
      R(ctx, "#3c5a72", 482, 117, 126, 3); hl(ctx, 482, 117, 126, 0.2);
      P.light(ctx, 545, 112, 96, "130,180,230", 0.22);
      R(ctx, "#1a2832", 492, 120, 6, 84); R(ctx, "#1a2832", 592, 120, 6, 84);
      [510, 548].forEach(px => {
        box(ctx, "#22303e", px, 176, 18, 50);
        R(ctx, "#2e4254", px + 3, 181, 12, 9);          // pump screen
        L(ctx, "#16222c", px + 16, 188, px + 22, 202, 2); // hose
        R(ctx, "#18242e", px + 2, 226, 14, 5);          // base
      });
      // gas price sign
      R(ctx, "#0e1a24", 586, 132, 22, 30);
      ctx.fillStyle = "#7fb0d8"; ctx.font = "8px Consolas, monospace";
      ctx.fillText("3.49", 588, 145); ctx.fillText("3.89", 588, 156);
      // glow spills onto the store floor
      refl(ctx, 545, 302, 130, 34, "120,170,220", 0.07);
      // window frame + door
      L(ctx, "#243440", 470, 70, 470, 303, 3); L(ctx, "#243440", 620, 70, 620, 303, 3);
      L(ctx, "#243440", 470, 70, 620, 70, 3); L(ctx, "#243440", 470, 303, 620, 303, 3);
      L(ctx, "#1c2a34", 545, 70, 545, 303, 2); L(ctx, "#1c2a34", 558, 70, 558, 303, 2);  // door is the right pane (558–620)
      R(ctx, "#2c3e4c", 560, 196, 36, 5); hl(ctx, 560, 196, 36, 0.12);   // push bar
      R(ctx, "#1a262e", 558, 299, 62, 5);                                 // door threshold, on the floor
      // ANOMALY: a figure standing out by the pumps, in the dark, watching the store.
      // PERSON event — it appears, lingers a while, then is gone (no in-store loom).
      if (S.figOutside) {
        P.shadow(ctx, 528, 232, 13, 3, 0.3);
        P.fig(ctx, 528, 232, 58, t, { color: "#080c14", rim: true, rimColor: "#b4cae0", sway: 0.22 });
      }
      // neon OPEN sign: tube + glow
      ctx.font = "11px Consolas, monospace";
      ctx.fillStyle = "rgba(255,90,70,0.9)";
      ctx.fillText("OPEN", 490, 92);
      ctx.strokeStyle = "rgba(255,120,90,0.35)"; ctx.lineWidth = 3;
      ctx.strokeText("OPEN", 490, 92);
      P.light(ctx, 503, 88, 30, "255,80,60", 0.22);
    },
    anomalies: [
      { key: "figOutside",  cat: "PERSON",  label: "figure out by the pumps" },
      { key: "registerGone",cat: "REMOVED", label: "register missing" },
      { key: "bucketMoved", cat: "MOVED",   label: "mop bucket moved" },
      { key: "shelfEmpty",  cat: "REMOVED", label: "shelf emptied" },
      { key: "lightsDim",   cat: "LIGHT",   label: "lights dimmed" },
      { key: "camTilt",     cat: "FEED",    label: "camera tilted" }
    ]
  };

  // ======================================================================
  // S2 — SUDS-24 (laundromat)
  // ======================================================================
  const laundromat = {
    id: "strm_0907", title: "SUDS-24 Laundry", src: "merchant cam",
    reason: "AUTO-ALERT: door sensor fault", q: 0.72, seed: 22, tiltDir: 1,
    decor(rng) {
      const JUG = ["#26424e", "#3e4a2c", "#46303a", "#2e3a52"];
      const jugs = [];
      for (let i = 0; i < 9; i++) jugs.push({
        x: 306 + i * 30, h: 15 + rng() * 6,
        c: JUG[(rng() * JUG.length) | 0], cap: rng() < 0.5 ? "#cfd2c8" : "#b8a44a"
      });
      const leds = [];
      for (let i = 0; i < 4; i++) leds.push(rng() * 6);
      return { jugs, leds };
    },
    draw(ctx, S, t, world, d) {
      R(ctx, "#04070a", 0, 0, W, H);
      grade(ctx, 0, 50, W, 250, "#16202a", "#0a1016");   // wall, lit from above
      grade(ctx, 0, 300, W, 60, "#121922", "#080c11");   // floor
      // signature checkerboard — brighter so it survives the post pass, sheared back
      ctx.save();
      for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++)
        if ((r + c) % 2 === 0) {
          ctx.fillStyle = "rgba(148,176,196," + (0.06 + r * 0.018) + ")";
          ctx.fillRect(c * 56 + r * 10, 300 + r * 20, 50, 20);
        }
      ctx.restore();
      cornerVig(ctx, 0.15);
      ao(ctx, 300, 22, 14, 0.26);
      // dead strip light + emergency lamp
      R(ctx, "#141c22", 230, 40, 180, 6);
      R(ctx, "#1a3a26", 416, 42, 8, 5);
      P.light(ctx, 420, 45, 18, "80,220,120", 0.10 + 0.04 * Math.sin(t * 2.2));
      P.light(ctx, 300, 60, 260, "150,190,200", 0.16);
      // hanging sign: neon
      R(ctx, "#0e1822", 224, 56, 100, 24);
      L(ctx, "#1c2a36", 224, 56, 224, 50, 1.5); L(ctx, "#1c2a36", 324, 56, 324, 50, 1.5);
      ctx.font = "12px Consolas, monospace";
      ctx.fillStyle = "rgba(110,200,225,0.95)"; ctx.fillText("SUDS-24", 248, 72);
      ctx.strokeStyle = "rgba(110,200,225,0.3)"; ctx.lineWidth = 3; ctx.strokeText("SUDS-24", 248, 72);
      P.light(ctx, 274, 68, 44, "110,200,225", 0.16);
      // front window, left
      glass(ctx, 28, 62, 124, 138, "#0b1622", "#070e16");
      if (!S.streetOff) {
        L(ctx, "#2e404a", 88, 78, 88, 152, 2.5);        // pole
        L(ctx, "#2e404a", 88, 78, 102, 82, 2);          // arm
        R(ctx, "#cfd8b0", 100, 80, 6, 3);               // head
        cone(ctx, 103, 84, 150, 8, 56, "200,210,160", 0.14);
        P.motes(ctx, 103, 90, 150, 24, t, "210,220,170", 5);
        P.light(ctx, 103, 83, 30, "210,220,170", 0.4);
        pool(ctx, 96, 150, 48, 14, "190,200,160", 0.07);
        refl(ctx, 96, 300, 70, 26, "190,200,160", 0.05);
      } else {
        R(ctx, "#05080b", 30, 64, 120, 134);
      }
      // ANOMALY: a car parked across the street with someone sitting in it, watching.
      // PERSON event — it pulls up, sits a while, then is gone (the car is NOT always there).
      if (S.carFig) {
        const cbg = ctx.createLinearGradient(40, 0, 110, 0);        // body catches the cold streetlamp
        cbg.addColorStop(0, "#10171f"); cbg.addColorStop(0.5, "#1c2632"); cbg.addColorStop(1, "#0e151d");
        ctx.fillStyle = cbg;
        P.rr(ctx, 40, 150, 70, 20, 7); ctx.fill();                  // body
        P.rr(ctx, 54, 136, 44, 18, 7); ctx.fill();                  // cabin / roof
        R(ctx, "rgba(150,172,205,0.20)", 56, 137, 40, 2);           // roofline highlight
        R(ctx, "rgba(150,172,205,0.12)", 42, 151, 66, 2);           // hood highlight
        R(ctx, "#0c141d", 60, 140, 34, 12);                         // windscreen glass
        L(ctx, "rgba(150,172,205,0.18)", 62, 141, 92, 141, 1);      // windscreen top glint
        L(ctx, "#222d39", 76, 138, 76, 152, 1);                     // door pillar
        ctx.fillStyle = "#05080c";
        ctx.beginPath(); ctx.arc(52, 170, 4.5, 0, 7); ctx.arc(98, 170, 4.5, 0, 7); ctx.fill();  // wheels
        ctx.fillStyle = "#04070c";                                  // figure in the driver's seat
        ctx.beginPath(); ctx.ellipse(72, 145, 4, 5, 0, 0, 7); ctx.fill();
        R(ctx, "#04070c", 66, 149, 14, 4);
        ctx.save(); ctx.globalCompositeOperation = "lighter";       // two cold eyes catching the streetlamp
        ctx.fillStyle = "rgba(205,218,228,0.75)"; ctx.beginPath(); ctx.arc(70.5, 144, 0.95, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(205,218,228,0.55)"; ctx.beginPath(); ctx.arc(74, 144.4, 0.85, 0, 7); ctx.fill();
        ctx.restore();
      }
      L(ctx, "#22323c", 28, 62, 152, 62, 3); L(ctx, "#22323c", 28, 200, 152, 200, 3);
      L(ctx, "#22323c", 28, 62, 28, 200, 3); L(ctx, "#22323c", 152, 62, 152, 200, 3);
      L(ctx, "#18242e", 90, 62, 90, 200, 1);
      // detergent shelf: jugs with caps + labels (spread left to balance the frame)
      R(ctx, "#1a242c", 296, 122, 304, 4); hl(ctx, 296, 122, 304, 0.08);
      L(ctx, "#11181f", 300, 126, 300, 132, 1); L(ctx, "#11181f", 596, 126, 596, 132, 1);
      d.jugs.forEach(j => {
        const y = 122 - j.h;
        box(ctx, j.c, j.x, y, 13, j.h);
        R(ctx, j.cap, j.x + 3.5, y - 3, 6, 3.5);
        R(ctx, shade(j.c, 0.25), j.x + 2, y + j.h * 0.35, 9, j.h * 0.3); // label
      });
      // washers: brushed metal, control panels, round doors
      for (let i = 0; i < 4; i++) {
        const x = 300 + i * 78;
        const cy = 250;                                          // door centre — short, full-width front loader
        P.shadow(ctx, x + 31, 297, 35, 5, 0.3);
        const wg = ctx.createLinearGradient(x, 0, x + 62, 0);    // rolled stainless form
        wg.addColorStop(0, "#11181f"); wg.addColorStop(0.4, "#222e3a");
        wg.addColorStop(0.72, "#19232c"); wg.addColorStop(1, "#0f161d");
        ctx.fillStyle = wg; P.rr(ctx, x, 198, 62, 98, 5); ctx.fill();
        hl(ctx, x + 3, 199, 56, 0.14);
        R(ctx, "rgba(190,210,230,0.10)", x + 16, 202, 6, 90);   // specular highlight band
        R(ctx, "#10161d", x + 54, 202, 6, 90);
        streaks(ctx, x + 3, 208, 50, 82, 5, 0.05, 22 + i);
        // control strip: knobs + LED
        R(ctx, "#0d1218", x + 4, 203, 54, 14);
        ctx.fillStyle = "#2c3a46";
        ctx.beginPath(); ctx.arc(x + 14, 210, 3.4, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 26, 210, 3.4, 0, 7); ctx.fill();
        hl(ctx, x + 11, 207, 6, 0.1);
        const ledOn = Math.sin(t * 1.3 + d.leds[i]) > (i === 2 ? -0.3 : 2); // only #3 blinks
        ctx.fillStyle = ledOn ? "#7fd890" : "#1c2a22";
        ctx.fillRect(x + 46, 208, 4, 3);
        if (ledOn) P.light(ctx, x + 48, 209, 10, "120,230,140", 0.25);
        // door: metallic ring + glass (round)
        ctx.strokeStyle = "#33424e"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(x + 31, cy, 17, 0, 7); ctx.stroke();
        ctx.strokeStyle = "#54707e"; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x + 31, cy, 19.2, -2.4, -0.7); ctx.stroke(); // ring glint
        ctx.strokeStyle = "rgba(230,245,255,0.4)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x + 31, cy, 18, -2.5, -2.0); ctx.stroke();   // chrome hotspot
        ctx.fillStyle = (S.drumLit && i === 1) ? "#e8dfae" : "#080d12";
        ctx.beginPath(); ctx.arc(x + 31, cy, 13.5, 0, 7); ctx.fill();
        if (S.drumLit && i === 1) {
          ctx.fillStyle = "rgba(120,90,40,0.5)";
          for (let hr = 0; hr < 3; hr++) for (let hc = 0; hc < 3; hc++) {
            ctx.beginPath(); ctx.arc(x + 24 + hc * 7, cy - 7 + hr * 7, 1.3, 0, 7); ctx.fill();
          }
          P.light(ctx, x + 31, cy, 52, "210,230,160", 0.32);
          refl(ctx, x + 31, 296, 56, 28, "210,230,160", 0.10);
        } else {
          ctx.strokeStyle = "rgba(180,210,230,0.10)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x + 26, cy - 4, 8, -2.6, -1.2); ctx.stroke();  // glass curve
        }
        R(ctx, "#222e38", x + 24, cy + 18, 14, 3);          // handle
      }
      // folding table
      P.shadow(ctx, 235, 302, 62, 5, 0.28);
      R(ctx, "#202c36", 170, 248, 130, 8); hl(ctx, 170, 248, 130, 0.12);
      R(ctx, "#141d26", 178, 256, 5, 44); R(ctx, "#141d26", 287, 256, 5, 44);
      R(ctx, "#0e151c", 176, 299, 9, 3); R(ctx, "#0e151c", 285, 299, 9, 3);
      if (!S.basketGone) {
        box(ctx, "#2c3a44", 206, 226, 44, 22);
        for (let i = 0; i < 4; i++) L(ctx, "#1a262e", 211 + i * 10, 227, 215 + i * 10, 247, 1.4);
        R(ctx, "#3c3128", 214, 222, 18, 6);             // clothes lump
        R(ctx, "#46343c", 226, 220, 12, 7);
      }
      // chairs: plastic shells on metal legs
      for (let i = 0; i < 3; i++) {
        if (S.chairMoved && i === 1) continue;
        const x = 44 + i * 40;
        ctx.fillStyle = "#26313c";
        P.rr(ctx, x - 1, 264, 24, 7, 2.5); ctx.fill();
        hl(ctx, x + 1, 264, 19, 0.1);
        P.rr(ctx, x - 1, 240, 5, 26, 2); ctx.fill();
        L(ctx, "#19222b", x + 2, 271, x, 299, 2); L(ctx, "#19222b", x + 19, 271, x + 21, 299, 2);
      }
      if (S.chairMoved) {
        ctx.save(); ctx.translate(222, 300); ctx.rotate(0.45);
        ctx.fillStyle = "#26313c";
        P.rr(ctx, -12, -32, 24, 7, 2.5); ctx.fill();
        P.rr(ctx, -12, -56, 5, 26, 2); ctx.fill();
        L(ctx, "#19222b", -9, -25, -11, 0, 2); L(ctx, "#19222b", 8, -25, 10, 0, 2);
        ctx.restore();
      }
      // wall clock — on the open wall left of the sign; reads the shift time (pale ghost when removed)
      if (!S.clockGone) {
        wallClock(ctx, 235, 126, 16, world.tMin, "#28343e", "#a2bac6");
      } else {
        ctx.fillStyle = "#141d24"; ctx.beginPath(); ctx.arc(235, 126, 18, 0, 7); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(235, 126, 18, 0, 7); ctx.stroke();
      }
    },
    anomalies: [
      { key: "carFig",     cat: "PERSON",  label: "a car parked outside, someone in it" },
      { key: "drumLit",    cat: "LIGHT",   label: "washer drum light on" },
      { key: "basketGone", cat: "REMOVED", label: "laundry basket missing" },
      { key: "chairMoved", cat: "MOVED",   label: "chair moved to the floor" },
      { key: "streetOff",  cat: "LIGHT",   label: "streetlight out" },
      { key: "clockGone",  cat: "REMOVED", label: "wall clock missing" },
      { key: "camZoom",    cat: "FEED",    label: "camera zoomed in" }
    ]
  };

  // ======================================================================
  // S3 — Little Sprouts (daycare playroom, after hours)
  // ======================================================================
  const daycare = {
    id: "strm_5512", title: "Little Sprouts Daycare", src: "interior cam",
    reason: "MOTION ALERT x3", q: 0.8, seed: 33, tiltDir: 1,
    decor(rng) {
      const BIN = ["#4a3a2e", "#34453c", "#43343f", "#45422f"];   // faded plastic under tungsten
      const cubby = [];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
        if (rng() < 0.78) cubby.push({ r, c, c2: BIN[(rng() * BIN.length) | 0], h: 12 + rng() * 8 });
      const scrib = [];
      for (let p = 0; p < 4; p++) scrib.push({ kind: (rng() * 3) | 0, hue: ["#8a5a42", "#42688a", "#6a8a42"][(rng() * 3) | 0] });
      return { cubby, scrib };
    },
    draw(ctx, S, t, world, d) {
      R(ctx, "#070506", 0, 0, W, H);
      grade(ctx, 0, 48, W, 252, "#211820", "#0d0a0b");   // warm wall, lit from above
      grade(ctx, 0, 300, W, 60, "#14100e", "#0a0807");   // floor
      P.light(ctx, 260, 70, 230, "120,90,58", 0.42);     // baked tungsten wash
      P.light(ctx, 260, 76, 220, "200,170,140", 0.1);
      cornerVig(ctx, 0.18);
      ao(ctx, 300, 22, 14, 0.26);
      // wainscot + alphabet strip
      L(ctx, "rgba(255,255,255,0.04)", 0, 240, W, 240, 2);
      ctx.font = "9px Consolas, monospace"; ctx.fillStyle = "rgba(220,200,180,0.16)";
      "A B C D E F G".split(" ").forEach((ch, i) => ctx.fillText(ch, 180 + i * 30, 62));
      // height chart by the door
      R(ctx, "#241c16", 532, 150, 9, 130);
      for (let i = 0; i < 7; i++) L(ctx, "#3c3026", 532, 160 + i * 18, 537, 160 + i * 18, 1);
      // play rug: clearly out-values the floor, concentric coloured rings + stars
      ctx.fillStyle = "#2d1e23"; ctx.beginPath(); ctx.ellipse(250, 312, 134, 27, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "#2e3a44"; ctx.lineWidth = 5;        // muted teal band
      ctx.beginPath(); ctx.ellipse(250, 312, 110, 21, 0, 0, 7); ctx.stroke();
      ctx.strokeStyle = "#5a4632"; ctx.lineWidth = 3;        // ochre band
      ctx.beginPath(); ctx.ellipse(250, 312, 80, 15, 0, 0, 7); ctx.stroke();
      ctx.strokeStyle = "#3a2a30"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(250, 312, 44, 8, 0, 0, 7); ctx.stroke();
      ctx.fillStyle = "rgba(200,176,120,0.22)";
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + 0.3;
        star(ctx, 250 + Math.cos(a) * 96, 312 + Math.sin(a) * 18, 3.4);
      }
      // cubbies: frame + colored bins
      P.shadow(ctx, 88, 292, 64, 5, 0.3);
      box(ctx, "#211a15", 28, 140, 122, 148);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        R(ctx, "#0e0b09", 33 + c * 29, 145 + r * 36, 24, 31);
        L(ctx, "rgba(255,255,255,0.04)", 33 + c * 29, 176 + r * 36, 57 + c * 29, 176 + r * 36, 1);
      }
      if (!S.cubbiesEmpty) d.cubby.forEach(it => {
        const bx = 35 + it.c * 29, by = 145 + it.r * 36 + (31 - it.h);
        ctx.fillStyle = it.c2;
        P.rr(ctx, bx, by, 20, it.h, 2.5); ctx.fill();
        hl(ctx, bx + 2, by + 1, 16, 0.08);
        R(ctx, "rgba(230,225,210,0.25)", bx + 5, by + it.h - 6, 10, 3);  // label
      });
      // drawings: taped paper + kid art (the fifth one is wrong)
      const papers = S.drawingAdded ? 5 : 4;
      for (let p = 0; p < papers; p++) {
        const x = 200 + p * 50;
        ctx.save(); ctx.translate(x, 88); ctx.rotate((p % 2 ? 1 : -1) * 0.035);
        ctx.globalAlpha = 0.8; R(ctx, "#cfc9b8", 0, 0, 26, 32);
        ctx.globalAlpha = 0.5; R(ctx, "#a8a294", 9, -2, 8, 4);            // tape
        ctx.globalAlpha = 1;
        if (p < 4) {
          const sc = d.scrib[p];
          if (sc.kind === 0) {        // sun
            ctx.strokeStyle = sc.hue; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.arc(13, 12, 5, 0, 7); ctx.stroke();
            for (let i = 0; i < 5; i++) {
              const a = i * 1.25;
              L(ctx, sc.hue, 13 + Math.cos(a) * 6.5, 12 + Math.sin(a) * 6.5, 13 + Math.cos(a) * 9.5, 12 + Math.sin(a) * 9.5, 1.2);
            }
            L(ctx, "#6a8a42", 4, 27, 22, 27, 1.5);
          } else if (sc.kind === 1) { // house
            ctx.strokeStyle = sc.hue; ctx.lineWidth = 1.4;
            ctx.strokeRect(8, 16, 11, 10);
            ctx.beginPath(); ctx.moveTo(6, 16); ctx.lineTo(13.5, 8); ctx.lineTo(21, 16); ctx.stroke();
          } else {                    // stick figure
            ctx.strokeStyle = sc.hue; ctx.lineWidth = 1.3;
            ctx.beginPath(); ctx.arc(13, 11, 3.4, 0, 7); ctx.stroke();
            L(ctx, sc.hue, 13, 14, 13, 23, 1.3);
            L(ctx, sc.hue, 13, 17, 8, 21, 1.3); L(ctx, sc.hue, 13, 17, 18, 21, 1.3);
            L(ctx, sc.hue, 13, 23, 9, 29, 1.3); L(ctx, sc.hue, 13, 23, 17, 29, 1.3);
          }
        } else {  // the new one: a dense dark figure, drawn hard enough to tear paper
          ctx.fillStyle = "#181414";
          ctx.beginPath(); ctx.ellipse(13, 17, 7, 11, 0.2, 0, 7); ctx.fill();
          ctx.strokeStyle = "#181414"; ctx.lineWidth = 1.8;
          for (let i = 0; i < 6; i++) L(ctx, "#181414", 4 + i * 3.4, 4, 7 + i * 3.2, 30, 1.6);
        }
        ctx.restore();
      }
      // toy chest: wood grain + latch — set well clear of the door
      P.shadow(ctx, 474, 300, 47, 5, 0.3);
      box(ctx, "#332419", 432, 262, 85, 36);
      for (let i = 0; i < 3; i++) L(ctx, "rgba(0,0,0,0.2)", 436, 272 + i * 9, 513, 273 + i * 9, 1);
      if (S.chestOpen) {
        const g = ctx.createLinearGradient(0, 252, 0, 264);
        g.addColorStop(0, "#040303"); g.addColorStop(1, "#0c0806");
        ctx.fillStyle = g; ctx.fillRect(436, 252, 77, 12);
        ctx.save(); ctx.translate(432, 252); ctx.rotate(-0.9);
        box(ctx, "#3a2a1c", 0, -11, 85, 11);
        ctx.restore();
      } else {
        box(ctx, "#3a2a1c", 428, 254, 93, 10);
        R(ctx, "#54442e", 470, 258, 9, 7);              // latch
        hl(ctx, 470, 258, 9, 0.15);
      }
      // ---- rocking horse (side view): curved rockers, barrel body, neck+head, saddle, mane, tail ----
      const hx = S.horseMoved ? 408 : 270;   // rests ON the rug; MOVED displaces it off to the right
      P.shadow(ctx, hx, 302, 34, 5, 0.34);
      ctx.save(); ctx.translate(hx, 300);
      ctx.lineCap = "round";
      // rockers (curved runners) — far (dark) then near (lit)
      ctx.strokeStyle = "#2c2117"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-32, -12); ctx.quadraticCurveTo(-2, -1, 28, -13); ctx.stroke();
      ctx.strokeStyle = "#5a4630"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-36, -6); ctx.quadraticCurveTo(0, 6, 36, -6); ctx.stroke();
      ctx.strokeStyle = "rgba(160,128,84,0.45)"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-34, -8); ctx.quadraticCurveTo(0, 3.5, 34, -8); ctx.stroke();
      // legs (back + front) then a cross slat
      ctx.strokeStyle = "#43331f"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-14, -3); ctx.lineTo(-11, -29); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, -3); ctx.lineTo(12, -29); ctx.stroke();
      ctx.lineCap = "butt";
      R(ctx, "#3a2c1e", -15, -4, 30, 3);
      // tail (before the body so its root tucks under the rump)
      ctx.strokeStyle = "#241a12"; ctx.lineCap = "round"; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(-20, -42); ctx.quadraticCurveTo(-34, -34, -31, -13); ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-21, -39); ctx.quadraticCurveTo(-29, -30, -26, -15); ctx.stroke();
      ctx.lineCap = "butt";
      // body barrel
      ctx.fillStyle = "#4c3a26"; ctx.beginPath(); ctx.ellipse(-1, -38, 23, 12, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(160,128,84,0.22)"; ctx.beginPath(); ctx.ellipse(-3, -45, 18, 4.5, 0, 0, 7); ctx.fill();   // lit top
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(-1, -32, 17, 4, 0, 0, 7); ctx.fill();          // belly shade
      // saddle (painted) + handle peg
      ctx.fillStyle = "#6a3a30"; P.rr(ctx, -9, -49, 18, 7, 2); ctx.fill(); hl(ctx, -8, -49, 16, 0.1);
      ctx.strokeStyle = "#5a4632"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(10, -49); ctx.lineTo(10, -57); ctx.stroke();
      ctx.fillStyle = "#6a5238"; ctx.beginPath(); ctx.arc(10, -58, 2.3, 0, 7); ctx.fill(); ctx.lineCap = "butt";
      // neck + head (facing right)
      ctx.fillStyle = "#46341f";
      ctx.beginPath();
      ctx.moveTo(12, -44); ctx.quadraticCurveTo(20, -52, 26, -62);
      ctx.lineTo(37, -60); ctx.quadraticCurveTo(30, -50, 23, -42); ctx.closePath(); ctx.fill();   // neck
      ctx.beginPath();
      ctx.moveTo(26, -62); ctx.lineTo(45, -62.5); ctx.quadraticCurveTo(50, -59, 45, -55.5);
      ctx.lineTo(33, -54); ctx.quadraticCurveTo(27, -56, 26, -62); ctx.closePath(); ctx.fill();   // head/muzzle
      ctx.beginPath(); ctx.moveTo(29, -62); ctx.lineTo(32, -71); ctx.lineTo(36, -61); ctx.closePath(); ctx.fill();  // ear
      ctx.strokeStyle = "rgba(160,128,84,0.4)"; ctx.lineWidth = 1;                                                  // lit crest
      ctx.beginPath(); ctx.moveTo(13, -45); ctx.quadraticCurveTo(22, -54, 27, -62); ctx.lineTo(45, -62.3); ctx.stroke();
      ctx.strokeStyle = "#241a12"; ctx.lineWidth = 1.6;                                                             // mane
      for (let i = 0; i < 6; i++) { const mx = 13 + i * 2.6, my = -44 - i * 3.0; L(ctx, "#241a12", mx, my, mx - 5, my + 3, 1.6); }
      ctx.fillStyle = "#0e0a07"; ctx.beginPath(); ctx.arc(38, -60, 1.7, 0, 7); ctx.fill();                          // eye
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.arc(38.5, -60.6, 0.6, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.beginPath(); ctx.arc(45, -57.5, 0.9, 0, 7); ctx.fill();               // nostril
      ctx.restore();
      // door + exit sign
      box(ctx, "#161010", 555, 120, 66, 180);
      grade(ctx, 568, 140, 40, 52, "#14110f", "#090706");   // door window onto a darker hall
      L(ctx, "rgba(120,140,160,0.06)", 604, 142, 604, 190, 2);
      ctx.save(); ctx.globalAlpha = 0.1;                     // wired safety glass
      for (let i = 1; i < 4; i++) { L(ctx, "#000", 568, 140 + i * 13, 608, 140 + i * 13, 1); L(ctx, "#000", 568 + i * 10, 140, 568 + i * 10, 192, 1); }
      ctx.restore();
      ctx.strokeStyle = "#241a16"; ctx.lineWidth = 2; ctx.strokeRect(568, 140, 40, 52);
      ctx.fillStyle = "#241c18"; ctx.beginPath(); ctx.arc(610, 215, 3, 0, 7); ctx.fill();
      R(ctx, "#1a1210", 555, 296, 66, 4);
      R(ctx, S.exitOff ? "#1c0e0e" : "#5c1818", 572, 100, 38, 13);
      if (!S.exitOff) {
        ctx.fillStyle = "#e0524a"; ctx.font = "9px Consolas, monospace"; ctx.fillText("EXIT", 580, 110);
        P.light(ctx, 591, 106, 54, "255,60,50", 0.32);
        refl(ctx, 591, 300, 60, 26, "255,60,50", 0.05);
      }
      // ANOMALY: the side door has been left standing open onto the dark hall. Someone went through.
      if (S.doorAjar) {
        // 1) the opening — a dark corridor, faint cold light bleeding from a fixture far down it
        const og = ctx.createLinearGradient(556, 0, 612, 0);
        og.addColorStop(0, "#080e16"); og.addColorStop(0.55, "#03060c"); og.addColorStop(1, "#010306");
        ctx.fillStyle = og; ctx.fillRect(556, 122, 64, 176);
        ctx.fillStyle = "rgba(120,150,195,0.07)"; ctx.fillRect(556, 124, 13, 174);
        L(ctx, "rgba(150,175,212,0.11)", 567, 124, 567, 296, 1);                 // bright seam at the hinge gap
        // 2) the door slab, swung in toward the camera (hinge at right), foreshortened
        ctx.beginPath(); ctx.moveTo(587, 131); ctx.lineTo(620, 122); ctx.lineTo(620, 297); ctx.lineTo(587, 289); ctx.closePath();
        const dg = ctx.createLinearGradient(587, 0, 620, 0); dg.addColorStop(0, "#251b14"); dg.addColorStop(1, "#0f0a07");
        ctx.fillStyle = dg; ctx.fill();
        // wired-glass vision panel on the swung slab
        ctx.fillStyle = "#0a0f13";
        ctx.beginPath(); ctx.moveTo(595, 151); ctx.lineTo(613, 146); ctx.lineTo(613, 196); ctx.lineTo(595, 199); ctx.closePath(); ctx.fill();
        ctx.save(); ctx.globalAlpha = 0.10;
        for (let i = 1; i < 4; i++) L(ctx, "#9fb0bc", 595, 151 + i * 12, 613, 146 + i * 12, 1);
        ctx.restore();
        // 3) edges: lit leading edge, its thickness, the hinge-side jamb shadow
        L(ctx, "rgba(172,160,134,0.20)", 587, 131, 587, 289, 2);                 // leading edge catches room light
        L(ctx, "rgba(0,0,0,0.5)", 589, 131, 589, 289, 1);                        // thickness shadow
        L(ctx, "rgba(0,0,0,0.5)", 620, 122, 620, 298, 2);                        // hinge jamb
        R(ctx, "#1a1210", 555, 296, 66, 4);                                      // threshold
        // 4) cold hall light spilling onto the floor through the gap
        refl(ctx, 576, 301, 32, 13, "120,150,195", 0.06);
      }
    },
    anomalies: [
      { key: "doorAjar",     cat: "MOVED",   label: "side door left ajar" },
      { key: "horseMoved",   cat: "MOVED",   label: "rocking horse moved" },
      { key: "drawingAdded", cat: "ADDED",   label: "a fifth drawing on the wall" },
      { key: "chestOpen",    cat: "MOVED",   label: "toy chest opened" },
      { key: "cubbiesEmpty", cat: "REMOVED", label: "cubbies emptied" },
      { key: "exitOff",      cat: "LIGHT",   label: "exit sign dark" },
      { key: "camStatic",    cat: "FEED",    label: "feed interference" }
    ]
  };

  // ======================================================================
  // S4 — Meridian Office Park, floor 3
  // ======================================================================
  const office = {
    id: "strm_7733", title: "Meridian Office — Flr 3", src: "security cam",
    reason: "AUTO-ALERT: badge-in not logged", q: 0.85, seed: 44, tiltDir: 1,
    decor(rng) {
      const bld = [];
      let bx = 46;
      while (bx < 590) {
        const bw = 24 + rng() * 50, bh = 18 + rng() * 52;
        bld.push({ x: bx, w: bw, h: bh, base: rng() < 0.4 ? "#0b1220" : rng() < 0.7 ? "#0d1422" : "#0f1726", lit: [] });
        bx += bw + 3 + rng() * 12;
      }
      bld.sort((a, b) => a.h - b.h);                     // shorter buildings behind
      bld.forEach(b => {                                 // window grid lattice per floor
        for (let wy = 131 - b.h + 4; wy < 127; wy += 6)
          for (let wx = b.x + 3; wx < b.x + b.w - 4; wx += 5)
            if (rng() < 0.35) b.lit.push({ x: wx, y: wy, tint: (rng() * 3) | 0, bright: rng() < 0.18, keep: rng() < 0.15 });
      });
      const deskStuff = [];
      for (let i = 0; i < 3; i++) deskStuff.push({ mug: rng() < 0.7, papers: rng() < 0.7, phone: rng() < 0.5 });
      return { bld, deskStuff, ant: { x: 60 + rng() * 500 } };
    },
    draw(ctx, S, t, world, d) {
      R(ctx, "#04060b", 0, 0, W, H);
      grade(ctx, 0, 48, W, 252, "#121a2c", "#080c14");   // cool wall, lit from above
      grade(ctx, 0, 300, W, 60, "#0c1019", "#070a10");   // carpet
      ao(ctx, 300, 22, 14, 0.24);
      // carpet mottle
      ctx.save(); ctx.globalAlpha = 0.03; ctx.fillStyle = "#8fa4c0";
      for (let i = 0; i < 9; i++) R(ctx, "#8fa4c0", 30 + i * 70, 306 + (i % 3) * 16, 40, 3);
      ctx.restore();
      // window strip: skyline + grid windows + blinking antenna
      glass(ctx, 40, 55, 560, 76, "#0a121e", "#070d16");
      const hg = ctx.createLinearGradient(0, 55, 0, 131);
      hg.addColorStop(0, "rgba(70,90,130,0.10)"); hg.addColorStop(0.55, "rgba(70,90,130,0)");
      ctx.fillStyle = hg; ctx.fillRect(40, 55, 560, 76);
      const WT = ["111,134,164", "176,154,106", "138,155,176"];
      d.bld.forEach(b => {
        const y0 = 131 - b.h;
        R(ctx, b.base, b.x, y0, b.w, b.h);
        R(ctx, "rgba(40,56,86,0.5)", b.x, y0, b.w, 2);                          // lit top cap
        R(ctx, "rgba(0,0,0,0.35)", b.x + b.w - Math.max(2, b.w * 0.15), y0, Math.max(2, b.w * 0.15), b.h); // dark face
        b.lit.forEach(p => {
          if (S.cityOut && !p.keep) return;
          ctx.fillStyle = "rgba(" + WT[p.tint] + "," + (p.bright ? 0.95 : 0.55) + ")";
          ctx.fillRect(p.x, p.y, 2, 2.4);
        });
      });
      L(ctx, "#1a2438", d.ant.x, 76, d.ant.x, 96, 1.5);
      if (!S.cityOut && Math.sin(t * 1.1) > 0.4) {
        ctx.fillStyle = "#c25048"; ctx.fillRect(d.ant.x - 1, 74, 2.6, 2.6);
        P.light(ctx, d.ant.x, 75, 9, "230,80,70", 0.4);
      }
      for (let i = 0; i <= 7; i++) L(ctx, "#141d30", 40 + i * 80, 55, 40 + i * 80, 131, 3);
      L(ctx, "#141d30", 40, 55, 600, 55, 3); L(ctx, "#141d30", 40, 131, 600, 131, 3);
      // top-down cool ambient so the room reads as a lit space, not a void
      const amb = ctx.createLinearGradient(0, 131, 0, 250);
      amb.addColorStop(0, "rgba(46,62,96,0.20)"); amb.addColorStop(1, "rgba(46,62,96,0)");
      ctx.fillStyle = amb; ctx.fillRect(0, 131, W, 119);
      P.light(ctx, 320, 150, 300, "120,150,200", 0.06);   // soft room fill so the office isn't a near-black void
      cornerVig(ctx, 0.15);
      // ceiling: tiles + vents + dead fluorescents + emergency strip
      R(ctx, "#0a0e16", 0, 24, W, 18);
      for (let i = 0; i < 9; i++) L(ctx, "#080b12", 10 + i * 74, 24, 10 + i * 74, 42, 1);
      R(ctx, "#0d1320", 60, 30, 24, 7); R(ctx, "#0d1320", 560, 30, 24, 7);   // vents
      for (let i = 0; i < 3; i++) R(ctx, "#121a2e", 120 + i * 200, 28, 90, 6);
      R(ctx, "#23304a", 320, 28, 90, 6); hl(ctx, 320, 28, 90, 0.1);
      P.light(ctx, 365, 34, 120, "140,170,220", 0.08);
      // cubicles: fabric partitions + desks + monitors + chairs
      for (let i = 0; i < 3; i++) {
        const x = 70 + i * 200;
        P.light(ctx, x + 75, 150, 110, "120,150,200", 0.05);               // faint ceiling pool per desk
        grade(ctx, x, 160, 150, 72, "#1d2941", "#141d2e");                 // fabric partition, lit above
        streaks(ctx, x + 4, 164, 142, 64, 9, 0.05, 44 + i);
        ctx.save(); ctx.globalAlpha = 0.04;                                // woven flecks
        for (let f = 0; f < 24; f++) R(ctx, f % 2 ? "#fff" : "#000", x + 6 + (f * 53 % 138), 164 + (f * 37 % 62), 2, 1);
        ctx.restore();
        R(ctx, "#222e44", x, 158, 150, 4); hl(ctx, x, 158, 150, 0.1);      // top rail
        R(ctx, "#11192b", x - 2, 158, 4, 74); R(ctx, "#11192b", x + 148, 158, 4, 74);  // end posts
        hl(ctx, x - 2, 158, 4, 0.08);
        L(ctx, "rgba(0,0,0,0.3)", x, 232, x + 150, 232, 1);               // AO at desk
        P.shadow(ctx, x + 75, 296, 84, 5, 0.22);
        box(ctx, "#1d2738", x - 6, 232, 162, 9);                           // desk top
        R(ctx, "#131a28", x + 6, 241, 8, 42); R(ctx, "#131a28", x + 136, 241, 8, 42);
        // monitor on a stand — the focal object of each cubicle
        const mx = x + 53;
        box(ctx, "#0c1018", mx, 187, 44, 31);                             // body
        R(ctx, "#0a0d14", mx + 19, 218, 6, 9); R(ctx, "#161b28", mx + 12, 227, 20, 3);  // stand + base
        L(ctx, "rgba(150,180,220,0.14)", mx, 187, mx + 44, 187, 1);        // bezel hl top
        L(ctx, "rgba(150,180,220,0.12)", mx, 187, mx, 218, 1);            // bezel hl left
        if (S.monitorOn && i === 1) {
          // a late-night news broadcast is playing — and the photo on screen is HIS face
          ctx.fillStyle = "#10151c"; ctx.fillRect(mx + 4, 190, 36, 24);     // dark studio bg
          R(ctx, "#a83828", mx + 4, 190, 36, 5);                           // red BREAKING banner
          ctx.fillStyle = "#e8d0c0"; ctx.font = "3.6px Consolas, monospace"; ctx.fillText("BREAKING", mx + 5.5, 194);
          R(ctx, "#05080d", mx + 6, 197, 13, 14);                          // mugshot frame
          ctx.fillStyle = "#0a0e15"; ctx.beginPath(); ctx.ellipse(mx + 12.5, 204, 4.4, 5.4, 0, 0, 7); ctx.fill(); // head
          R(ctx, "#0a0e15", mx + 8.5, 208.5, 8, 3);                        // shoulders
          ctx.save(); ctx.globalCompositeOperation = "lighter";            // his eyes — two cold glints
          ctx.fillStyle = "rgba(205,218,228,0.85)";
          ctx.beginPath(); ctx.arc(mx + 11, 203, 0.85, 0, 7); ctx.fill();
          ctx.fillStyle = "rgba(205,218,228,0.6)";
          ctx.beginPath(); ctx.arc(mx + 14, 203.4, 0.75, 0, 7); ctx.fill();
          ctx.restore();
          for (let r = 0; r < 4; r++) R(ctx, "rgba(180,195,210,0.55)", mx + 21, 198 + r * 3.1, r === 3 ? 9 : 16, 1.4); // headline lines
          R(ctx, "#a8301f", mx + 4, 209, 36, 5);                           // lower-third ticker
          P.light(ctx, mx + 22, 202, 16, "150,180,220", 0.45);            // screen glow
          P.light(ctx, mx + 22, 202, 80, "120,160,210", 0.2);
          refl(ctx, mx + 22, 300, 80, 32, "120,160,210", 0.06);
        } else {
          R(ctx, "#0d1320", mx + 4, 190, 36, 24);
          ctx.save(); ctx.globalAlpha = 0.06; ctx.strokeStyle = "#7896c0"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(mx + 7, 211); ctx.lineTo(mx + 28, 191); ctx.stroke(); ctx.restore();  // glass reflection
          ctx.fillStyle = "#c25048"; ctx.fillRect(mx + 38, 214, 1.8, 1.8);  // standby LED
        }
        // keyboard + per-desk clutter
        R(ctx, "#1a2436", x + 48, 234, 26, 4);
        ctx.fillStyle = "#1a2436"; ctx.beginPath(); ctx.arc(x + 84, 236, 2.2, 0, 7); ctx.fill(); // mouse
        if (d.deskStuff[i].mug) { R(ctx, "#2e2230", x + 116, 228, 7, 7); L(ctx, "#2e2230", x + 124, 230, x + 126, 233, 1.4); }
        if (d.deskStuff[i].papers) { ctx.save(); ctx.globalAlpha = 0.5; R(ctx, "#9aa4ac", x + 16, 233, 14, 3); ctx.restore(); }
        if (d.deskStuff[i].phone) R(ctx, "#0f1522", x + 100, 231, 12, 5);
        // chair
        if (!(S.chairOut && i === 1)) officeChair(ctx, "#222e44", x + 70, 286, 0);
      }
      if (S.chairOut) officeChair(ctx, "#222e44", 392, 310, -0.5);
      // copier / printer — a multifunction office copier
      P.shadow(ctx, 58, 293, 38, 4, 0.3);
      box(ctx, "#1a2230", 26, 214, 60, 77);             // lower cabinet
      R(ctx, "#10161f", 32, 250, 48, 11); R(ctx, "#283449", 32, 250, 48, 1.5);   // paper drawer
      R(ctx, "#10161f", 32, 266, 48, 11); R(ctx, "#283449", 32, 266, 48, 1.5);   // paper drawer
      ctx.fillStyle = "#0c111a"; ctx.beginPath(); ctx.arc(56, 256, 1.6, 0, 7); ctx.arc(56, 272, 1.6, 0, 7); ctx.fill(); // handles
      R(ctx, "#161d29", 28, 226, 50, 7);                // output tray slot
      ctx.save(); ctx.globalAlpha = 0.9; R(ctx, "#c9cfd4", 36, 221, 34, 6); R(ctx, "#b4bcc6", 36, 221, 34, 1.5); ctx.restore(); // printed sheets
      box(ctx, "#222c3e", 22, 196, 68, 20);             // scanner top unit
      R(ctx, "#19222f", 30, 199, 50, 8); hl(ctx, 22, 196, 68, 0.10);             // flatbed lid
      R(ctx, "#283449", 34, 191, 44, 6); hl(ctx, 34, 191, 44, 0.12);             // document feeder hump
      box(ctx, "#2c3a52", 70, 204, 16, 15);             // control panel
      R(ctx, "#3f6f7a", 72, 206, 9, 4);                 // teal screen
      ctx.fillStyle = "#56708a"; [0, 1, 2].forEach(i => { ctx.beginPath(); ctx.arc(74 + i * 4, 214, 1.2, 0, 7); ctx.fill(); }); // buttons
      if (S.copierLit) {
        const lx = 32 + ((t * 38) % 46);                // scan bar sweeps under the lid
        R(ctx, "#d8e8d0", lx, 199, 6, 6);
        P.light(ctx, lx + 3, 202, 30, "180,240,170", 0.3);
      }
      // plant: layered foliage
      if (!S.plantGone) {
        P.shadow(ctx, 606, 301, 15, 3, 0.3);
        box(ctx, "#241c16", 596, 282, 20, 18);
        ctx.fillStyle = "#1c3022";
        ctx.beginPath(); ctx.ellipse(606, 266, 14, 18, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(598, 260, 8, 13, -0.5, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(614, 260, 8, 13, 0.5, 0, 7); ctx.fill();
        ctx.fillStyle = "#26402c";
        ctx.beginPath(); ctx.ellipse(604, 262, 7, 11, -0.2, 0, 7); ctx.fill();
      }
      // papers on the floor
      if (S.papersAdded) {
        const px = [300, 332, 366, 398, 318, 352, 384];
        px.forEach((x, i) => {
          ctx.save(); ctx.translate(x, 318 + (i % 3) * 11); ctx.rotate((i * 1.7) % 1 - 0.5);
          ctx.globalAlpha = 0.65; R(ctx, "#c9cfd4", -7, -5, 14, 10);
          ctx.globalAlpha = 0.3; L(ctx, "#5a6470", -4, -2, 4, -2, 1); L(ctx, "#5a6470", -4, 1, 4, 1, 1);
          ctx.restore();
        });
      }
    },
    anomalies: [
      { key: "monitorOn",   cat: "LIGHT",   label: "monitor on — late news" },
      { key: "chairOut",    cat: "MOVED",   label: "chair in the aisle" },
      { key: "plantGone",   cat: "REMOVED", label: "plant missing" },
      { key: "copierLit",   cat: "LIGHT",   label: "copier running" },
      { key: "papersAdded", cat: "ADDED",   label: "papers on the floor" },
      { key: "cityOut",     cat: "LIGHT",   label: "the city went dark" },
      { key: "camTilt",     cat: "FEED",    label: "camera tilted" }
    ]
  };

  // ======================================================================
  // S5 — StoreRite Warehouse, aisle 9
  // ======================================================================
  const warehouse = {
    id: "strm_3138", title: "StoreRite Whse — Aisle 9", src: "interior cam",
    reason: "AUTO-ALERT: thermal delta", q: 0.68, seed: 55, tiltDir: -1,
    // Dead-on ELEVATION of one loaded pallet-rack run: 4 upright columns -> 4 bays,
    // 4 shelf levels. No aisle, no vanishing point — the cam stares at the shelf face.
    decor(rng) {
      // pre-darkened for a 3AM feed (lamps re-light the pools in draw)
      const TAN = ["#56401f", "#614929", "#6c532f", "#4c3b21", "#44341e", "#3a2d17", "#65502d"];
      const COOL = ["#30372a", "#373846"];   // ~1-in-8 odd carton so the wall isn't monochrome
      const PALE = "#6c5f49";                 // a shrink-wrapped pale pallet, ~1 per level
      const xU = [16, 168, 320, 472, 624];
      const LV = [{ beam: 120, ceil: 44 }, { beam: 190, ceil: 124 }, { beam: 250, ceil: 194 }, { beam: 312, ceil: 254 }];
      const runs = [];
      for (let lvl = 0; lvl < 4; lvl++) {
        runs[lvl] = [];
        for (let bay = 0; bay < 4; bay++) {
          const x0 = xU[bay] + 7, x1 = xU[bay + 1] - 7;   // inside the 10px uprights
          const band = LV[lvl].beam - LV[lvl].ceil;
          const boxes = [];
          let x = x0, pale = false;
          while (x < x1 - 12) {
            let w = 26 + rng() * 26;                                   // varied widths 26..52
            if (x + w > x1) w = x1 - x;
            const tall = rng() < 0.26 ? 0.34 + rng() * 0.26 : 0.70 + rng() * 0.30;  // ragged tops
            const h = Math.min(band - 5, band * tall);
            let c;
            if (!pale && rng() < 0.16) { c = PALE; pale = true; }
            else if (rng() < 0.12) c = COOL[(rng() * COOL.length) | 0];
            else c = TAN[(rng() * TAN.length) | 0];
            boxes.push({ x, w, h, c, tape: rng() < 0.35, label: rng() < 0.30, tier2: rng() < 0.24 ? 0.30 + rng() * 0.22 : 0 });
            x += w;
          }
          runs[lvl][bay] = { boxes, wrapped: rng() < 0.5 };
        }
      }
      const scuffs = [];
      for (let i = 0; i < 6; i++) scuffs.push({ x: 40 + rng() * 560, y: 326 + rng() * 26, r: 9 + rng() * 20, a: rng() * 0.5 });
      const stains = [];
      for (let i = 0; i < 3; i++) stains.push({ x: 70 + rng() * 500, y: 334 + rng() * 16, rx: 14 + rng() * 20, a: 0.05 + rng() * 0.05 });
      return { runs, scuffs, stains };
    },
    draw(ctx, S, t, world, d) {
      const xU = [16, 168, 320, 472, 624];
      const LV = [{ beam: 120, ceil: 44 }, { beam: 190, ceil: 124 }, { beam: 250, ceil: 194 }, { beam: 312, ceil: 254 }];
      const lamps = [244, 548];   // over bay centres (bay1 & bay3), not the uprights, so light pools

      R(ctx, "#060503", 0, 0, W, H);

      // ---- floor strip (a thin concrete apron — no aisle, no receding plane) ----
      grade(ctx, 0, 318, W, 42, "#16140f", "#1c1a14");
      R(ctx, "#0a0907", 0, 313, W, 6);                   // dim wall-base band behind the rack feet
      ao(ctx, 320, 16, 12, 0.4);                          // seat the rack on the floor
      ctx.save();
      d.scuffs.forEach(s => {
        ctx.globalAlpha = 0.05 + s.a * 0.05; ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0.3, 1.5); ctx.stroke();
      });
      d.stains.forEach(s => {
        ctx.globalAlpha = s.a; ctx.fillStyle = "#000";
        ctx.beginPath(); ctx.ellipse(s.x, s.y, s.rx, s.rx * 0.32, 0, 0, 7); ctx.fill();
      });
      ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = "#968030";   // painted floor safety stripe
      for (let i = 0; i < 40; i++) R(ctx, "#968030", 14 + i * 16, 316, 8, 3);
      ctx.restore();

      // ---- loose floor pallet (MOVED target), drawn before the rack ----
      const px = S.palletMoved ? 300 : 70;
      if (S.palletMoved) { ctx.save(); ctx.globalAlpha = 0.1; ctx.strokeStyle = "#000"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(96, 339); ctx.lineTo(px + 12, 333); ctx.stroke(); ctx.restore(); }  // drag scuff
      P.shadow(ctx, px + 34, 336, 44, 5, 0.4);
      for (let i = 0; i < 6; i++) R(ctx, "#3a2c16", px + i * 12, 324, 9, 4);                       // deck slats
      R(ctx, "#2a1f10", px, 328, 68, 5);                                                          // stringer
      [px + 6, px + 32, px + 58].forEach(bx => R(ctx, "#1f160a", bx - 2, 328, 4, 6));             // foot blocks

      // ---- sodium floor pools under the two high-bays ----
      pool(ctx, lamps[0], 338, 150, 30, "210,150,72", 0.07);
      if (!S.lampOut) pool(ctx, lamps[1], 338, 150, 30, "210,150,72", 0.07);

      // ---- a box cutter left on the floor at the start of the night — gone later (he took it) ----
      if (!S.cutterGone) {
        const kx = 424, ky = 334;
        P.shadow(ctx, kx + 11, ky + 3, 14, 2, 0.36);
        ctx.save(); ctx.translate(kx, ky); ctx.rotate(-0.14);
        R(ctx, "#a8702a", 0, 0, 22, 6);                          // orange handle
        R(ctx, "#caa23a", 0, 0, 22, 2);                          // handle highlight
        R(ctx, "#5a4420", 5, 2, 9, 2.4);                         // slider track
        ctx.fillStyle = "#1a1410"; ctx.beginPath(); ctx.arc(8, 3, 1.4, 0, 7); ctx.fill();   // slider thumb
        ctx.fillStyle = "#aab2b8"; ctx.beginPath();             // exposed blade
        ctx.moveTo(22, 0.6); ctx.lineTo(31, 1.6); ctx.lineTo(22, 5); ctx.closePath(); ctx.fill();
        R(ctx, "#dfe6ea", 22, 1.2, 7, 0.9);                     // blade glint
        ctx.restore();
      } else {
        ctx.save(); ctx.globalAlpha = 0.045; ctx.fillStyle = "#fff";   // a clean spot where it lay
        ctx.beginPath(); ctx.ellipse(436, 335, 16, 4, 0, 0, 7); ctx.fill(); ctx.restore();
      }

      // ---- one carton: front face + sodium-lit top + shadow side + neighbour seam ----
      function carton(b, deckY, dark) {
        let c = b.c; if (dark) c = shade(c, -0.3);
        const y = deckY - b.h;
        if (b.tier2) {                                       // a smaller carton stacked on top
          const h2 = b.h * b.tier2, x2 = b.x + b.w * 0.14, w2 = b.w * 0.72;
          R(ctx, shade(c, -0.05), x2, y - h2, w2, h2);
          R(ctx, shade(c, 0.18), x2, y - h2, w2, Math.max(1, h2 * 0.16));
          L(ctx, "rgba(0,0,0,0.4)", x2, y - h2, x2, y, 1);
        }
        R(ctx, c, b.x, y, b.w, b.h);                                                   // front face
        R(ctx, shade(c, 0.13), b.x, y, b.w, Math.max(1.6, b.h * 0.12));                // top flap (gentle — lamps do the lifting)
        R(ctx, shade(c, -0.34), b.x + b.w - Math.max(2, b.w * 0.10), y, Math.max(2, b.w * 0.10), b.h); // shadow side
        L(ctx, "rgba(0,0,0,0.5)", b.x, y, b.x, deckY, 1);                              // seam to neighbour
        if (b.tape) R(ctx, "rgba(214,200,168,0.22)", b.x + b.w * 0.42, y, Math.max(1.5, b.w * 0.12), b.h);
        if (b.label) R(ctx, "rgba(228,224,206,0.18)", b.x + b.w * 0.16, y + b.h * 0.16, Math.min(16, b.w * 0.4), Math.min(10, b.h * 0.4));
      }

      // ---- rack steel + cartons, level by level (top L4 -> bottom L1) ----
      for (let lvl = 0; lvl < 4; lvl++) {
        const beamY = LV[lvl].beam, deckY = beamY - 4;
        R(ctx, "#32363e", 14, beamY, 612, 7);                          // gunmetal load beam
        R(ctx, "rgba(226,162,82,0.42)", 14, beamY, 612, 1.5);         // its warm lit top edge (THE shelf cue)
        R(ctx, "rgba(0,0,0,0.6)", 14, beamY + 7, 612, 1);            // black bottom seam
        for (let bay = 0; bay < 4; bay++) {
          const dark = S.lampOut && xU[bay] >= 320;                    // right half dims when its lamp dies
          R(ctx, "#2a1f10", xU[bay] + 6, deckY, (xU[bay + 1] - xU[bay]) - 12, 4);   // wood pallet deck peeking under the boxes
          if (S.palletGone && lvl === 2 && bay === 3) {               // REMOVED: this slot is bare
            const rx = xU[bay] + 7, rw = (xU[bay + 1] - xU[bay]) - 14, rtop = LV[lvl].ceil + 4, rh = deckY - LV[lvl].ceil - 4;
            const rec = ctx.createLinearGradient(0, rtop, 0, deckY);
            rec.addColorStop(0, "#040402"); rec.addColorStop(1, "#0b0a07");                 // dark void, a touch lighter toward the deck
            ctx.fillStyle = rec; ctx.fillRect(rx, rtop, rw, rh);
            R(ctx, "rgba(226,162,82,0.12)", rx, rtop, 1.4, rh);                             // warm rim on the exposed interior upright
            R(ctx, "#2a1f10", rx + 2, deckY - 2, rw - 4, 3);                                // the empty wooden pallet deck still there
            P.light(ctx, rx + rw / 2, rtop + rh / 2, 64, "120,130,150", 0.07);             // faint cold light into the cavity
            ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = "rgba(210,196,150,1)";
            for (let g = 0; g < 3; g++) R(ctx, "rgba(210,196,150,1)", rx + 8 + g * 32, deckY - 5, 24, 3);  // warm pallet-footprint dust on the deck
            ctx.restore();
            L(ctx, "rgba(214,200,168,0.32)", rx + 36, rtop + 3, rx + 41, rtop + 24, 1.6);   // a torn shrink-wrap shred
            continue;
          }
          const run = d.runs[lvl][bay];
          run.boxes.forEach(b => carton(b, deckY, dark));
          L(ctx, "rgba(0,0,0,0.35)", xU[bay] + 6, deckY, xU[bay + 1] - 6, deckY, 1);   // contact shadow seating the boxes
          if (run.wrapped) {                                           // shrink-wrap sheen + a diagonal highlight
            ctx.save();
            R(ctx, "rgba(150,165,180,0.06)", xU[bay] + 7, LV[lvl].ceil + 2, (xU[bay + 1] - xU[bay]) - 14, deckY - LV[lvl].ceil - 2);
            ctx.globalAlpha = 0.05; ctx.strokeStyle = "#cfe0ee"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(xU[bay] + 22, deckY); ctx.lineTo(xU[bay] + 62, LV[lvl].ceil + 6); ctx.stroke();
            ctx.restore();
          }
        }
      }

      // ---- upright frames, drawn in FRONT of the loaded bays (selective racking) ----
      R(ctx, "#2a2e36", 11, 32, 618, 5);                               // top tie frame
      R(ctx, "rgba(226,162,82,0.3)", 11, 32, 618, 1.2);
      for (let u = 0; u < 5; u++) {
        const x = xU[u], dark = S.lampOut && x >= 320;
        R(ctx, shade("#2a2e36", dark ? -0.3 : 0), x - 5, 34, 10, 279);
        R(ctx, dark ? "rgba(150,150,160,0.12)" : "rgba(228,170,86,0.30)", x - 5, 34, 2, 279);  // sodium-lit left edge
        R(ctx, "#15171c", x + 3, 34, 2, 279);                                                  // shadow right edge
        if (u === 1 || u === 2) {                                                              // bracing ticks read as a truss
          ctx.save(); ctx.strokeStyle = "#1c1f25"; ctx.lineWidth = 1;
          for (let yy = 60; yy < 300; yy += 26) { ctx.beginPath(); ctx.moveTo(x - 4, yy); ctx.lineTo(x + 4, yy + 12); ctx.stroke(); }
          ctx.restore();
        }
        R(ctx, "#343943", x - 7, 313, 14, 6);                                                  // foot plate
        L(ctx, "rgba(0,0,0,0.4)", x - 7, 319, x + 7, 319, 1);
      }
      // rack-end inventory placard on the second upright
      R(ctx, "#0e1116", 159, 150, 18, 14);
      R(ctx, "rgba(200,206,190,0.5)", 161, 153, 14, 2);
      R(ctx, "rgba(200,206,190,0.30)", 161, 158, 10, 2);

      // ---- always-on gloom: sink the wall to a 3AM feed; the lamps below re-light the pools ----
      const glV = ctx.createLinearGradient(0, 32, 0, 150);
      glV.addColorStop(0, "rgba(0,0,0,0.42)"); glV.addColorStop(1, "rgba(0,0,0,0)");   // top gloom (L4 no longer crushed)
      ctx.fillStyle = glV; ctx.fillRect(0, 32, W, 124);
      const glH = ctx.createLinearGradient(0, 0, W, 0);
      glH.addColorStop(0, "rgba(0,0,0,0.46)"); glH.addColorStop(0.38, "rgba(0,0,0,0)");   // dark left edge -> lit bay1
      glH.addColorStop(0.62, "rgba(0,0,0,0.34)");                                          // dim the bay-2 centre gap
      glH.addColorStop(0.86, "rgba(0,0,0,0)"); glH.addColorStop(1, "rgba(0,0,0,0.46)");   // lit bay3 -> dark right edge
      ctx.fillStyle = glH; ctx.fillRect(0, 32, W, 288);

      // ---- high-bay fixtures + their pooled sodium wash (re-light over the gloom) ----
      lamps.forEach((lx, i) => {
        const out = i === 1 && S.lampOut;
        L(ctx, "#0e0c08", lx, 0, lx, 10, 2);
        ctx.fillStyle = out ? "#171410" : "#2a241a";
        ctx.beginPath(); ctx.moveTo(lx - 13, 24); ctx.lineTo(lx + 13, 24); ctx.lineTo(lx + 7, 10); ctx.lineTo(lx - 7, 10); ctx.closePath(); ctx.fill();
        if (!out) {
          R(ctx, "#e8d8a0", lx - 6, 22, 12, 3);
          P.light(ctx, lx, 20, 30, "235,180,95", 0.42);
          P.light(ctx, lx, 72, 150, "228,164,84", 0.10);    // soft top wash recovers L4
          P.light(ctx, lx, 170, 215, "228,164,84", 0.14);   // pooled wash down the rack face
          P.light(ctx, lx, 150, 120, "228,164,84", 0.07);
        }
      });
      // lampOut: cool the right half so bays 2-3 fall into deeper gloom
      if (S.lampOut) { ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(320, 0, 320, 318); }

      // ---- ADDED: a collapsed pallet — fresh debris on the floor at the bay-2 base ----
      if (S.spillAdded) {
        P.shadow(ctx, 396, 318, 52, 6, 0.4);
        box(ctx, "#624c2a", 360, 296, 32, 22); R(ctx, shade("#624c2a", 0.2), 360, 296, 32, 4);
        box(ctx, "#574326", 392, 302, 26, 16);
        ctx.save(); ctx.translate(424, 300); ctx.rotate(0.16); box(ctx, "#7c5e34", 0, 0, 24, 18); ctx.restore();  // one crushed/skewed box
        R(ctx, "rgba(214,200,168,0.18)", 384, 292, 6, 22);                                                        // burst shrink-wrap
        ctx.fillStyle = "rgba(220,214,196,0.3)";                                                                  // spilled packing beads
        for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(364 + i * 8, 316 + (i % 2) * 3, 1, 0, 7); ctx.fill(); }
      }

    },
    anomalies: [
      { key: "cutterGone",  cat: "REMOVED", label: "box cutter gone" },
      { key: "palletGone",  cat: "REMOVED", label: "a pallet is missing" },
      { key: "spillAdded",  cat: "ADDED",   label: "a pallet has collapsed" },
      { key: "palletMoved", cat: "MOVED",   label: "floor pallet moved" },
      { key: "lampOut",     cat: "LIGHT",   label: "a high-bay went dark" },
      { key: "camShake",    cat: "FEED",    label: "camera shaking" }
    ]
  };

  // ======================================================================
  // S6 — Crestview Apartments, lobby  (it's YOUR building)
  // ======================================================================
  const lobby = {
    id: "strm_8090", title: "Crestview Apts — Lobby", src: "entry cam",
    reason: "TENANT CALL x12", q: 0.8, seed: 66, tiltDir: -1,
    decor(rng) {
      const scuffs = [];
      for (let i = 0; i < 7; i++) scuffs.push({ x: 60 + rng() * 520, y: 314 + rng() * 38, r: 8 + rng() * 11 });
      return { scuffs };
    },
    // Simple eye-level lobby — you are standing in it. A back wall with a WINDOW
    // (left), MAILBOXES (centre) and a DOOR (right); a reception DESK in front of you.
    draw(ctx, S, t, world, d) {
      const lit = !S.lightOut;
      R(ctx, "#05070a", 0, 0, W, H);
      grade(ctx, 0, 0, W, 48, "#0c1119", "#080c12");          // ceiling
      grade(ctx, 0, 48, W, 254, "#1c232f", "#12171f");        // back wall
      grade(ctx, 0, 302, W, 58, "#14181f", "#0c0f15");        // floor
      L(ctx, "rgba(0,0,0,0.4)", 0, 302, W, 302, 1.5);         // wall/floor line
      ao(ctx, 302, 20, 16, 0.28);
      L(ctx, "rgba(255,255,255,0.045)", 0, 252, W, 252, 1);   // wainscot cap
      ctx.save();
      for (let i = 0; i < 2; i++) L(ctx, "rgba(210,218,225,0.04)", 0, 322 + i * 22, W, 322 + i * 22, 1);  // faint floor tiles
      d.scuffs.forEach(s => { ctx.globalAlpha = 0.07; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * 0.3, 0, 0, 7); ctx.fill(); });
      ctx.restore();

      // ---- ceiling light fixture ----
      R(ctx, "#0d1019", 250, 14, 152, 14);
      L(ctx, "rgba(255,255,255,0.05)", 250, 14, 402, 14, 1);
      if (lit) {
        R(ctx, "#e9ead6", 256, 18, 140, 7);
        P.light(ctx, 326, 22, 70, "235,233,208", 0.5);
        P.light(ctx, 326, 64, 250, "212,212,196", 0.13);
        pool(ctx, 326, 322, 250, 46, "210,206,182", 0.06);
      } else { R(ctx, "#1b1f27", 256, 18, 140, 7); }

      // ---- WINDOW (left): night outside + a cold streetlamp ----
      R(ctx, "#28323e", 34, 72, 150, 142);                    // frame
      glass(ctx, 40, 78, 138, 130, "#0e1a28", "#0a1320");
      L(ctx, "#2a3844", 152, 92, 152, 150, 2);                // streetlamp pole (outside)
      R(ctx, "#e0c8a0", 148, 86, 6, 4);                       // lamp head
      cone(ctx, 151, 90, 210, 6, 44, "150,170,210", 0.12);    // cold exterior cone
      P.light(ctx, 151, 88, 24, "185,200,230", 0.30);
      L(ctx, "#1b2530", 109, 78, 109, 208, 2);                // mullions
      L(ctx, "#1b2530", 40, 122, 178, 122, 2); L(ctx, "#1b2530", 40, 165, 178, 165, 2);
      R(ctx, "#222c38", 32, 208, 152, 7); hl(ctx, 32, 208, 152, 0.08);   // sill

      // ---- MAILBOXES (on the wall, centre) ----
      box(ctx, "#1d2531", 250, 92, 150, 106);
      L(ctx, "#3a4a5a", 250, 92, 400, 92, 2);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
        const x = 256 + c * 23, y = 98 + r * 24;
        if (S.boxesOpen && (r * 6 + c) % 5 < 2) {            // a cluster hangs open
          R(ctx, "#04070c", x, y, 20, 20);
          if ((r * 6 + c) % 3 === 0) R(ctx, "rgba(220,225,215,0.5)", x + 4, y + 13, 11, 4);   // mail inside
          ctx.save(); ctx.translate(x, y); ctx.rotate(-0.5); R(ctx, "#28323e", 0, 0, 20, 18); hl(ctx, 1, 1, 18, 0.06); ctx.restore();
        } else {
          R(ctx, (r * 6 + c) % 4 === 0 ? "#2c3744" : "#26323e", x, y, 20, 20);
          L(ctx, "rgba(255,255,255,0.1)", x, y, x + 20, y, 1); L(ctx, "rgba(255,255,255,0.08)", x, y, x, y + 20, 1);
          L(ctx, "rgba(0,0,0,0.4)", x, y + 20, x + 20, y + 20, 1); L(ctx, "rgba(0,0,0,0.4)", x + 20, y, x + 20, y + 20, 1);
          ctx.fillStyle = "#0c1117"; ctx.beginPath(); ctx.arc(x + 14, y + 11, 1.5, 0, 7); ctx.fill();   // keyhole
          R(ctx, "rgba(220,228,235,0.16)", x + 3, y + 3, 9, 3);   // number plate
        }
      }

      // ---- DOOR (right): the entrance ----
      box(ctx, "#202a36", 466, 58, 124, 244);                 // frame
      R(ctx, "#161d27", 474, 64, 108, 238); hl(ctx, 474, 64, 108, 0.05);   // slab
      glass(ctx, 492, 82, 72, 74, "#0c1622", "#091018");      // vision panel
      ctx.save(); ctx.globalAlpha = 0.1;                      // wired glass
      for (let i = 1; i < 5; i++) { L(ctx, "#000", 492, 82 + i * 15, 564, 82 + i * 15, 1); L(ctx, "#000", 492 + i * 14, 82, 492 + i * 14, 156, 1); }
      ctx.restore();
      R(ctx, "#3a4a58", 480, 188, 8, 44); hl(ctx, 480, 188, 8, 0.16);      // pull handle
      R(ctx, "#1a2430", 474, 292, 108, 10);                   // kick plate
      R(ctx, S.lightOut ? "#2a1010" : "#5c1818", 500, 44, 50, 13);         // EXIT sign
      ctx.fillStyle = "#e0524a"; ctx.font = "9px Consolas, monospace"; ctx.fillText("EXIT", 512, 54);
      P.light(ctx, 525, 50, 30, "255,70,60", 0.22);

      // ---- KEY RACK on the wall behind the desk: keys hang here at the start, gone later ----
      box(ctx, "#2a2018", 408, 150, 46, 36);                  // wooden board
      R(ctx, shade("#2a2018", 0.18), 408, 150, 46, 3); hl(ctx, 408, 150, 46, 0.06);
      ctx.fillStyle = "#6a6258";
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(417 + i * 10, 160, 1.3, 0, 7); ctx.fill(); }   // hooks
      if (!S.keysGone) {
        const kc = ["#c2a64a", "#9aa2a8", "#c2a64a", "#9aa2a8"];
        for (let i = 0; i < 4; i++) {
          const kx = 417 + i * 10;
          L(ctx, "#8a8270", kx, 161, kx, 170, 1.2);            // ring / shank
          ctx.fillStyle = kc[i]; ctx.beginPath(); ctx.arc(kx, 174, 2.4, 0, 7); ctx.fill();  // bow
          R(ctx, kc[i], kx - 0.8, 169, 1.6, 5);                // blade
          R(ctx, kc[i], kx - 0.8, 172, 3, 1);                  // bit
        }
      }

      // ---- DESK (foreground): the front desk ----
      if (!S.benchGone) officeChair(ctx, "#212c39", 322, 252, 0);          // chair behind the desk (back peeks above)
      P.shadow(ctx, 314, 324, 156, 9, 0.36);
      box(ctx, "#2c2118", 172, 246, 290, 76);                 // desk body
      R(ctx, "#3a2c1d", 164, 236, 306, 11); hl(ctx, 164, 236, 306, 0.1);   // desktop slab
      L(ctx, "rgba(0,0,0,0.22)", 172, 282, 462, 282, 1);
      R(ctx, "#241a12", 172, 247, 6, 75); R(ctx, "#241a12", 456, 247, 6, 75);   // side posts
      R(ctx, "#cfc7b4", 350, 228, 30, 9); R(ctx, "rgba(0,0,0,0.2)", 350, 235, 30, 2);   // ledger/logbook
      box(ctx, "#10151f", 392, 220, 22, 16); R(ctx, lit ? "#2a3a4c" : "#141c26", 394, 222, 18, 10);   // a terminal
      L(ctx, "#2a3340", 214, 236, 214, 212, 2);               // desk lamp
      ctx.fillStyle = "#2a3340"; ctx.beginPath(); ctx.moveTo(205, 212); ctx.lineTo(225, 212); ctx.lineTo(219, 204); ctx.lineTo(211, 204); ctx.closePath(); ctx.fill();
      if (S.elevLit) { R(ctx, "#ffe6a0", 209, 210, 12, 3); P.light(ctx, 214, 213, 46, "240,205,130", 0.42); pool(ctx, 214, 250, 48, 13, "240,205,130", 0.16); }
      if (S.flyersAdded) { P.shadow(ctx, 300, 240, 28, 4, 0.3); box(ctx, "#6a5230", 280, 210, 42, 30); R(ctx, shade("#6a5230", 0.18), 280, 210, 42, 5); R(ctx, "rgba(205,196,166,0.22)", 297, 210, 5, 30); }   // parcel (ADDED)

      // ---- brown-out: room falls dark, only window + EXIT survive ----
      if (S.lightOut) {
        ctx.fillStyle = "rgba(2,4,9,0.5)"; ctx.fillRect(0, 0, W, H);
        P.light(ctx, 151, 92, 48, "150,170,210", 0.3);        // streetlamp through the window
        pool(ctx, 120, 252, 72, 18, "120,140,180", 0.05);
        P.light(ctx, 525, 50, 30, "255,70,60", 0.24);         // EXIT
      }

      cornerVig(ctx, 0.16);
    },
    anomalies: [
      { key: "keysGone",    cat: "REMOVED", label: "keys gone from the rack" },
      { key: "elevLit",     cat: "LIGHT",   label: "desk lamp on" },
      { key: "boxesOpen",   cat: "MOVED",   label: "mailboxes opened" },
      { key: "benchGone",   cat: "REMOVED", label: "desk chair missing" },
      { key: "lightOut",    cat: "LIGHT",   label: "ceiling light out" },
      { key: "flyersAdded", cat: "ADDED",   label: "a parcel on the desk" }
    ]
  };

  // ======================================================================
  // S7 — apartment_cam (scripted; appears at 4:15 AM)
  // Your room, seen from the doorway. The reverse angle of your modcam.
  // ======================================================================
  const apartment = {
    id: "strm_0413", title: "apartment_cam", src: "UNREGISTERED DEVICE",
    reason: "UNREGISTERED — NO WORK ORDER", q: 0.6, seed: 77, tiltDir: 1,
    special: "apartment",
    decor(rng) {
      const books = [];
      for (let i = 0; i < 11; i++) books.push({
        x: 506 + i * 10, h: 8 + rng() * 6,
        c: ["#161c28", "#1b1924", "#151f1c"][(rng() * 3) | 0],
        lean: rng() < 0.18
      });
      const planks = [];
      for (let i = 0; i < 4; i++) planks.push(0.02 + rng() * 0.03);
      return { books, planks };
    },
    draw(ctx, S, t, world, d) {
      R(ctx, "#04060a", 0, 0, W, H);
      grade(ctx, 0, 64, W, 240, "#11161f", "#090c13");   // back wall
      grade(ctx, 0, 304, W, 56, "#0e1016", "#080a0e");   // floor
      ao(ctx, 304, 22, 14, 0.24);
      P.light(ctx, 92, 150, 150, "120,150,200", 0.05);   // faint window ambient, left wall
      // wood planks
      d.planks.forEach((a, i) => {
        R(ctx, "rgba(120,90,60," + a + ")", 0, 308 + i * 13, W, 12);
        L(ctx, "rgba(0,0,0,0.25)", 0, 308 + i * 13, W, 308 + i * 13, 1);
      });
      // rug: woven bands
      ctx.fillStyle = "#171a23"; ctx.beginPath(); ctx.ellipse(300, 330, 150, 22, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "#1e222c"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(300, 330, 118, 16, 0, 0, 7); ctx.stroke();
      ctx.strokeStyle = "#12151d"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(300, 330, 84, 11, 0, 0, 7); ctx.stroke();
      // window, LEFT (your modcam shows it on the right — mirrored)
      R(ctx, "#131a26", 41, 91, 98, 126);
      glass(ctx, 45, 95, 90, 118, "#1b2738", "#101824");
      for (let i = 0; i < 7; i++) {
        R(ctx, "#0d131d", 49, 103 + i * 15, 82, 5);
        L(ctx, "rgba(140,170,210,0.06)", 49, 109 + i * 15, 131, 109 + i * 15, 1);  // light leak
      }
      L(ctx, "#222e3e", 41, 91, 139, 91, 3); L(ctx, "#222e3e", 41, 213, 139, 213, 3);
      R(ctx, "#1a2433", 39, 213, 102, 5);               // sill
      // poster: framed mountain print
      R(ctx, "#202b3e", 163, 93, 46, 60);
      R(ctx, "#141c2c", 166, 96, 40, 54);
      ctx.fillStyle = "#28385a"; ctx.beginPath(); ctx.moveTo(169, 144); ctx.lineTo(186, 108); ctx.lineTo(203, 144); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#39507a"; ctx.beginPath(); ctx.moveTo(180, 122); ctx.lineTo(186, 108); ctx.lineTo(192, 122); ctx.closePath(); ctx.fill();
      hl(ctx, 163, 93, 46, 0.07);
      // desk + monitor (screen faces away — you only see its glow)
      P.shadow(ctx, 415, 304, 72, 5, 0.3);
      box(ctx, "#1a2230", 348, 240, 134, 9);
      R(ctx, "#10151f", 356, 249, 8, 52); R(ctx, "#10151f", 466, 249, 8, 52);
      const flick = 0.28 + 0.06 * Math.sin(t * 9.1) + 0.04 * Math.sin(t * 23.7);
      ctx.save(); ctx.translate(415, 205); ctx.scale(1.7, 1.0);          // screen spill onto wall
      P.light(ctx, 0, 0, 150, "120,160,230", flick * 0.42); ctx.restore();
      P.light(ctx, 412, 212, 70, "150,190,255", flick);                  // tight core
      P.light(ctx, 412, 212, 165, "120,160,230", flick * 0.4);           // broad halo
      refl(ctx, 415, 300, 120, 28, "120,160,230", 0.05);                 // cool floor reflection
      box(ctx, "#0d1119", 395, 200, 40, 28);
      ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = "#000";
      for (let i = 0; i < 4; i++) R(ctx, "#000", 400 + i * 8, 205, 4, 12);   // vents
      ctx.restore();
      R(ctx, "#0c1018", 412, 228, 9, 12);
      ctx.strokeStyle = "#0a0e15"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(432, 228); ctx.quadraticCurveTo(444, 252, 438, 296); ctx.stroke(); // cable
      R(ctx, "#1e1a2e", 372, 233, 8, 8); L(ctx, "#1e1a2e", 381, 235, 384, 238, 1.4);                 // mug
      hl(ctx, 350, 240, 130, 0.1);                                       // desk lip catches the screen
      refl(ctx, 415, 250, 90, 12, "120,160,230", 0.05);                  // screen reflection on desktop
      R(ctx, "#0c1018", 360, 244, 12, 5);                                // face-down phone
      if (Math.sin(t * 0.7) > 0.7) R(ctx, "rgba(120,200,255,0.3)", 363, 245, 6, 3);  // dim notification
      // YOU, seated just right of the screen, headphones on, back to this camera
      const pose = world.youPose(t);
      box(ctx, "#131925", 404, 254, 40, 42);                            // chair back — BEHIND you, so it doesn't notch the silhouette
      P.fig(ctx, 434 + pose.headX, 288 + pose.bob, 116, t, { seated: true, sway: 0, color: "#080b10", rimColor: "#8fb4d4" });
      headphones(ctx, 434 + pose.headX, 288 + pose.bob - 116 * 0.62 - 116 * 0.105 * 0.8, 116 * 0.105, { base: "#11161f", rimColor: "rgba(120,160,230,0.34)" });
      // couch: cushions, pillows, throw
      P.shadow(ctx, 560, 322, 64, 5, 0.3);
      box(ctx, "#1e2636", 500, 272, 120, 48); hl(ctx, 500, 272, 120, 0.08);
      L(ctx, "rgba(0,0,0,0.3)", 540, 276, 540, 316, 1.4);
      L(ctx, "rgba(0,0,0,0.3)", 580, 276, 580, 316, 1.4);
      box(ctx, "#1c2432", 494, 252, 22, 62);
      R(ctx, "#1c2432", 500, 258, 114, 16); hl(ctx, 500, 258, 114, 0.06);
      ctx.fillStyle = "#222d40"; P.rr(ctx, 548, 260, 24, 14, 4); ctx.fill();
      ctx.fillStyle = "#2a2330"; P.rr(ctx, 576, 260, 22, 13, 4); ctx.fill();
      R(ctx, "#262e3c", 496, 252, 18, 30);              // throw over the arm
      // lamp (state shared with your modcam — it went off at 2:10, remember?)
      L(ctx, "#222a36", 590, 212, 590, 268, 3);
      L(ctx, "#171d27", 583, 270, 597, 270, 3);
      const lg = ctx.createLinearGradient(0, 192, 0, 212);
      lg.addColorStop(0, world.lampOn ? "#463618" : "#1c2430");
      lg.addColorStop(1, world.lampOn ? "#2c2210" : "#141a24");
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.moveTo(577, 212); ctx.lineTo(603, 212); ctx.lineTo(596, 192); ctx.lineTo(584, 192); ctx.closePath(); ctx.fill();
      if (world.lampOn) {
        P.light(ctx, 590, 206, 84, "240,180,110", 0.26);
        refl(ctx, 590, 304, 70, 30, "240,180,110", 0.07);
      }
      // shelf: brackets, books, bookend, tiny plant
      R(ctx, "#1a212c", 500, 170, 118, 5); hl(ctx, 500, 170, 118, 0.08);
      L(ctx, "#141a24", 508, 175, 508, 182, 2); L(ctx, "#141a24", 608, 175, 608, 182, 2);
      d.books.forEach(b => {
        ctx.save();
        if (b.lean) { ctx.translate(b.x + 3, 170); ctx.rotate(-0.18); ctx.translate(-(b.x + 3), -170); }
        R(ctx, b.c, b.x, 170 - b.h, 7, b.h);
        ctx.restore();
      });
      R(ctx, "#252e3c", 615, 158, 4, 12);               // bookend
      R(ctx, "#1c1410", 498, 162, 7, 8);
      ctx.fillStyle = "#1c3022"; ctx.beginPath(); ctx.ellipse(501.5, 158, 4, 5, 0, 0, 7); ctx.fill();
      // 4:40 AM — something is standing point-blank where this camera is:
      // a body looming over the lens, head at the top of frame, shoulders flared.
      if (world.aptFigure) {
        const sway = Math.sin(t * 0.3) * 2.2;                       // a slow lean at the glass
        // point-blank: the SAME creature, now CROWDING the lens — a value-hole mass over the near
        // half of frame, small low head + long neck up top, eyes the brightest in the game. You sit
        // oblivious at the desk to the right. Recognition + occlusion is the scare.
        P.light(ctx, 150 + sway, 200, 220, "40,42,54", 0.10);      // it blocks the room light
        P.light(ctx, 212 + sway, 100, 150, "70,78,98", 0.13);      // lift the wall behind the head so the dome reads
        const body = ctx.createLinearGradient(0, 0, 0, 360);        // value-hole: blacker than the room
        body.addColorStop(0, "#0c1018");
        body.addColorStop(0.18, "#000002");
        body.addColorStop(1, "#06080d");
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(-40, 360); ctx.lineTo(-40, -10);
        ctx.lineTo(162 + sway, -10);                                // top edge, left of the neck
        ctx.quadraticCurveTo(182 + sway, 50, 192 + sway, 106);      // long throat (right side of the neck)
        ctx.quadraticCurveTo(206 + sway, 158, 252 + sway, 178);     // neck flares into the body under the head
        ctx.quadraticCurveTo(314 + sway, 190, 328 + sway, 250);     // near shoulder / upper-arm bulge (the looming mass)
        ctx.quadraticCurveTo(340 + sway, 310, 288 + sway, 360);     // taper to the floor
        ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.ellipse(212 + sway, 100, 54, 66, 0, 0, 7); ctx.fill();   // BIG head, point-blank at the lens
        ctx.save(); ctx.translate(212 + sway, 100); P.eyeGlints(ctx, 58, t, 0.3); ctx.restore();  // inescapable gaze
        // rim: clamped to the contour, short broken segments only (never slashing across empty space)
        ctx.globalAlpha = 0.4; ctx.strokeStyle = "#9fc0dc"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(214 + sway, 38);
        ctx.quadraticCurveTo(258 + sway, 54, 264 + sway, 104); ctx.stroke();          // head dome, upper-right
        ctx.beginPath();
        ctx.moveTo(300 + sway, 198);
        ctx.quadraticCurveTo(328 + sway, 240, 322 + sway, 296); ctx.stroke();         // near shoulder edge
        ctx.globalAlpha = 1; ctx.lineCap = "butt";
        const grad = ctx.createLinearGradient(330, 0, 510, 0);      // push the room (and you) back, do not hide
        grad.addColorStop(0, "rgba(0,0,0,0.34)"); grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad; ctx.fillRect(330, 0, 180, 360);
      }
    },
    anomalies: []
  };

  // ======================================================================
  // MODCAM — you, at your desk, required by §4
  // ======================================================================
  function drawModcam(ctx, t, world) {
    const w = 320, h = 180;
    R(ctx, "#05070c", 0, 0, w, h);
    grade(ctx, 0, 28, w, 124, "#172033", "#0c1119");
    R(ctx, "#0d1017", 0, 152, w, 28);
    P.light(ctx, 160, 56, 180, "120,150,190", 0.1);
    // doorway, behind you (center-left)
    R(ctx, "#030405", 78, 34, 50, 124);
    if (world.doorOpen) {
      R(ctx, world.lampOn ? "#0d1118" : "#04060a", 82, 38, 42, 120);   // void onto the hall when dark
      L(ctx, "rgba(150,165,185,0.12)", 121, 40, 121, 156, 1.5);         // light-leak down the hinge
      L(ctx, "#11151d", 82, 150, 124, 144, 2);
      ctx.save(); ctx.translate(78, 34);
      ctx.fillStyle = "#0e1118";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-16, 8); ctx.lineTo(-16, 130); ctx.lineTo(0, 124); ctx.closePath(); ctx.fill();
      L(ctx, "#1a212c", -16, 8, -16, 130, 1.5);
      L(ctx, "rgba(150,170,200,0.12)", 0, 0, 0, 124, 1);                // door edge catch-light
      ctx.restore();
    }
    L(ctx, "#202b3c", 78, 34, 78, 158, 2.5); L(ctx, "#202b3c", 128, 34, 128, 158, 2.5);
    L(ctx, "#202b3c", 78, 34, 128, 34, 2.5);
    hl(ctx, 78, 34, 50, 0.05);
    // 3:33 AM — it stands in your doorway for eight seconds, backlit.
    if (world.doorFigure) {
      P.light(ctx, 103, 92, 40, "70,86,108", 0.18);
      P.fig(ctx, 103, 156, 118, t, { sway: 0.2, color: "#0c1220", rimColor: "#9fbcd8", rim: true });
    }
    // window, RIGHT (mirror of apartment_cam's left window)
    glass(ctx, 228, 42, 62, 74, "#1b2738", "#101824");
    for (let i = 0; i < 5; i++) {
      R(ctx, "#0d131d", 228, 50 + i * 14, 62, 4);
      L(ctx, "rgba(140,170,210,0.06)", 228, 55 + i * 14, 290, 55 + i * 14, 1);
    }
    L(ctx, "#222e3e", 228, 42, 290, 42, 2); L(ctx, "#222e3e", 228, 116, 290, 116, 2);
    L(ctx, "#222e3e", 228, 42, 228, 116, 2); L(ctx, "#222e3e", 290, 42, 290, 116, 2);
    // poster, right wall — same mountain print
    R(ctx, "#202b3e", 182, 44, 34, 44);
    R(ctx, "#141c2c", 184.5, 46.5, 29, 39);
    ctx.fillStyle = "#28385a"; ctx.beginPath(); ctx.moveTo(187, 81); ctx.lineTo(199, 56); ctx.lineTo(211, 81); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#39507a"; ctx.beginPath(); ctx.moveTo(195, 66); ctx.lineTo(199, 56); ctx.lineTo(203, 66); ctx.closePath(); ctx.fill();
    // lamp, LEFT
    L(ctx, "#222a36", 38, 98, 38, 140, 2);
    const lg = ctx.createLinearGradient(0, 82, 0, 96);
    lg.addColorStop(0, world.lampOn ? "#463618" : "#1c2430");
    lg.addColorStop(1, world.lampOn ? "#2c2210" : "#141a24");
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.moveTo(28, 96); ctx.lineTo(48, 96); ctx.lineTo(43, 82); ctx.lineTo(33, 82); ctx.closePath(); ctx.fill();
    if (world.lampOn) P.light(ctx, 38, 92, 56, "240,180,110", 0.34);
    // shelf, left
    R(ctx, "#1a212c", 14, 64, 52, 3); hl(ctx, 14, 64, 52, 0.07);
    for (let i = 0; i < 5; i++) R(ctx, ["#1a2230", "#22202c", "#1c2824"][i % 3], 18 + i * 9, 52, 6, 12);
    // couch arm, bottom-right
    box(ctx, "#1a212c", 268, 136, 52, 44);
    L(ctx, "rgba(0,0,0,0.25)", 268, 150, 320, 150, 1.4);
    // ---- YOU (seated at your post, back to the cam, carved by the monitor glow) ----
    const pose = world.youPose(t), bob = pose.bob;
    // the thing directly behind your chair — a second body, turned to face the lens (its eyes)
    if (world.behindYou) P.fig(ctx, 198, 188, 158, t, { face: true, sway: 0.1, color: "#0a0e16", rimColor: "#9fc0dc" });
    const hx = pose.headX * 0.5;
    const flick = 0.22 + 0.05 * Math.sin(t * 9.1) + 0.03 * Math.sin(t * 23.7);
    ctx.save();
    ctx.translate(160 + pose.headX * 0.3, 0);             // +x is the lit (monitor) side
    // (0) office chair — high back + side bolsters; a hair lighter so the black body separates
    ctx.fillStyle = "#0c1119"; P.rr(ctx, -62, 116, 124, 76, 14); ctx.fill();
    ctx.fillStyle = "#0a0e15"; P.rr(ctx, -62, 116, 24, 76, 11); ctx.fill(); P.rr(ctx, 38, 116, 24, 76, 11); ctx.fill();
    L(ctx, "rgba(0,0,0,0.4)", 0, 122, 0, 190, 1);                 // centre seam
    hl(ctx, -60, 116, 120, 0.05);                                 // top rim of the chair back
    R(ctx, "rgba(150,185,255,0.18)", 60, 126, 1.4, 58);          // far pipe edge catches the monitor
    // (1) the body — ONE clean path: sloped shoulders, narrow neck, breathing
    ctx.save(); ctx.translate(0, bob);
    function torso() {
      ctx.beginPath();
      ctx.moveTo(-54, 192);
      ctx.quadraticCurveTo(-58, 158, -45, 140);                   // left deltoid
      ctx.quadraticCurveTo(-31, 122, -12, 112);                   // trapezius into the neck base
      ctx.lineTo(-9, 100); ctx.lineTo(9, 100); ctx.lineTo(12, 112);  // neck (narrower than the head)
      ctx.quadraticCurveTo(31, 122, 45, 140);                     // right trapezius
      ctx.quadraticCurveTo(58, 158, 54, 192);                     // right deltoid
      ctx.closePath();
    }
    ctx.fillStyle = "#05070d"; torso(); ctx.fill();
    ctx.save(); torso(); ctx.clip();                              // form-shade: barrel-round, lit far third
    const fgr = ctx.createLinearGradient(-58, 0, 60, 0);
    fgr.addColorStop(0, "#04060b"); fgr.addColorStop(0.55, "#05080f"); fgr.addColorStop(1, "#0e1626");
    ctx.fillStyle = fgr; ctx.fillRect(-60, 100, 124, 92);
    R(ctx, "rgba(2,4,9,0.82)", -3, 108, 6, 84);                   // spine core shadow
    ctx.restore();
    // (2) the back of the head, occiput rounded, seated on the neck
    ctx.fillStyle = "#05070d"; ctx.beginPath(); ctx.ellipse(hx, 84, 17, 20, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.ellipse(hx, 84, 17, 20, 0, 0, 7); ctx.clip();
    const hgr = ctx.createLinearGradient(hx - 17, 0, hx + 17, 0);
    hgr.addColorStop(0, "#05070d"); hgr.addColorStop(0.6, "#070b13"); hgr.addColorStop(1, "#12203a");
    ctx.fillStyle = hgr; ctx.fillRect(hx - 17, 64, 34, 41);
    ctx.restore();
    // (3) over-ear headphones — band over the crown + a cup each side (seen from behind)
    headphones(ctx, hx, 84, 19, { base: "#0e131c", rimColor: "rgba(120,160,230,0.3)" });
    // (4) monitor rim — cool light only on the far (+x) contour + crown, tapered (no dash)
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    const shg = ctx.createLinearGradient(0, 104, 0, 172);
    shg.addColorStop(0, "rgba(150,185,255,0)");
    shg.addColorStop(0.35, "rgba(150,185,255," + (0.26 + flick * 0.12) + ")");
    shg.addColorStop(1, "rgba(150,185,255,0)");
    ctx.strokeStyle = shg; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(11, 110); ctx.quadraticCurveTo(31, 122, 45, 140); ctx.quadraticCurveTo(58, 158, 54, 184); ctx.stroke();
    const skg = ctx.createLinearGradient(0, 64, 0, 94);
    skg.addColorStop(0, "rgba(150,185,255," + (0.16 + flick * 0.09) + ")");
    skg.addColorStop(1, "rgba(150,185,255,0)");
    ctx.strokeStyle = skg; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(hx, 84, 19, -Math.PI * 0.6, Math.PI * 0.05); ctx.stroke();
    ctx.restore();
    ctx.restore();                                                // end breathing body
    // (5) faint monitor fill so the body isn't pure black
    P.light(ctx, 4, 200, 130, "120,160,230", 0.08 + flick * 0.07);
    ctx.restore();
    R(ctx, "rgba(140,180,240,0.10)", 70, 176, 180, 4);            // monitor bottom-edge glow on the desk
  }

  // Stages 2 and 3 draw in front of everything: it is closer than the furniture now.
  function drawStagedFigs(ctx, scene, S, t) {
    if (!scene.figStages) return;
    Object.keys(scene.figStages).forEach(key => {
      const stage = S[key];
      if (!stage || stage < 2) return;
      const def = scene.figStages[key][stage - 2];
      const fd = scene.figDark || 1;   // per-scene loom-darkening (bright feeds need more)
      P.shadow(ctx, def.x, def.gy - 1, def.h * 0.30, def.h * 0.05, 0.38, true);
      // a tight, hard contact pancake right at the feet so it is planted, not hovering
      ctx.save(); ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath(); ctx.ellipse(def.x, def.gy, def.h * 0.13, Math.max(1.5, def.h * 0.025), 0, 0, 7); ctx.fill();
      ctx.restore();
      P.fig(ctx, def.x, def.gy, def.h, t, {
        face: !!def.face,
        sway: def.sway !== undefined ? def.sway : 0.4,
        color: def.color || "#030405",
        rimColor: scene.figRim || "#8fb0c4"
      });
      if (def.face) {  // at stage 3 the room darkens around it — scaled per scene so it always reads
        const cx = def.x, cy = def.gy - def.h * 0.55;
        const g = ctx.createRadialGradient(cx, cy, def.h * 0.48, cx, cy, def.h * 1.7);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.6, "rgba(0,0,0," + (0.18 * fd) + ")");
        g.addColorStop(1, "rgba(0,0,0," + Math.min(0.85, 0.40 * fd) + ")");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    });
  }

  return {
    list: [gasmart, laundromat, daycare, office, warehouse, lobby],
    apartment,
    drawModcam,
    drawStagedFigs
  };
})();
