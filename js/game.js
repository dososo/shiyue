/* 拾月 · game.js — 主循环、建模、交互、演出与界面。 */
(function () {
  'use strict';
  var L = window.SY_LOGIC, G = window.SY_GFX, AU = window.SY_AUDIO, LEVELS = window.SY_LEVELS, M = G.M;
  var $ = function (id) { return document.getElementById(id); };
  var NUM = ['一', '二', '三', '四', '五', '六'];
  var RX = [0.70710678, 0, -0.70710678], UY = [-0.40824829, 0.81649658, -0.40824829];
  var s2 = function (v) { return [v[0] * RX[0] + v[2] * RX[2], v[0] * UY[0] + v[1] * UY[1] + v[2] * UY[2]]; };
  var hex = function (h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255; }); };
  var mulc = function (c, k) { return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]; };
  var mixc = function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  var rgba = function (h, a) { var c = hex(h); return 'rgba(' + ((c[0] * 255) | 0) + ',' + ((c[1] * 255) | 0) + ',' + ((c[2] * 255) | 0) + ',' + a + ')'; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };

  var bgc = $('bg'), glc = $('gl'), fxc = $('fx'), bg = bgc.getContext('2d'), fx = fxc.getContext('2d');
  var R;
  try { R = new G.Renderer(glc); } catch (e) { $('nogl').classList.add('on'); return; }

  var W = 1, H = 1, DPR = 1;
  var save = { done: 0, mute: false };
  try { var sv = JSON.parse(localStorage.getItem('shiyue.v1') || '{}'); if (sv && typeof sv === 'object') { save.done = sv.done | 0; save.mute = !!sv.mute; } } catch (e) { }
  var persist = function () { try { localStorage.setItem('shiyue.v1', JSON.stringify(save)); } catch (e) { } };
  AU.muted = save.mute;

  var S = { mode: 'title', idx: 0, t: 0, world: null, def: null, pal: null, pc: {}, meshes: [], glows: [], seq: [],
    cam: { c: [0, 0, 0], ppu: 60, base: 0, intro: 0 }, ga: 1, moon: { phase: 0, anim: null, x: 0, y: 0, r: 30 },
    ptr: null, drag: null, pendingTap: null, ripples: [], dust: [], orb: null, goalTaken: false, canContinue: false,
    hintI: 0, hintT: 0, stepN: 0, busy: 0 };
  var P = { node: null, pos: [0, 0, 0], path: [], step: null, face: 0.8, faceT: 0.8, rideRef: 0, idle: 0, blink: 0, cheer: 0, gy: 0 };
  var PM = {}; // 主角网格

  // ───────────── 投影 ─────────────
  function proj(p) {
    var c = S.cam.c, d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], s = s2(d);
    return [W / 2 + s[0] * S.cam.ppu, H / 2 - s[1] * S.cam.ppu + S.cam.base + S.cam.intro];
  }
  function fitCamera() {
    var mn = [1e9, 1e9], mx = [-1e9, -1e9];
    var add = function (p) { var s = s2(p); mn[0] = Math.min(mn[0], s[0]); mn[1] = Math.min(mn[1], s[1]); mx[0] = Math.max(mx[0], s[0]); mx[1] = Math.max(mx[1], s[1]); };
    S.world.parts.forEach(function (p) {
      var sts = p.kind === 'rot' ? [0, 1, 2, 3] : p.kind === 'slide' ? (p.handles.length ? [p.min, p.max] : [p.max]) : [0];
      sts.forEach(function (st) {
        (p.def.boxes || []).forEach(function (b) {
          var y0 = Math.max(b[1], -1.6) - 0.5, y1 = b[4] + 0.5;
          if (y1 < y0) return;
          [b[0] - 0.5, b[3] + 0.5].forEach(function (x) { [y0, y1 + 1.5].forEach(function (y) { [b[2] - 0.5, b[5] + 0.5].forEach(function (z) { add(L.tPoint(p, st, [x, y, z])); }); }); });
        });
        p.nodes.forEach(function (n) { add(L.tPoint(p, st, [n.c[0], n.c[1] + 2.2, n.c[2]])); add(L.tPoint(p, st, [n.c[0], n.c[1] - 0.6, n.c[2]])); });
      });
    });
    var top = 84, bot = 96, side = 28;
    var ppu = Math.max(6, Math.min((W - side * 2) / (mx[0] - mn[0]), (H - top - bot) / (mx[1] - mn[1]), 76 * Math.max(1, Math.min(W, H) / 720))); // 大屏按比例放宽上限 // 极小窗口下也保持为正
    var cu = (mn[0] + mx[0]) / 2, cv = (mn[1] + mx[1]) / 2;
    S.cam.c = [RX[0] * cu + UY[0] * cv, UY[1] * cv, RX[2] * cu + UY[2] * cv];
    S.cam.ppu = ppu; S.cam.base = (top - bot) / 2;
  }

  // ───────────── 建模 ─────────────
  function deco(g, p, x) {
    var c = S.pc, t = x[0], X = x[1], Y = x[2], Z = x[3], by = Y + 0.5, i;
    if (t === 'tree') {
      if (x[4] === 1) { // 松
        g.cyl(X, by, Z, 0.07, 0.06, 0.32, c.trunk, 8);
        g.cyl(X, by + 0.26, Z, 0.44, 0, 0.6, c.leaf, 10);
        g.cyl(X, by + 0.62, Z, 0.34, 0, 0.52, mixc(c.leaf, [1, 1, 1], 0.25), 10);
        g.cyl(X, by + 0.96, Z, 0.24, 0, 0.46, mixc(c.leaf, [1, 1, 1], 0.7), 10);
      } else { // 花树
        g.cyl(X, by, Z, 0.075, 0.05, 0.78, c.trunk, 8);
        g.sphere(X, by + 1.04, Z, 0.42, 0.36, 0.42, c.leaf);
        g.sphere(X + 0.22, by + 0.84, Z + 0.14, 0.27, 0.24, 0.27, mulc(c.leaf, 0.95));
        g.sphere(X - 0.2, by + 0.9, Z - 0.1, 0.29, 0.26, 0.29, mixc(c.leaf, [1, 1, 1], 0.22));
      }
    } else if (t === 'lamp') { // 石灯
      g.frustum(X, by, Z, 0.2, 0.12, 0.42, c.b);
      g.e = 1; g.box(X, by + 0.56, Z, 0.13, 0.14, 0.13, c.glow); g.e = 0;
      g.frustum(X, by + 0.7, Z, 0.25, 0.03, 0.2, c.dark);
      S.glows.push({ part: p, p: [X, by + 0.56, Z], r: 1.5 });
    } else if (t === 'pav') { // 亭
      for (i = 0; i < 4; i++) g.cyl(X + (i & 1 ? 0.4 : -0.4), by, Z + (i & 2 ? 0.4 : -0.4), 0.05, 0.05, 1.8, c.acc, 8);
      g.box(X, by + 1.84, Z, 0.5, 0.05, 0.5, c.b);
      g.frustum(X, by + 1.89, Z, 0.8, 0.5, 0.15, c.dark);
      g.frustum(X, by + 2.04, Z, 0.58, 0.05, 0.5, c.dark);
      g.sphere(X, by + 2.6, Z, 0.07, 0.09, 0.07, c.knob);
    } else if (t === 'win') { // 窗
      if (x[4] === 'x') { g.box(X + 0.503, Y + 0.02, Z, 0.004, 0.2, 0.095, c.dark); g.box(X + 0.506, Y - 0.2, Z, 0.006, 0.02, 0.13, c.path); }
      else { g.box(X, Y + 0.02, Z + 0.503, 0.095, 0.2, 0.004, c.dark); g.box(X, Y - 0.2, Z + 0.506, 0.13, 0.02, 0.006, c.path); }
    } else if (t === 'hub') {
      g.cyl(X, Y - 0.5, Z, 0.3, 0.3, 0.62, c.b, 14);
    } else if (t === 'lotus') {
      var wy = S.def.water.y, sc = x[3];
      g.cyl(X, wy + 0.004, Y, 0.34 * sc, 0.34 * sc, 0.016, c.jade, 12);
      g.cyl(X + 0.42 * sc, wy + 0.004, Y + 0.2 * sc, 0.2 * sc, 0.2 * sc, 0.014, mulc(c.jade, 0.92), 10);
      if (sc >= 0.9) g.sphere(X + 0.05, wy + 0.09, Y - 0.04, 0.09, 0.08, 0.09, c.leaf, 8);
    } else if (t === 'pad') { // 莲台(阿渡停靠处)
      var w2 = S.def.water.y; g.e = 0.85;
      g.cyl(X, w2 + 0.006, Y, 0.86, 0.86, 0.012, c.glow, 24); g.e = 0;
      g.cyl(X, w2 + 0.02, Y, 0.72, 0.72, 0.008, c.water, 24);
      S.glows.push({ part: p, p: [X, w2, Y], r: 1.6 });
    } else if (t === 'turtle') { // 石龟阿渡
      var j = c.jade, jl = mixc(j, [1, 1, 1], 0.28), jd = mulc(j, 0.78), skin = mixc(j, [1, 0.96, 0.8], 0.55);
      g.sphere(X, Y - 0.02, Z, 0.5, 0.15, 0.5, jd, 16);
      g.sphere(X, Y + 0.1, Z, 0.46, 0.4, 0.46, j, 16);
      g.cyl(X, Y + 0.43, Z, 0.36, 0.33, 0.07, jl, 16);
      g.cyl(X, Y + 0.497, Z, 0.2, 0.2, 0.006, j, 12);
      g.sphere(X, Y + 0.12, Z + 0.56, 0.18, 0.16, 0.2, skin, 12);
      g.sphere(X - 0.08, Y + 0.18, Z + 0.71, 0.03, [0.2, 0.18, 0.2], 8); g.sphere(X + 0.08, Y + 0.18, Z + 0.71, 0.03, [0.2, 0.18, 0.2], 8);
      g.sphere(X - 0.13, Y + 0.1, Z + 0.68, 0.036, 0.022, 0.028, [0.95, 0.66, 0.6], 8); g.sphere(X + 0.13, Y + 0.1, Z + 0.68, 0.036, 0.022, 0.028, [0.95, 0.66, 0.6], 8);
      for (i = 0; i < 4; i++) g.sphere(X + (i & 1 ? 0.36 : -0.36), Y - 0.14, Z + (i & 2 ? 0.34 : -0.34), 0.14, 0.09, 0.14, skin, 10);
      g.sphere(X, Y - 0.02, Z - 0.5, 0.06, 0.05, 0.09, skin, 8);
    }
  }
  function buildPart(p) {
    var g = new G.Geo(), d = p.def, c = S.pc;
    g.e = d.glow ? 0.8 : 0;
    (d.boxes || []).forEach(function (b) {
      var col = c[b[6]] || c.a, hx = (b[3] - b[0] + 1) / 2, hz = (b[5] - b[2] + 1) / 2, cx = (b[0] + b[3]) / 2, cz = (b[2] + b[5]) / 2;
      if (d.thin) g.box(cx, b[4] + 0.3, cz, hx, 0.2, hz, col);
      else g.box(cx, (b[1] + b[4]) / 2, cz, hx, (b[4] - b[1] + 1) / 2, hz, col);
    });
    p.nodes.forEach(function (n) {
      if (d.turtle) return;
      var q = n.c;
      if (n.stair) {
        var dr = n.stair;
        for (var i = 0; i < 4; i++) {
          var al = -0.375 + i * 0.25, h = (i + 1) * 0.25;
          g.box(q[0] + dr[0] * al, q[1] - 0.5 + h / 2, q[2] + dr[2] * al, dr[0] ? 0.125 : 0.5, h / 2, dr[2] ? 0.125 : 0.5, d.glow ? c.glow : (i % 2 ? c.path : c.a));
        }
        return;
      }
      var nn = n.n, e = [nn[0] ? 0.008 : 0.42, nn[1] ? 0.008 : 0.42, nn[2] ? 0.008 : 0.42];
      g.box(q[0] + nn[0] * 0.508, q[1] + nn[1] * 0.508, q[2] + nn[2] * 0.508, e[0], e[1], e[2], d.glow ? [1, 1, 0.94] : c.path);
      if (n.goal) { var e0 = g.e; g.e = 1; g.cyl(q[0], q[1] + 0.516, q[2], 0.33, 0.33, 0.012, c.glow, 20); g.e = e0; g.cyl(q[0], q[1] + 0.528, q[2], 0.22, 0.22, 0.006, c.path, 20); }
      if (n.plate) { g.cyl(q[0], q[1] + 0.516, q[2], 0.32, 0.3, 0.05, c.acc, 20); g.cyl(q[0], q[1] + 0.566, q[2], 0.2, 0.2, 0.006, c.knob, 16); }
    });
    (d.deco || []).forEach(function (x) { deco(g, p, x); });
    p.handles.forEach(function (h) {
      if (d.turtle) return;
      if (p.kind === 'rot' && p.axis === 'y') {
        var pv = p.pivot, dx = h[0] - pv[0], dz = h[2] - pv[2];
        g.box((h[0] + pv[0]) / 2, h[1] - 0.06, (h[2] + pv[2]) / 2, Math.abs(dx) / 2 + (dx ? 0 : 0.055), 0.05, Math.abs(dz) / 2 + (dz ? 0 : 0.055), c.b);
        g.cyl(h[0], h[1] - 0.16, h[2], 0.2, 0.2, 0.22, c.knob, 16);
        g.cyl(h[0], h[1] + 0.06, h[2], 0.11, 0.11, 0.04, c.acc, 12);
      } else if (p.kind === 'rot' && Math.abs(h[0] - p.pivot[0]) + Math.abs(h[1] - p.pivot[1]) > 0.5) { // 臂端的小握钮
        g.cyl(h[0], h[1], h[2] - 0.1, 0.17, 0.17, 0.06, c.dark, 14, 'z'); g.sphere(h[0], h[1], h[2], 0.13, c.knob, 10);
      } else if (p.kind === 'rot') {
        g.cyl(h[0], h[1], h[2] - 0.22, 0.34, 0.34, 0.12, c.b, 20, 'z');
        g.cyl(h[0], h[1], h[2] - 0.1, 0.2, 0.2, 0.12, c.knob, 16, 'z');
        for (var k = 0; k < 4; k++) g.sphere(h[0] + Math.cos(k * 1.5708) * 0.3, h[1] + Math.sin(k * 1.5708) * 0.3, h[2] - 0.06, 0.075, c.knob, 8);
      } else {
        var ax = Math.abs(h[0] - Math.round(h[0])) > 0.3 ? 'x' : 'z';
        if (ax === 'x') g.cyl(h[0] - 0.12, h[1], h[2], 0.2, 0.2, 0.08, c.dark, 16, 'x'); else g.cyl(h[0], h[1], h[2] - 0.12, 0.2, 0.2, 0.08, c.dark, 16, 'z');
        g.sphere(h[0], h[1], h[2], 0.15, c.knob, 10);
      }
    });
    return R.mesh(g);
  }
  function buildPlayer() {
    var w = [1, 0.985, 0.955], pink = [0.97, 0.72, 0.7], red = [0.86, 0.33, 0.25], dk = [0.2, 0.17, 0.2], g;
    g = new G.Geo();
    g.sphere(0, 0.26, 0, 0.21, 0.25, 0.2, w); g.sphere(0, 0.6, 0.02, 0.19, 0.175, 0.18, w);
    g.sphere(0, 0.2, -0.2, 0.07, w, 8);
    g.sphere(0, 0.445, 0.005, 0.17, 0.055, 0.165, red); g.sphere(0.1, 0.41, 0.13, 0.05, 0.06, 0.04, red, 8);
    g.sphere(-0.09, 0.04, 0.06, 0.07, 0.045, 0.1, w, 8); g.sphere(0.09, 0.04, 0.06, 0.07, 0.045, 0.1, w, 8);
    g.sphere(-0.125, 0.565, 0.145, 0.036, 0.022, 0.02, pink, 8); g.sphere(0.125, 0.565, 0.145, 0.036, 0.022, 0.02, pink, 8);
    g.sphere(0, 0.585, 0.196, 0.016, 0.012, 0.01, pink, 6);
    g.cyl(0.27, 0.46, 0.1, 0.007, 0.007, 0.13, dk, 6);
    PM.body = R.mesh(g);
    g = new G.Geo(); g.sphere(0, 0.17, 0, 0.052, 0.18, 0.04, w, 10); g.sphere(0, 0.17, 0.022, 0.026, 0.13, 0.025, pink, 8); PM.ear = R.mesh(g);
    g = new G.Geo(); g.sphere(-0.075, 0.625, 0.172, 0.025, 0.034, 0.018, dk, 8); g.sphere(0.075, 0.625, 0.172, 0.025, 0.034, 0.018, dk, 8); PM.eyes = R.mesh(g);
    g = new G.Geo(); g.e = 1; g.sphere(0.27, 0.36, 0.1, 0.075, 0.09, 0.075, [1, 0.9, 0.62], 10); g.e = 0; g.cyl(0.27, 0.44, 0.1, 0.04, 0.03, 0.025, red, 8); g.cyl(0.27, 0.255, 0.1, 0.03, 0.04, 0.02, red, 8); PM.lantern = R.mesh(g);
    g = new G.Geo(); g.e = 1; g.cyl(0, 0, 0, 0.2, 0.2, 0.004, [0.12, 0.12, 0.2], 16); PM.blob = R.mesh(g);
    g = new G.Geo(); g.e = 1; g.sphere(0, 0, 0, 0.13, 0.2, 0.13, [1, 0.97, 0.82], 4); PM.shard = R.mesh(g);
    g = new G.Geo(); g.e = 1; g.quad([-1, 0, -1], [-1, 0, 1], [1, 0, 1], [1, 0, -1], [0, 1, 0], [1, 1, 1]); PM.quad = g;
  }

  // ───────────── 关卡载入 ─────────────
  function loadLevel(i) {
    var def = LEVELS[i], k;
    S.idx = i; S.def = def; S.pal = def.pal; S.pc = {};
    for (k in def.pal) if (typeof def.pal[k] === 'string' && def.pal[k][0] === '#') S.pc[k] = hex(def.pal[k]);
    S.meshes.forEach(function (m) { R.free(m.mesh); }); S.meshes = []; S.glows = []; S.seq = [];
    S.world = L.build(def);
    S.world.parts.forEach(function (p) { p.anim = null; p.shake = 0; S.meshes.push({ part: p, mesh: buildPart(p) }); });
    if (S.waterMesh) R.free(S.waterMesh);
    S.waterMesh = null;
    if (def.water) { var g = new G.Geo(); g.e = 1; var s = 90; g.quad([-s, 0, -s], [-s, 0, s], [s, 0, s], [s, 0, -s], [0, 1, 0], S.pc.water); S.waterMesh = R.mesh(g); }
    fitCamera();
    P.node = S.world.start; P.pos = P.node.stand.slice(); P.gy = P.pos[1]; P.path = []; P.step = null; P.face = P.faceT = 0.8; P.rideRef = P.node.part.val; P.idle = 0; P.cheer = 0;
    S.moon.phase = i / 6; S.moon.anim = null; S.goalTaken = false; S.canContinue = false; S.orb = null; S.drag = null; S.ptr = null; S.pendingTap = null; S.ripples = [];
    S.hintI = 0; S.hintT = 0; S.stepN = 0; S.did = {};
    initDust(); drawBG();
    document.documentElement.style.setProperty('--ink', def.pal.ink);
    document.documentElement.style.setProperty('--ink-soft', rgba(def.pal.ink, 0.55));
    $('chapter').textContent = NUM[i] + ' · ' + def.name;
    $('endline').classList.remove('on'); $('endgo').classList.remove('on'); setHint('');
    AU.music(def.music);
  }
  function after(sec, fn) { S.seq.push({ at: S.t + sec, fn: fn }); }
  function setHint(t) { var h = $('hint'); if (t) { h.textContent = t; h.classList.add('on'); } else h.classList.remove('on'); }
  function nextHint() {
    var hs = S.def.hints || []; while (hs[S.hintI] && S.did[hs[S.hintI][1]]) S.hintI++;
    if (S.hintI >= hs.length) { setHint(''); return; }
    setHint(hs[S.hintI][0]); S.hintT = 0;
  }
  function hintEvent(ev) {
    S.did[ev] = 1;
    var hs = S.def.hints || [], h = hs[S.hintI]; if (!h || S.mode !== 'play') return;
    if (h[1] === ev) { S.hintI++; setHint(''); after(0.9, nextHint); }
  }
  function veil(on, cb) { var v = $('veil'); v.classList.toggle('on', on); if (cb) setTimeout(cb, on ? 750 : 60); }
  function showCard() {
    S.mode = 'card'; S.ga = 0; S.cam.intro = 90;
    $('cno').textContent = '第' + NUM[S.idx] + '章'; $('cname').textContent = S.def.name; $('cpoem').textContent = S.def.poem;
    $('card').classList.add('on');
    after(3.0, beginIntro);
  }
  function beginIntro() {
    if (S.mode !== 'card' && S.mode !== 'load') return;
    $('card').classList.remove('on'); S.mode = 'intro'; S.introT = 0; S.seq = [];
  }
  function start(i, withCard) {
    S.mode = 'load';
    veil(true, function () {
      ['title', 'levels', 'finale'].forEach(function (id) { $(id).classList.remove('on'); });
      $('hud').classList.add('on'); $('chapter').classList.add('on');
      loadLevel(i);
      if (withCard) showCard(); else { S.ga = 0; S.cam.intro = 90; beginIntro(); }
      veil(false);
    });
  }

  // ───────────── 背景 ─────────────
  function rnd(seed) { var s = seed * 9301 + 49297; return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
  function drawBG() {
    var pal = S.pal, g, i, k;
    g = bg.createLinearGradient(0, 0, 0, H); g.addColorStop(0, pal.sky[0]); g.addColorStop(0.55, pal.sky[1]); g.addColorStop(1, pal.sky[2]);
    bg.fillStyle = g; bg.fillRect(0, 0, W, H);
    if (pal.night) { var r = rnd(S.idx + 3); for (i = 0; i < 110; i++) { var x = r() * W, y = r() * H * 0.7, rr = 0.4 + r() * 1.1; bg.fillStyle = 'rgba(255,250,235,' + (0.25 + r() * 0.55) + ')'; bg.beginPath(); bg.arc(x, y, rr, 0, 6.2832); bg.fill(); } }
    // 月
    var mr = clamp(Math.min(W, H) * 0.055, 22, 52 * Math.max(1, Math.min(W, H) / 720)), mx = W * (S.def.moonX || (W > H ? 0.8 : 0.76)), my = H * (W > H ? 0.2 : 0.16), f = S.moon.phase;
    S.moon.x = mx; S.moon.y = my; S.moon.r = mr;
    g = bg.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 3.6); g.addColorStop(0, 'rgba(255,246,214,' + (0.1 + 0.32 * f) + ')'); g.addColorStop(1, 'rgba(255,246,214,0)');
    bg.fillStyle = g; bg.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
    bg.fillStyle = pal.night ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)'; bg.beginPath(); bg.arc(mx, my, mr, 0, 6.2832); bg.fill();
    if (f > 0.01) {
      bg.fillStyle = pal.night ? '#fff5d4' : '#fffaf0'; bg.beginPath();
      if (f > 0.995) bg.arc(mx, my, mr, 0, 6.2832);
      else { bg.arc(mx, my, mr, -Math.PI / 2, Math.PI / 2, false); bg.ellipse(mx, my, mr * Math.abs(1 - 2 * f), mr, 0, Math.PI / 2, -Math.PI / 2, f < 0.5); }
      bg.fill();
    }
    // 远山(水墨层叠)
    for (k = 0; k < 3; k++) {
      var by = H * (0.5 + 0.14 * k), amp = H * (0.11 - 0.022 * k), sd = S.idx * 3.7 + k * 9.1, fr = 3.2 * (1 + k * 0.35);
      bg.beginPath(); bg.moveTo(0, H);
      for (var px = 0; px <= W + 8; px += 8) {
        var u = px / W * fr, rg = Math.sin(u * 1.3 + sd) * 0.5 + Math.sin(u * 2.9 + sd * 1.7) * 0.25 + Math.sin(u * 6.1 + sd * 2.3) * 0.12;
        bg.lineTo(px, by - amp * (0.5 + rg));
      }
      bg.lineTo(W, H); bg.closePath();
      g = bg.createLinearGradient(0, by - amp * 1.4, 0, by + H * 0.24); g.addColorStop(0, rgba(pal.mtn, 0.2 + 0.1 * k)); g.addColorStop(1, rgba(pal.mtn, 0));
      bg.fillStyle = g; bg.fill();
    }
    g = bg.createLinearGradient(0, H * 0.72, 0, H); g.addColorStop(0, rgba(pal.fog, 0)); g.addColorStop(1, rgba(pal.fog, 0.75));
    bg.fillStyle = g; bg.fillRect(0, H * 0.72, W, H * 0.28);
  }

  // ───────────── 粒子 / 特效层 ─────────────
  function initDust() {
    var t = S.pal.fx, n = t === 'snow' ? 90 : t === 'petal' ? 34 : t === 'firefly' ? 30 : 44; S.dust = [];
    for (var i = 0; i < n; i++) S.dust.push({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random(), ph: Math.random() * 6.28, sp: 0.5 + Math.random() });
  }
  function glowDot(x, y, r, col, a) {
    if (!(r > 0.5)) return;
    var g = fx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    fx.fillStyle = g; fx.beginPath(); fx.arc(x, y, r, 0, 6.2832); fx.fill();
  }
  function drawFX(dt) {
    var pal = S.pal, t = S.t, i, d, s, ppu = S.cam.ppu;
    fx.clearRect(0, 0, W, H);
    if (S.mode === 'title' || S.mode === 'load') return;
    fx.globalAlpha = S.ga;
    var night = pal.night ? 1 : 0.55;
    // 灯与机关的柔光
    fx.globalCompositeOperation = 'lighter';
    S.glows.forEach(function (gl) { s = proj(L.tPoint(gl.part, gl.part.val, gl.p)); if (gl.p[1] + (gl.part.kind === 'slide' && gl.part.axis === 'y' ? gl.part.val : 0) > -1.5) glowDot(s[0], s[1], gl.r * ppu, pal.glow, 0.26 * night); });
    var lp = lanternPos(); s = proj(lp); glowDot(s[0], s[1], ppu * (1.05 + 0.05 * Math.sin(t * 2.3)), pal.glow, 0.36 * night);
    if (!S.goalTaken) { var gn = goalNode(); if (gn && gn.active) { s = proj([gn.stand[0], gn.stand[1] + 0.95, gn.stand[2]]); glowDot(s[0], s[1], ppu * 1.25, '#fff4cc', 0.42 * night); } }
    S.world.nodes.forEach(function (n) { if (n.plate && !n.pressed && n.active) { s = proj(n.stand); glowDot(s[0], s[1], ppu * (0.6 + 0.08 * Math.sin(t * 2)), pal.glow, 0.3 * night); } });
    fx.globalCompositeOperation = 'source-over';
    // 把手呼吸环
    if (S.mode === 'play') S.world.parts.forEach(function (p) {
      if (!p.handles.length || p.anim || L.locked(p, P.node)) return;
      p.handles.forEach(function (h) {
        var hw = L.tPoint(p, p.val, h); if (hw[1] < -0.8) return; // 转到下方、被挡住的握钮不提示
        s = proj(hw); var k = 0.5 + 0.5 * Math.sin(t * 2.2), rr = ppu * (p.def.turtle ? 0.6 : 0.3) * (1 + 0.14 * k);
        fx.strokeStyle = rgba(pal.knob, 0.2 + 0.5 * (1 - k)); fx.lineWidth = 1.5; fx.beginPath(); fx.ellipse(s[0], s[1] + (p.def.turtle ? ppu * 0.12 : 0), rr, rr * (p.def.turtle ? 0.6 : 1), 0, 0, 6.2832); fx.stroke();
      });
    });
    // 飘落物
    for (i = 0; i < S.dust.length; i++) {
      d = S.dust[i]; var x, y;
      if (pal.fx === 'petal') { d.y += dt * 0.035 * d.sp; d.x += dt * 0.02 * d.sp + Math.sin(t + d.ph) * 0.0006; x = d.x * W; y = d.y * H; fx.fillStyle = rgba(pal.leaf, 0.75); fx.beginPath(); fx.ellipse(x, y, 4.6 * d.r, 2.3 * d.r, d.ph + t * d.sp, 0, 6.2832); fx.fill(); }
      else if (pal.fx === 'snow') { d.y += dt * 0.05 * d.sp; d.x += Math.sin(t * 0.6 + d.ph) * 0.0004; fx.fillStyle = 'rgba(255,255,255,0.8)'; fx.beginPath(); fx.arc(d.x * W, d.y * H, 1 + 1.3 * d.r, 0, 6.2832); fx.fill(); }
      else if (pal.fx === 'firefly') { d.x += Math.cos(d.ph + t * 0.3 * d.sp) * dt * 0.02; d.y += Math.sin(d.ph * 1.7 + t * 0.25) * dt * 0.02; fx.globalCompositeOperation = 'lighter'; glowDot(d.x * W, d.y * H, 7 + 3 * d.r, '#fff2a0', 0.35 + 0.35 * Math.sin(t * 2 + d.ph)); fx.globalCompositeOperation = 'source-over'; }
      else { d.y -= dt * 0.012 * d.sp; d.x += Math.sin(t * 0.4 + d.ph) * 0.0003; fx.fillStyle = pal.fx === 'star' ? 'rgba(255,236,180,' + (0.3 + 0.3 * Math.sin(t * 1.6 + d.ph)) + ')' : 'rgba(255,255,255,' + (0.3 + 0.2 * Math.sin(t + d.ph)) + ')'; fx.beginPath(); fx.arc(d.x * W, d.y * H, 0.8 + 1.4 * d.r, 0, 6.2832); fx.fill(); }
      if (d.y > 1.03) { d.y = -0.03; d.x = Math.random(); } if (d.y < -0.04) { d.y = 1.02; d.x = Math.random(); } if (d.x > 1.03) d.x = -0.02; if (d.x < -0.03) d.x = 1.02;
    }
    // 点击涟漪
    for (i = S.ripples.length - 1; i >= 0; i--) {
      var rp = S.ripples[i]; rp.t += dt * 2.2; if (rp.t >= 1) { S.ripples.splice(i, 1); continue; }
      var k2 = easeOut(rp.t); fx.strokeStyle = rgba(rp.ok ? pal.knob : pal.acc, (1 - rp.t) * 0.8); fx.lineWidth = rp.ok ? 1.6 : 2.2;
      fx.beginPath(); fx.ellipse(rp.x, rp.y, (rp.ok ? 6 + 20 * k2 : 14 - 6 * k2), (rp.ok ? 6 + 20 * k2 : 14 - 6 * k2) * 0.58, 0, 0, 6.2832); fx.stroke();
    }
    // 月光归位
    if (S.orb) {
      var o = S.orb; o.t += dt / o.dur; var u = ease(clamp(o.t, 0, 1)), a = o.a, b = [S.moon.x, S.moon.y], cx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * 0.25, cy = Math.min(a[1], b[1]) - 60;
      var qx = (1 - u) * (1 - u) * a[0] + 2 * u * (1 - u) * cx + u * u * b[0], qy = (1 - u) * (1 - u) * a[1] + 2 * u * (1 - u) * cy + u * u * b[1];
      fx.globalCompositeOperation = 'lighter'; glowDot(qx, qy, 34, '#fff4cc', 0.75); glowDot(qx, qy, 8, '#ffffff', 0.95); fx.globalCompositeOperation = 'source-over';
      if (o.t >= 1) S.orb = null;
    }
    fx.globalAlpha = 1;
  }
  function goalNode() { var ns = S.world.nodes; for (var i = 0; i < ns.length; i++) if (ns[i].goal) return ns[i]; return null; }

  // ───────────── 主角 ─────────────
  function standNow(n) {
    var p = n.part, loc = n.stair ? n.c : [n.c[0] + n.n[0] * 0.5, n.c[1] + n.n[1] * 0.5, n.c[2] + n.n[2] * 0.5];
    return L.tPoint(p, p.val, loc);
  }
  function faceNow() { var p = P.node.part; return P.face + (!P.step && p.kind === 'rot' && p.axis === 'y' ? (p.val - P.rideRef) * Math.PI / 2 : 0); }
  function lanternPos() { var f = faceNow(), c = Math.cos(f), s = Math.sin(f), x = 0.27, z = 0.1; return [P.pos[0] + x * c + z * s, P.pos[1] + 0.36 + (P.hopY || 0), P.pos[2] - x * s + z * c]; }
  function anyAnim() { var ps = S.world.parts; for (var i = 0; i < ps.length; i++) if (ps[i].anim) return true; return false; }
  function canWalk() { return S.mode === 'play' && !anyAnim() && !(S.drag && S.drag.on); }
  function updPlayer(dt) {
    P.hopY = 0;
    if (P.step) {
      var st = P.step; st.t += dt / st.dur; P.idle = 0;
      if (st.t >= 1) { P.step = null; P.node = st.to; P.pos = st.to.stand.slice(); P.gy = P.pos[1]; P.rideRef = P.node.part.val; arrive(st.to); }
      else {
        var k = st.t, a = st.p0, b = st.p1;
        P.pos = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; P.gy = P.pos[1];
        P.hopY = Math.sin(Math.PI * k) * (st.stair ? 0.05 : 0.11);
      }
    } else if (P.path.length && canWalk()) {
      var nx = P.path.shift(), e = L.edge(P.node, nx);
      if (!e) { P.path = []; return; }
      var f = P.node.stand, t = nx.stand, p0 = f.slice(), p1 = t.slice(), dir;
      if (e.ill) { // 视错觉边:全程待在离相机更近的那一侧坐标系里,屏幕位置连续
        var sh = [t[0] - f[0] - e.step[0], t[1] - f[1], t[2] - f[2] - e.step[2]];
        if (sh[1] > 0) p0 = [f[0] + sh[0], f[1] + sh[1], f[2] + sh[2]]; else p1 = [t[0] - sh[0], t[1] - sh[1], t[2] - sh[2]];
        dir = e.step;
      } else dir = [t[0] - f[0], 0, t[2] - f[2]];
      P.faceT = Math.atan2(dir[0], dir[2]);
      P.step = { to: nx, p0: p0, p1: p1, t: 0, dur: (nx.stair || P.node.stair) ? 0.3 : 0.26, stair: !!(nx.stair || P.node.stair) };
      AU.step(S.stepN++);
    } else {
      P.pos = standNow(P.node); P.gy = P.pos[1]; P.idle += dt;
      if (P.idle > 1.4 && S.mode === 'play') P.faceT = 0.8;
      if (P.cheer > 0) { P.cheer -= dt; P.hopY = Math.abs(Math.sin(P.cheer * 7)) * 0.22 * clamp(P.cheer, 0, 1); }
    }
    var df = P.faceT - P.face; while (df > Math.PI) df -= 6.2832; while (df < -Math.PI) df += 6.2832; P.face += df * Math.min(1, dt * 12);
    P.blink -= dt; if (P.blink < -0.12) P.blink = 2 + Math.random() * 3;
  }
  function arrive(n) {
    hintEvent('walk');
    if (n.part.def.turtle && P.path.length === 0) AU.chirp();
    if (n.plate && !n.pressed) {
      n.pressed = true; P.path = [];
      var p = S.world.byId[n.plate.part], dur = clamp(1.3 + 0.2 * Math.abs(n.plate.to - p.val), 1.6, 3.8);
      AU.plate(); AU.rise(dur); animPart(p, n.plate.to, dur, ease);
      return;
    }
    if (n.goal) { win(); return; }
    checkFollows();
  }

  // ───────────── 机关 ─────────────
  function partModel(p) {
    var v = p.val + (p.shake > 0 ? Math.sin(p.shake * 46) * 0.035 * (p.shake / 0.35) : 0);
    if (p.kind === 'rot') { var pv = p.pivot; return M.chain(M.tr(pv[0], pv[1], pv[2]), M.rot(p.axis, v * Math.PI / 2), M.tr(-pv[0], -pv[1], -pv[2])); }
    if (p.kind === 'slide') { var a = L.AXV[p.axis]; return M.tr(a[0] * v, a[1] * v, a[2] * v); }
    return M.id();
  }
  function animPart(p, to, dur, ez) { p.anim = { from: p.val, to: to, t: 0, dur: dur, ez: ez || easeOut }; }
  function finishPart(p) {
    var to = p.anim.to, was = p.state; p.anim = null;
    if (p.kind === 'rot') {
      if (P.node.part === p && p.axis === 'y') { P.face += (to - P.rideRef) * Math.PI / 2; P.faceT = P.face; }
      p.state = ((to % 4) + 4) % 4; p.val = p.state; if (P.node.part === p) P.rideRef = p.val;
    } else { p.state = p.val = to; }
    L.settle(S.world); P.path = [];
    if (p.state !== was && p.handles.length) hintEvent('part');
    checkFollows();
    if (!anyAnim() && S.pendingTap) { var q = S.pendingTap; S.pendingTap = null; tap(q[0], q[1]); }
  }
  function checkFollows() {
    S.world.parts.forEach(function (p) {
      if (!p.follow || p.anim) return;
      var t = L.followTarget(S.world, p);
      if (p.state !== t && P.node.part !== p && !(P.step && P.step.to.part === p)) { var d = 1.5; AU.rise(d); animPart(p, t, d, ease); }
    });
  }
  function handleAt(x, y) {
    var best = null, bd = 1e9;
    S.world.parts.forEach(function (p) {
      if (!p.handles.length || p.anim) return;
      p.handles.forEach(function (h) {
        var hw = L.tPoint(p, p.val, h); if (hw[1] < -0.8) return;
        var s = proj(hw), d = Math.hypot(x - s[0], y - s[1]), r = Math.max(26, (p.def.turtle ? 0.66 : 0.5) * S.cam.ppu);
        if (d < r && d < bd) { bd = d; best = p; }
      });
    });
    return best;
  }
  function planeAngle(p, x, y) {
    var pv = proj(p.pivot), qx = (x - pv[0]) / S.cam.ppu, qy = -(y - pv[1]) / S.cam.ppu;
    var B = { y: [[0, 0, 1], [1, 0, 0]], z: [[1, 0, 0], [0, 1, 0]], x: [[0, 1, 0], [0, 0, 1]] }[p.axis], a = s2(B[0]), b = s2(B[1]);
    var det = a[0] * b[1] - a[1] * b[0];
    return Math.atan2((a[0] * qy - a[1] * qx) / det, (qx * b[1] - qy * b[0]) / det);
  }
  function nearPivot(p, x, y) { var pv = proj(p.pivot); return Math.hypot(x - pv[0], y - pv[1]) < 0.5 * S.cam.ppu; }
  function startDrag(p, x, y) {
    S.drag = { part: p, on: true, val0: p.val, x0: x, y0: y, acc: 0, last: p.kind === 'rot' ? planeAngle(p, x, y) : 0, dead: p.kind === 'rot' && nearPivot(p, x, y), k: Math.round(p.val * (p.kind === 'rot' ? 3 : 2)) };
    P.path = [];
  }
  function moveDrag(x, y) {
    var d = S.drag, p = d.part;
    if (p.kind === 'rot') {
      var a = planeAngle(p, x, y), da;
      if (nearPivot(p, x, y)) { d.dead = true; return; } // 贴着转轴时角度不稳定,先不跟手
      if (d.dead) { d.dead = false; d.last = a; }
      da = a - d.last; while (da > Math.PI) da -= 6.2832; while (da < -Math.PI) da += 6.2832;
      d.acc += da; d.last = a; p.val = d.val0 + d.acc / (Math.PI / 2);
    } else {
      var sa = s2(L.AXV[p.axis]), qx = (x - d.x0) / S.cam.ppu, qy = -(y - d.y0) / S.cam.ppu;
      p.val = clamp(d.val0 + (qx * sa[0] + qy * sa[1]) / (sa[0] * sa[0] + sa[1] * sa[1]), p.min, p.max);
    }
    var k = Math.round(p.val * (p.kind === 'rot' ? 3 : 2)); if (k !== d.k) { d.k = k; AU.tick(k); }
  }
  function endDrag() {
    var d = S.drag, p = d.part; S.drag = null; if (!d.on) return;
    var to = Math.round(p.val); if (p.kind === 'slide') to = clamp(to, p.min, p.max);
    animPart(p, to, 0.16 + 0.3 * Math.abs(to - p.val)); if (Math.abs(to - d.val0) > 0.5) AU.snap();
  }
  function stepOn(p) { return !!P.step && (P.step.to.part === p || P.node.part === p); }
  function denyPart(p) { p.shake = 0.35; AU.deny(); }

  // ───────────── 输入 ─────────────
  function pickNode(x, y, strict) {
    var best = null, bd = -1e9, near = null, nd = 0.95, ns = S.world.nodes;
    for (var i = 0; i < ns.length; i++) {
      var n = ns[i]; if (!n.active) continue;
      var s = proj(n.stand), du = (x - s[0]) / S.cam.ppu, dv = -(y - s[1]) / S.cam.ppu, a = du * 1.41421356, b = -dv * 2.44948974, dx = (a + b) / 2, dz = (b - a) / 2, m = Math.max(Math.abs(dx), Math.abs(dz));
      var depth = n.stand[0] + n.stand[1] + n.stand[2];
      if (m <= 0.5) { if (depth > bd) { bd = depth; best = n; } }
      else if (m < nd) { nd = m; near = n; }
    }
    return best || (strict ? null : near);
  }
  function tap(x, y) {
    if (S.mode !== 'play') return;
    if (anyAnim()) { S.pendingTap = [x, y]; return; }
    var n = pickNode(x, y), from = P.step ? P.step.to : P.node;
    if (!n) return;
    var s = proj(n.stand);
    if (n === from) { P.path = []; return; }
    var pth = L.path(from, n);
    if (pth) { P.path = pth; S.ripples.push({ x: s[0], y: s[1], t: 0, ok: true }); }
    else { S.ripples.push({ x: s[0], y: s[1], t: 0, ok: false }); AU.deny(); }
  }
  function onDown(e) {
    AU.init();
    var x = e.clientX, y = e.clientY;
    if (S.mode === 'card') { beginIntro(); return; }
    if (S.mode === 'end') { if (S.canContinue) nextLevel(); return; }
    if (S.mode !== 'play' || S.ptr) return;
    S.ptr = { id: e.pointerId, x: x, y: y, x0: x, y0: y, part: handleAt(x, y), moved: false };
    try { fxc.setPointerCapture(e.pointerId); } catch (er) { }
  }
  function onMove(e) {
    var q = S.ptr; if (!q || q.id !== e.pointerId) return;
    q.x = e.clientX; q.y = e.clientY;
    if (!q.moved && Math.hypot(q.x - q.x0, q.y - q.y0) > 7) {
      q.moved = true;
      if (q.part) {
        if (L.locked(q.part, P.step ? P.step.to : P.node)) { denyPart(q.part); q.part = null; }
        else if (q.part.anim) q.part = null;
        else { S.drag = { part: q.part, on: false }; P.path = []; }
      }
    }
    if (S.drag && S.drag.on) moveDrag(q.x, q.y);
    e.preventDefault();
  }
  function onUp(e) {
    var q = S.ptr; if (!q || q.id !== e.pointerId) return; S.ptr = null;
    if (S.drag) { if (!S.drag.on && !stepOn(S.drag.part)) { startDrag(S.drag.part, q.x0, q.y0); moveDrag(q.x, q.y); } endDrag(); return; }
    if (q.moved || S.mode !== 'play') return;
    if (q.part && !pickNode(q.x, q.y, true)) {
      var p = q.part;
      if (p.kind === 'rot') {
        if (L.locked(p, P.step ? P.step.to : P.node) || P.step) { if (!P.step) denyPart(p); return; }
        if (!p.anim) { P.path = []; animPart(p, p.val + 1, 0.5, ease); AU.tick(p.state + 1); AU.snap(); }
      }
      return;
    }
    tap(q.x, q.y);
  }
  fxc.addEventListener('pointerdown', onDown); fxc.addEventListener('pointermove', onMove);
  fxc.addEventListener('pointerup', onUp); fxc.addEventListener('pointercancel', function (e) { if (S.ptr && S.ptr.id === e.pointerId) { S.ptr = null; if (S.drag) endDrag(); } });
  fxc.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ───────────── 通关演出 ─────────────
  function win() {
    S.mode = 'end'; P.path = []; P.cheer = 1.6; P.faceT = 0.8; setHint(''); AU.goal();
    var gn = goalNode();
    after(0.7, function () { S.goalTaken = true; S.orb = { t: 0, dur: 2.1, a: proj([gn.stand[0], gn.stand[1] + 0.95, gn.stand[2]]) }; AU.orb(); });
    after(2.8, function () { S.moon.anim = { from: S.idx / 6, to: (S.idx + 1) / 6, t: 0 }; AU.moon(); save.done = Math.max(save.done, S.idx + 1); persist(); });
    after(4.0, function () { $('endtext').textContent = S.def.end; $('endline').classList.add('on'); });
    after(5.6, function () { S.canContinue = true; $('endgo').classList.add('on'); });
  }
  function nextLevel() {
    S.canContinue = false; AU.ui();
    if (S.idx < LEVELS.length - 1) start(S.idx + 1, true);
    else { S.mode = 'load'; veil(true, function () { $('hud').classList.remove('on'); $('chapter').classList.remove('on'); $('endline').classList.remove('on'); $('finale').classList.add('on'); S.mode = 'final'; veil(false); }); }
  }

  // ───────────── 帧 ─────────────
  function update(dt) {
    S.t += dt;
    for (var i = S.seq.length - 1; i >= 0; i--) if (S.seq[i] && S.seq[i].at <= S.t) { var f = S.seq.splice(i, 1)[0].fn; f(); }
    if (!S.world) return;
    if (S.mode === 'intro') {
      S.introT += dt / 1.7; var k = easeOut(clamp(S.introT, 0, 1)); S.ga = clamp(S.introT * 1.6, 0, 1); S.cam.intro = 90 * (1 - k);
      if (S.introT >= 1) { S.mode = 'play'; S.ga = 1; S.cam.intro = 0; after(0.4, nextHint); }
    }
    if (S.drag && !S.drag.on && !stepOn(S.drag.part) && S.ptr) { startDrag(S.drag.part, S.ptr.x0, S.ptr.y0); moveDrag(S.ptr.x, S.ptr.y); }
    S.world.parts.forEach(function (p) {
      if (p.shake > 0) p.shake -= dt;
      if (p.anim) { var a = p.anim; a.t += dt / a.dur; if (a.t >= 1) { p.val = a.to; finishPart(p); } else p.val = a.from + (a.to - a.from) * a.ez(a.t); }
    });
    updPlayer(dt);
    if (S.moon.anim) { var m = S.moon.anim; m.t += dt / 1.4; S.moon.phase = m.from + (m.to - m.from) * ease(clamp(m.t, 0, 1)); if (m.t >= 1) S.moon.anim = null; drawBG(); }
    if (S.mode === 'play') { var hs = S.def.hints || [], h = hs[S.hintI]; if (h) { S.hintT += dt; if (S.hintT > (h[1] === 'time' ? 9 : 40)) { S.hintI++; setHint(''); after(1, nextHint); } } }
  }
  function render() {
    if (!S.world) return;
    var cam = S.cam, pal = S.pal, wat = [0, 0, 1];
    if (S.def.water) { var k = (S.def.water.y - cam.c[1]) / 0.57735; wat = [cam.c[0] + 0.57735 * k, cam.c[2] + 0.57735 * k, 0.62 * Math.max(W, H * 1.2) / cam.ppu]; }
    R.begin({ center: cam.c, sx: 2 * cam.ppu / W, sy: 2 * cam.ppu / H, offY: -2 * (cam.base + cam.intro) / H, shade: pal.shade, light: pal.light,
      fogC: S.pc.fog, fog: [-4.6, -0.2, -6.2, -3.0], wat: wat, time: S.t, ga: S.ga });
    S.meshes.forEach(function (m) { R.draw(m.mesh, partModel(m.part)); });
    // 主角
    var f = faceNow(), hop = P.hopY || 0, br = 1 + 0.025 * Math.sin(S.t * 2.4), sq = P.step ? 1 + 0.1 * Math.sin(Math.PI * P.step.t) : br;
    R.draw(PM.blob, M.chain(M.tr(P.pos[0], P.gy + 0.012, P.pos[2]), M.sc(1 - hop * 1.6, 1, 1 - hop * 1.6)), { alpha: 0.2, noDepth: true });
    var base = M.chain(M.tr(P.pos[0], P.pos[1] + hop, P.pos[2]), M.rot('y', f), M.sc(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)));
    R.draw(PM.body, base);
    var sway = 0.07 * Math.sin(S.t * 1.7) + (P.step ? 0.2 * Math.sin(Math.PI * P.step.t) : 0);
    R.draw(PM.ear, M.chain(base, M.tr(-0.085, 0.73, -0.02), M.rot('z', 0.2 + sway * 0.5), M.rot('x', -0.2 - sway)));
    R.draw(PM.ear, M.chain(base, M.tr(0.085, 0.73, -0.02), M.rot('z', -0.2 - sway * 0.5), M.rot('x', -0.2 - sway)));
    R.draw(PM.eyes, M.chain(base, M.tr(0, 0.625, 0), M.sc(1, P.blink < 0 ? 0.12 : 1, 1), M.tr(0, -0.625, 0)));
    R.draw(PM.lantern, M.chain(base, M.tr(0.27, 0.5, 0.1), M.rot('z', 0.12 * Math.sin(S.t * 2.1) + sway * 0.6), M.tr(-0.27, -0.5, -0.1)));
    if (!S.goalTaken) { var gn = goalNode(); if (gn && gn.active) R.draw(PM.shard, M.chain(M.tr(gn.stand[0], gn.stand[1] + 0.95 + 0.07 * Math.sin(S.t * 1.8), gn.stand[2]), M.rot('y', S.t * 0.9))); }
    if (S.waterMesh) R.draw(S.waterMesh, M.tr(0, S.def.water.y, 0), { alpha: 0.62, water: true, noDepth: true });
  }
  var last = 0;
  function frame(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    update(dt); render(); drawFX(dt);
    requestAnimationFrame(frame);
  }
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2); W = Math.max(1, window.innerWidth); H = Math.max(1, window.innerHeight);
    [bgc, glc, fxc].forEach(function (c) { c.width = (W * DPR) | 0; c.height = (H * DPR) | 0; });
    bg.setTransform(DPR, 0, 0, DPR, 0, 0); fx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (S.world) { fitCamera(); drawBG(); }
  }

  // ───────────── 界面 ─────────────
  function buildLevelList() {
    var box = $('lvlist'); box.innerHTML = '';
    LEVELS.forEach(function (lv, i) {
      var b = document.createElement('button'), open = i <= save.done;
      b.className = 'lv' + (open ? '' : ' locked') + (i < save.done ? ' done' : ''); b.disabled = !open;
      b.innerHTML = '<span class="lv-no">' + NUM[i] + '</span><span class="lv-name">' + lv.name + '</span>';
      b.setAttribute('aria-label', '第' + NUM[i] + '章 ' + lv.name + (open ? '' : '(未解锁)'));
      b.addEventListener('click', function () { AU.init(); AU.ui(); start(i, true); });
      box.appendChild(b);
    });
  }
  function setMuteUI() { $('bmu').classList.toggle('off', save.mute); $('bmu').setAttribute('aria-pressed', save.mute ? 'true' : 'false'); }
  $('title').addEventListener('click', function () { if (S.mode !== 'title') return; AU.init(); AU.ui(); start(Math.min(save.done, LEVELS.length - 1), true); });
  $('blv').addEventListener('click', function () { AU.ui(); buildLevelList(); $('levels').classList.add('on'); });
  $('lvclose').addEventListener('click', function () { AU.ui(); $('levels').classList.remove('on'); });
  $('bre').addEventListener('click', function () { if (S.mode === 'play' || S.mode === 'end') { AU.ui(); start(S.idx, false); } });
  $('bmu').addEventListener('click', function () { save.mute = !save.mute; AU.setMute(save.mute); persist(); setMuteUI(); AU.ui(); });
  $('again').addEventListener('click', function () { AU.ui(); start(0, true); });
  $('pick').addEventListener('click', function () { AU.ui(); buildLevelList(); $('levels').classList.add('on'); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'r' || e.key === 'R') $('bre').click(); else if (e.key === 'm' || e.key === 'M') $('bmu').click();
    else if (e.key === 'Escape') $('levels').classList.remove('on');
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { AU.pause(document.hidden); last = performance.now(); });

  buildPlayer(); setMuteUI(); resize();
  if (save.done > 0) $('tgo').textContent = save.done >= LEVELS.length ? '轻触，再走一遍' : '轻触，继续第' + NUM[Math.min(save.done, 5)] + '章';
  // 标题页背景用第一章的天色
  S.pal = LEVELS[0].pal; S.def = LEVELS[0]; drawBG();
  var qs = /[?&]lv=(\d)/.exec(location.search);
  if (qs) { // 直达某章(调试/分享用),跳过标题与转场
    $('title').style.transition = 'none'; $('title').classList.remove('on'); $('hud').classList.add('on'); $('chapter').classList.add('on');
    loadLevel(clamp(+qs[1] - 1, 0, LEVELS.length - 1)); S.mode = 'load'; S.ga = 0; S.cam.intro = 90; beginIntro();
  }
  requestAnimationFrame(frame);

  // 调试/自动化验证入口(不影响游玩)
  window.__sy = { S: S, P: P, start: start, proj: proj, tick: function (sec) { for (var i = 0; i < sec * 60; i++) update(1 / 60); render(); drawFX(0); return S.mode; },
    walk: function (x, y, z) { var n = S.world.nodes.filter(function (n) { return n.active && n.cell[0] === x && n.cell[1] === y && n.cell[2] === z; })[0]; if (!n) return 'no node'; var p = L.path(P.node, n); if (!p) return 'no path'; P.path = p; return p.length; },
    set: function (id, st, dur) { var p = S.world.byId[id]; if (L.locked(p, P.node)) return 'locked'; animPart(p, st, dur || 0.4, ease); return 'ok'; } };
})();
