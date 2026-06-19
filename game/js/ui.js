// CLOSED CIRCUIT — ui.js
// DOM chrome: queue list, HUD, toasts, flag panel, shift log, rulebook, endings.
window.MQ = window.MQ || {};

MQ.ui = (function () {
  const U = MQ.util;
  const $ = id => document.getElementById(id);

  const els = {};
  let pendSeq = 1;
  let flagOpen = false, rulesOpen = false, logOpen = false;

  function init(game) {
    ["titleScreen", "console", "clock", "integrityFill", "integrityPct", "integrityWrap",
     "rateLimit", "rateLimitT", "muteBtn", "queueList", "queueCount", "feedOverlay",
     "ovId", "ovUp", "ovChan", "ovBitrate", "offlineCard", "flagBtn", "rulebookBtn",
     "logBtn", "shiftLog", "shiftLogList", "shiftLogClose",
     "flagPanel", "flagStreamName", "flagGrid", "flagCancel", "rulebook", "rulebookClose",
     "toasts", "endScreen", "endTitle", "endBody", "endStats", "restartBtn", "pauseVeil",
     "clockIn", "titleNoise", "sbShift"].forEach(id => els[id] = $(id));

    MQ.CATS.forEach(cat => {
      const b = document.createElement("button");
      b.className = "catBtn";
      b.innerHTML = "<span class='catHot'>" + cat.hot + "</span><span class='catLabel'>" + cat.label + "</span><span class='catDesc'>" + cat.desc + "</span>";
      b.onclick = () => game.submitTicket(cat.id);
      els.flagGrid.appendChild(b);
    });

    els.flagCancel.onclick = () => closeFlag();
    els.rulebookClose.onclick = () => closeRules();
    els.shiftLogClose.onclick = () => closeLog();
    els.flagBtn.onclick = () => openFlag(game);
    els.rulebookBtn.onclick = () => { MQ.audio.uiTick(); openRules(); };
    els.logBtn.onclick = () => { MQ.audio.uiTick(); toggleLog(game); };
    els.restartBtn.onclick = () => location.reload();
    els.muteBtn.onclick = () => {
      MQ.audio.setMuted(!MQ.audio.isMuted());
      els.muteBtn.textContent = MQ.audio.isMuted() ? "SND OFF" : "SND ON";
    };
    els.muteBtn.textContent = MQ.audio.isMuted() ? "SND OFF" : "SND ON";
  }

  // ---------------- queue ----------------
  function rebuildQueue(game) {
    els.queueList.innerHTML = "";
    game.streams.forEach((st, i) => {
      if (!st.inQueue) return;
      const li = document.createElement("li");
      li.className = "qItem" + (st.scene.special ? " apt" : "");
      li.dataset.idx = i;
      li.innerHTML =
        "<div class='qTop'><span class='qDot'></span><span class='qId'>" + st.scene.id + "</span>" +
        "<span class='qFiled'></span></div>" +
        "<div class='qTitle'>" + st.scene.title +
        (st.scene.special && !game.viewedApartment ? " <span class='qNew'>NEW</span>" : "") + "</div>" +
        "<div class='qReason'>" + st.scene.reason + "</div>";
      li.onclick = () => game.switchStream(i);
      els.queueList.appendChild(li);
    });
    refreshQueue(game);
  }

  function refreshQueue(game) {
    let n = 0;
    els.queueList.querySelectorAll(".qItem").forEach(li => {
      const i = +li.dataset.idx, st = game.streams[i];
      n++;
      li.classList.toggle("active", i === game.cur);
      li.classList.toggle("offline", !!st.offline);
      const filed = MQ.director.filedOn(i);
      li.querySelector(".qFiled").textContent = filed ? filed + " filed" : "";
    });
    els.queueCount.textContent = "(" + n + ")";
  }

  // ---------------- HUD ----------------
  function refreshHud(game) {
    els.clock.textContent = U.fmtClock(game.tMin);
    const integ = MQ.director.state.integrity;
    els.integrityFill.style.width = integ + "%";
    els.integrityPct.textContent = Math.round(integ) + "%";
    els.integrityWrap.classList.toggle("warn", integ < 60 && integ >= 35);
    els.integrityWrap.classList.toggle("danger", integ < 35);

    const lk = game.lockoutUntil - MQ.director.state.realT;
    if (lk > 0) {
      els.rateLimit.classList.remove("hidden");
      els.rateLimitT.textContent = Math.ceil(lk) + "s";
    } else els.rateLimit.classList.add("hidden");

    const st = game.streams[game.cur];
    els.ovId.textContent = st.scene.id + " · " + st.scene.src;
    els.ovUp.textContent = "UP " + U.fmtUp(st.upOffset + MQ.director.state.realT);
    els.ovChan.textContent = "CH " + (game.cur + 1) + (st.offline ? " NO SIG" : "");
    if (Math.random() < 0.02)
      els.ovBitrate.textContent = (st.offline ? 0 : (380 + ((Math.random() * 90) | 0))) + " kbps";
    els.offlineCard.classList.toggle("hidden", !st.offline);
    els.flagBtn.disabled = !!st.offline || game.pendingTicket !== null || lk > 0;
  }

  // ---------------- toasts ----------------
  function toast(html, cls, ttl) {
    const d = document.createElement("div");
    d.className = "toast " + (cls || "");
    d.innerHTML = html;
    els.toasts.appendChild(d);
    while (els.toasts.children.length > 4) els.toasts.removeChild(els.toasts.firstChild);
    setTimeout(() => { d.classList.add("out"); setTimeout(() => d.remove(), 600); }, ttl || 7000);
  }
  function superMsg(text) {
    toast("<div class='tFrom'>SUPERVISOR (auto)</div>" + text, "super", 9500);
  }

  // ---------------- panels ----------------
  function openFlag(game) {
    const st = game.streams[game.cur];
    if (st.offline || game.pendingTicket || game.lockoutUntil > MQ.director.state.realT) return;
    flagOpen = true;
    MQ.audio.openPanel();
    els.flagStreamName.textContent = st.scene.id + " “" + st.scene.title + "”";
    els.flagPanel.classList.remove("hidden");
  }
  function closeFlag() { flagOpen = false; els.flagPanel.classList.add("hidden"); }
  function openRules() { rulesOpen = true; els.rulebook.classList.remove("hidden"); }
  function closeRules() { rulesOpen = false; els.rulebook.classList.add("hidden"); }

  function fmtEntryRow(ev) {
    const cls = ev.redacted ? "logRow redacted" : "logRow";
    const label = ev.redacted ? "[ENTRY REMOVED]" : ev.label;
    return "<div class='" + cls + "'>" +
      "<span class='lTime'>" + U.fmtClock(ev.tMinOnset) + "</span>" +
      "<span class='lStream'>" + ev.streamId + "</span>" +
      "<span class='lCat'>" + ev.cat + "</span>" +
      "<span class='lLabel'>" + label + "</span>" +
      "<span class='lNo'>#" + ev.entryNo + "</span></div>";
  }
  function refreshLog() {
    const filed = MQ.director.state.events
      .filter(e => e.filedAt)
      .sort((a, b) => b.filedAt - a.filedAt);
    els.shiftLogList.innerHTML = filed.length
      ? filed.map(fmtEntryRow).join("")
      : "<div class='dim' style='padding:14px'>no entries filed yet. that had better change. (§3)</div>";
  }
  function openLog(game) { logOpen = true; refreshLog(); els.shiftLog.classList.remove("hidden"); }
  function closeLog() { logOpen = false; els.shiftLog.classList.add("hidden"); }
  function toggleLog(game) { logOpen ? closeLog() : openLog(game); }

  // ---------------- ticket results ----------------
  function ticketPending() {
    const id = "T-" + (pendSeq++);
    toast("<div class='tFrom'>ENTRY " + id + "</div>processing…", "pending", 2300);
    return id;
  }
  function ticketResult(res, id, catId) {
    if (res.special === "apartment") {
      const n = res.attempts;
      if (n >= 3)
        toast("<div class='tFrom'>ENTRY ACCEPTED — THEN REMOVED</div>stop logging incidents on this camera, MW-0612.", "bad", 9000);
      else
        toast("<div class='tFrom'>ENTRY ACCEPTED — THEN REMOVED</div>your entry was logged and scrubbed. no incident on record for this camera.", "bad", 8000);
      MQ.audio.reject();
    } else if (res.ok) {
      toast("<div class='tFrom'>ENTRY #" + res.ev.entryNo + " FILED</div>" + res.ev.label + " — appended to shift report. the event remains live.", "ok", 6500);
      MQ.audio.confirm();
      if (logOpen) refreshLog();
    } else if (res.dup) {
      toast("<div class='tFrom'>DUPLICATE</div>that event is already on file (entry #" + res.ev.entryNo + "). check your shift log [L].", "pending", 6000);
      MQ.audio.reject();
    } else {
      toast("<div class='tFrom'>ENTRY " + id + " — REJECTED</div>no undocumented “" + catLabel(catId).toLowerCase() + "” on this camera. rate limited.", "bad", 6500);
      MQ.audio.reject();
    }
  }
  function catLabel(id) { const c = MQ.CATS.find(c => c.id === id); return c ? c.label : id; }

  // ---------------- endings ----------------
  function showEnd(kind, stats, game) {
    els.endScreen.classList.remove("hidden");
    els.endScreen.classList.add(kind === "fail" ? "failEnd" : "winEnd");
    let body = "", title = "";

    if (kind === "fail") {
      title = "SIGNAL LOST";
      body =
        "<p>log integrity reached zero at " + U.fmtClock(game.tMin) + ".</p>" +
        "<p>too many events were left undocumented. the log noticed.</p>" +
        "<p>guard_id MW-0612 has been marked <b>ABSENT</b> for the remainder of post 2841.</p>" +
        "<p class='dim'>do not return to this console.</p>";
    } else {
      title = "06:00:00 — SHIFT COMPLETE";
      body = "<p>shift report graded: <b class='grade " + stats.grade.toLowerCase() + "'>" + stats.grade + "</b> — " +
        stats.filed + " of " + stats.total + " events documented.</p>";
      if (stats.grade === "ACCURATE") {
        body += "<p>the day team takes the handoff without a word. nothing you filed was fixed.<br>it was never going to be fixed. it was only ever going to be <i>recorded</i>.</p>";
      } else if (stats.grade === "INCOMPLETE") {
        body += "<p>the day team will inherit " + stats.missed + " undocumented event" + (stats.missed === 1 ? "" : "s") + ". they will file them. that is all anyone will do.</p>";
      } else {
        body += "<p>your report is unusable. the events still happened. the record simply doesn't show it.<br>somewhere, that distinction matters to someone. not to the rooms.</p>";
      }
      if (stats.cluesTotal > 0) {
        if (stats.cluesFiled === stats.cluesTotal)
          body += "<p>you logged every sign the night gave you. you watched it come for you and wrote down each step.<br>it changed nothing. it was only ever a record.</p>";
        else if (stats.cluesFiled === 0)
          body += "<p>the night was assembling itself across your feeds — the same thing, getting closer — and you logged none of it.<br>you filed nothing that mattered.</p>";
        else
          body += "<p>you caught " + stats.cluesFiled + " of the " + stats.cluesTotal + " that pointed the same way. the rest you let pass.</p>";
      }
      body += "<p>camera 0413 (apartment_cam) dropped off the board at 5:50 AM.<br>reason code: <b>SOURCE OFFLINE</b>.</p>" +
        "<p>you clock out. the sun is coming up.<br>your apartment is eleven minutes away.</p>";
      if (!stats.viewedApartment)
        body += "<p class='aptNote'>you never opened strm_0413. it sat in your queue for an hour and forty-five minutes.<br>it watched you not looking.</p>";
      else if (stats.aptFlags >= 3)
        body += "<p class='aptNote'>you filed " + stats.aptFlags + " entries on apartment_cam. every one was processed, accepted, and removed.<br>the report shows nothing. you know what you saw.</p>";
      else if (stats.aptFlags >= 1)
        body += "<p class='aptNote'>your entry on apartment_cam was accepted, then removed.<br>there was a rule for this. they just never printed it.</p>";
      else
        body += "<p class='aptNote'>you watched your own apartment and filed nothing.<br>per the rule they never printed: correct.</p>";
    }

    els.endTitle.textContent = title;
    els.endBody.innerHTML = body;

    // the shift report — every event of the night
    let s =
      "<div class='statRow'><span>events documented</span><span>" + stats.filed + " / " + stats.total + " (" + stats.coverage + "%)</span></div>" +
      "<div class='statRow'><span>false entries</span><span>" + stats.falseFlags + "</span></div>" +
      "<div class='statRow'><span>lowest log integrity</span><span>" + stats.minIntegrity + "%</span></div>" +
      "<div class='statHead'>INCIDENT RECORD — POST 2841</div>";
    stats.events.forEach(ev => {
      let status, cls = "";
      if (ev.redacted) { status = "REMOVED"; cls = " redacted"; }
      else if (ev.filedAt) {
        const secs = Math.round(ev.filedAt - ev.onsetReal);
        status = (ev.late ? "FILED LATE +" : "FILED +") + secs + "s" + (ev.departed ? " · departed" : "");
      }
      else { status = ev.departed ? "MISSED — departed" : "MISSED"; cls = " miss"; }
      s += "<div class='statRow report" + cls + "'>" +
        "<span>" + U.fmtClock(ev.tMinOnset) + " · " + ev.streamTitle + "</span>" +
        "<span>" + (ev.redacted ? "[ENTRY REMOVED]" : ev.label) + "</span>" +
        "<span class='rStatus'>" + status + "</span></div>";
    });
    els.endStats.innerHTML = s;
  }

  return {
    init, rebuildQueue, refreshQueue, refreshHud, toast, superMsg,
    openFlag, closeFlag, openRules, closeRules, openLog, closeLog, toggleLog, refreshLog,
    ticketPending, ticketResult, showEnd,
    isFlagOpen: () => flagOpen, isRulesOpen: () => rulesOpen, isLogOpen: () => logOpen,
    els: () => els
  };
})();
