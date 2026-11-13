/* 拾月 · logic.js — 世界模型:机关变换、行走节点、视错觉连通、寻路。
 * 纯逻辑,无 DOM 依赖,浏览器与 Node(tools/solve.js)共用。
 *
 * 坐标:整数格,y 向上。相机方向固定为 (1,1,1) 的正交等距投影,
 * 因此两点差为 k·(1,1,1) 时投影到同一屏幕位置 —— 这是全部「不可能连通」的来源。
 */
(function (root) {
  'use strict';
  var FACES = { py: [0, 1, 0], ny: [0, -1, 0], px: [1, 0, 0], nx: [-1, 0, 0], pz: [0, 0, 1], nz: [0, 0, -1] };
  var DIRS = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };
  var AXV = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  var key = function (x, y, z) { return x + ',' + y + ',' + z; };

  // 右手系 90° 整数旋转
  function rot90(v, axis, n) {
    n = ((n % 4) + 4) % 4;
    var x = v[0], y = v[1], z = v[2], t;
    for (var i = 0; i < n; i++) {
      if (axis === 'y') { t = x; x = z; z = -t; }
      else if (axis === 'z') { t = x; x = -y; y = t; }
      else { t = y; y = -z; z = t; }
    }
    return [x, y, z];
  }
  function rotC(v, axis, a) {
    var c = Math.cos(a), s = Math.sin(a), x = v[0], y = v[1], z = v[2];
    if (axis === 'y') return [x * c + z * s, y, -x * s + z * c];
    if (axis === 'z') return [x * c - y * s, x * s + y * c, z];
    return [x, y * c - z * s, y * s + z * c];
  }
  // 连续变换(渲染、拖拽用)
  function tPoint(p, val, v) {
    if (p.kind === 'rot') {
      var pv = p.pivot, r = rotC([v[0] - pv[0], v[1] - pv[1], v[2] - pv[2]], p.axis, val * Math.PI / 2);
      return [r[0] + pv[0], r[1] + pv[1], r[2] + pv[2]];
    }
    if (p.kind === 'slide') { var a = AXV[p.axis]; return [v[0] + a[0] * val, v[1] + a[1] * val, v[2] + a[2] * val]; }
    return [v[0], v[1], v[2]];
  }
  // 整数变换(落定状态用)
  function tCell(p, st, c) {
    if (p.kind === 'rot') {
      var pv = p.pivot, r = rot90([c[0] - pv[0], c[1] - pv[1], c[2] - pv[2]], p.axis, st);
      return [r[0] + pv[0], r[1] + pv[1], r[2] + pv[2]];
    }
    if (p.kind === 'slide') { var a = AXV[p.axis]; return [c[0] + a[0] * st, c[1] + a[1] * st, c[2] + a[2] * st]; }
    return [c[0], c[1], c[2]];
  }
  function tDirI(p, st, d) { return p.kind === 'rot' ? rot90(d, p.axis, st) : [d[0], d[1], d[2]]; }

  function build(def) {
    var W = { def: def, parts: [], byId: {}, nodes: [], start: null };
    def.parts.forEach(function (pd) {
      var p = {
        id: pd.id, kind: pd.kind || 'static', axis: pd.axis || 'y', pivot: pd.pivot || [0, 0, 0],
        min: pd.min, max: pd.max, state: pd.state || 0, val: pd.state || 0,
        handles: pd.handles || [], follow: pd.follow || null, def: pd, cells: [], nodes: []
      };
      (pd.boxes || []).forEach(function (b) {
        for (var x = b[0]; x <= b[3]; x++) for (var y = b[1]; y <= b[4]; y++) for (var z = b[2]; z <= b[5]; z++) p.cells.push([x, y, z]);
      });
      var add = function (c, o) {
        var n = { id: W.nodes.length, part: p, c: c, n: o.n || [0, 1, 0], stair: o.stair || null, magic: !!o.magic,
          goal: !!o.goal, plate: o.plate || null, pressed: false, cell: null, stand: null, active: false, dir: null, adj: [] };
        W.nodes.push(n); p.nodes.push(n);
      };
      (pd.walk || []).forEach(function (w) {
        var nums = [], o = {};
        w.forEach(function (t) {
          if (typeof t === 'number') nums.push(t);
          else if (typeof t === 'string') { if (t === 'm') o.magic = true; else o.n = FACES[t]; }
          else { if (t.goal) o.goal = true; if (t.plate) o.plate = t.plate; }
        });
        if (nums.length === 6) {
          for (var x = nums[0]; x <= nums[3]; x++) for (var y = nums[1]; y <= nums[4]; y++) for (var z = nums[2]; z <= nums[5]; z++) add([x, y, z], o);
        } else add([nums[0], nums[1], nums[2]], o);
      });
      (pd.stairs || []).forEach(function (s) { add([s[0], s[1], s[2]], { stair: DIRS[s[3]] }); });
      W.parts.push(p); W.byId[p.id] = p;
    });
    settle(W);
    W.nodes.forEach(function (n) {
      if (!n.stair && n.active && n.cell[0] === def.start[0] && n.cell[1] === def.start[1] && n.cell[2] === def.start[2]) W.start = n;
    });
    return W;
  }

  // 依据各机关的整数状态,重算节点位置与连通图
  function settle(W) {
    var occ = {}, flat = {}, stairs = {}, i, n, p, wc;
    W.parts.forEach(function (p) {
      p.cells.forEach(function (c) { var w = tCell(p, p.state, c); occ[key(w[0], w[1], w[2])] = 1; });
    });
    for (i = 0; i < W.nodes.length; i++) {
      n = W.nodes[i]; p = n.part; wc = tCell(p, p.state, n.c);
      var wn = tDirI(p, p.state, n.n);
      n.cell = wc; n.adj = []; n.active = wn[1] === 1 && wc[1] >= -1; // 沉入雾/水下的砖不可走、不可点
      if (n.stair) { n.dir = tDirI(p, p.state, n.stair); n.stand = [wc[0], wc[1], wc[2]]; if (n.active) stairs[key(wc[0], wc[1], wc[2])] = n; }
      else {
        n.stand = [wc[0], wc[1] + 0.5, wc[2]];
        if (n.active && occ[key(wc[0], wc[1] + 1, wc[2])]) n.active = false; // 头顶被方块占住
        if (n.active) flat[key(wc[0], wc[1], wc[2])] = n;
      }
    }
    var link = function (a, b, ex) { var e = { to: b, ill: false, step: null }; if (ex) { e.ill = true; e.step = ex; } a.adj.push(e); };
    var D4 = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]], k, m;
    var magic = [];
    for (k in flat) {
      n = flat[k];
      for (i = 0; i < 4; i++) { m = flat[key(n.cell[0] + D4[i][0], n.cell[1], n.cell[2] + D4[i][2])]; if (m) link(n, m); }
      if (n.magic) magic.push(n);
    }
    for (k in stairs) {
      n = stairs[k]; var c = n.cell, d = n.dir;
      var lo = flat[key(c[0] - d[0], c[1] - 1, c[2] - d[2])], hi = flat[key(c[0] + d[0], c[1], c[2] + d[2])];
      if (lo) { link(n, lo); link(lo, n); }
      if (hi) { link(n, hi); link(hi, n); }
      var up = stairs[key(c[0] + d[0], c[1] + 1, c[2] + d[2])];
      if (up && up.dir[0] === d[0] && up.dir[2] === d[2]) { link(n, up); link(up, n); }
    }
    // 视错觉连通:两块「幻砖」屏幕相邻且不同高。约束:靠 +x/+z 一侧的那块必须更高(更靠近相机),
    // 这样近处砖面恰好盖住远处砖的侧面,画面与真实相邻完全一致,不会穿帮。
    for (i = 0; i < magic.length; i++) for (var j = 0; j < magic.length; j++) {
      var a = magic[i], b = magic[j];
      if (b.cell[1] <= a.cell[1]) continue;
      var du = (b.cell[0] - b.cell[1]) - (a.cell[0] - a.cell[1]), dv = (b.cell[2] - b.cell[1]) - (a.cell[2] - a.cell[1]);
      if ((du === 1 && dv === 0) || (du === 0 && dv === 1)) { link(a, b, [du, 0, dv]); link(b, a, [-du, 0, -dv]); }
    }
  }

  function path(a, b) {
    if (a === b) return [];
    var prev = {}, q = [a], n, i; prev[a.id] = a;
    while (q.length) {
      n = q.shift(); if (n === b) break;
      for (i = 0; i < n.adj.length; i++) { var t = n.adj[i].to; if (prev[t.id] === undefined) { prev[t.id] = n; q.push(t); } }
    }
    if (prev[b.id] === undefined) return null;
    var out = []; for (n = b; n !== a; n = prev[n.id]) out.unshift(n);
    return out;
  }
  function edge(a, b) { for (var i = 0; i < a.adj.length; i++) if (a.adj[i].to === b) return a.adj[i]; return null; }

  // 竖直面旋转的机关,主角站在上面时不可转(会被甩下去)
  function locked(part, playerNode) { return part.kind === 'rot' && part.axis !== 'y' && playerNode && playerNode.part === part; }
  // 联动机关的目标状态(主角站在其上时不动)
  function followTarget(W, p) { var s = W.byId[p.follow.src]; return s.state === p.follow.when ? p.follow.on : p.follow.off; }

  var api = { build: build, settle: settle, path: path, edge: edge, locked: locked, followTarget: followTarget,
    tPoint: tPoint, tCell: tCell, rot90: rot90, AXV: AXV, key: key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SY_LOGIC = api;
})(typeof window !== 'undefined' ? window : this);
