#!/usr/bin/env node
/* 拾月 · 关卡求解器:对每一关做状态空间 BFS,证明可通关,并做静态检查。
 * 用法: node tools/solve.js [--json 输出路径]
 * 检查项:
 *   SOLVABLE   起点可达终点,输出最短操作序列
 *   NO_SOFTLOCK 所有可达状态都仍能到达终点(不存在死局)
 *   NO_OVERLAP  任一可达状态下,没有两块可走砖投影到同一屏幕位置(避免误点/穿帮)
 *   RIDER_SAFE  移动机关后主角脚下的砖始终有效
 */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../js/logic.js');
const LEVELS = require('../js/levels.js');

function solveLevel(def, idx) {
  const W = L.build(def);
  const res = { level: idx + 1, name: def.name, checks: {}, warnings: [] };
  if (!W.start) { res.checks.SOLVABLE = false; res.warnings.push('起点不是有效砖'); return res; }
  const plates = W.nodes.filter(n => n.plate);
  const snap = pl => pl.id + '|' + W.parts.map(p => p.state).join(',') + '|' + plates.map(n => n.pressed ? 1 : 0).join('');
  const load = s => {
    const [pid, ps, pr] = s.split('|');
    ps.split(',').forEach((v, i) => { W.parts[i].state = W.parts[i].val = +v; });
    plates.forEach((n, i) => { n.pressed = pr[i] === '1'; });
    L.settle(W);
    return W.nodes[+pid];
  };
  const follows = pl => {
    let ch = true;
    while (ch) {
      ch = false;
      for (const p of W.parts) if (p.follow) {
        const t = L.followTarget(W, p);
        if (p.state !== t && pl.part !== p) { p.state = p.val = t; ch = true; }
      }
    }
    L.settle(W);
  };
  const lint = pl => {
    const seen = {};
    for (const n of W.nodes) if (n.active && !n.stair) {
      const k = (n.cell[0] - n.cell[1]) + ',' + (n.cell[2] - n.cell[1]);
      if (seen[k]) res.overlap.add(`(${seen[k].cell}) 与 (${n.cell}) 屏幕重叠`);
      seen[k] = n;
    }
    if (!pl.active) res.rider.add(`主角所在砖 (${pl.cell}) 失效`);
  };
  res.overlap = new Set(); res.rider = new Set();

  const s0 = snap(W.start);
  const prev = new Map([[s0, null]]);
  const fwd = new Map(); // state -> [next states]
  const queue = [s0];
  let goalState = null;
  while (queue.length) {
    const s = queue.shift();
    const pl = load(s);
    lint(pl);
    if (pl.goal && !goalState) goalState = s;
    const nexts = [];
    const push = (label, ns) => { nexts.push(ns); if (!prev.has(ns)) { prev.set(ns, [s, label]); queue.push(ns); } };
    // 行走一步
    for (const e of pl.adj.slice()) {
      load(s);
      const t = e.to; let label = `走到 (${t.cell})` + (e.ill ? '〔视错觉〕' : '');
      if (t.plate && !t.pressed) { t.pressed = true; const p = W.byId[t.plate.part]; p.state = p.val = t.plate.to; label += ` 踏板→${p.id}`; }
      follows(t);
      push(label, snap(t));
    }
    // 拨动机关
    load(s);
    for (const p of W.parts) {
      if (!p.handles.length || L.locked(p, pl)) continue;
      const opts = [];
      if (p.kind === 'rot') for (let k = 0; k < 4; k++) opts.push(k); else for (let k = p.min; k <= p.max; k++) opts.push(k);
      const cur = p.state;
      for (const k of opts) {
        if (k === cur) continue;
        load(s); p.state = p.val = k; follows(pl);
        push(`${p.id}: ${cur}→${k}`, snap(pl));
      }
    }
    fwd.set(s, nexts);
  }
  res.states = prev.size;
  res.checks.SOLVABLE = !!goalState;
  if (goalState) {
    const steps = []; let s = goalState;
    while (prev.get(s)) { steps.unshift(prev.get(s)[1]); s = prev.get(s)[0]; }
    // 合并连续行走,便于阅读
    const merged = [];
    for (const st of steps) {
      const walk = st.startsWith('走到') && !st.includes('踏板') && !st.includes('视错觉');
      if (walk && merged.length && merged[merged.length - 1].w) merged[merged.length - 1] = { t: st, w: true };
      else merged.push({ t: st, w: walk });
    }
    res.solution = merged.map(m => m.t);
    res.rawSteps = steps.length;
  }
  // 死局检查:从终点状态集合反向可达
  const rev = new Map();
  for (const [s, ns] of fwd) for (const n of ns) { if (!rev.has(n)) rev.set(n, []); rev.get(n).push(s); }
  const ok = new Set(); const q2 = [];
  for (const s of prev.keys()) { const pl = load(s); if (pl.goal) { ok.add(s); q2.push(s); } }
  while (q2.length) { const s = q2.shift(); for (const p of (rev.get(s) || [])) if (!ok.has(p)) { ok.add(p); q2.push(p); } }
  res.checks.NO_SOFTLOCK = ok.size === prev.size;
  if (!res.checks.NO_SOFTLOCK) res.warnings.push(`存在 ${prev.size - ok.size} 个无法通关的可达状态`);
  res.checks.NO_OVERLAP = res.overlap.size === 0;
  res.checks.RIDER_SAFE = res.rider.size === 0;
  res.warnings.push(...res.overlap, ...res.rider);
  delete res.overlap; delete res.rider;
  res.pass = Object.values(res.checks).every(Boolean);
  return res;
}

const results = LEVELS.map(solveLevel);
let allPass = true;
for (const r of results) {
  allPass = allPass && r.pass;
  console.log(`\n第 ${r.level} 章 ${r.name}  ${r.pass ? 'PASS' : 'FAIL'}  (可达状态 ${r.states}, 最短 ${r.rawSteps} 步)`);
  for (const [k, v] of Object.entries(r.checks)) console.log(`  ${v ? '✔' : '✘'} ${k}`);
  (r.solution || []).forEach((s, i) => console.log(`    ${String(i + 1).padStart(2)}. ${s}`));
  r.warnings.forEach(w => console.log('  ! ' + w));
}
console.log(`\n总计: ${results.filter(r => r.pass).length}/${results.length} PASS`);
const ji = process.argv.indexOf('--json');
if (ji > 0) {
  const out = path.resolve(process.argv[ji + 1]);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ schema_version: 1, tool: 'tools/solve.js', generated_at: new Date().toISOString(), all_pass: allPass, levels: results }, null, 2));
}
process.exit(allPass ? 0 : 1);
