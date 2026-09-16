/* ==========================================================================
   TRINETRA AI — live dashboard renderer
   ========================================================================== */
(function () {
  "use strict";

  var R = window.TrinetraEngine;
  var engine = R.makeEngine({ nodeId: "TN-001", baseTemp: 32 });

  var CIRC = 2 * Math.PI * 86;
  var SENSOR_KEYS = ["motion", "vibration", "temperature", "camera"];

  var CONTRIB = [
    { code: "motion", lab: "PIR Motion", w: 20 },
    { code: "vibration", lab: "Abnormal Vibration", w: 30 },
    { code: "temperature", lab: "Temperature Anomaly", w: 10 },
    { code: "camera", lab: "Camera Detection", w: 40 }
  ];

  var E = {}; // element cache

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function sparkSVG(data, color) {
    var w = 130, h = 36;
    if (!data || data.length < 2) data = [0, 0];
    var min = Math.min.apply(null, data);
    var max = Math.max.apply(null, data);
    var span = (max - min) || 0.001;
    var pad = 3;
    var step = (w - pad * 2) / (data.length - 1);
    var pts = data.map(function (v, i) {
      var x = pad + i * step;
      var y = h - pad - ((v - min) / span) * (h - pad * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    });
    return '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">' +
      '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linecap="round" style="filter:drop-shadow(0 0 3px ' + color + ')"/>' +
      '<line x1="0" y1="' + (h - pad) + '" x2="' + w + '" y2="' + (h - pad) + '" stroke="rgba(255,255,255,0.08)" stroke-width="1"/></svg>';
  }

  function cacheEls() {
    E.gaugeBar   = $("tsBar");
    E.gaugeNum   = $("tsNum");
    E.gaugeLvl   = $("tsLvl");
    E.levelPill  = $("tsPill");
    E.contrib    = $("contribList");
    E.alertList  = $("alertList");
    E.alertCount = $("alertCount");
    E.evLog      = $("evLog");
    E.clock      = $("dashClock");
    E.lastSync   = $("dashLastSync");
    E.statusVal  = $("dashStatus");
    E.statusPill = $("statusPill");
    E.connVal    = $("dashConn");
    E.powerFill  = $("powerFill");
    E.powerVal   = $("dashPower");
    E.upVal      = $("dashUptime");
    E.pendingCount = $("pendingCount");
    E.pendingWrap = $("pendingWrap");
    E.pendingCount2 = $("pendingCount2");
    E.syncVisual = document.querySelector(".dash-grid .sync-visual");
    E.syncPill   = $("syncPill");
    E.chart      = $("threatChart");
    E.engineFlow = $("engineFlow");

    E.sv = {}; E.ss = {}; E.sc = {}; E.spk = {};
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    SENSOR_KEYS.forEach(function (k) {
      E.sv[k] = $("s" + cap(k) + "V");
      E.ss[k] = $("s" + cap(k) + "S");
      E.sc[k] = $("c" + cap(k));
      E.spk[k] = $("sp" + cap(k));
    });

    E.chipFlow = $("chipFlow");
  }

  /* ---------- status bar ---------- */

  function renderStatus() {
    var off = engine.offline;
    var crit = R.levelFor(engine.score).key === "crit";

    E.statusVal.textContent = off ? "OFFLINE MODE" : "ONLINE";
    E.statusVal.style.color = off ? "#ffc24b" : crit ? "#ff4d68" : "#2ff2a4";
    E.statusPill.className = "pill pill-" + (off ? "amber" : crit ? "red" : "green");
    E.statusPill.innerHTML = '<span class="dot' + (off || crit ? "" : " pulse") + '"></span>' +
      (off ? "OFFLINE" : crit ? "CRITICAL" : "ONLINE");

    E.connVal.textContent = off ? "Offline Mode" : "Connected";
    E.connVal.style.color = off ? "#ffc24b" : "#46c9f8";

    E.powerVal.textContent = engine.power + "%";
    E.powerFill.style.width = engine.power + "%";

    E.lastSync.textContent = off ? "\u2014 · queued for sync" : "Synced " + R.timeStr(new Date(engine.lastSync));
    E.syncPill.className = "pill pill-" + (off ? "amber" : "cyan");
    E.syncPill.innerHTML = '<span class="dot"></span>' + (off ? "OFFLINE MODE ACTIVE" : "LIVE LINK");

    E.pendingWrap.style.display = off ? "block" : "none";
    E.pendingCount.textContent = engine.pendingCount;
    if (E.pendingCount2) E.pendingCount2.textContent = engine.pendingCount;

    if (E.syncVisual) {
      E.syncVisual.className = "sync-visual " + (off ? "offlined" : "online");
      var lbl = E.syncVisual.querySelector(".offline-label");
      if (lbl) lbl.textContent = off ? "OFFLINE MODE ACTIVE" : "LINK STANDBY";
    }

    var u = engine.uptimeSec;
    E.upVal.textContent = pad(Math.floor(u / 3600)) + ":" + pad(Math.floor((u % 3600) / 60)) + ":" + pad(u % 60);

    document.body.classList.toggle("offline", off);
  }

  /* ---------- threat gauge ---------- */

  function renderGauge() {
    var s = engine.score;
    var lvl = R.levelFor(s);
    E.gaugeBar.setAttribute("stroke-dashoffset", (CIRC * (1 - s / 100)).toFixed(1));
    E.gaugeBar.setAttribute("stroke", lvl.color);
    E.gaugeBar.style.filter = "drop-shadow(0 0 8px " + lvl.color + ")";
    E.gaugeNum.textContent = s;
    E.gaugeNum.style.color = lvl.color;
    E.gaugeLvl.textContent = lvl.label;
    E.gaugeLvl.style.color = lvl.color;
    E.levelPill.className = "pill pill-" + (lvl.key === "ok" ? "green" : lvl.key === "warn" ? "amber" : "red");
    E.levelPill.innerHTML = '<span class="dot"></span>' + lvl.label;

    document.querySelectorAll(".zone").forEach(function (z) {
      z.classList.toggle("on", z.getAttribute("data-level") === lvl.key);
    });
  }

  /* ---------- contributions ---------- */

  function renderContrib() {
    var html = CONTRIB.map(function (c) {
      var on = engine.isActive(c.code);
      return '<div class="contrib' + (on ? " on" : "") + '">' +
        '<span class="lab">' + c.lab + "</span>" +
        '<span class="val">' + (on ? "+" + c.w : "+0") + "</span></div>";
    }).join("");
    E.contrib.innerHTML =
      html +
      '<div class="contrib" title="Motion + camera in parallel"><span class="lab">Correlation boost</span><span class="val">+15</span></div>' +
      '<div class="contrib" title="3+ sensors simultaneously"><span class="lab">Multi-sensor stack</span><span class="val">+20</span></div>';
  }

  /* ---------- sensor cards ---------- */

  function sensorView(k) {
    var active = engine.isActive(k);
    var s = engine.sensors[k];
    var c = !active
      ? (k === "motion" ? "#2ff2a4" : k === "temperature" ? "#7f93ab" : k === "camera" ? "#46c9f8" : "#8fa1b3")
      : (k === "camera" ? "#ff4d68" : k === "temperature" ? "#ffc24b" : k === "vibration" ? "#ffc24b" : "#2ff2a4");
    var big, sub;
    if (k === "camera") {
      big = active ? s.confidence : "READY";
      sub = active ? s.confidence + "% confidence \u00B7 suspicious" : "stream idle \u00B7 no motion";
    } else if (k === "motion") {
      big = active ? s.value : "\u2014";
      sub = active ? "idx \u00B7 movement" : "normal \u00B7 clear";
    } else if (k === "vibration") {
      big = active ? s.value.toFixed(2) : "0.00";
      sub = "g \u00B7 threshold 0.90g";
    } else {
      big = s.value.toFixed(1);
      sub = "\u00B0C \u00B7 anomaly \u2265 55\u00B0C";
    }
    return { c: c, big: big, sub: sub, active: active, stateCls: active ? (c === "#2ff2a4" ? "state-ok" : c === "#ffc24b" ? "state-warn" : "state-crit") : "state-ok" };
  }

  function renderSensors() {
    SENSOR_KEYS.forEach(function (k) {
      var v = sensorView(k);
      var card = E.sc[k];
      card.className = "sensor " + v.stateCls;
      if (v.active) card.classList.add("hot-" + k);
      E.sv[k].textContent = v.big;
      E.sv[k].style.color = v.c;
      var st = E.ss[k];
      st.innerHTML = '<span class="dot"></span>' + (v.active ? (k === "motion" ? "Detected" : "ABNORMAL") : "Normal");
      st.style.color = v.c;
      st.style.borderColor = v.c;
      E.spk[k].innerHTML = sparkSVG(engine.sensorHistory[k], v.c);
    });
  }

  /* ---------- alerts ---------- */

  function renderAlerts() {
    var list = engine.alerts;
    var L = {
      motion: "Motion", vibration: "Vibration", temperature: "Temperature", camera: "Camera",
      offline: "Offline Mode", sync: "Cloud Sync", correlation: "Correlation", reset: "Manual Reset"
    };
    E.alertCount.textContent = list.length + (engine.pendingCount ? " \u00B7 +" + engine.pendingCount + " queued" : "");
    if (!list.length) {
      E.alertList.innerHTML = '<div class="dim small" style="padding:6px 2px">No alerts yet.</div>';
      return;
    }
    E.alertList.innerHTML = list.map(function (a) {
      var sevFace = { ok: "\u{1F7E2}", warn: "\u{1F7E1}", crit: "\u{1F534}" }[a.sev] || "\u{1F7E2}";
      var sevText = { ok: "NORMAL", warn: "WARNING", crit: "CRITICAL" }[a.sev] || "NORMAL";
      var ev = (a.evidence || []).map(function (e) {
        return '<span class="ev">' + esc(L[e] || e) + "</span>";
      }).join("");
      return '<div class="alert-item sev-' + a.sev + '">' +
        '<span class="sev-badge">' + sevFace + sevText + "</span>" +
        '<div><div class="a-title">' + esc(a.title) + "</div>" +
        '<div class="a-msg">' + esc(a.msg) + "</div>" +
        (ev ? '<div class="a-evidence">' + ev + "</div>" : "") + "</div>" +
        '<div class="a-time">' + esc(a.time) + (a.local ? '<br><span style="color:#ffc24b">stored locally</span>' : "") + "</div>" +
        "</div>";
    }).join("");
  }

  /* ---------- event log ---------- */

  function renderLog() {
    E.evLog.innerHTML = engine.logs.map(function (l) {
      return '<div class="row ' + esc(l.kind) + '"><span class="ts">' + esc(l.time) + '</span><span class="mk">\u258E</span><span class="msg">' + esc(l.msg) + "</span></div>";
    }).join("");
  }

  /* ---------- threat chart ---------- */

  function drawChart() {
    var cv = E.chart;
    if (!cv) return;
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth || 480;
    var h = 168;
    cv.width = w * dpr; cv.height = h * dpr;
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var series = engine.history.map(function (p) { return p.score; });
    if (series.length < 2) series = [0, 0];
    var n = series.length;

    // zone bands
    ctx.fillStyle = "rgba(47,242,164,0.05)"; ctx.fillRect(0, yFor(30), w, yFor(0) - yFor(30));
    ctx.fillStyle = "rgba(255,194,75,0.05)";  ctx.fillRect(0, yFor(70), w, yFor(30) - yFor(70));
    ctx.fillStyle = "rgba(255,77,104,0.06)";  ctx.fillRect(0, yFor(100), w, yFor(70) - yFor(100));

    function yFor(v) { return (h - 12) - (v / 100) * (h - 28); }

    // grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 0.6;
    [30, 70, 100].forEach(function (v) {
      ctx.beginPath(); ctx.moveTo(0, yFor(v)); ctx.lineTo(w, yFor(v)); ctx.stroke();
    });

    function line(arr, color) {
      ctx.beginPath();
      arr.forEach(function (v, i) {
        var x = (i / (n - 1)) * w;
        var yy = yFor(v);
        if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    function area(arr, color) {
      ctx.beginPath();
      arr.forEach(function (v, i) {
        var x = (i / (n - 1)) * w;
        var yy = yFor(v);
        if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      });
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    area(series, "rgba(47,242,164,0.12)");
    line(series, "#2ff2a4");

    // labels
    ctx.fillStyle = "#5e748d"; ctx.font = "9px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
    [30, 70, 100].forEach(function (v) { ctx.fillText(v, 2, yFor(v) - 3); });
  }

  /* ---------- correlation flow chip ---------- */

  function renderEngineFlow() {
    if (!E.engineFlow) return;
    var ks = ["motion", "vibration", "temperature", "camera"];
    var chips = ks.map(function (k) {
      var on = engine.isActive(k);
      var w = (CONTRIB.filter(function (c) { return c.code === k; })[0] || {}).w || 0;
      return '<span class="s-chip' + (on ? " fired" : "") + '"><span class="mini-dot"></span>' + k + (on ? " +" + w : "") + "</span>";
    }).join("");
    var lvl = R.levelFor(engine.score);
    E.engineFlow.innerHTML =
      chips +
      '<span class="engine-arrow">\u2192</span>' +
      '<span class="engine-box"><span class="eb-k">Threat Engine</span><span class="eb-v" style="color:' + lvl.color + '">' + engine.score + '</span></span>' +
      '<span class="engine-arrow">\u2192</span>' +
      '<span class="engine-box"><span class="eb-k">Alert</span><span class="eb-v" style="color:' + lvl.color + ';font-size:1rem">' + lvl.label + "</span></span>";
  }

  /* ---------- master tick ---------- */

  function tick() {
    try {
      if (E.clock) E.clock.textContent = R.timeStr();
      renderStatus();
      renderGauge();
      renderSensors();
      renderContrib();
      renderAlerts();
      renderLog();
      renderEngineFlow();
      drawChart();
    } catch (err) {
      if (window.console) console.warn("dashboard tick:", err);
    }
  }

  /* ---------- boot ---------- */

  function scrollToMonitor() {
    var m = $("monitor");
    if (m) m.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // automated demo sequence (loops while running)
  var AUTOSEQ = [
    { act: null,        wait: 800 },
    { act: "motion",    wait: 1800, hint: "single signal — low threat" },
    { act: "vibration", wait: 1700, hint: "2 signals — warning band" },
    { act: "camera",    wait: 2300, hint: "3 signals agree → CRITICAL" },
    { act: "multiple",  wait: 1700, hint: "compound tampering re-armed" },
    { act: "reset",     wait: 1800, hint: "de-escalating to NORMAL" }
  ];
  var AUTO = { running: false, idx: 0, timer: null };

  var ICON_PLAY = '<path d="M8 5v14l11-7z"/>';
  var ICON_PAUSE = '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';

  function setFab(on) {
    var fab = $("simFab");
    if (!fab) return;
    fab.classList.toggle("running", on);
    var lbl = fab.querySelector(".lbl");
    if (lbl) lbl.textContent = on ? "Simulation Running" : "Simulation Mode";
    var ico = fab.querySelector(".ic svg");
    if (ico) ico.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
    $("simRibbon") && $("simRibbon").classList.toggle("demo-running", on);
  }

  function autoStep() {
    if (!AUTO.running) return;
    var st = AUTOSEQ[AUTO.idx % AUTOSEQ.length];
    if (st.act) engine.simulate(st.act);
    AUTO.idx++;
    AUTO.timer = setTimeout(autoStep, st.wait);
  }

  function toggleAuto() {
    if (AUTO.running) {
      AUTO.running = false;
      clearTimeout(AUTO.timer);
      engine.reset();
      setFab(false);
      return;
    }
    AUTO.running = true;
    AUTO.idx = 0;
    setFab(true);
    engine.start();
    autoStep();
    scrollToMonitor();
  }

  document.addEventListener("DOMContentLoaded", function () {
    cacheEls();

    ["motion", "vibration", "temperature", "camera", "multiple", "reset"].forEach(function (k) {
      var btn = $("sim" + k.charAt(0).toUpperCase() + k.slice(1));
      if (btn) btn.addEventListener("click", function () {
        engine.simulate(k);
        scrollToMonitor(); // bring the live sensor area into view
      });
    });

    // floating simulation-mode button + header ribbon
    var fab = $("simFab");
    if (fab) fab.addEventListener("click", toggleAuto);
    var ribbon = $("simRibbon");
    if (ribbon) ribbon.addEventListener("click", toggleAuto);

    // clickable sensor cards as a shortcut to simulate that sensor
    SENSOR_KEYS.forEach(function (k) {
      var card = E.sc[k];
      if (card) card.addEventListener("click", function () { engine.simulate(k); });
    });

    var off = $("offlineToggle");
    if (off) off.addEventListener("change", function () { engine.setOffline(off.checked); });

    var offBtn = $("offlineMode");
    if (offBtn) offBtn.addEventListener("click", function (e) { e.preventDefault(); engine.setOffline(!engine.offline); refreshToggle(engine.offline); });

    engine.start();
    setInterval(tick, 700);
    tick();
  });

  function refreshToggle(off) {
    var t = $("offlineToggle");
    if (t) t.checked = !!off;
    renderStatus();
  }
})();