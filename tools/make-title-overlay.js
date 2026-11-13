#!/usr/bin/env node
/* 拾月 · 生成片头用的透明片名图层(1920x1080 PNG),供 cut-demo.js 叠在第一个镜头上。
 * 用法: NODE_PATH=$(npm root -g) PW_EXE=<chrome-headless-shell> node tools/make-title-overlay.js <输出.png>
 */
'use strict';
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : { channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.setContent(`<html><body style="margin:0;background:transparent">
  <div style="position:absolute;left:150px;top:0;height:1080px;display:flex;align-items:center;gap:34px;color:#f4ecd8;
    font-family:'Songti SC','STSong','Noto Serif CJK SC',serif">
    <div style="writing-mode:vertical-rl;font-size:210px;font-weight:300;letter-spacing:.16em;line-height:1">拾月</div>
    <div style="display:flex;flex-direction:column;gap:30px;align-self:flex-start;margin-top:330px">
      <div style="writing-mode:vertical-rl;background:#b8452f;color:#f8ece0;font-size:26px;font-weight:700;letter-spacing:.12em;padding:14px 8px 10px;border-radius:3px">团团</div>
    </div>
  </div>
  <div style="position:absolute;left:156px;bottom:92px;color:#f4ecd8;opacity:.8;font:700 22px Georgia,serif;letter-spacing:.6em">GATHER THE MOON</div>
  </body></html>`);
  await p.screenshot({ path: process.argv[2] || 'title.png', omitBackground: true });
  await b.close();
})();
