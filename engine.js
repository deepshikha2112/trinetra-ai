/* ==========================================================================
   TRINETRA AI — simulation engine (shared by dashboard + landing teaser)
   Pure logic; DOM rendering lives in dashboard.js / landing.js
   ========================================================================== */
(function (global) {
  "use strict";

  var WEIGHTS = { motion: 20, vibration: 30, temperature: 10, camera: 40 };
  var DURATIONS = { motion: 14000, vibration: 18000, temperature: 11000, camera: 26000 };
  var HISTORY_LIMIT = 90;

  function timeStr(d) {
    d = d || new Date();
    function p(n) { return String(n).padStart(2, "0"); }
    return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function levelFor(score) {
    if (score <= 30) return { key: "ok", label: "NORMAL", color: "#2ff2a4", range: "0-30" };
    if (score <= 70) return { key: "warn", label: "WARNING", color: "#ffc24b", range: "31-70" };
    return { key: "crit", label: "CRITICAL", color: "#ff4d68", range: "71-100" };
  }

  function makeEngine(init) {
    var cfg = Object.assign({
      nodeId: "TN-001",
      baseTemp: 32,
      onEvent: function () {}
    }, init || {});

    var power = 87;
    var connectivity = true;          // false => offline mode
    var lastSync = Date.now();
    var bootedAt = Date.now();

    var sensors = {
      motion:      { label: "Motion",      active: false, value: 0, units: "idx" },
      vibration:   { label: "Vibration",   active: false, value: 0, units: "g", threshold: 0.9 },
      temperature: { label: "Temperature", active: false, value: cfg.baseTemp, units: "\u00B0C", anomaly: 62 },
      camera:      { label: "Camera",      active: false, confidence: 0, units: "%" }
    };

    var score = 0;
    var evId = 0;
    var pending = [];              // events stored locally while offline
    var alerts = [];               // newest first
    var logs = [];                  // newest first
    var history = [];              // score samples {t, score}
    var sensorHistory = { motion: [], vibration: [], temperature: [], camera: [] };
    var timers = {};
    var ambientTimer = null;
    var heartTimer = null;
    var heartCount = 0;
    var started = false;

    /* ---------------- low-level helpers ---------------- */

    function pushLog(msg, kind) {
      logs.unshift({ id: ++evId, time: timeStr(), msg: msg, kind: kind || "sys" });
      if (logs.length > 120) logs.pop();
    }

    function pushAlert(sev, title, msg, evidence, local) {
      alerts.unshift({ id: ++evId, time: timeStr(), sev: sev, title: title, msg: msg, evidence: evidence || [], local: !!local });
      if (alerts.length > 40) alerts.pop();
    }

    function activeKeys() {
      var out = [];
      ["motion", "vibration", "temperature", "camera"].forEach(function (k) {
        if (sensors[k].active) out.push(k);
      });
      return out;
    }

    function anyActive() {
      return ["motion", "vibration", "temperature", "camera"].some(function (k) { return sensors[k].active; });
    }

    function rawValue(k) {
      if (k === "camera") return sensors.camera.confidence;
      return sensors[k].value;
    }

    function sample() {
      history.push({ t: Date.now(), score: score });
      if (history.length > HISTORY_LIMIT) history.shift();
      ["motion", "vibration", "temperature", "camera"].forEach(function (k) {
        var arr = sensorHistory[k];
        arr.push(sensors[k].active ? rawValue(k) : (k === "vibration" ? sensors.vibration.value : (k === "temperature" ? sensors.temperature.value : 0)));
        if (arr.length > HISTORY_LIMIT) arr.shift();
      });
    }

    function recompute() {
      var s = 0;
      if (sensors.motion.active) s += WEIGHTS.motion;
      if (sensors.vibration.active) s += WEIGHTS.vibration;
      if (sensors.temperature.active) s += WEIGHTS.temperature;
      if (sensors.camera.active) s += WEIGHTS.camera;
      if (sensors.motion.active && sensors.camera.active) s += 15;
      if (sensors.motion.active && sensors.vibration.active) s += 10;
      var n = activeKeys().length;
      if (n >= 3) s += 20;
      if (n >= 4) s += 10;
      score = Math.min(100, s);
      sample();
      return score;
    }

    function storeLocal(title) {
      if (!connectivity) { pending.push(title); return true; }
      return false;
    }

    /* ---------------- intensity/sync bookkeeping ---------------- */

    function maybeIntensityChange() {
      var before = levelFor(score).key;
      var after = levelFor(recompute()).key;
      if (after === "crit") pushLog("THREAT LEVEL escalated \u2014 CRITICAL", "crit");
      else if (after === "warn" && before !== "warn") pushLog("threat level raised \u2014 WARNING", "warn");
      else if (after === "ok" && before !== "ok") {
        pushLog("threat cleared \u2014 back to NORMAL", "ok");
        pushAlert("ok", "All systems nominal", "Threat sequence resolved. Node " + cfg.nodeId + " resuming normal monitoring.", ["correlation"], false);
      }
      cfg.onEvent({ type: "score" });
    }

    /* ---------------- triggers ---------------- */

    function kindLabel(k) {
      return { motion: "Motion", vibration: "Abnormal vibration", temperature: "Temperature anomaly", camera: "Camera detection" }[k] || k;
    }

    function trigger(kind) {
      if (kind === "multiple") {
        trigger("motion");
        trigger("camera");
        trigger("vibration");
        return;
      }
      if (kind === "reset") { reset(); return; }

      var s = sensors[kind];
      var evidence = [];

      switch (kind) {
        case "motion":
          s.active = true;
          s.value = Math.round(58 + Math.random() * 36);
          evidence.push("PIR trigger " + s.value + " idx");
          break;
        case "vibration":
          s.active = true;
          s.value = Math.round((1.6 + Math.random() * 2.4) * 100) / 100;
          evidence.push("vib " + s.value + "g > 0.9g");
          break;
        case "temperature":
          s.active = true;
          s.value = Math.round((61 + Math.random() * 3) * 10) / 10;
          evidence.push("temp " + s.value + "\u00B0C \u2265 55\u00B0C");
          break;
        case "camera":
          s.active = true;
          s.confidence = Math.round(66 + Math.random() * 32);
          evidence.push("AI cam " + s.confidence + "% confident");
          break;
        default:
          return;
      }

      var stored = storeLocal(kindLabel(kind));
      var s2 = recompute();
      var lvl = levelFor(s2);
      var active = activeKeys();
      var multi = sensors.motion.active && sensors.camera.active && active.length >= 3;

      var title, msg, sev, ev;
      if (multi) {
        sev = "crit";
        title = "CRITICAL \u2014 Possible Tampering Detected";
        msg = "Motion + abnormal vibration + camera activity detected near node " + cfg.nodeId + ". Multiple independent signals agree.";
        ev = ["motion", "vibration", "camera"];
      } else if (lvl.key === "crit") {
        sev = "crit";
        title = "Critical anomaly \u2014 immediate attention";
        msg = kindLabel(kind) + " escalated to critical near node " + cfg.nodeId + ". Correlated evidence: " + active.join(" + ").replace(/(^|_)motion/g, "$1Motion").replace(/_/g, "") + ".";
        ev = active.slice();
      } else if (lvl.key === "warn") {
        sev = "warn";
        title = "Suspicious activity \u2014 verify";
        msg = kindLabel(kind) + " detected near node " + cfg.nodeId + ". Threat engine evaluating. Recommended: dispatch inspection.";
        ev = [kind];
      } else {
        sev = "ok";
        title = "Sensor event registered";
        msg = kindLabel(kind) + " noted near node " + cfg.nodeId + ". Insufficient evidence to escalate — monitoring continues.";
        ev = [kind];
      }

      pushAlert(sev, title, msg, ev, stored);
      pushLog((sev === "crit" ? "ALERT \u00B7 " : "event \u00B7 ") + title + " (score " + s2 + ")", sev);
      scheduleClear(kind);
      cfg.onEvent({ type: "sensor", sensor: kind });
    }

    function scheduleClear(kind) {
      clearTimeout(timers[kind]);
      timers[kind] = setTimeout(function () {
        var s = sensors[kind];
        if (kind === "motion") s.active = false;
        else if (kind === "vibration") { s.active = false; s.value = 0; }
        else if (kind === "temperature") { s.active = false; s.value = cfg.baseTemp; }
        else if (kind === "camera") { s.active = false; s.confidence = 0; }
        pushLog(kindLabel(kind).toLowerCase() + " settled \u2014 re-evaluating", "ok");
        maybeIntensityChange();
        cfg.onEvent({ type: "clear", sensor: kind });
      }, DURATIONS[kind]);
    }

    /* ---------------- ambient heartbeat ---------------- */

    function ambient() {
      if (!sensors.temperature.active) {
        sensors.temperature.value = Math.max(26, Math.min(39, sensors.temperature.value + (Math.random() - 0.5) * 0.8));
      } else {
        sensors.temperature.value = Math.round((sensors.temperature.anomaly - Math.random() * 2) * 10) / 10;
      }
      if (!sensors.vibration.active && sensors.vibration.value > 0) {
        sensors.vibration.value = Math.max(0, sensors.vibration.value - 0.03);
      }
      sample();
      heartCount++;
      if (heartCount % 5 === 0 && !anyActive()) {
        pushLog("heartbeat OK \u00B7 watchdog healthy (heap " + (28 + Math.floor(Math.random() * 6)) + "%)", "ok");
      }
      if (heartCount % 20 === 0 && !connectivity) {
        pushLog("offline \u00B7 event buffer " + pending.length + " queued locally", "off");
      }
      cfg.onEvent({ type: "tick" });
    }

    /* ---------------- public control ---------------- */

    function start() {
      if (started) return;
      started = true;
      ambientTimer = setInterval(ambient, 1500);
      pushLog("node booted \u2014 sensors online, awaiting events", "ok");
      cfg.onEvent({ type: "boot" });
    }

    function stop() {
      if (ambientTimer) clearInterval(ambientTimer);
      if (heartTimer) clearInterval(heartTimer);
      started = false;
    }

    function resetAll() {
      var wasActive = anyActive();
      Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); });
      Object.keys(sensors).forEach(function (k) {
        sensors[k].active = false;
        sensors[k].value = 0;
        sensors[k].confidence = 0;
      });
      sensors.temperature.value = cfg.baseTemp;
      power = 87;
      score = 0;
      pushLog("manual reset \u2014 node re-initialized", "ok");
      pushLog("system state cleared \u00B7 threat score \u2192 0", "ok");
      if (wasActive) pushAlert("ok", "State reset", "All simulated conditions cleared. Node scanning normally.", ["reset"], false);
      cfg.onEvent({ type: "reset" });
    }

    function setOffline(off) {
      var wasOff = !connectivity;
      connectivity = !off;
      if (off && !wasOff) {
        pushLog("connectivity LOST \u2014 switching to OFFLINE mode", "off");
        pushAlert("warn", "Offline mode active", "No internet link. Sensors keep monitoring; events and alerts stored locally until connectivity returns.", ["offline"], true);
      } else if (!off && wasOff) {
        var n = pending.length;
        pushLog("connectivity restored \u2014 synchronizing " + n + " stored event(s)", "off");
        if (n > 0) {
          pushAlert("ok", "Sync complete", n + " locally stored event(s) pushed to backend. Last sync updated.", ["sync"], false);
        } else {
          pushAlert("ok", "Back online", "Realtime link re-established. Nothing pending to sync.", ["sync"], false);
        }
        pending = [];
        lastSync = Date.now();
        cfg.onEvent({ type: "sync", count: n });
      }
      cfg.onEvent({ type: "connectivity", offline: off });
    }

    /* ---------------- api ---------------- */

    return {
      nodeId: cfg.nodeId,
      sensors: sensors,
      get score() { return score; },
      get alerts() { return alerts; },
      get logs() { return logs; },
      get history() { return history; },
      get sensorHistory() { return sensorHistory; },
      get power() { return power; },
      get offline() { return !connectivity; },
      get lastSync() { return lastSync; },
      get uptimeSec() { return Math.floor((Date.now() - bootedAt) / 1000); },
      get pending() { return pending.slice(); },
      get pendingCount() { return pending.length; },
      levelFor: levelFor,
      start: start,
      stop: stop,
      reset: resetAll,
      simulate: trigger,
      setOffline: setOffline,
      timeStr: timeStr,
      isActive: function (k) { return !!sensors[k] && sensors[k].active; }
    };
  }

  global.TrinetraEngine = {
    makeEngine: makeEngine,
    levelFor: levelFor,
    timeStr: timeStr,
    WEIGHTS: WEIGHTS
  };
})(window);