#!/usr/bin/env node
/* 拾月 · 生成宣传封面:在游戏里按目标比例摆好「团团走上月光阶梯」的镜头,叠上片名排版后截图。
 * 每个比例出两张:带试玩链接(-link)与不带链接(-clean)。
 * 用法: NODE_PATH=$(npm root -g) PW_EXE=<chrome-headless-shell> node tools/make-covers.js [站点地址] [输出目录]
 *   站点地址默认 http://localhost:8791,输出目录默认 media/covers
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8791';
const OUT = path.resolve(process.argv[3] || 'media/covers');
const LINK = 'dososo.github.io/shiyue';
const SERIF = "'Songti SC','STSong','Noto Serif CJK SC',serif";
const INK = '#f4ecd8', SEAL = '#b8452f';

// 每个比例的排版:片名竖排在左侧,画面主体偏右;链接用小字放在不抢画面的角落
const SIZES = [
  { name: '16x9', w: 1920, h: 1080, title: 210, side: 'left', x: 150, top: 'center', foot: 92 },
  { name: '4x3', w: 1440, h: 1080, title: 180, side: 'left', x: 100, top: 'center', foot: 80 },
  // 竖版画面主体偏左,片名放到右侧空着的天幕里
  { name: '3x4', w: 1080, h: 1440, title: 170, side: 'right', x: 110, top: 400, foot: 72 },
];

function overlay(s, withLink) {
  const R = s.side === 'right';
  const vpos = s.top === 'center' ? `top:0;height:${s.h}px;display:flex;align-items:center` : `top:${s.top}px`;
  const fs2 = Math.round(s.title * 0.11);
  const en = `<div style="font:700 ${Math.round(s.title * 0.105)}px Georgia,serif;letter-spacing:.6em;opacity:.82">GATHER THE MOON</div>`;
  const link = withLink ? `<div style="font:400 ${fs2}px ${SERIF};letter-spacing:.12em;opacity:.82">
      <span style="opacity:.72">浏览器打开即玩</span>　<span style="font-family:Georgia,serif;letter-spacing:.06em">${LINK}</span></div>` : '';
  const foot = s.w > s.h
    ? `<div style="position:absolute;left:${s.x + 6}px;right:${s.x}px;bottom:${s.foot}px;display:flex;justify-content:space-between;align-items:baseline">${en}${link}</div>`
    : `<div style="position:absolute;left:${s.x}px;right:${s.x}px;bottom:${s.foot}px;display:flex;flex-direction:column;align-items:center;gap:22px">${en}${link}</div>`;
  const seal = `<div style="writing-mode:vertical-rl;align-self:${R ? 'flex-end' : 'flex-start'};margin:${R ? `0 0 ${Math.round(s.title * 0.08)}px` : `${Math.round(s.title * 0.06)}px 0 0`};background:${SEAL};color:#f8ece0;
        font-size:${Math.round(s.title * 0.124)}px;font-weight:700;letter-spacing:.12em;padding:14px 8px 10px;border-radius:3px">团团</div>`;
  const ttl = `<div style="writing-mode:vertical-rl;font-size:${s.title}px;font-weight:300;letter-spacing:.16em;line-height:1">拾月</div>`;
  return `<div id="cover-ov" style="position:absolute;inset:0;z-index:99;pointer-events:none;color:${INK};font-family:${SERIF}">
    <div style="position:absolute;left:0;right:0;bottom:0;height:${Math.round(s.h * 0.3)}px;background:linear-gradient(to top,rgba(22,32,62,.5),rgba(22,32,62,0))"></div>
    <div style="position:absolute;${R ? 'right' : 'left'}:${s.x}px;${vpos}">
      <div style="display:flex;flex-direction:${R ? 'row-reverse' : 'row'};gap:${Math.round(s.title * 0.16)}px">${ttl}${seal}</div>
    </div>${foot}</div>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : { channel: 'chrome' });
  for (const s of SIZES) {
    const p = await b.newPage({ viewport: { width: s.w, height: s.h } });
    await p.addInitScript(() => localStorage.setItem('shiyue.v1', JSON.stringify({ done: 6, mute: true })));
    await p.goto(BASE + '/?lv=6');
    await p.waitForFunction(() => window.__sy && window.__sy.S);
    // 与 record-demo.js 第六章同一条通关路线,停在月光阶梯中段
    const at = await p.evaluate(() => {
      const y = window.__sy, run = sec => { for (let t = 0; t < sec; t += 0.05) y.tick(0.05); };
      run(3);
      const steps = [['w', 10, 0, 8], ['s', 'turtle', 0], ['w', 7, 0, 8], ['s', 'lift', 0], ['w', 6, 0, 8], ['s', 'lift', 2], ['w', 6, 2, 7, 7],
        ['w', 6, 2, 8], ['s', 'lift', 3], ['w', 4, 3, 8], ['s', 'arm', 0], ['w', 3, 3, 8], ['s', 'arm', 1], ['w', 2, 3, 6, 6], ['w', 2, 3, 7], ['s', 'arm', 3, 1.6]];
      for (const st of steps) { if (st[0] === 'w') { y.walk(st[1], st[2], st[3]); run(st[4] || 4); } else { y.set(st[1], st[2]); run(st[3] || 1.2); } }
      y.walk(3, 9, 3); run(1.55);
      return y.P.node ? y.P.node.cell.join(',') : 'moving';
    });
    await p.addStyleTag({ content: '#chapter,#hud,#hint,#endline{display:none!important}' });
    for (const withLink of [true, false]) {
      await p.evaluate(h => { document.getElementById('cover-ov')?.remove(); document.getElementById('app').insertAdjacentHTML('beforeend', h); }, overlay(s, withLink));
      await p.evaluate(() => document.fonts.ready);
      const file = path.join(OUT, `cover-${s.name}-${withLink ? 'link' : 'clean'}.png`);
      await p.screenshot({ path: file });
      console.log(s.name, withLink ? 'link ' : 'clean', 'at', at, '→', path.relative(process.cwd(), file));
    }
    await p.close();
  }
  await b.close();
})();
