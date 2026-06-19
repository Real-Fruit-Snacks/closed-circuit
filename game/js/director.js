// CLOSED CIRCUIT — director.js
// Persistent-event model: nothing you file gets fixed. Filing an entry satisfies
// the platform (stops the compliance drain for that event, adds a row to your
// shift report). The thing on camera stays. Rooms accumulate wrongness all night.
//
// PERSON events escalate: stage 1 (far) -> 2 (closer) -> 3 (facing the camera),
// advancing preferentially while you are NOT watching, then depart on their own
// schedule. The only thing the platform ever repairs is its own equipment:
// FEED events recalibrate a short while after being filed.
window.MQ = window.MQ || {};

// Event classes — §1 of the rulebook.
MQ.CATS = [
  { id: "PERSON",  hot: 1, label: "UNAUTHORIZED PERSON", desc: "a figure that should not be there" },
  { id: "REMOVED", hot: 2, label: "OBJECT REMOVED",      desc: "something is gone" },
  { id: "ADDED",   hot: 3, label: "OBJECT ADDED",        desc: "something new appeared" },
  { id: "MOVED",   hot: 4, label: "OBJECT MOVED",        desc: "position or state changed" },
  { id: "LIGHT",   hot: 5, label: "LIGHTING ANOMALY",    desc: "a light changed" },
  { id: "FEED",    hot: 6, label: "FEED INTERFERENCE",   desc: "the camera itself is wrong" }
];

MQ.TUNE = {
  SECONDS_PER_GAME_MIN: 1.5,   // 1.5 real seconds per game minute -> 9 min shift
  SPAWN_START_MIN: 38,         // first event no earlier than 12:38 AM
  DRAIN_PER_EVENT: 0.45,       // integrity %/sec per UNFILED event
  REGEN: 1.4,                  // integrity %/sec when everything is documented
  FILE_BONUS: 6,               // integrity restored per accepted entry
  TICKET_DELAY: 2.2,           // seconds an entry "processes"
  DOC_WINDOW: 75,              // seconds an undocumented event drains compliance;
                               // after that the queue stops caring — your report already took the hit
  LOCKOUT_BASE: 8,             // false-entry rate limit, grows on repeats
  LOCKOUT_GROWTH: 1.6,
  LOCKOUT_MAX: 22,
  DUP_LOCKOUT: 3,              // gentle: filing something already on file
  FEED_RECAL: [25, 45],        // seconds after filing until a FEED event recalibrates
  FIG_STAGE: [26, 44],         // seconds between figure stages
  FIG_DEFER: [8, 14],          // re-check delay when it declines to move while watched
  FIG_HOLD: [18, 30]           // seconds it stares at stage 3 before departing
};

