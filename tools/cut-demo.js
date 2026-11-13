#!/usr/bin/env node
/* 拾月 · 把 record-demo.js 录下的素材剪成成片:各片段交叉淡化拼接,铺上配乐,首尾淡入淡出。
 * 用法: node tools/cut-demo.js <素材目录> <输出.mp4>
 * 高清:先 HQ=1 录制,再在素材目录里合帧:
 *   ffmpeg -f concat -safe 0 -i frames.txt -vf fps=60 -c:v libx264 -crf 10 -preset fast raw.mkv
 * 目录里有 raw.mkv 时本脚本自动按 1920x1080 高码率输出。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const REC = path.resolve(process.argv[2] || 'rec'), OUT = path.resolve(process.argv[3] || 'demo.mp4');
const { marks } = JSON.parse(fs.readFileSync(path.join(REC, 'marks.json'), 'utf8'));
const XF = 0.45, FPS = 30;
const HQ = fs.existsSync(path.join(REC, 'raw.mkv')); // 高清素材(record-demo.js 的 HQ 模式 + 下方说明的合帧步骤)
const RAW = path.join(REC, HQ ? 'raw.mkv' : 'raw.webm'), SIZE = HQ ? '1920:1080' : '1280:720';
// 每段可微调:[起点偏移, 时长上限]
const TRIM = { title: [0.4, 2.6], l1moon: [0, 2.4], finale: [0, 5.2] };
const segs = marks.map(m => { const t = TRIM[m.name] || [0, 1e9]; return { name: m.name, in: m.in + t[0], dur: Math.min(m.out - m.in - t[0], t[1]) }; });
// 片头:社交平台拿第一帧当封面,所以开场不从黑场淡入,直接用「团团走上月光阶梯」的画面并叠片名
const l6b = marks.find(m => m.name === 'l6b');
const HERO = 2.4, TITLE = path.join(REC, 'title.png'), hasTitle = fs.existsSync(TITLE);
// 片尾:终章画面上淡入试玩链接(小红书、抖音正文不能放链接,靠视频结尾带出)
const OUTRO = path.join(REC, 'outro.png'), hasOutro = fs.existsSync(OUTRO), OUTRO_IN = 3.4;
if (l6b) segs.unshift({ name: 'hero', in: l6b.in + 2.9, dur: HERO });
const inputs = [], filters = [];
segs.forEach((s, i) => {
  inputs.push('-ss', s.in.toFixed(3), '-t', s.dur.toFixed(3), '-i', RAW);
  const hero = s.name === 'hero' && hasTitle;
  filters.push(`[${i}:v]fps=${FPS},scale=${SIZE}:flags=lanczos,format=yuv420p,setpts=PTS-STARTPTS[${hero ? 'h0' : 'v' + i}]`);
});
let prev = 'v0', t = segs[0].dur;
for (let i = 1; i < segs.length; i++) {
  const o = `x${i}`;
  filters.push(`[${prev}][v${i}]xfade=transition=fade:duration=${XF}:offset=${(t - XF).toFixed(3)}[${o}]`);
  t += segs[i].dur - XF; prev = o;
}
const total = t, ti = segs.length, oi = ti + (hasTitle ? 1 : 0), ai = oi + (hasOutro ? 1 : 0);
if (hasTitle) filters.push(`[${ti}:v]scale=${SIZE},format=rgba,fade=t=out:st=${(HERO - 0.7).toFixed(2)}:d=0.5:alpha=1[tt]`, `[h0][tt]overlay=0:0:format=auto,format=yuv420p[v0]`);
if (hasOutro) {
  filters.push(`[${oi}:v]scale=${SIZE},format=rgba,fade=t=in:st=${(total - OUTRO_IN).toFixed(3)}:d=0.7:alpha=1[ot]`, `[${prev}][ot]overlay=0:0:format=auto,format=yuv420p[vo]`);
  prev = 'vo';
}
filters.push(`[${prev}]fade=t=out:st=${(total - 0.9).toFixed(3)}:d=0.9[vout]`);
filters.push(`[${ai}:a]atrim=start=1.5:duration=${total.toFixed(3)},asetpts=PTS-STARTPTS,volume=5dB,afade=t=in:st=0:d=0.5,afade=t=out:st=${(total - 2.4).toFixed(3)}:d=2.4[aout]`);
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, ...(hasTitle ? ['-loop', '1', '-t', String(HERO), '-i', TITLE] : []),
  ...(hasOutro ? ['-loop', '1', '-t', total.toFixed(3), '-i', OUTRO] : []), '-i', path.join(REC, 'music.webm'),
  '-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', HQ ? '14' : '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', total.toFixed(3), OUT], { stdio: 'inherit' });
console.log('成片时长', total.toFixed(2) + 's', '→', OUT);
