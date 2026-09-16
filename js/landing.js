/* ==========================================================================
   TRINETRA AI — landing page: live pipeline demo, SMS feed, sync visual,
   reveal-on-scroll
   ========================================================================== */
(function () {
  "use strict";

  var R = window.TrinetraEngine;
  var engine = R.makeEngine({ nodeId: "TN-001", baseTemp: 32 });
  var online = false;

  function $(id) { return document.getElementById(id); }
  function qsa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  /* ---------------- live pipeline demo ---------------- */

  var DEMO_STEPS = [
    { at: 0,    act: null, caption: "Idle. All signals nominal — the Threat Engine is at rest." },
    { at: 1400, act: "motion",  caption: "A single motion blip is registered. One signal alone is <b>not enough</b> to escalate." },
    { at: 2900, act: "vibration", caption: "Abnormal vibration joins in. The correlation engine starts weighing evidence." },
    { at: 4500, act: "camera",  caption: "Camera confirms a figure. Three independent signals <b>AGREE</b> → threat score climbs hard." },
    { at: 6200, act: null,      caption: "Verdict issued: CRITICAL. Operators alerted with full sensor evidence attached." },
    { at: 7400, act: "reset",   caption: "Debrief complete. Engine de-escalates and the node re-bootstraps to NORMAL." }
  ];

  function renderDemo() {
    var s = engine.score;
    var lvl = R.levelFor(s);
    var color = lvl.color;

    qsa(".s-chip.ld").forEach(function (el) {
      var k = el.getAttribute("data-k");
      el.classList.toggle("fired", k ? engine.isActive(k) : false);
    });

    var scoreEl = $("ldScore");
    var scoreNode = $("ldScoreNode");
    var verdict = $("ldVerdict");
    var level = $("ldLevel");

    [scoreEl, scoreNode].forEach(function (el) {
      if (el) { el.textContent = s; el.style.color = color; }
    });
    if (verdict) { verdict.textContent = lvl.label; verdict.style.color = color; }
    if (level) {
      level.className = "pill pill-" + (lvl.key === "ok" ? "green" : lvl.key === "warn" ? "amber" : "red");
      level.style.color = "";
      level.textContent = lvl.label;
    }
  }

  var demoStepTimer = null;
  var demoIdx = 0;
  var demoPlaying = true;

  function stepDemo() {
    if (!demoPlaying) { scheduleDemo(400); return; }
    if (demoIdx >= DEMO_STEPS.length) { scheduleDemo(2600); return; }
    var st = DEMO_STEPS[demoIdx];
    if (st.act) engine.simulate(st.act);
    var cap = $("ldCaption");
    if (cap) cap.innerHTML = "<b>STEP " + (demoIdx + 1) + " —</b> " + st.caption;
    renderDemo();

    if (st.act === "camera") { setSyncState(false); pushSMS('<span class="tag">CRITICAL</span>Motion + vibration + camera activity near Node TN-001. <b>Store locally until link returns.</b>', true); }
    if (st.act === "reset") { setSyncState(true); pushSMS("Node re-bootstrapped. Resume normal monitoring.", false); pushSMS("2 buffer events synced to cloud [OK].", false); }

    demoIdx++;
    var nxt = DEMO_STEPS[Math.min(demoIdx, DEMO_STEPS.length - 1)];
    scheduleDemo((nxt.at - st.at) || 1500);
  }

  function scheduleDemo(ms) {
    clearTimeout(demoStepTimer);
    demoStepTimer = setTimeout(stepDemo, ms);
  }

  function initDemo() {
    var why = $("why");
    if (why) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { demoPlaying = en.isIntersecting; });
      }, { threshold: 0.1 });
      io.observe(why);
    }
    scheduleDemo(1400);
  }

  /* ---------------- phone SMS feed ---------------- */

  function pushSMS(html, alertFlag) {
    var list = $("smsList");
    if (!list) return;
    var row = document.createElement("div");
    row.className = "sms" + (alertFlag ? " alert" : "");
    var d = new Date();
    var tm = R.timeStr(d).slice(0, 5);
    row.innerHTML = '<span class="tm">' + tm + '</span><div class="bubble">' + html + "</div>";
    list.appendChild(row);
    while (list.children.length > 6) list.removeChild(list.firstChild);
    list.scrollTop = list.scrollHeight;
  }

  /* ---------------- sync visual ---------------- */

  function setSyncState(offlineNow) {
    online = !offlineNow;
    var v = $("syncVisual");
    if (!v) return;
    v.className = "sync-visual " + (offlineNow ? "offlined" : "online");
    var hint = $("syncHint");
    if (hint) {
      hint.innerHTML = offlineNow
        ? "Connectivity lost — events buffer on-device. Watch them hold right here."
        : "Link restored — buffered events stream to cloud. The node never stopped watching.";
    }
  }

  /* ---------------- reveal on scroll ---------------- */

  function setupReveals() {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    qsa(".reveal").forEach(function (el) { io.observe(el); });
  }

  /* ---------------- boot ---------------- */

  function init() {
    setupReveals();
    initDemo();
    setSyncState(true); // start story in offline, buffer shown before reconnecting
    engine.start();

    // seed phone feed
    setTimeout(function () {
      pushSMS("Node booted. Link probe: 2 bars. Switching to battery.", false);
    }, 600);
    setTimeout(function () {
      pushSMS('<span class="tag">INFO</span>Connectivity LOST — entering OFFLINE MODE.', false);
      setSyncState(false);
    }, 1400);
  }

  document.addEventListener("DOMContentLoaded", init);
})();