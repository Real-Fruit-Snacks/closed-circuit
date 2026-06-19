// CLOSED CIRCUIT — audio.js
// All sound is synthesized with WebAudio. No files.
window.MQ = window.MQ || {};

MQ.audio = (function () {
  let ac = null, master = null, muted = false;
  let bedGain = null, hissGain = null, hissFilter = null, droneGain = null, droneOsc = null;
  let presOsc = null, presGain = null;
  let breathGain = null, breathLfoG = null;
  let unlocked = false;

  try { muted = localStorage.getItem("mq_muted") === "1"; } catch (e) {}

  function noiseBuffer(seconds, brown) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * white) / 1.02; d[i] = last * 3.2; }
      else d[i] = white;
    }
    return buf;
  }

  function unlock() {
    if (unlocked) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    unlocked = true;

    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(ac.destination);

    // --- room-tone bed: brown noise + mains hum ---
    bedGain = ac.createGain(); bedGain.gain.value = 0.05; bedGain.connect(master);
    const bedSrc = ac.createBufferSource();
    bedSrc.buffer = noiseBuffer(3, true); bedSrc.loop = true;
    const bedLp = ac.createBiquadFilter(); bedLp.type = "lowpass"; bedLp.frequency.value = 220;
    bedSrc.connect(bedLp); bedLp.connect(bedGain); bedSrc.start();

    const hum = ac.createOscillator(); hum.type = "triangle"; hum.frequency.value = 55;
    const humG = ac.createGain(); humG.gain.value = 0.016;
    hum.connect(humG); humG.connect(master); hum.start();
    const hum2 = ac.createOscillator(); hum2.type = "sine"; hum2.frequency.value = 110.4;
    const hum2G = ac.createGain(); hum2G.gain.value = 0.007;
    hum2.connect(hum2G); hum2G.connect(master); hum2.start();

    // --- per-stream hiss (retuned on switch) ---
    hissGain = ac.createGain(); hissGain.gain.value = 0.0; hissGain.connect(master);
    const hissSrc = ac.createBufferSource();
    hissSrc.buffer = noiseBuffer(2, false); hissSrc.loop = true;
    hissFilter = ac.createBiquadFilter(); hissFilter.type = "bandpass";
    hissFilter.frequency.value = 1400; hissFilter.Q.value = 0.7;
    hissSrc.connect(hissFilter); hissFilter.connect(hissGain); hissSrc.start();
    hissGain.gain.setTargetAtTime(0.028, ac.currentTime, 0.4);

    // --- danger drone (gain driven by integrity) ---
    droneOsc = ac.createOscillator(); droneOsc.type = "sawtooth"; droneOsc.frequency.value = 46;
    const droneLp = ac.createBiquadFilter(); droneLp.type = "lowpass"; droneLp.frequency.value = 300;
    droneGain = ac.createGain(); droneGain.gain.value = 0;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.13;
    const lfoG = ac.createGain(); lfoG.gain.value = 6;
    lfo.connect(lfoG); lfoG.connect(droneOsc.frequency); lfo.start();
    droneOsc.connect(droneLp); droneLp.connect(droneGain); droneGain.connect(master);
    droneOsc.start();

    // --- presence: something close is on the feed you're watching ---
    presOsc = ac.createOscillator(); presOsc.type = "triangle"; presOsc.frequency.value = 57;
    const presLfo = ac.createOscillator(); presLfo.frequency.value = 1.7;
    const presLfoG = ac.createGain(); presLfoG.gain.value = 4;
    presLfo.connect(presLfoG); presLfoG.connect(presOsc.frequency); presLfo.start();
    presGain = ac.createGain(); presGain.gain.value = 0;
    presOsc.connect(presGain); presGain.connect(master);
    presOsc.start();

    // --- breathing: the thing in YOUR room. Close, wet, slow. Silent until it's near. ---
    const breathSrc = ac.createBufferSource();
    breathSrc.buffer = noiseBuffer(4, false); breathSrc.loop = true;
    const breathLp = ac.createBiquadFilter(); breathLp.type = "lowpass"; breathLp.frequency.value = 540; breathLp.Q.value = 1.3;
    breathGain = ac.createGain(); breathGain.gain.value = 0;
    breathSrc.connect(breathLp); breathLp.connect(breathGain); breathGain.connect(master); breathSrc.start();
    // a slow in/out rhythm — the LFO IS the signal, so it falls silent at each zero crossing
    const breathLfo = ac.createOscillator(); breathLfo.type = "sine"; breathLfo.frequency.value = 0.27;
    breathLfoG = ac.createGain(); breathLfoG.gain.value = 0;   // depth (and on/off) set by setBreath
    breathLfo.connect(breathLfoG); breathLfoG.connect(breathGain.gain); breathLfo.start();
  }

  function env(node, peak, attack, decay) {
    const t = ac.currentTime;
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function tone(freq, type, peak, attack, decay, when) {
    if (!ac) return;
    const o = ac.createOscillator(); o.type = type || "sine"; o.frequency.value = freq;
    const g = ac.createGain(); g.gain.value = 0.0001;
    o.connect(g); g.connect(master);
    const t0 = ac.currentTime + (when || 0);
    o.start(t0); o.stop(t0 + attack + decay + 0.05);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function noiseHit(peak, decay, freq, q) {
    if (!ac) return;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(decay + 0.1, false);
    const f = ac.createBiquadFilter(); f.type = "bandpass";
    f.frequency.value = freq || 1800; f.Q.value = q || 0.8;
    const g = ac.createGain(); g.gain.value = 0.0001;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    env(g, peak, 0.008, decay);
    src.stop(ac.currentTime + decay + 0.2);
  }

  // ---------- public cues ----------
  function switchFeed(seed) {
    if (!ac) return;
    hissFilter.frequency.setTargetAtTime(900 + (seed % 7) * 420, ac.currentTime, 0.05);
    noiseHit(0.05, 0.07, 2400, 0.5); // tune blip
  }
  function uiTick()    { tone(660, "sine", 0.025, 0.004, 0.05); }
  function openPanel() { tone(520, "sine", 0.03, 0.005, 0.07); }
  function confirm()   { tone(520, "sine", 0.05, 0.006, 0.09); tone(780, "sine", 0.05, 0.006, 0.12, 0.09); }
  function reject()    { tone(170, "square", 0.04, 0.005, 0.16); tone(120, "square", 0.035, 0.005, 0.2, 0.1); }
  function thud()      { tone(38, "sine", 0.16, 0.06, 0.9); }       // scripted dread
  function burst()     { noiseHit(0.16, 0.22, 900, 0.4); }          // glitch hit
  function bigBurst()  { noiseHit(0.3, 0.7, 600, 0.3); tone(52, "sawtooth", 0.12, 0.02, 0.8); }
  function alert_()    { tone(880, "sine", 0.045, 0.005, 0.1); tone(880, "sine", 0.045, 0.005, 0.1, 0.16); }

  function setDanger(level01) { // 0 calm .. 1 dying
    if (!ac || !droneGain) return;
    droneGain.gain.setTargetAtTime(0.07 * Math.pow(level01, 1.6), ac.currentTime, 0.8);
  }
  function setPresence(level01) { // 0 none .. 1 it is facing you
    if (!ac || !presGain) return;
    presGain.gain.setTargetAtTime(0.055 * level01, ac.currentTime, 0.5);
  }
  function setBreath(level01) {   // 0 none .. 1 it is right behind you
    if (!ac || !breathLfoG) return;
    breathLfoG.gain.setTargetAtTime(0.12 * level01, ac.currentTime, 0.9);
  }
  function inhale() {             // a slow, wet drawn breath — the moment it arrives
    if (!ac) return;
    const src = ac.createBufferSource(); src.buffer = noiseBuffer(1.1, false);
    const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 680; f.Q.value = 1.1;
    const g = ac.createGain(); g.gain.value = 0.0001;
    src.connect(f); f.connect(g); g.connect(master);
    const t = ac.currentTime; src.start(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    src.stop(t + 1.1);
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem("mq_muted", m ? "1" : "0"); } catch (e) {}
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.85, ac.currentTime, 0.05);
  }
  function isMuted() { return muted; }
  function suspend() { if (ac && ac.state === "running") ac.suspend(); }
  function resume()  { if (ac && ac.state === "suspended") ac.resume(); }

  return {
    unlock, switchFeed, uiTick, openPanel, confirm, reject, thud, burst, bigBurst,
    alert: alert_, setDanger, setPresence, setBreath, inhale, setMuted, isMuted, suspend, resume
  };
})();
