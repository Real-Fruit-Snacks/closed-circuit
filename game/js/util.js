// CLOSED CIRCUIT — util.js
window.MQ = window.MQ || {};

MQ.util = (function () {
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function irnd(a, b) { return Math.floor(rnd(a, b + 1)); }
  function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  // Deterministic PRNG for stable scene decoration.
  function mulberry(seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Game minutes (0 = midnight) -> "12:34 AM"
  function fmtClock(min) {
    min = Math.floor(min);
    let h24 = Math.floor(min / 60) % 24;          // 0..5 for our shift
    const m = min % 60;
    let h12 = h24 % 12; if (h12 === 0) h12 = 12;
    const ap = h24 < 12 ? "AM" : "PM";
    return h12 + ":" + pad2(m) + " " + ap;
  }

  function fmtUp(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return pad2(h) + ":" + pad2(m) + ":" + pad2(s);
  }

  // Smooth deterministic wobble in [-1,1], stable per (seed, period).
  function wob(t, seed, period) {
    return Math.sin(t * (Math.PI * 2) / period + seed * 17.31);
  }

  return { clamp, lerp, rnd, irnd, choice, pad2, mulberry, fmtClock, fmtUp, wob };
})();
