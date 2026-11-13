#!/usr/bin/env node
/* 拾月 · 演示视频素材录制:用无头浏览器实机跑游戏,录下各章片段与一段配乐。
 * 依赖(仅录制时需要):playwright、ffmpeg,以及一个 Chromium 内核:
 *   推荐用 PW_EXE 指向 chrome-headless-shell(无窗口边框,画面是完整的 16:9);
 *   不设则用本机 Chrome,但其无头窗口比视口矮,底部会留一条灰边。
 * 用法: NODE_PATH=$(npm root -g) node tools/record-demo.js <输出目录> [基地址]
 * 产物: <输出目录>/raw.webm(整段画面)、music.webm(配乐)、marks.json(各片段起止时间)
 * 之后用 tools/cut-demo.js 剪成成片。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const OUT = path.resolve(process.argv[2] || 'rec');
const BASE = process.argv[3] || 'http://127.0.0.1:8791';
const W = 1280, H = 720;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TAP = () => {
  const oc = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (d, ...a) {
    if (d instanceof AudioDestinationNode) {
      const c = d.context;
      if (!c.__tap) { c.__tap = c.createMediaStreamDestination(); window.__tapStream = c.__tap.stream; }
      oc.call(this, c.__tap);
    }
    return oc.call(this, d, ...a);
  };
  window.__recStart = () => {
    const r = new MediaRecorder(window.__tapStream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
    const ch = []; r.ondataavailable = e => ch.push(e.data);
    window.__recStop = () => new Promise(res => {
      r.onstop = async () => {
        const buf = new Uint8Array(await new Blob(ch).arrayBuffer()); let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        res(btoa(s));
      };
      r.stop();
    });
    r.start();
  };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ ...(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : { channel: process.env.PW_CHANNEL || 'chrome' }), args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-gpu'] });

  // ── 配乐:单独一页,只放第六章的音乐,连续录 66 秒 ──
  const music = (async () => {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
    await ctx.addInitScript(TAP);
    const p = await ctx.newPage();
    await p.goto(BASE + '/?lv=6'); await sleep(800);
    await p.dispatchEvent('#fx', 'pointerdown', { clientX: 5, clientY: 300, pointerId: 9 });
    await p.dispatchEvent('#fx', 'pointerup', { clientX: 5, clientY: 300, pointerId: 9 });
    await sleep(300);
    const state = await p.evaluate(() => window.SY_AUDIO.ctx && window.SY_AUDIO.ctx.state);
    await p.evaluate(() => window.__recStart());
    await sleep(66000);
    const b64 = await p.evaluate(() => window.__recStop());
    fs.writeFileSync(path.join(OUT, 'music.webm'), Buffer.from(b64, 'base64'));
    await ctx.close();
    return state;
  })();

  // ── 画面 ──
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, recordVideo: { dir: OUT, size: { width: W, height: H } } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const marks = [];
  const now = () => (Date.now() - t0) / 1000;
  const seg = async (name, fn) => { const a = now(); await fn(); marks.push({ name, in: a, out: now() }); console.log(name, (now() - a).toFixed(2) + 's'); };
  const mode = m => page.waitForFunction(m => window.__sy && window.__sy.S.mode === m, m, { timeout: 30000 });
  const walk = (x, y, z) => page.evaluate(([x, y, z]) => window.__sy.walk(x, y, z), [x, y, z]);
  const set = (id, st, dur) => page.evaluate(([id, st, dur]) => window.__sy.set(id, st, dur), [id, st, dur]);
  const pre = steps => page.evaluate(steps => {
    const y = window.__sy, log = [];
    for (const s of steps) {
      if (s[0] === 'w') { log.push(y.walk(s[1], s[2], s[3])); y.tick(s[4] || 4); }
      else if (s[0] === 's') { log.push(y.set(s[1], s[2])); y.tick(s[3] || 1.2); }
      else y.tick(s[1]);
    }
    return log.join(',') + ' @' + y.P.node.cell.join(',');
  }, steps);
  const direct = async lv => { await page.goto(BASE + '/?lv=' + lv); await sleep(500); await page.evaluate(() => window.__sy.tick(3)); };

  // A 标题
  await page.goto(BASE + '/'); await sleep(900);
  await seg('title', () => sleep(3300));
  // B 章节页
  await page.click('#title'); await sleep(1100);
  await seg('card1', () => sleep(2100));
  // C 第一章
  await mode('intro'); await sleep(450);
  await seg('l1', async () => {
    await mode('play'); await sleep(350);
    await walk(3, 0, 1); await sleep(1350);
    await set('bridge', 0, 0.7); await sleep(950);
    await walk(8, 1, -2); await sleep(2900);
  });
  await sleep(500);
  await seg('l1moon', () => sleep(3000));
  const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t > 1000) r(n); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  console.log('fps', fps);

  // D 章节选择(全部解锁的样子)
  await page.evaluate(() => localStorage.setItem('shiyue.v1', JSON.stringify({ done: 6, mute: false })));
  await direct(1);
  await page.click('#blv'); await sleep(1000);
  await seg('select', () => sleep(2700));
  await page.click('#lvlist .lv:nth-child(2)');
  // E 第二章
  await mode('play'); await sleep(300);
  await seg('l2', async () => {
    await sleep(300);
    await set('arm', 0, 0.7); await sleep(900);
    await walk(2, 0, 0); await sleep(1100);
    await set('arm', 1, 0.8); await sleep(1000);
    await walk(2, 4, 7); await sleep(3800);
  });
  // F 第三章:踏板让石路浮出水面
  await direct(3);
  console.log('pre3', await pre([['s', 'lift1', 0], ['w', 5, 0, 6], ['s', 'lift1', 2], ['w', 3, 2, 4], ['s', 'lift2', 1], ['w', 3, 2, 3], ['s', 'lift2', 2], ['w', 3, 3, 1]]));
  await sleep(500);
  await seg('l3', async () => {
    await sleep(300);
    await walk(2, 3, 1); await sleep(3100);
    await walk(-2, 4, -2); await sleep(1800);
  });
  // G 第四章:阿渡摆渡,然后独自停到莲台,桥升起
  await direct(4);
  console.log('pre4', await pre([['w', 7, 0, 6]]));
  await sleep(500);
  await seg('l4', async () => {
    await sleep(350);
    await set('turtle', 2, 1.2); await sleep(1450);
    await walk(5, 1, -1); await sleep(2500);
    await set('turtle', 0, 1.5); await sleep(3300);
  });
  // H 第五章:桥立成塔,借视错觉登顶
  await direct(5);
  console.log('pre5', await pre([['s', 'wheel', 0], ['w', 2, 0, 5, 5], ['s', 'wheel', 2], ['w', 0, 0, 4], ['s', 'lift', 0], ['w', -1, 0, 4], ['s', 'lift', 2], ['w', -1, 2, 3, 6], ['w', -1, 2, 4], ['s', 'lift', 0], ['w', 0, 0, 2]]));
  await sleep(500);
  await seg('l5', async () => {
    await sleep(350);
    await set('wheel', 1, 1.6); await sleep(1950);
    await walk(4, 4, -4); await sleep(4300);
  });
  // I 第六章:月阶升起,登月
  await direct(6);
  console.log('pre6', await pre([['w', 10, 0, 8], ['s', 'turtle', 0], ['w', 7, 0, 8], ['s', 'lift', 0], ['w', 6, 0, 8], ['s', 'lift', 2], ['w', 6, 2, 7, 7], ['w', 6, 2, 8], ['s', 'lift', 3], ['w', 4, 3, 8], ['s', 'arm', 0], ['w', 3, 3, 8]]));
  await sleep(500);
  await seg('l6a', async () => {
    await sleep(300);
    await set('arm', 1, 0.8); await sleep(1000);
    await walk(2, 3, 6); await sleep(4700);
  });
  await walk(2, 3, 7); await sleep(600);
  await seg('l6b', async () => {
    await set('arm', 3, 1.1); await sleep(1350);
    await walk(3, 9, 3); await sleep(4700);
    await sleep(3900);
  });
  // J 终章
  await page.waitForFunction(() => window.__sy.S.canContinue, null, { timeout: 15000 });
  await page.dispatchEvent('#fx', 'pointerdown', { clientX: 300, clientY: 300, pointerId: 3 });
  await mode('final'); await sleep(700);
  await seg('finale', () => sleep(5200));

  const video = page.video();
  await ctx.close();
  const raw = path.join(OUT, 'raw.webm');
  fs.renameSync(await video.path(), raw);
  const audioState = await music;
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify({ fps, audioState, marks }, null, 2));
  console.log('audio', audioState, 'done →', OUT);
})().catch(e => { console.error(e); process.exit(1); });
