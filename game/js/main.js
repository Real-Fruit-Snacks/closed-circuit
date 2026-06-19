// CLOSED CIRCUIT — main.js
// State machine, render loop, input, entry-filing flow.
window.MQ = window.MQ || {};

(function () {
  const U = MQ.util, P = MQ.paint, T = MQ.TUNE;
  const DEBUG = /[?&]debug=1/.test(location.search);

  const game = {
    state: "title",            // title | shift | ending | ended
    tMin: 0,                   // game minutes since midnight (360 = 6 AM)
    timeScale: DEBUG ? 6 : 1,
    cur: 0,
    streams: [],
    aptIdx: 6,
    world: {
      lampOn: true, doorFigure: false, doorOpen: false,
      aptFigure: false, aptOffline: false, behindYou: false,
      youPose(t) {
        return {
          bob: Math.sin(t * 0.55) * 1.6 + Math.sin(t * 0.21) * 0.8,
          headX: Math.sin(t * 0.11) * 2 + Math.sin(t * 0.043) * 1.5
        };
      }
    },
    pendingTicket: null,       // {id, catId, streamIdx, revealAt, result}
    lockoutUntil: 0,
    lockoutMult: 1,
    falseFlags: 0,
    aptFlags: 0,
    viewedApartment: false,
    paused: false,
    endingKind: null,
    endingT: 0
  };
  MQ.game = game;

  let feedCv, feedCtx, modCv, modCtx, titleCv, titleCtx;

  // ---------------- setup ----------------
  function buildStreams() {
    const defs = MQ.scenes.list.concat([MQ.scenes.apartment]);
    game.streams = defs.map((scene, i) => ({
      scene,
      S: {},
      decor: scene.decor ? scene.decor(U.mulberry(scene.seed)) : null,
      glitchUntil: 0,
      upOffset: 3600 * U.rnd(2, 9),
      offline: false,
      inQueue: !scene.special      // apartment_cam joins at 4:15
    }));
  }

  function boot() {
    feedCv = document.getElementById("feed");   feedCtx = feedCv.getContext("2d");
    modCv = document.getElementById("modcam");  modCtx = modCv.getContext("2d");
    titleCv = document.getElementById("titleNoise"); titleCtx = titleCv.getContext("2d");
    P.initNoise();
    buildStreams();
    MQ.ui.init(game);
    MQ.ui.rebuildQueue(game);

    document.getElementById("clockIn").onclick = startShift;
    document.addEventListener("keydown", onKey);
    // click any camera (main feed OR your desk cam) to enlarge it (click again or ESC to shrink)
    document.getElementById("feedWrap").addEventListener("click", () => toggleZoom("feedWrap"));
    document.getElementById("modcamDock").addEventListener("click", () => toggleZoom("modcamDock"));
    document.addEventListener("visibilitychange", () => {
      const hide = document.hidden && game.state === "shift";
      game.paused = hide;
      document.getElementById("pauseVeil").classList.toggle("hidden", !hide);
      if (hide) MQ.audio.suspend(); else MQ.audio.resume();
    });

    fitStage();
    window.addEventListener("resize", fitStage);
    requestAnimationFrame(frame);
  }

  function fitStage() {
    const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    document.getElementById("stage").style.transform = "scale(" + s + ")";
  }

  function startShift() {
    MQ.audio.unlock();
    MQ.audio.uiTick();
    document.getElementById("titleScreen").classList.add("hidden");
    document.getElementById("console").classList.remove("hidden");
    game.state = "shift";
    MQ.audio.switchFeed(game.streams[0].scene.seed);
    MQ.ui.openRules();              // diegetic tutorial: rulebook opens once
  }

  // ---------------- input ----------------
  // enlarge a camera (id = "feedWrap" main feed, or "modcamDock" desk cam); only one at a time
  function toggleZoom(id) {
    if (game.state !== "shift") return;
    if (MQ.ui.isRulesOpen() || MQ.ui.isFlagOpen() || MQ.ui.isLogOpen()) return;
    const other = document.getElementById(id === "feedWrap" ? "modcamDock" : "feedWrap");
    other.classList.remove("zoomed");
    document.getElementById(id).classList.toggle("zoomed");
    MQ.audio.uiTick();
  }

  function onKey(e) {
    if (game.state === "title" && (e.key === "Enter" || e.key === " ")) { startShift(); return; }
    if (game.state !== "shift") return;

    if (MQ.ui.isFlagOpen()) {
      if (e.key === "Escape") { MQ.ui.closeFlag(); return; }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 6) { game.submitTicket(MQ.CATS[n - 1].id); }
      return;
    }
    if (MQ.ui.isRulesOpen()) {
      if (e.key === "Escape" || e.key.toLowerCase() === "r") MQ.ui.closeRules();
      return;
    }
    if (MQ.ui.isLogOpen()) {
      if (e.key === "Escape" || e.key.toLowerCase() === "l") MQ.ui.closeLog();
      return;
    }
    const fw = document.getElementById("feedWrap"), md = document.getElementById("modcamDock");
    if (e.key === "Escape" && (fw.classList.contains("zoomed") || md.classList.contains("zoomed"))) {
      fw.classList.remove("zoomed"); md.classList.remove("zoomed"); return;
    }

    switch (e.key) {
      case "ArrowLeft":  switchRel(-1); break;
      case "ArrowRight": switchRel(1); break;
      case "0": toggleZoom("modcamDock"); break;   // 0 = your desk cam (enlarge)
      case "f": case "F": case " ": MQ.ui.openFlag(game); e.preventDefault(); break;
      case "r": case "R": MQ.audio.uiTick(); MQ.ui.openRules(); break;
      case "l": case "L": MQ.audio.uiTick(); MQ.ui.toggleLog(game); break;
      case "m": case "M": MQ.audio.setMuted(!MQ.audio.isMuted());
        MQ.ui.els().muteBtn.textContent = MQ.audio.isMuted() ? "SND OFF" : "SND ON"; break;
      default: {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= 7) {
          const visible = game.streams.map((s, i) => s.inQueue ? i : -1).filter(i => i >= 0);
          if (visible[n - 1] !== undefined) game.switchStream(visible[n - 1]);
        }
      }
    }
  }

  function switchRel(d) {
    const visible = game.streams.map((s, i) => s.inQueue ? i : -1).filter(i => i >= 0);
    const pos = visible.indexOf(game.cur);
    game.switchStream(visible[(pos + d + visible.length) % visible.length]);
  }

  game.switchStream = function (i) {
    if (!game.streams[i] || !game.streams[i].inQueue || i === game.cur) return;
    game.cur = i;
    if (game.streams[i].scene.special === "apartment" && !game.viewedApartment) {
      game.viewedApartment = true;
      MQ.ui.rebuildQueue(game);     // clears the NEW badge
    }
    game.streams[i].glitchUntil = MQ.director.state.realT + 0.25;
    MQ.audio.switchFeed(game.streams[i].scene.seed);
    MQ.ui.closeFlag();
    MQ.ui.refreshQueue(game);
  };

  // ---------------- entries ----------------
  game.submitTicket = function (catId) {
    if (game.pendingTicket || game.state !== "shift" || game.streams[game.cur].offline) return;
    MQ.ui.closeFlag();
    const res = MQ.director.evaluate(game, catId);
    if (res.special === "apartment") { game.aptFlags++; res.attempts = game.aptFlags; }
    game.pendingTicket = {
      id: MQ.ui.ticketPending(), catId, streamIdx: game.cur,
      revealAt: MQ.director.state.realT + T.TICKET_DELAY, result: res
    };
    MQ.audio.uiTick();
  };

  function settleTicket() {
    const tk = game.pendingTicket;
    game.pendingTicket = null;
    const res = tk.result;
    if (res.ok) MQ.director.file(game, res.ev);          // filed. not fixed. filed.
    else if (res.special) MQ.director.fileApartment(game, tk.catId);
    MQ.ui.ticketResult(res, tk.id, tk.catId);
    MQ.ui.refreshQueue(game);
    if (res.ok) {
      game.lockoutMult = 1;
      // ARGUS waves you off the story clues — steering you away from what they add up to
      const dm = res.ev.clue && MQ.director.clueDismiss(res.ev.key);
      if (dm) setTimeout(() => { if (game.state === "shift") MQ.ui.superMsg(dm); }, 1500);
    } else if (res.dup) {
      game.lockoutUntil = MQ.director.state.realT + T.DUP_LOCKOUT;
    } else {
      const lock = res.special ? 5 : Math.min(T.LOCKOUT_MAX, T.LOCKOUT_BASE * game.lockoutMult);
      if (!res.special) { game.falseFlags++; game.lockoutMult *= T.LOCKOUT_GROWTH; }
      game.lockoutUntil = MQ.director.state.realT + lock;
    }
  }

  // ---------------- endings ----------------
  function beginEnding(kind) {
    game.state = "ending";
    game.endingKind = kind;
    game.endingT = 0;
    MQ.ui.closeFlag(); MQ.ui.closeRules(); MQ.ui.closeLog();
    MQ.audio.setPresence(0);
    if (kind === "fail") MQ.audio.bigBurst();
  }

  function endingFrame(dt) {
    game.endingT += dt;
    const t = game.endingT;
    if (game.endingKind === "fail") {
      if (t < 0.9) {
        renderFeed(0.9);
      } else if (t < 3.3) {
        game.world.behindYou = true;
        feedCtx.setTransform(1, 0, 0, 1, 0, 0);
        feedCtx.save();
        feedCtx.scale(2, 2);
        MQ.scenes.drawModcam(feedCtx, MQ.director.state.realT, game.world);
        feedCtx.restore();
        P.fxPass(feedCtx, feedCv, 0.5, t > 3.0 ? 0.8 : 0.12, MQ.director.state.realT);
        if (t > 2.1 && Math.floor(t * 18) % 5 === 0) MQ.audio.burst();
      } else {
        feedCtx.fillStyle = "#000"; feedCtx.fillRect(0, 0, 640, 360);
        if (t > 3.9) finishEnding();
      }
    } else {
      renderFeed(t < 1.0 ? 0.5 : 0);
      if (t > 1.6) finishEnding();
    }
  }

  function finishEnding() {
    game.state = "ended";
    MQ.audio.setDanger(0);
    MQ.ui.showEnd(game.endingKind, MQ.director.stats(game), game);
  }

  // ---------------- rendering ----------------
  function renderFeed(extraGlitch) {
    const st = game.streams[game.cur];
    const D = MQ.director.state;
    const t = D.realT;
    const S = st.S;
    game.world.tMin = game.tMin;          // room clocks read the same time the OSD shows

    feedCtx.setTransform(1, 0, 0, 1, 0, 0);
    feedCtx.fillStyle = "#000";
    feedCtx.fillRect(0, 0, 640, 360);

    if (st.offline) {
      P.drawNoise(feedCtx, 640, 360, 0.5);
      P.scanlines(feedCtx, 640, 360, 0.25);
      P.vignette(feedCtx, 640, 360, 0.7);
      P.camText(feedCtx, "NO SIGNAL", 10, 350, { tint: "rgba(225,80,70,0.7)" });
      MQ.audio.setPresence(0);
      return;
    }

    feedCtx.save();
    if (S.camTilt) {
      feedCtx.translate(320, 180);
      feedCtx.rotate(st.scene.tiltDir * 0.045);
      feedCtx.scale(1.07, 1.07);
      feedCtx.translate(-320, -180);
    }
    if (S.camZoom) {
      feedCtx.translate(320, 180);
      feedCtx.scale(1.10, 1.10);
      feedCtx.translate(-320, -180);
    }
    if (S.camShake) feedCtx.translate((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 5);
    st.scene.draw(feedCtx, S, t, game.world, st.decor);
    MQ.scenes.drawStagedFigs(feedCtx, st.scene, S, t);
    feedCtx.restore();

    const apt = st.scene.special === "apartment";
    P.camText(feedCtx, st.scene.id.toUpperCase() + "  " + U.fmtClock(game.tMin) + "  REC", 10, 350, {
      t, rec: true,
      irregular: apt, jitter: apt ? 0.8 : 0,
      tint: apt ? "rgba(224,196,150,0.78)" : "rgba(208,224,216,0.78)",
      recColor: apt ? "rgba(235,150,40,0.95)" : "rgba(225,60,50,0.95)"
    });

    // presence: how close is the thing on THIS feed (drives the dread drone)
    let near = 0;
    if (apt) {
      // the apartment dread rides on PROXIMITY now, not on any viewer count
      MQ.audio.setPresence(st.offline ? 0 : game.world.doorOpen ? 1 : game.world.aptFigure ? 0.65 : 0.12);
    } else {
      if (st.scene.figStages)
        Object.keys(st.scene.figStages).forEach(k => { if (S[k] >= 2) near = Math.max(near, S[k] - 1); });
      MQ.audio.setPresence(near >= 2 ? 1 : near ? 0.45 : 0);
    }

    let glitch = extraGlitch || 0;
    if (st.glitchUntil > t) glitch = Math.max(glitch, 0.7 * U.clamp(st.glitchUntil - t, 0, 1));
    if (S.camStatic) glitch = Math.max(glitch, 0.2 + 0.35 * Math.abs(Math.sin(t * 1.7)));
    if (near) glitch = Math.max(glitch, near >= 2 ? 0.14 : 0.06);
    P.fxPass(feedCtx, feedCv, st.scene.q, glitch, t, st.scene.seed);
  }

  function renderModcam() {
    const t = MQ.director.state.realT;
    modCtx.setTransform(1, 0, 0, 1, 0, 0);
    MQ.scenes.drawModcam(modCtx, t, game.world);
    // same DVR grammar as the feeds, just a different sensor seed
    P.fxPass(modCtx, modCv, 0.82, 0, t, 999);
    P.camText(modCtx, "DESK CAM  " + U.fmtClock(game.tMin) + "  REC", 8, 172, { t, rec: true, size: 9 });
    // the thing in your room breathes louder as it nears — ambient, from behind you
    const w = game.world;
    MQ.audio.setBreath(w.behindYou ? 1 : w.doorOpen ? 0.85 : w.aptFigure ? 0.7 : w.doorFigure ? 0.55 : 0);
  }

  function renderTitle() {
    titleCtx.fillStyle = "#020304";
    titleCtx.fillRect(0, 0, 640, 360);
    P.drawNoise(titleCtx, 640, 360, 0.16);
    P.scanlines(titleCtx, 640, 360, 0.2);
    P.vignette(titleCtx, 640, 360, 0.5);
  }

  // ---------------- main loop ----------------
  let lastTs = 0, feedAcc = 0, hudAcc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    if (game.paused) return;

    if (game.state === "title") {
      feedAcc += dt;
      if (feedAcc > 1 / 18) { renderTitle(); feedAcc = 0; }
      return;
    }
    if (game.state === "ended") return;

    if (game.state === "ending") {
      MQ.director.state.realT += dt;
      feedAcc += dt;
      if (feedAcc > 1 / 24) { endingFrame(feedAcc); renderModcam(); feedAcc = 0; }
      return;
    }

    // --- shift ---
    // Reading your POST ORDERS freezes the watch — the clock and every threat hold while the
    // rulebook is open (it opens itself at the start as the tutorial). Filing / shift log run live.
    let verdict = null;
    if (!MQ.ui.isRulesOpen()) {
      game.tMin += (dt / T.SECONDS_PER_GAME_MIN) * game.timeScale;
      verdict = MQ.director.tick(game, dt * game.timeScale);
      if (game.pendingTicket && MQ.director.state.realT >= game.pendingTicket.revealAt)
        settleTicket();
    }

    feedAcc += dt;
    if (feedAcc > 1 / 13) { renderFeed(0); renderModcam(); feedAcc = 0; }
    hudAcc += dt;
    if (hudAcc > 0.25) { MQ.ui.refreshHud(game); MQ.ui.refreshQueue(game); hudAcc = 0; }

    if (verdict) beginEnding(verdict);
  }

  // ---------------- debug ----------------
  MQ.skipTo = function (min) { game.tMin = min; };
  MQ.forceSpawn = function (streamIdx) { return MQ.director.spawn(game, streamIdx); };
  MQ.win = function () { game.tMin = 360; };
  MQ.fail = function () { MQ.director.state.integrity = 0; };
  if (DEBUG) console.log("[MQ] debug on: timeScale=6 · MQ.skipTo(min) MQ.forceSpawn(i) MQ.win() MQ.fail()");

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