MQ.director = (function () {
  const U = MQ.util, T = MQ.TUNE;

  const D = {
    realT: 0,
    integrity: 100,
    minIntegrity: 100,
    events: [],          // see makeEvent
    usedKeys: {},        // sceneId+key -> true (each event happens once per night)
    entrySeq: 8401,
    nextSpawnAt: 0,
    fired: {},
    doorFigureUntil: -1,
    clueIdx: 0
  };

  function hour(game) { return game.tMin / 60; }
  function spawnInterval(h) { return U.clamp(58 - 6.4 * h, 20, 62) * U.rnd(0.75, 1.35); }
  function maxConcurrent(h) { return h < 1 ? 2 : h < 3 ? 3 : 4; }

  // The figure is ONE thing. While it is in your space (doorway / apartment / behind you),
  // it cannot also be on a public feed.
  function figureInYourSpace(g) { return g.world.aptFigure || g.world.doorFigure || g.world.behindYou; }
  function departPublicFigures(g) {
    D.events.forEach(ev => {
      if (ev.cat !== "PERSON" || ev.departed) return;
      ev.departed = true; ev.missed = !ev.filedAt;
      const st = g.streams[ev.stream]; delete st.S[ev.key]; st.glitchUntil = D.realT + 0.8;
    });
  }

  // The stalking thread — story clues that arrive far -> near as the night runs, so the player
  // feels him closing on the building. These are pulled OUT of the random spawner and forced
  // in this order; the mundane anomalies still spawn at random around them.
  const CLUE_THREAD = [
    { id: "strm_2241", key: "figOutside", at: 48 },   // 12:48 — a figure out by the gas pumps
    { id: "strm_3138", key: "cutterGone", at: 92 },   // 1:32  — a box cutter is gone
    { id: "strm_7733", key: "monitorOn",  at: 140 },  // 2:20  — the late news, his face
    { id: "strm_0907", key: "carFig",     at: 184 },  // 3:04  — a car outside, someone in it
    { id: "strm_5512", key: "doorAjar",   at: 226 },  // 3:46  — a door left open
    { id: "strm_8090", key: "keysGone",   at: 250 }   // 4:10  — keys gone from YOUR lobby (just before 4:15)
  ];
  const CLUE_KEYS = { figOutside: 1, carFig: 1, monitorOn: 1, cutterGone: 1, doorAjar: 1, keysGone: 1 };
  // ARGUS waves you off each clue — steering you away from noticing.
  const CLUE_DISMISS = {
    figOutside: "the forecourt is public ground. not your camera. log it and move on.",
    cutterGone: "inventory shrink goes to day shift. it is not your concern.",
    monitorOn:  "leave the broadcast alone and watch your own feeds, MW-0612.",
    carFig:     "a parked car is not an incident. stop flagging the street.",
    doorAjar:   "a propped door is maintenance. it is not on your patrol.",
    keysGone:   "the key log is handled upstairs. do not touch it again."
  };

  function makeEvent(game, si, anom) {
    const st = game.streams[si];
    D.usedKeys[st.scene.id + anom.key] = true;
    const ev = {
      stream: si, key: anom.key, cat: anom.cat, label: anom.label,
      streamTitle: st.scene.title, streamId: st.scene.id,
      tMinOnset: game.tMin, onsetReal: D.realT,
      filedAt: null, entryNo: null,
      stage: anom.cat === "PERSON" ? 1 : 0,
      nextStageAt: anom.cat === "PERSON" ? D.realT + U.rnd(T.FIG_STAGE[0], T.FIG_STAGE[1]) : 0,
      departAt: 0, departed: false, missed: false,
      clearAt: 0, cleared: false, redacted: false, clue: !!CLUE_KEYS[anom.key]
    };
    st.S[anom.key] = anom.cat === "PERSON" ? 1 : true;
    D.events.push(ev);
    return ev;
  }
  function spawnKey(game, sceneId, key) {
    const i = game.streams.findIndex(s => s.scene.id === sceneId);
    if (i < 0) return false;
    const st = game.streams[i];
    if (D.usedKeys[sceneId + key] || st.offline) return false;
    const anom = st.scene.anomalies.find(a => a.key === key);
    if (!anom) return false;
    makeEvent(game, i, anom);
    return true;
  }
  function clueThreadTick(game) {
    if (D.clueIdx >= CLUE_THREAD.length) return;
    const cl = CLUE_THREAD[D.clueIdx];
    if (game.tMin < cl.at) return;
    if (D.usedKeys[cl.id + cl.key]) { D.clueIdx++; return; }
    const i = game.streams.findIndex(s => s.scene.id === cl.id);
    const st = game.streams[i];
    if (!st || !st.inQueue || st.offline) return;
    const anom = st.scene.anomalies.find(a => a.key === cl.key);
    if (anom && anom.cat === "PERSON" && figureInYourSpace(game)) return;   // he can't be two places
    if (draining().length >= maxConcurrent(hour(game)) + 1) return;          // don't pile clues on
    spawnKey(game, cl.id, cl.key);
    D.clueIdx++;
  }

  // events that are fresh, undocumented, and actively draining compliance
  function draining() {
    return D.events.filter(e =>
      !e.filedAt && !e.departed && !e.redacted && (D.realT - e.onsetReal) < T.DOC_WINDOW);
  }
  function drainingOn(streamIdx) {
    return draining().filter(e => e.stream === streamIdx).length;
  }

  function spawn(game, forceStream) {
    const noPerson = figureInYourSpace(game);   // it's in your room — don't put it on a public feed too
    // clue keys are reserved for the scripted thread; the random spawner only does mundane anomalies
    const ok = (st, a) => !D.usedKeys[st.scene.id + a.key] && !CLUE_KEYS[a.key] && !(noPerson && a.cat === "PERSON");
    const candidates = [];
    game.streams.forEach((st, i) => {
      if (st.scene.special || !st.inQueue || st.offline) return;
      if (drainingOn(i) >= 2) return;
      if (!st.scene.anomalies.some(a => ok(st, a))) return;
      candidates.push(i);
    });
    if (!candidates.length) return false;

    let si = forceStream !== undefined ? forceStream : U.choice(candidates);
    if (forceStream === undefined && si === game.cur && candidates.length > 1 && Math.random() < 0.65)
      si = U.choice(candidates.filter(i => i !== game.cur));

    const st = game.streams[si];
    const pool = st.scene.anomalies.filter(a => ok(st, a));
    if (!pool.length) return false;
    makeEvent(game, si, U.choice(pool));
    return true;
  }

  // Match an entry against the CURRENT stream. Filing happens at settle time.
  function evaluate(game, catId) {
    const st = game.streams[game.cur];
    if (st.scene.special === "apartment") return { special: "apartment" };
    let open = null, dup = null;
    D.events.forEach(e => {
      if (e.stream !== game.cur || e.cat !== catId || e.redacted) return;
      if (!e.filedAt && !e.departed) { if (!open || e.onsetReal < open.onsetReal) open = e; }
      else if (e.filedAt && !e.departed && !e.cleared) { dup = e; }
    });
    if (open) return { ok: true, ev: open };
    if (dup) return { dup: true, ev: dup };
    return { ok: false };
  }

  function file(game, ev) {
    ev.filedAt = D.realT;
    ev.late = (D.realT - ev.onsetReal) >= T.DOC_WINDOW;
    ev.entryNo = D.entrySeq++;
    D.integrity = Math.min(100, D.integrity + (ev.late ? T.FILE_BONUS / 2 : T.FILE_BONUS));
    if (ev.cat === "FEED") ev.clearAt = D.realT + U.rnd(T.FEED_RECAL[0], T.FEED_RECAL[1]);
    game.streams[ev.stream].glitchUntil = D.realT + 0.3;   // brief ack flicker — nothing more
    return ev;
  }

  // Entries on apartment_cam are accepted, processed, and scrubbed.
  function fileApartment(game, catId) {
    const ev = {
      stream: game.aptIdx, key: "apt" + D.entrySeq, cat: catId,
      label: "[ENTRY REMOVED]",
      streamTitle: "apartment_cam", streamId: "strm_0413",
      tMinOnset: game.tMin, onsetReal: D.realT,
      filedAt: D.realT, entryNo: D.entrySeq++,
      stage: 0, departed: false, missed: false, cleared: false, redacted: true
    };
    D.events.push(ev);
    return ev;
  }

  // ---------------- the scripted night ----------------
  const SCRIPT = [
    { at: 1, fn(g) {
      MQ.ui.superMsg("post 2841 is yours, MW-0612. baseline every camera now. anything changes after that, log an incident. logging is the job. (§3)");
    }},
    { at: 90, fn(g) {
      MQ.ui.superMsg("reminder per §4: your desk cam stays on. your post is monitored.");
    }},
    { at: 130, fn(g) { g.world.lampOn = false; }},      // 2:10 AM — your lamp, behind you
    { at: 213, fn(g) {                                   // 3:33 AM — your doorway
      g.world.doorFigure = true;
      D.doorFigureUntil = D.realT + 8;
      departPublicFigures(g);                            // it's at your door now, not on a feed
      MQ.audio.thud();
    }},
    { at: 220, fn(g) {
      MQ.ui.superMsg("ignore interference on personal devices. it is not on your patrol.");
    }},
    { at: 255, fn(g) {                                   // 4:15 AM — apartment_cam
      g.streams[g.aptIdx].inQueue = true;
      MQ.ui.rebuildQueue(g);
      MQ.audio.alert(); MQ.audio.thud();                 // a heavier sting as it joins the board
      MQ.ui.superMsg("new camera on the board. auto-alert: unregistered source. watch it like any other feed.");
    }},
    { at: 280, fn(g) {                                   // 4:40 AM — it is in the room with you now
      g.world.aptFigure = true;
      departPublicFigures(g);                            // it can only be in one place
      MQ.audio.thud(); MQ.audio.inhale();                // low hit + a slow drawn breath; breathing bed ramps up
    }},
    { at: 320, fn(g) {                                   // 5:20 AM
      g.world.doorOpen = true;
      MQ.audio.thud();
      MQ.ui.superMsg("you're almost through. don't get up.");
    }},
    { at: 350, fn(g) {                                   // 5:50 AM
      g.streams[g.aptIdx].offline = true;
      g.world.aptOffline = true;
      if (g.cur === g.aptIdx) MQ.ui.closeFlag();          // can't file a dead feed — close an open panel
      MQ.audio.burst();
      MQ.ui.rebuildQueue(g);
    }},
    { at: 359, fn(g) {
      g.streams.forEach(st => st.glitchUntil = D.realT + 2.2);
      MQ.audio.bigBurst();
    }}
  ];

  function advanceFigures(game) {
    D.events.forEach(ev => {
      if (ev.cat !== "PERSON" || ev.departed) return;
      const st = game.streams[ev.stream];
      const watched = game.cur === ev.stream && game.state === "shift";

      if (ev.stage < 3 && D.realT >= ev.nextStageAt) {
        // it prefers to move while you are looking elsewhere
        if (watched && Math.random() < 0.6) {
          ev.nextStageAt = D.realT + U.rnd(T.FIG_DEFER[0], T.FIG_DEFER[1]);
        } else {
          ev.stage++;
          st.S[ev.key] = ev.stage;
          if (ev.stage === 3) ev.departAt = D.realT + U.rnd(T.FIG_HOLD[0], T.FIG_HOLD[1]);
          else ev.nextStageAt = D.realT + U.rnd(T.FIG_STAGE[0], T.FIG_STAGE[1]);
          if (watched) { MQ.audio.thud(); st.glitchUntil = D.realT + 0.35; }
        }
      } else if (ev.stage === 3 && D.realT >= ev.departAt) {
        ev.departed = true;
        ev.missed = !ev.filedAt;
        delete st.S[ev.key];
        st.glitchUntil = D.realT + 1.1;
        if (game.cur === ev.stream) MQ.audio.burst();
      }
    });
  }

  function tick(game, dt) {
    D.realT += dt;

    SCRIPT.forEach((evt, i) => {
      if (!D.fired[i] && game.tMin >= evt.at) { D.fired[i] = true; evt.fn(game); }
    });
    if (D.doorFigureUntil > 0 && D.realT >= D.doorFigureUntil) {
      game.world.doorFigure = false;
      D.doorFigureUntil = -1;
    }

    advanceFigures(game);

    // the platform repairs its own equipment, nothing else
    D.events.forEach(ev => {
      if (ev.cat === "FEED" && ev.filedAt && !ev.cleared && D.realT >= ev.clearAt && ev.clearAt > 0) {
        ev.cleared = true;
        delete game.streams[ev.stream].S[ev.key];
        game.streams[ev.stream].glitchUntil = D.realT + 0.6;
        MQ.ui.toast("<div class='tFrom'>SYSTEM</div>feed recalibrated: " + ev.streamId + ". hardware nominal.", "sys", 5000);
      }
    });

    // the scripted clue thread (far -> near), then the random mundane spawner around it
    clueThreadTick(game);

    // spawning
    const h = hour(game);
    if (game.tMin >= T.SPAWN_START_MIN) {
      if (!D.nextSpawnAt) D.nextSpawnAt = D.realT + U.rnd(2, 8);
      if (D.realT >= D.nextSpawnAt) {
        if (draining().length < maxConcurrent(h)) spawn(game);
        D.nextSpawnAt = D.realT + spawnInterval(h);
      }
    }

    // compliance: FRESH undocumented events drain it; documentation is all it wants
    const open = draining().length;
    if (open) D.integrity -= T.DRAIN_PER_EVENT * open * dt;
    else D.integrity = Math.min(100, D.integrity + T.REGEN * dt);
    D.integrity = Math.max(0, D.integrity);
    D.minIntegrity = Math.min(D.minIntegrity, D.integrity);
    MQ.audio.setDanger(U.clamp(1 - D.integrity / 100, 0, 1));

    if (D.integrity <= 0) return "fail";
    if (game.tMin >= 360) return "win";
    return null;
  }

  function stats(game) {
    const real = D.events.filter(e => !e.redacted);
    const filed = real.filter(e => e.filedAt);
    const missed = real.filter(e => !e.filedAt);
    const coverage = real.length ? filed.length / real.length : 1;
    const grade = game.falseFlags > 6 ? "NEGLIGENT"
      : coverage >= 0.9 ? "ACCURATE"
      : coverage >= 0.6 ? "INCOMPLETE" : "NEGLIGENT";
    const clues = real.filter(e => e.clue);
    return {
      events: D.events.slice().sort((a, b) => a.tMinOnset - b.tMinOnset),
      total: real.length, filed: filed.length, missed: missed.length,
      coverage: Math.round(coverage * 100), grade,
      falseFlags: game.falseFlags,
      minIntegrity: Math.round(D.minIntegrity),
      aptFlags: game.aptFlags,
      viewedApartment: game.viewedApartment,
      cluesTotal: clues.length, cluesFiled: clues.filter(e => e.filedAt).length
    };
  }

  return {
    state: D, tick, evaluate, file, fileApartment, spawn, stats,
    clueDismiss: (key) => CLUE_DISMISS[key],
    unfiledCount: () => draining().length,
    filedOn: (i) => D.events.filter(e => e.stream === i && e.filedAt && !e.redacted).length
  };
})();
