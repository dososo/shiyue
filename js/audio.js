/* 拾月 · audio.js — 全程序化音频(WebAudio):五声音阶的生成式配乐 + 与配乐同调的交互音效。
 * 没有任何音频文件。所有音效的音高都取自当前关卡的调式,因此怎么操作都不会「走音」。
 */
(function (root) {
  'use strict';
  var SC = { gong: [0, 2, 4, 7, 9], yu: [0, 3, 5, 7, 10] };
  var A = { ctx: null, muted: false, spec: null };
  var ctx, master, revIn, sfx, bus = null, pads = [], timer = null, nextT = 0, half = 0, mel = null, chordI = 0;

  function fq(d) {
    var sp = A.spec || { root: 60, scale: 'gong' }, s = SC[sp.scale], o = Math.floor(d / 5), i = ((d % 5) + 5) % 5;
    return 440 * Math.pow(2, (sp.root + s[i] + 12 * o - 69) / 12);
  }
  function mkIR() {
    var len = (ctx.sampleRate * 3.4) | 0, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c), lp = 0;
      for (var i = 0; i < len; i++) { var t = i / len; lp += (Math.random() * 2 - 1 - lp) * 0.32; d[i] = lp * Math.pow(1 - t, 2.8); }
    }
    return b;
  }
  A.init = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var C = root.AudioContext || root.webkitAudioContext; if (!C) return;
    try { ctx = A.ctx = new C(); } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = A.muted ? 0 : 0.85;
    var comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
    var cv = ctx.createConvolver(); cv.buffer = mkIR();
    revIn = ctx.createGain(); revIn.gain.value = 0.6; revIn.connect(cv); cv.connect(master);
    sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
    if (A.spec) startMusic();
    timer = setInterval(sched, 110);
  };
  A.setMute = function (m) { A.muted = m; if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.08); };
  A.pause = function (p) { if (!ctx) return; if (p) ctx.suspend(); else ctx.resume(); };

  // 单个发声体
  function voice(f, t, o) {
    var os = ctx.createOscillator(), g = ctx.createGain();
    os.type = o.type || 'sine';
    if (o.bend) { os.frequency.setValueAtTime(f * o.bend, t); os.frequency.exponentialRampToValueAtTime(f, t + 0.05); } else os.frequency.setValueAtTime(f, t);
    if (o.vib) { var l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 4.6; lg.gain.value = f * 0.006; l.connect(lg); lg.connect(os.frequency); l.start(t); l.stop(t + o.dur + 0.1); }
    var at = o.att || 0.006;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol, t + at);
    if (o.hold) g.gain.setValueAtTime(o.vol, t + at + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    os.connect(g); g.connect(o.dest);
    var w = ctx.createGain(); w.gain.value = o.wet === undefined ? 0.55 : o.wet; g.connect(w); w.connect(revIn);
    os.start(t); os.stop(t + o.dur + 0.05);
  }
  // 拨弦(筝)
  function pluck(f, t, vol, dest) {
    voice(f, t, { type: 'triangle', vol: vol, dur: 1.7, bend: 1.012, dest: dest });
    voice(f * 2, t, { vol: vol * 0.28, dur: 0.7, dest: dest });
    voice(f * 3, t, { vol: vol * 0.09, dur: 0.3, dest: dest });
  }
  // 磬/钟
  function bell(f, t, vol, dest) {
    voice(f, t, { vol: vol, dur: 1.5, dest: dest, wet: 0.8 });
    voice(f * 2.01, t, { vol: vol * 0.3, dur: 0.6, dest: dest });
    voice(f * 3.02, t, { vol: vol * 0.08, dur: 0.25, dest: dest });
  }
  // 箫
  function flute(f, t, len, vol, dest) {
    voice(f, t, { vol: vol, att: 0.14, hold: Math.max(0.05, len * 0.55), dur: len + 0.5, vib: 1, dest: dest, wet: 0.8 });
    voice(f * 2, t, { vol: vol * 0.12, att: 0.16, dur: len + 0.3, dest: dest });
  }
  function lead(f, t, len, dest) {
    var k = A.spec.lead;
    if (k === 'flute') flute(f, t, len, 0.075, dest); else if (k === 'bell') bell(f, t, 0.09, dest); else pluck(f, t, 0.11, dest);
    if (A.spec.duo && Math.random() < 0.5) flute(f / 2, t, len * 1.2, 0.035, dest);
  }

  function setChord(k) {
    var now = ctx.currentTime, old = pads; pads = [];
    old.forEach(function (p) { p.g.gain.setTargetAtTime(0, now, 1.4); p.os.forEach(function (o) { o.stop(now + 7); }); });
    var ch = A.spec.chords[k % A.spec.chords.length], dest = bus;
    ch.forEach(function (d, i) {
      var g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620;
      g.gain.setValueAtTime(0, now); g.gain.setTargetAtTime(i === 0 ? 0.05 : 0.034, now, 1.6);
      var os = [-4, 5].map(function (det) { var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fq(d - 5); o.detune.value = det; o.connect(lp); o.start(now); return o; });
      lp.connect(g); g.connect(dest);
      pads.push({ g: g, os: os });
    });
  }
  function startMusic() {
    var now = ctx.currentTime;
    if (bus) { var ob = bus; ob.gain.setTargetAtTime(0, now, 0.7); setTimeout(function () { try { ob.disconnect(); } catch (e) { } }, 9000); }
    bus = ctx.createGain(); bus.gain.setValueAtTime(0, now); bus.gain.setTargetAtTime(0.62, now + 0.4, 1.2); bus.connect(master);
    var bw = ctx.createGain(); bw.gain.value = 0.4; bus.connect(bw); bw.connect(revIn);
    mel = { i: 0, wait: 6, tr: 0, end: A.spec.motif.length }; half = 0; chordI = 0; nextT = now + 0.4;
    setChord(0);
  }
  A.music = function (spec) { if (A.spec === spec) return; A.spec = spec; if (ctx) startMusic(); };

  function sched() {
    if (!ctx || !A.spec || !bus || ctx.state !== 'running') return;
    var hb = 30 / A.spec.bpm;
    if (nextT < ctx.currentTime - 0.3) nextT = ctx.currentTime + 0.05;
    while (nextT < ctx.currentTime + 0.35) { stepHalf(nextT, hb); nextT += hb; half++; }
  }
  function stepHalf(t, hb) {
    var sp = A.spec;
    if (half > 0 && half % 32 === 0) { chordI++; setChord(chordI); }
    if (half % 32 === 0) pluck(fq(sp.chords[chordI % sp.chords.length][0] - 10), t, 0.09, bus);
    if (mel.wait > 0) mel.wait--;
    else {
      var nt = sp.motif[mel.i];
      lead(fq(nt[0] + mel.tr), t, nt[1] * hb, bus);
      mel.wait = nt[1] - 1; mel.i++;
      if (mel.i >= mel.end) {
        mel.i = 0; mel.wait += 6 + ((Math.random() * 10) | 0);
        mel.tr = [0, 0, 0, 1, 2, -2, 5][(Math.random() * 7) | 0];
        mel.end = Math.random() < 0.3 ? Math.ceil(sp.motif.length / 2) : sp.motif.length;
      }
    }
    if (Math.random() < 0.07) bell(fq(10 + ((Math.random() * 6) | 0)), t + Math.random() * hb, 0.022, bus);
  }

  // ── 交互音效 ──
  var ok = function () { return ctx && ctx.state === 'running'; };
  var STEP = [0, 1, 2, 1, 3, 2, 4, 2];
  A.step = function (i) { if (ok()) bell(fq(5 + STEP[i % 8]), ctx.currentTime, 0.085, sfx); };
  A.tick = function (i) { if (ok()) pluck(fq(5 + (((i % 8) + 8) % 8)), ctx.currentTime, 0.12, sfx); };
  A.snap = function () { if (!ok()) return; var t = ctx.currentTime; pluck(fq(5), t, 0.1, sfx); pluck(fq(7), t + 0.07, 0.1, sfx); };
  A.deny = function () { if (!ok()) return; var t = ctx.currentTime; voice(150, t, { vol: 0.16, dur: 0.22, bend: 1.25, dest: sfx, wet: 0.2 }); };
  A.plate = function () { if (!ok()) return; var t = ctx.currentTime; [0, 2, 4, 5].forEach(function (d, i) { pluck(fq(d), t + i * 0.09, 0.13, sfx); }); };
  A.rise = function (dur) { if (!ok()) return; var t = ctx.currentTime, n = 9; for (var i = 0; i < n; i++) bell(fq(3 + i), t + 0.15 + i * (dur * 0.8 / n), 0.07, sfx); };
  A.goal = function () { if (!ok()) return; var t = ctx.currentTime; for (var i = 0; i < 8; i++) pluck(fq(5 + i), t + i * 0.11, 0.12, sfx); flute(fq(10), t + 0.9, 2.2, 0.09, sfx); };
  A.orb = function () { if (!ok()) return; var t = ctx.currentTime; for (var i = 0; i < 12; i++) bell(fq(10 + (i % 5) + ((i / 5) | 0) * 2), t + i * 0.16, 0.05, sfx); };
  A.moon = function () { if (!ok()) return; var t = ctx.currentTime; [0, 2, 4, 7, 9].forEach(function (d) { voice(fq(d), t, { vol: 0.07, att: 1.1, hold: 1.2, dur: 5.5, dest: sfx, wet: 0.9 }); }); bell(fq(15), t + 1.0, 0.08, sfx); };
  A.chirp = function () {
    if (!ok()) return; var t = ctx.currentTime;
    [0, 0.14].forEach(function (dt, i) {
      var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(fq(8 + i), t + dt); o.frequency.exponentialRampToValueAtTime(fq(10 + i), t + dt + 0.1);
      g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.09, t + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.18);
      o.connect(g); g.connect(sfx); g.connect(revIn); o.start(t + dt); o.stop(t + dt + 0.25);
    });
  };
  A.ui = function () { if (ok()) bell(fq(12), ctx.currentTime, 0.05, sfx); };

  root.SY_AUDIO = A;
})(window);
